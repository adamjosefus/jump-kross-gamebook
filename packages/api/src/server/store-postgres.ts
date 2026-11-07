import type { State, Value } from '@gamebook/core';
import { neon } from '@neondatabase/serverless';
import { Effect, Layer, Schema } from 'effect';

import { SCHEMA } from './schema.ts';
import {
  Store,
  StoreError,
  type AdminFailures,
  type GameSettingsRow,
  type LogRow,
  type ReadingRow,
  type SessionRow,
  type TeamRow,
} from './store.ts';

export type Row = Readonly<Record<string, unknown>>;

/** One SQL statement with `$1`, `$2`, … in place of its parameters. */
export interface SqlStatement {
  readonly text: string;
  readonly params: readonly unknown[];
}

/**
 * What the store needs of a database: the two ways Neon's HTTP driver runs statements. Tests run
 * the same store on an embedded Postgres through this.
 */
export interface SqlClient {
  /** Runs one statement and returns its rows. */
  readonly query: (statement: SqlStatement) => Promise<readonly Row[]>;
  /** Runs the statements in order, in one transaction. */
  readonly transaction: (statements: readonly SqlStatement[]) => Promise<void>;
}

/** Writes a statement: the values of the template become its parameters, in order. */
const sql = (strings: TemplateStringsArray, ...values: readonly unknown[]): SqlStatement => ({
  text: strings.slice(1).reduce((text, part, index) => `${text}$${index + 1}${part}`, strings[0]!),
  params: values,
});

/** Neon over HTTP: one round trip per query, no connection to keep warm in a serverless function. */
export const neonClient = (url: string): SqlClient => {
  const run = neon(url);
  return {
    query: async ({ text, params }) => (await run.query(text, [...params])) as readonly Row[],
    transaction: async (statements) =>
      void (await run.transaction(
        statements.map(({ text, params }) => run.query(text, [...params])),
      )),
  };
};

/** The schema as the statements to run, in order. */
export const schemaStatements = (): readonly SqlStatement[] =>
  SCHEMA.split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
    .map((text) => ({ text, params: [] }));

// Rows come back untyped, so every column is decoded; a mismatch throws and surfaces as StoreError.
const decodeText = Schema.decodeUnknownSync(Schema.String);
const decodeObject = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));
const decodeTimestamp = Schema.decodeUnknownSync(Schema.Union([Schema.String, Schema.Date]));

const text = (value: unknown) => decodeText(value);
const optionalText = (value: unknown) => (value === null ? undefined : decodeText(value));
const timestamp = (value: unknown) => new Date(decodeTimestamp(value));
/**
 * A state is read leniently: a value the game cannot hold (a `null` from a `NaN`, an object) is
 * dropped rather than making the row, and with it every list of teams, unreadable for good.
 */
const isValue = (entry: unknown): entry is Value =>
  typeof entry === 'string' || typeof entry === 'boolean' || Number.isFinite(entry);
const decodeState = (value: unknown): State =>
  Object.fromEntries(
    Object.entries(decodeObject(value)).flatMap(([key, entry]): readonly [string, Value][] =>
      isValue(entry) ? [[key, entry]] : [],
    ),
  );

const toTeam = (row: Row): TeamRow => ({
  id: Number(row['id']),
  node: optionalText(row['node']),
  state: decodeState(row['state']),
  step: Number(row['step']),
  startedAt: row['started_at'] === null ? undefined : timestamp(row['started_at']),
  finishedAt: row['finished_at'] === null ? undefined : timestamp(row['finished_at']),
  updatedAt: timestamp(row['updated_at']),
});

const toLog = (row: Row): LogRow => ({
  teamId: Number(row['team_id']),
  at: timestamp(row['at']),
  action: text(row['action']),
  fromNode: optionalText(row['from_node']),
  toNode: optionalText(row['to_node']),
  state: decodeState(row['state']),
});

const toFailures = (row: Row): AdminFailures => ({
  failures: Number(row['failures']),
  lastAt: timestamp(row['last_at']),
});

const toSession = (row: Row): SessionRow => ({
  id: text(row['id']),
  teamId: Number(row['team_id']),
  createdAt: timestamp(row['created_at']),
  lastSeenAt: timestamp(row['last_seen_at']),
  ip: optionalText(row['ip']),
  userAgent: optionalText(row['user_agent']),
});

const toSettings = (row: Row | undefined): GameSettingsRow => ({
  closed: row?.['closed'] === true,
  changedAt:
    row === undefined || row['closed_changed_at'] === null
      ? undefined
      : timestamp(row['closed_changed_at']),
});

const toReading = (row: Row): ReadingRow => ({
  teamId: Number(row['team_id']),
  startedAt: timestamp(row['started_at']),
  endedAt: timestamp(row['ended_at']),
});

/** The store on a Postgres database reached through `client`; the schema is applied on the first query. */
export const makePostgresStore = (client: SqlClient) => {
  const { query: run, transaction } = client;
  // The migration runs once per instance and is retried only after it failed itself, so its
  // promise is kept in a `let`. A failed query must not run the DDL (and take its locks) again.
  let ready: Promise<unknown> | undefined;
  const migrate = () =>
    (ready ??= transaction(schemaStatements()).catch((cause: unknown) => {
      ready = undefined;
      throw cause;
    }));

  const query = <A>(compute: () => Promise<A>) =>
    Effect.tryPromise({
      try: async () => {
        await migrate();
        return await compute();
      },
      catch: (cause) =>
        new StoreError({ message: cause instanceof Error ? cause.message : String(cause) }),
    });

  return Store.of({
    listTeams: () =>
      query(async () => (await run(sql`select * from team order by id`)).map(toTeam)),
    getTeam: (id) =>
      query(async () => {
        const [row] = await run(sql`select * from team where id = ${id}`);
        return row === undefined ? undefined : toTeam(row);
      }),
    ensureTeam: (id) =>
      query(async () => {
        // The no-op update makes `returning` yield the row when it already exists.
        const [row] = await run(sql`
          insert into team (id) values (${id})
          on conflict (id) do update set id = excluded.id
          returning *`);
        return toTeam(row!);
      }),
    moveTeam: (id, expectedStep, move) =>
      query(async () => {
        // CTEs see the table as it was before the update, so `previous` holds the old node. A
        // null expected step matches any step.
        const [row] = await run(sql`
          with previous as (select node from team where id = ${id}),
          updated as (
            update team set
              node = ${move.node ?? null},
              state = ${JSON.stringify(move.state)}::jsonb,
              step = step + 1,
              finished_at = case when ${move.finished} then coalesce(finished_at, now()) else null end,
              updated_at = now()
            where id = ${id} and (${expectedStep ?? null}::int is null or step = ${expectedStep ?? null}::int)
            returning *
          ),
          logged as (
            insert into step_log (team_id, action, from_node, to_node, state)
            select updated.id, ${move.action}, (select node from previous), updated.node, updated.state from updated
          )
          select * from updated`);
        return row === undefined ? undefined : toTeam(row);
      }),

    resetTeams: (ids, start) =>
      query(async () => {
        const list = [...ids];
        const state = JSON.stringify(start.state);
        await transaction([
          sql`insert into team (id) select unnest(${list}::int[]) on conflict (id) do nothing`,
          sql`
            insert into step_log (team_id, action, from_node, to_node, state)
            select id, ${start.action}, node, ${start.node ?? null}, ${state}::jsonb
            from team where id = any(${list}::int[]) order by id`,
          sql`
            update team set
              node = ${start.node ?? null},
              state = ${state}::jsonb,
              step = step + 1,
              finished_at = case when ${start.finished} then coalesce(finished_at, now()) else null end,
              started_at = null,
              updated_at = now()
            where id = any(${list}::int[])`,
          sql`delete from reading where team_id = any(${list}::int[])`,
          sql`delete from session where team_id = any(${list}::int[])`,
          sql`update game set started_at = null`,
        ]);
        return (await run(sql`select * from team where id = any(${list}::int[]) order by id`)).map(
          toTeam,
        );
      }),

    gameStartedAt: () =>
      query(async () => {
        const [row] = await run(sql`select started_at from game where id = 1`);
        return row === undefined || row['started_at'] === null
          ? undefined
          : timestamp(row['started_at']);
      }),
    startGame: () =>
      query(async () => {
        const [row] = await run(sql`
          insert into game (id, started_at) values (1, now())
          on conflict (id) do update set started_at = coalesce(game.started_at, now())
          returning started_at`);
        return timestamp(row!['started_at']);
      }),

    markStarted: (id) =>
      query(
        async () =>
          void (await run(
            sql`update team set started_at = coalesce(started_at, now()) where id = ${id}`,
          )),
      ),
    clearTiming: (id) =>
      query(() =>
        transaction([
          sql`update team set started_at = null where id = ${id}`,
          sql`delete from reading where team_id = ${id}`,
          sql`delete from session where team_id = ${id}`,
        ]),
      ),
    addReading: (rows) =>
      query(() =>
        transaction(
          rows.map(
            ({ teamId, startedAt, endedAt }) => sql`
              insert into reading (team_id, started_at, ended_at)
              values (${teamId}, ${startedAt.toISOString()}::timestamptz, ${endedAt.toISOString()}::timestamptz)`,
          ),
        ),
      ),
    listReading: () =>
      query(async () => (await run(sql`select * from reading order by id`)).map(toReading)),

    createSession: (id, teamId, { ip, userAgent }) =>
      query(
        async () =>
          void (await run(sql`
            insert into session (id, team_id, ip, user_agent)
            values (${id}, ${teamId}, ${ip ?? null}, ${userAgent ?? null})`)),
      ),
    touchSession: (id, createdAfter) =>
      query(async () => {
        // Only write when the last touch is older than 30 s, so polling stays a read.
        const [row] = await run(sql`
          with touched as (
            update session set last_seen_at = now()
            where id = ${id} and created_at > ${createdAfter.toISOString()}::timestamptz
              and last_seen_at < now() - interval '30 seconds'
          )
          select team_id from session
          where id = ${id} and created_at > ${createdAfter.toISOString()}::timestamptz`);
        return row === undefined ? undefined : Number(row['team_id']);
      }),
    deleteSession: (id) =>
      query(async () => void (await run(sql`delete from session where id = ${id}`))),
    activeDevices: (since) =>
      query(async () => {
        const rows = await run(sql`
          select team_id, count(*)::int as devices from session
          where last_seen_at >= ${since.toISOString()}::timestamptz group by team_id`);
        return new Map(rows.map((row) => [Number(row['team_id']), Number(row['devices'])]));
      }),
    listSessions: (createdAfter) =>
      query(async () =>
        (
          await run(sql`
            select * from session where created_at > ${createdAfter.toISOString()}::timestamptz
            order by last_seen_at desc, created_at desc`)
        ).map(toSession),
      ),

    gameSettings: () =>
      query(async () => {
        const [row] = await run(sql`select closed, closed_changed_at from game where id = 1`);
        return toSettings(row);
      }),
    setGameClosed: (closed) =>
      query(async () => {
        const [row] = await run(sql`
          insert into game (id, closed, closed_changed_at) values (1, ${closed}, now())
          on conflict (id) do update
            set closed = excluded.closed, closed_changed_at = excluded.closed_changed_at
          returning closed, closed_changed_at`);
        return toSettings(row);
      }),

    adminFailures: (key) =>
      query(async () => {
        const [row] = await run(sql`select failures, last_at from admin_login where key = ${key}`);
        return row === undefined ? undefined : toFailures(row);
      }),
    recordAdminFailure: (key) =>
      query(
        async () =>
          void (await run(sql`
            insert into admin_login (key, failures, last_at) values (${key}, 1, now())
            on conflict (key) do update set failures = admin_login.failures + 1, last_at = now()`)),
      ),
    clearAdminFailures: (key) =>
      query(async () => void (await run(sql`delete from admin_login where key = ${key}`))),

    recentLog: (limit) =>
      query(async () =>
        (await run(sql`select * from step_log order by at desc, id desc limit ${limit}`)).map(
          toLog,
        ),
      ),
    visitCounts: () =>
      query(async () => {
        const rows = await run(sql`
          select to_node, count(*)::int as visits from step_log
          where to_node is not null group by to_node`);
        return new Map(rows.map((row) => [text(row['to_node']), Number(row['visits'])]));
      }),
  });
};

export const PostgresStoreLayer = (url: string) =>
  Layer.sync(Store, () => makePostgresStore(neonClient(url)));
