import { neon } from '@neondatabase/serverless';
import { Effect, Layer, Schema } from 'effect';

import { GameState } from '../api.ts';
import { SCHEMA } from './schema.ts';
import { Store, StoreError, type LogRow, type ReadingRow, type TeamRow } from './store.ts';

type Row = Record<string, unknown>;

// Rows come back untyped, so every column is decoded; a mismatch throws and surfaces as StoreError.
const decodeText = Schema.decodeUnknownSync(Schema.String);
const decodeState = Schema.decodeUnknownSync(GameState);
const decodeTimestamp = Schema.decodeUnknownSync(Schema.Union([Schema.String, Schema.Date]));

const text = (value: unknown) => decodeText(value);
const optionalText = (value: unknown) => (value === null ? undefined : decodeText(value));
const timestamp = (value: unknown) => new Date(decodeTimestamp(value));

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

const toReading = (row: Row): ReadingRow => ({
  teamId: Number(row['team_id']),
  startedAt: timestamp(row['started_at']),
  endedAt: timestamp(row['ended_at']),
});

/** Neon over HTTP: one round trip per query, no connection to keep warm in a serverless function. */
export const makePostgresStore = (url: string) => {
  const sql = neon(url);
  let ready: Promise<unknown> | undefined;
  const migrate = () =>
    (ready ??= sql.transaction(
      SCHEMA.split(/;\s*$/m)
        .map((statement) => statement.trim())
        .filter((statement) => statement !== '')
        .map((statement) => sql.query(statement)),
    ));

  const query = <A>(run: () => Promise<A>) =>
    Effect.tryPromise({
      try: async () => {
        await migrate();
        return await run();
      },
      catch: (cause) => {
        ready = undefined; // retry the migration on the next request
        return new StoreError({ message: cause instanceof Error ? cause.message : String(cause) });
      },
    });

  return Store.of({
    listTeams: () => query(async () => (await sql`select * from team order by id`).map(toTeam)),
    getTeam: (id) =>
      query(async () => {
        const [row] = await sql`select * from team where id = ${id}`;
        return row === undefined ? undefined : toTeam(row);
      }),
    ensureTeam: (id) =>
      query(async () => {
        // The no-op update makes `returning` yield the row when it already exists.
        const [row] = await sql`
          insert into team (id) values (${id})
          on conflict (id) do update set id = excluded.id
          returning *`;
        return toTeam(row!);
      }),
    moveTeam: (id, expectedStep, move) =>
      query(async () => {
        // CTEs see the table as it was before the update, so `previous` holds the old node.
        const [row] = await sql`
          with previous as (select node from team where id = ${id}),
          updated as (
            update team set
              node = ${move.node ?? null},
              state = ${JSON.stringify(move.state)}::jsonb,
              step = step + 1,
              finished_at = case when ${move.finished} then coalesce(finished_at, now()) else null end,
              updated_at = now()
            where id = ${id} and step = ${expectedStep}
            returning *
          ),
          logged as (
            insert into step_log (team_id, action, from_node, to_node, state)
            select updated.id, ${move.action}, (select node from previous), updated.node, updated.state from updated
          )
          select * from updated`;
        return row === undefined ? undefined : toTeam(row);
      }),

    markStarted: (id) =>
      query(
        async () =>
          void (await sql`update team set started_at = coalesce(started_at, now()) where id = ${id}`),
      ),
    clearTiming: (id) =>
      query(
        async () =>
          void (await sql.transaction([
            sql`update team set started_at = null where id = ${id}`,
            sql`delete from reading where team_id = ${id}`,
          ])),
      ),
    addReading: (rows) =>
      query(
        async () =>
          void (await sql.transaction(
            rows.map(
              ({ teamId, startedAt, endedAt }) => sql`
                insert into reading (team_id, started_at, ended_at)
                values (${teamId}, ${startedAt.toISOString()}, ${endedAt.toISOString()})`,
            ),
          )),
      ),
    listReading: () => query(async () => (await sql`select * from reading`).map(toReading)),

    createSession: (id, teamId) =>
      query(
        async () => void (await sql`insert into session (id, team_id) values (${id}, ${teamId})`),
      ),
    touchSession: (id) =>
      query(async () => {
        // Only write when the last touch is older than 30 s, so polling stays a read.
        const [row] = await sql`
          with touched as (
            update session set last_seen_at = now()
            where id = ${id} and last_seen_at < now() - interval '30 seconds'
          )
          select team_id from session where id = ${id}`;
        return row === undefined ? undefined : Number(row['team_id']);
      }),
    deleteSession: (id) =>
      query(async () => void (await sql`delete from session where id = ${id}`)),
    activeDevices: (since) =>
      query(async () => {
        const rows = await sql`
          select team_id, count(*)::int as devices from session
          where last_seen_at >= ${since.toISOString()} group by team_id`;
        return new Map(rows.map((row) => [Number(row['team_id']), Number(row['devices'])]));
      }),

    recentLog: (limit) =>
      query(async () =>
        (await sql`select * from step_log order by at desc, id desc limit ${limit}`).map(toLog),
      ),
    visitCounts: () =>
      query(async () => {
        const rows = await sql`
          select to_node, count(*)::int as visits from step_log
          where to_node is not null group by to_node`;
        return new Map(rows.map((row) => [text(row['to_node']), Number(row['visits'])]));
      }),
  });
};

export const PostgresStoreLayer = (url: string) => Layer.sync(Store, () => makePostgresStore(url));
