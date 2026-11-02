import { Effect, Layer } from 'effect';

import { Store, type LogRow, type ReadingRow, type TeamRow } from './store.ts';

/** In-process store for local development without a database and for tests. */
export const makeMemoryStore = () => {
  const teams = new Map<number, TeamRow>();
  const sessions = new Map<string, { teamId: number; lastSeenAt: Date }>();
  const log: LogRow[] = [];
  let reading: readonly ReadingRow[] = [];

  return Store.of({
    listTeams: () => Effect.sync(() => [...teams.values()].toSorted((a, b) => a.id - b.id)),
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
        log.push({
          teamId: id,
          at: now,
          action: move.action,
          fromNode: team.node,
          toNode: move.node,
          state: move.state,
        });
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
        reading = reading.filter((row) => row.teamId !== id);
      }),
    addReading: (rows) =>
      Effect.sync(() => {
        reading = [...reading, ...rows];
      }),
    listReading: () => Effect.sync(() => reading),

    createSession: (id, teamId) =>
      Effect.sync(() => void sessions.set(id, { teamId, lastSeenAt: new Date() })),
    touchSession: (id) =>
      Effect.sync(() => {
        const session = sessions.get(id);
        if (session === undefined || !teams.has(session.teamId)) return undefined;
        session.lastSeenAt = new Date();
        return session.teamId;
      }),
    deleteSession: (id) => Effect.sync(() => void sessions.delete(id)),
    activeDevices: (since) =>
      Effect.sync(() => {
        const counts = new Map<number, number>();
        for (const { teamId, lastSeenAt } of sessions.values()) {
          if (lastSeenAt >= since) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
        }
        return counts;
      }),

    recentLog: (limit) => Effect.sync(() => log.slice(-limit).toReversed()),
    visitCounts: () =>
      Effect.sync(() => {
        const counts = new Map<string, number>();
        for (const { toNode } of log) {
          if (toNode !== undefined) counts.set(toNode, (counts.get(toNode) ?? 0) + 1);
        }
        return counts;
      }),
  });
};

export const MemoryStoreLayer = () => Layer.sync(Store, makeMemoryStore);
