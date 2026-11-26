import { Effect, Layer } from 'effect';

import {
  Store,
  type AdminFailures,
  type BanRow,
  type GameSettingsRow,
  START_ACTIONS,
  type LogRow,
  type PauseRow,
  type SessionRow,
  type TeamMove,
  type TeamRow,
} from './store.ts';

/** How many times each key occurs. */
const countBy = <K>(keys: readonly K[]): ReadonlyMap<K, number> =>
  new Map(
    [...new Set(keys)].map((key) => [key, keys.filter((candidate) => candidate === key).length]),
  );

/**
 * What the memory store holds. It is the one place with state, so these collections are replaced or
 * updated in place on purpose; the rows themselves are never changed, only swapped for new ones.
 * It stands apart from the store, so the data can outlive a reload of the code in development.
 */
export interface MemoryData {
  readonly teams: Map<number, TeamRow>;
  readonly sessions: Map<string, SessionRow>;
  readonly adminFailures: Map<string, AdminFailures>;
  readonly bans: Map<string, BanRow>;
  log: readonly LogRow[];
  gameStartedAt: Date | undefined;
  settings: GameSettingsRow;
  pauses: readonly PauseRow[];
}

export const emptyMemoryData = (): MemoryData => ({
  teams: new Map(),
  sessions: new Map(),
  adminFailures: new Map(),
  bans: new Map(),
  log: [],
  gameStartedAt: undefined,
  settings: { closed: false, changedAt: undefined },
  pauses: [],
});

/** In-process store for local development without a database and for tests. */
export const makeMemoryStore = (data: MemoryData = emptyMemoryData()) => {
  const { teams, sessions, adminFailures, bans } = data;

  const ensure = (id: number): TeamRow => {
    const existing = teams.get(id);
    if (existing !== undefined) return existing;
    const team: TeamRow = {
      id,
      node: undefined,
      state: {},
      revision: 0,
      startedAt: undefined,
      finishedAt: undefined,
      updatedAt: new Date(),
    };
    teams.set(id, team);
    return team;
  };

  const move = (team: TeamRow, next: TeamMove, now: Date): TeamRow => {
    const updated: TeamRow = {
      ...team,
      node: next.node,
      state: next.state,
      revision: team.revision + 1,
      finishedAt: next.finished ? (team.finishedAt ?? now) : undefined,
      updatedAt: now,
    };
    teams.set(team.id, updated);
    data.log = [
      ...data.log,
      {
        teamId: team.id,
        at: now,
        action: next.action,
        fromNode: team.node,
        toNode: next.node,
        state: next.state,
      },
    ];
    return updated;
  };

  return Store.of({
    listTeams: () =>
      Effect.sync(() => [...teams.values()].toSorted((first, second) => first.id - second.id)),
    getTeam: (id) => Effect.sync(() => teams.get(id)),
    ensureTeam: (id) => Effect.sync(() => ensure(id)),
    moveTeam: (id, expectedRevision, next) =>
      Effect.sync(() => {
        const team = teams.get(id);
        if (team === undefined) return undefined;
        if (expectedRevision !== undefined && team.revision !== expectedRevision) return undefined;
        return move(team, next, new Date());
      }),
    resetTeams: (ids, start) =>
      Effect.sync(() => {
        const now = new Date();
        const reset = ids.map((id) => {
          const moved = move(ensure(id), start, now);
          const cleared = { ...moved, startedAt: undefined };
          teams.set(id, cleared);
          return cleared;
        });
        for (const [sessionId, session] of sessions)
          if (ids.includes(session.teamId)) sessions.delete(sessionId);
        data.gameStartedAt = undefined;
        data.pauses = data.pauses.filter(({ endedAt }) => endedAt === undefined);
        return reset;
      }),

    gameStartedAt: () => Effect.sync(() => data.gameStartedAt),
    startGame: () => Effect.sync(() => (data.gameStartedAt ??= new Date())),

    markStarted: (id) =>
      Effect.sync(() => {
        const team = teams.get(id);
        if (team !== undefined) teams.set(id, { ...team, startedAt: team.startedAt ?? new Date() });
      }),
    clearTiming: (id) =>
      Effect.sync(() => {
        const team = teams.get(id);
        if (team !== undefined) teams.set(id, { ...team, startedAt: undefined });
        for (const [sessionId, session] of sessions)
          if (session.teamId === id) sessions.delete(sessionId);
      }),
    resetTiming: (id) =>
      Effect.sync(() => {
        const team = teams.get(id);
        if (team === undefined || team.finishedAt !== undefined) return false;
        teams.set(id, { ...team, startedAt: undefined });
        data.log = [
          ...data.log,
          {
            teamId: id,
            at: new Date(),
            action: 'reset-time',
            fromNode: team.node,
            toNode: undefined,
            state: team.state,
          },
        ];
        for (const [sessionId, session] of sessions)
          if (session.teamId === id) sessions.delete(sessionId);
        return true;
      }),

    createSession: (id, teamId, client) =>
      Effect.sync(() => {
        const now = new Date();
        sessions.set(id, { id, teamId, createdAt: now, lastSeenAt: now, ...client });
      }),
    touchSession: (id, createdAfter) =>
      Effect.sync(() => {
        const session = sessions.get(id);
        if (session === undefined || !teams.has(session.teamId)) return undefined;
        if (session.createdAt <= createdAfter) return undefined;
        // A session that slipped in while its device was being banned is refused too.
        if (session.deviceId !== undefined && bans.has(session.deviceId)) return undefined;
        sessions.set(id, { ...session, lastSeenAt: new Date() });
        return session.teamId;
      }),
    deleteSession: (id) => Effect.sync(() => void sessions.delete(id)),
    activeDevices: (since) =>
      Effect.sync(() =>
        countBy(
          [...sessions.values()]
            .filter((session) => session.lastSeenAt >= since)
            .map((session) => session.teamId),
        ),
      ),
    listSessions: (createdAfter) =>
      Effect.sync(() =>
        [...sessions.values()]
          .filter((session) => session.createdAt > createdAfter && teams.has(session.teamId))
          .toSorted((first, second) => second.lastSeenAt.getTime() - first.lastSeenAt.getTime()),
      ),

    banDevice: (ban) =>
      Effect.sync(() => {
        if (!bans.has(ban.deviceId)) bans.set(ban.deviceId, { ...ban, bannedAt: new Date() });
        for (const [id, session] of sessions)
          if (session.deviceId === ban.deviceId) sessions.delete(id);
      }),
    unbanDevice: (deviceId) => Effect.sync(() => void bans.delete(deviceId)),
    isBanned: (deviceId) => Effect.sync(() => bans.has(deviceId)),
    listBans: () =>
      Effect.sync(() =>
        [...bans.values()].toSorted(
          (first, second) => second.bannedAt.getTime() - first.bannedAt.getTime(),
        ),
      ),

    gameSettings: () => Effect.sync(() => data.settings),
    setGameClosed: (closed) =>
      Effect.sync(() => {
        const now = new Date();
        const running = data.pauses.some(({ endedAt }) => endedAt === undefined);
        data.pauses = closed
          ? running
            ? data.pauses
            : [...data.pauses, { startedAt: now, endedAt: undefined }]
          : data.pauses.map((pause) =>
              pause.endedAt === undefined ? { ...pause, endedAt: now } : pause,
            );
        data.settings = { closed, changedAt: now };
        return data.settings;
      }),
    listPauses: () => Effect.sync(() => data.pauses),

    adminFailures: (key) => Effect.sync(() => adminFailures.get(key)),
    recordAdminFailure: (key) =>
      Effect.sync(() => {
        const current = adminFailures.get(key);
        adminFailures.set(key, { failures: (current?.failures ?? 0) + 1, lastAt: new Date() });
      }),
    clearAdminFailures: (key) => Effect.sync(() => void adminFailures.delete(key)),

    recentLog: (limit) => Effect.sync(() => data.log.slice(-limit).toReversed()),
    listMoves: (teamId) =>
      Effect.sync(() => {
        const lastStart = new Map<number, number>();
        for (const [index, row] of data.log.entries())
          if (START_ACTIONS.includes(row.action)) lastStart.set(row.teamId, index);
        return data.log.filter(
          (row, index) =>
            (teamId === undefined || row.teamId === teamId) &&
            index >= (lastStart.get(row.teamId) ?? 0),
        );
      }),
    visitCounts: () =>
      Effect.sync(() =>
        countBy(data.log.flatMap((row) => (row.toNode === undefined ? [] : [row.toNode]))),
      ),
  });
};

export const MemoryStoreLayer = (data?: MemoryData) =>
  Layer.sync(Store, () => makeMemoryStore(data));
