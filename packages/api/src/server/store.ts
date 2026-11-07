import type { State } from '@gamebook/core';
import { Context, type Effect, Schema } from 'effect';

export class StoreError extends Schema.TaggedError<StoreError>()('StoreError', {
  message: Schema.String,
}) {}

/** Progress of a team; its name comes from the story. */
export interface TeamRow {
  readonly id: number;
  /** Undefined until the team starts (or after a reset). */
  readonly node: string | undefined;
  readonly state: State;
  readonly step: number;
  /** The team's first login after the game started; undefined before it and after a reset. */
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  readonly updatedAt: Date;
}

export interface LogRow {
  readonly teamId: number;
  readonly at: Date;
  readonly action: string;
  readonly fromNode: string | undefined;
  readonly toNode: string | undefined;
  readonly state: State;
}

/** A time a device of the team showed a text. */
export interface ReadingRow {
  readonly teamId: number;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

/** A device logged in to a team, as the admin sees it. */
export interface SessionRow {
  /** The session's id, which is also the device's cookie; never shown as it is. */
  readonly id: string;
  readonly teamId: number;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  /** The device's address at the login, as the proxy reported it. */
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
  /** The device's own cookie, which outlives its sessions; undefined for older sessions. */
  readonly deviceId: string | undefined;
}

/** What the device told about itself when it logged in. */
export interface SessionClient {
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
  /** An id this server gave the device (see `isDeviceId`); undefined when it has none. */
  readonly deviceId: string | undefined;
}

/** A device the admin banned; it cannot log in again until it is unbanned. */
export interface BanRow {
  readonly deviceId: string;
  readonly teamId: number;
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
  readonly bannedAt: Date;
}

/** Whether teams can play; the admin closes the game before it starts or after it ends. */
export interface GameSettingsRow {
  readonly closed: boolean;
  /** The last time the admin opened or closed the game; undefined when it never happened. */
  readonly changedAt: Date | undefined;
}

export interface AdminFailures {
  readonly failures: number;
  readonly lastAt: Date;
}

export interface TeamMove {
  readonly node: string | undefined;
  readonly state: State;
  readonly finished: boolean;
  readonly action: string;
}

/**
 * Persistence. `moveTeam` is the only write on the hot path and must be atomic: it applies only
 * when the team is still at `expectedStep`, which is how concurrent devices of a team are resolved.
 * Without an expected step (the admin resets or moves a team) it applies whatever the team does
 * meanwhile, so the admin's word is the last one.
 */
export interface StoreShape {
  readonly listTeams: () => Effect.Effect<readonly TeamRow[], StoreError>;
  readonly getTeam: (id: number) => Effect.Effect<TeamRow | undefined, StoreError>;
  /** The team's row, created (not started) the first time the team is needed. */
  readonly ensureTeam: (id: number) => Effect.Effect<TeamRow, StoreError>;
  /**
   * Returns the updated team, or undefined when the step did not match or the team has no row.
   * With `expectedStep` undefined the move applies at any step.
   */
  readonly moveTeam: (
    id: number,
    expectedStep: number | undefined,
    move: TeamMove,
  ) => Effect.Effect<TeamRow | undefined, StoreError>;

  /**
   * A new game for these teams in one go: rows created where missing, every team moved to `start`
   * whatever its step, the first login, the reading and the devices' sessions forgotten, and the
   * game itself no longer started. Returns the rows as they are then.
   */
  readonly resetTeams: (
    ids: readonly number[],
    start: TeamMove,
  ) => Effect.Effect<readonly TeamRow[], StoreError>;

  /** When the organisers started the game; undefined until they do and after a new game. */
  readonly gameStartedAt: () => Effect.Effect<Date | undefined, StoreError>;
  /** Starts the game and returns when it started; a game already started keeps its start. */
  readonly startGame: () => Effect.Effect<Date, StoreError>;

  /** Records the team's first login; later calls change nothing. */
  readonly markStarted: (id: number) => Effect.Effect<void, StoreError>;
  /**
   * Forgets the first login and the reading and logs the team's devices out, for a new game of the
   * team: its next login starts its clock.
   */
  readonly clearTiming: (id: number) => Effect.Effect<void, StoreError>;
  readonly addReading: (rows: readonly ReadingRow[]) => Effect.Effect<void, StoreError>;
  readonly listReading: () => Effect.Effect<readonly ReadingRow[], StoreError>;

  readonly createSession: (
    id: string,
    teamId: number,
    client: SessionClient,
  ) => Effect.Effect<void, StoreError>;
  /**
   * Resolves a session created after `createdAfter` and records that the device is alive; an
   * older session, or one of a banned device, resolves to undefined.
   */
  readonly touchSession: (
    id: string,
    createdAfter: Date,
  ) => Effect.Effect<number | undefined, StoreError>;
  readonly deleteSession: (id: string) => Effect.Effect<void, StoreError>;
  /** Devices seen since `since`, per team. */
  readonly activeDevices: (since: Date) => Effect.Effect<ReadonlyMap<number, number>, StoreError>;
  /** Sessions created after `createdAfter`, the most recently seen first. */
  readonly listSessions: (createdAfter: Date) => Effect.Effect<readonly SessionRow[], StoreError>;

  /** Bans the device and ends every session of it, in one go. */
  readonly banDevice: (ban: Omit<BanRow, 'bannedAt'>) => Effect.Effect<void, StoreError>;
  readonly unbanDevice: (deviceId: string) => Effect.Effect<void, StoreError>;
  readonly isBanned: (deviceId: string) => Effect.Effect<boolean, StoreError>;
  /** The most recent ban first. */
  readonly listBans: () => Effect.Effect<readonly BanRow[], StoreError>;

  readonly gameSettings: () => Effect.Effect<GameSettingsRow, StoreError>;
  readonly setGameClosed: (closed: boolean) => Effect.Effect<GameSettingsRow, StoreError>;

  /** Failed admin logins from `key` (the client's address) since the last success. */
  readonly adminFailures: (key: string) => Effect.Effect<AdminFailures | undefined, StoreError>;
  readonly recordAdminFailure: (key: string) => Effect.Effect<void, StoreError>;
  readonly clearAdminFailures: (key: string) => Effect.Effect<void, StoreError>;

  readonly recentLog: (limit: number) => Effect.Effect<readonly LogRow[], StoreError>;
  /** Arrivals per node over the whole game, by choice, scan, start, reset or admin move. */
  readonly visitCounts: () => Effect.Effect<ReadonlyMap<string, number>, StoreError>;
}

export class Store extends Context.Service<Store, StoreShape>()('gamebook/Store') {}
