import { neon } from '@neondatabase/serverless'
import type { State } from '@gamebook/core'
import { Effect, Layer } from 'effect'
import { SCHEMA } from './schema.ts'
import type { LocationKind } from '../api.ts'
import { Store, StoreError, type LocationRow, type LogRow, type TeamRow } from './store.ts'

type Row = Record<string, unknown>

const toTeam = (row: Row): TeamRow => ({
  id: Number(row['id']),
  name: String(row['name']),
  startNode: String(row['start_node']),
  node: row['node'] === null ? undefined : String(row['node']),
  state: row['state'] as State,
  step: Number(row['step']),
  finishedAt: row['finished_at'] === null ? undefined : new Date(row['finished_at'] as string),
  updatedAt: new Date(row['updated_at'] as string),
})

const toLocation = (row: Row): LocationRow => ({
  id: Number(row['id']),
  name: String(row['name']),
  kind: row['kind'] as LocationKind,
})

const toLog = (row: Row): LogRow => ({
  teamId: Number(row['team_id']),
  at: new Date(row['at'] as string),
  action: String(row['action']),
  fromNode: row['from_node'] === null ? undefined : String(row['from_node']),
  toNode: row['to_node'] === null ? undefined : String(row['to_node']),
  state: row['state'] as State,
})

/** Neon over HTTP: one round trip per query, no connection to keep warm in a serverless function. */
export const makePostgresStore = (url: string) => {
  const sql = neon(url)
  let ready: Promise<unknown> | undefined
  const migrate = () =>
    (ready ??= sql.transaction(
      SCHEMA
        .split(/;\s*$/m)
        .map((statement) => statement.trim())
        .filter((statement) => statement !== '')
        .map((statement) => sql.query(statement)),
    ))

  const query = <A>(run: () => Promise<A>) =>
    Effect.tryPromise({
      try: async () => {
        await migrate()
        return await run()
      },
      catch: (cause) => {
        ready = undefined // retry the migration on the next request
        return new StoreError({ message: cause instanceof Error ? cause.message : String(cause) })
      },
    })

  return Store.of({
    getDraft: () =>
      query(async () => {
        const [row] = await sql`select source, updated_at from draft where id = 1`
        return row === undefined
          ? { source: '', updatedAt: new Date(0) }
          : { source: String(row['source']), updatedAt: new Date(row['updated_at'] as string) }
      }),
    saveDraft: (source) =>
      query(async () => {
        const [row] = await sql`
          insert into draft (id, source) values (1, ${source})
          on conflict (id) do update set source = excluded.source, updated_at = now()
          returning updated_at`
        return { source, updatedAt: new Date(row!['updated_at'] as string) }
      }),
    publish: (source) =>
      query(async () => {
        const [row] = await sql`insert into version (source) values (${source}) returning id, published_at`
        return { id: Number(row!['id']), source, publishedAt: new Date(row!['published_at'] as string) }
      }),
    currentVersion: () =>
      query(async () => {
        const [row] = await sql`select id, source, published_at from version order by id desc limit 1`
        return row === undefined
          ? undefined
          : { id: Number(row['id']), source: String(row['source']), publishedAt: new Date(row['published_at'] as string) }
      }),

    listLocations: () => query(async () => (await sql`select * from location order by id`).map(toLocation)),
    getLocation: (id) =>
      query(async () => {
        const [row] = await sql`select * from location where id = ${id}`
        return row === undefined ? undefined : toLocation(row)
      }),
    saveLocation: (location) =>
      query(async () => {
        await sql`
          insert into location (id, name, kind) values (${location.id}, ${location.name}, ${location.kind})
          on conflict (id) do update set name = excluded.name, kind = excluded.kind`
        return location
      }),
    deleteLocation: (id) => query(async () => void (await sql`delete from location where id = ${id}`)),

    listTeams: () => query(async () => (await sql`select * from team order by id`).map(toTeam)),
    getTeam: (id) =>
      query(async () => {
        const [row] = await sql`select * from team where id = ${id}`
        return row === undefined ? undefined : toTeam(row)
      }),
    createTeam: (name, startNode) =>
      query(async () => toTeam((await sql`insert into team (name, start_node) values (${name}, ${startNode}) returning *`)[0]!)),
    updateTeam: (id, name, startNode) =>
      query(async () => {
        const [row] = await sql`update team set name = ${name}, start_node = ${startNode} where id = ${id} returning *`
        return row === undefined ? undefined : toTeam(row)
      }),
    deleteTeam: (id) => query(async () => (await sql`delete from team where id = ${id} returning id`).length > 0),
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
          select * from updated`
        return row === undefined ? undefined : toTeam(row)
      }),

    createSession: (id, teamId) => query(async () => void (await sql`insert into session (id, team_id) values (${id}, ${teamId})`)),
    touchSession: (id) =>
      query(async () => {
        // Only write when the last touch is older than 30 s, so polling stays a read.
        const [row] = await sql`
          with touched as (
            update session set last_seen_at = now()
            where id = ${id} and last_seen_at < now() - interval '30 seconds'
          )
          select team_id from session where id = ${id}`
        return row === undefined ? undefined : Number(row['team_id'])
      }),
    deleteSession: (id) => query(async () => void (await sql`delete from session where id = ${id}`)),
    activeDevices: (since) =>
      query(async () => {
        const rows = await sql`
          select team_id, count(*)::int as devices from session
          where last_seen_at >= ${since.toISOString()} group by team_id`
        return new Map(rows.map((row) => [Number(row['team_id']), Number(row['devices'])]))
      }),

    recentLog: (limit) =>
      query(async () => (await sql`select * from step_log order by at desc, id desc limit ${limit}`).map(toLog)),
  })
}

export const PostgresStoreLayer = (url: string) => Layer.sync(Store, () => makePostgresStore(url))
