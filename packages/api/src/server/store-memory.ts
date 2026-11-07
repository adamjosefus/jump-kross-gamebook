import { Effect, Layer } from 'effect';

import {
  Store,
  type AdminFailures,
  type LogRow,
  type ReadingRow,
  type TeamMove,
  type TeamRow,
} from './store.ts';

interface SessionRow {
  readonly teamId: number;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
}

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
  log: readonly LogRow[];
  reading: readonly ReadingRow[];
}

export const emptyMemoryData = (): MemoryData => ({
  teams: new Map(),
  sessions: new Map(),
  adminFailures: new Map(),
  log: [],
  reading: [],
});

/** In-process store for local development without a database and for tests. */
export const makeMemoryStore = (data: MemoryData = emptyMemoryData()) => {
  const { teams, sessions, adminFailures } = data;

  const ensure = (id: number): TeamRow => {
    const existing = teams.get(id);
    if (existing !== undefined) return existing;
    const team: TeamRow = {
      id,
      node: undefined,
      state: {},
      step: 0,
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
      step: team.step + 1,
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
    moveTeam: (id, expectedStep, next) =>
      Effect.sync(() => {
        const team = teams.get(id);
        if (team === undefined) return undefined;
        if (expectedStep !== undefined && team.step !== expectedStep) return undefined;
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
        data.reading = data.reading.filter((row) => !ids.includes(row.teamId));
        return reset;
      }),

    markStarted: (id) =>
      Effect.sync(() => {
        const team = teams.get(id);
        if (team !== undefined) teams.set(id, { ...team, startedAt: team.startedAt ?? new Date() });
      }),
    clearTiming: (id) =>
      Effect.sync(() => {
        const team = teams.get(id);
        if (team !== undefined) teams.set(id, { ...team, startedAt: undefined });
        data.reading = data.reading.filter((row) => row.teamId !== id);
      }),
    addReading: (rows) =>
      Effect.sync(() => {
        data.reading = [...data.reading, ...rows];
      }),
    listReading: () => Effect.sync(() => data.reading),

    createSession: (id, teamId) =>
      Effect.sync(() => {
        const now = new Date();
        sessions.set(id, { teamId, createdAt: now, lastSeenAt: now });
      }),
    touchSession: (id, createdAfter) =>
      Effect.sync(() => {
        const session = sessions.get(id);
        if (session === undefined || !teams.has(session.teamId)) return undefined;
        if (session.createdAt <= createdAfter) return undefined;
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

    adminFailures: (key) => Effect.sync(() => adminFailures.get(key)),
    recordAdminFailure: (key) =>
      Effect.sync(() => {
        const current = adminFailures.get(key);
        adminFailures.set(key, { failures: (current?.failures ?? 0) + 1, lastAt: new Date() });
      }),
    clearAdminFailures: (key) => Effect.sync(() => void adminFailures.delete(key)),

    recentLog: (limit) => Effect.sync(() => data.log.slice(-limit).toReversed()),
    visitCounts: () =>
      Effect.sync(() =>
        countBy(data.log.flatMap((row) => (row.toNode === undefined ? [] : [row.toNode]))),
      ),
  });
};

export const MemoryStoreLayer = (data?: MemoryData) =>
  Layer.sync(Store, () => makeMemoryStore(data));
