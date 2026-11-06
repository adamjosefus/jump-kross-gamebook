import { Effect, Layer } from 'effect';

import { Store, type LogRow, type ReadingRow, type TeamRow } from './store.ts';

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
  log: readonly LogRow[];
  reading: readonly ReadingRow[];
}

export const emptyMemoryData = (): MemoryData => ({
  teams: new Map(),
  sessions: new Map(),
  log: [],
  reading: [],
});

/** In-process store for local development without a database and for tests. */
export const makeMemoryStore = (data: MemoryData = emptyMemoryData()) => {
  const { teams, sessions } = data;

  return Store.of({
    listTeams: () =>
      Effect.sync(() => [...teams.values()].toSorted((first, second) => first.id - second.id)),
    getTeam: (id) => Effect.sync(() => teams.get(id)),
    ensureTeam: (id) =>
      Effect.sync(() => {
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
      }),
    moveTeam: (id, expectedStep, move) =>
      Effect.sync(() => {
        const team = teams.get(id);
        if (team === undefined || team.step !== expectedStep) return undefined;
        const now = new Date();
        const updated: TeamRow = {
          ...team,
          node: move.node,
          state: move.state,
          step: team.step + 1,
          finishedAt: move.finished ? (team.finishedAt ?? now) : undefined,
          updatedAt: now,
        };
        teams.set(id, updated);
        data.log = [
          ...data.log,
          {
            teamId: id,
            at: now,
            action: move.action,
            fromNode: team.node,
            toNode: move.node,
            state: move.state,
          },
        ];
        return updated;
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

    recentLog: (limit) => Effect.sync(() => data.log.slice(-limit).toReversed()),
    visitCounts: () =>
      Effect.sync(() =>
        countBy(data.log.flatMap((row) => (row.toNode === undefined ? [] : [row.toNode]))),
      ),
  });
};

export const MemoryStoreLayer = (data?: MemoryData) =>
  Layer.sync(Store, () => makeMemoryStore(data));
