import type { State } from '@gamebook/core';
import { Context, type Effect, Schema } from 'effect';

import type { LocationKind } from '../api.ts';

export class StoreError extends Schema.TaggedError<StoreError>()('StoreError', {
  message: Schema.String,
}) {}

export interface LocationRow {
  readonly id: number;
  readonly name: string;
  readonly kind: LocationKind;
}

export interface TeamRow {
  readonly id: number;
  readonly name: string;
  readonly startNode: string;
  /** Undefined until the team starts (or after a reset). */
  readonly node: string | undefined;
  readonly state: State;
  /** Checkpoints of the current node already unlocked by scanning. */
  readonly checkpoints: number;
  readonly step: number;
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

export interface TeamMove {
  readonly node: string | undefined;
  readonly state: State;
  readonly checkpoints: number;
  readonly finished: boolean;
  readonly action: string;
}

/**
 * Persistence. `moveTeam` is the only write on the hot path and must be atomic: it applies only
 * when the team is still at `expectedStep`, which is how concurrent devices of a team are resolved.
 */
export interface StoreShape {
  readonly listLocations: () => Effect.Effect<readonly LocationRow[], StoreError>;
  readonly getLocation: (id: number) => Effect.Effect<LocationRow | undefined, StoreError>;
  readonly saveLocation: (location: LocationRow) => Effect.Effect<LocationRow, StoreError>;
  readonly deleteLocation: (id: number) => Effect.Effect<void, StoreError>;

  readonly listTeams: () => Effect.Effect<readonly TeamRow[], StoreError>;
  readonly getTeam: (id: number) => Effect.Effect<TeamRow | undefined, StoreError>;
  readonly createTeam: (name: string, startNode: string) => Effect.Effect<TeamRow, StoreError>;
  readonly updateTeam: (
    id: number,
    name: string,
    startNode: string,
  ) => Effect.Effect<TeamRow | undefined, StoreError>;
  readonly deleteTeam: (id: number) => Effect.Effect<boolean, StoreError>;
  /** Returns the updated team, or undefined when the step did not match. */
  readonly moveTeam: (
    id: number,
    expectedStep: number,
    move: TeamMove,
  ) => Effect.Effect<TeamRow | undefined, StoreError>;

  readonly createSession: (id: string, teamId: number) => Effect.Effect<void, StoreError>;
  /** Resolves a session and records that the device is alive. */
  readonly touchSession: (id: string) => Effect.Effect<number | undefined, StoreError>;
  readonly deleteSession: (id: string) => Effect.Effect<void, StoreError>;
  /** Devices seen since `since`, per team. */
  readonly activeDevices: (since: Date) => Effect.Effect<ReadonlyMap<number, number>, StoreError>;

  readonly recentLog: (limit: number) => Effect.Effect<readonly LogRow[], StoreError>;
  /** Arrivals per node over the whole game; scans keep a team on its node and do not count. */
  readonly visitCounts: () => Effect.Effect<ReadonlyMap<string, number>, StoreError>;
}

export class Store extends Context.Service<Store, StoreShape>()('gamebook/Store') {}
