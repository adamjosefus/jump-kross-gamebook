import { PGlite } from '@electric-sql/pglite';
import { encodeQr } from '@gamebook/core';
import { Effect, Layer } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SAMPLE } from '../../core/test/fixtures.ts';
import { makeHandler, type ServerConfigShape } from '../src/server/index.ts';
import {
  makePostgresStore,
  schemaStatements,
  type Row,
  type SqlClient,
} from '../src/server/store-postgres.ts';
import { Store } from '../src/server/store.ts';

/**
 * The store's SQL on a real Postgres, embedded: the same statements the Neon driver sends, run by
 * PGlite in this process. What the driver itself does (HTTP, pooling) is Neon's to test.
 */
const pgliteClient = (db: PGlite): SqlClient => ({
  query: async ({ text, params }) => (await db.query<Row>(text, [...params])).rows,
  transaction: (statements) =>
    db.transaction(async (transaction) => {
      for (const { text, params } of statements) await transaction.query(text, [...params]);
    }),
});

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

describe('postgres store', () => {
  let db: PGlite;
  let store: ReturnType<typeof makePostgresStore>;
  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    store = makePostgresStore(pgliteClient(db));
  });
  afterAll(() => db.close());

  it('applies the schema, and applies it again without harm', async () => {
    await run(store.listTeams());
    // A second instance (another function instance) finds the tables there already.
    const again = makePostgresStore(pgliteClient(db));
    expect(await run(again.listTeams())).toEqual([]);
    expect(schemaStatements().every(({ text }) => text !== '')).toBe(true);
  });

  it('creates a team once and keeps its progress', async () => {
    const created = await run(store.ensureTeam(1));
    expect(created).toMatchObject({ id: 1, node: undefined, state: {}, step: 0 });
    expect(created.startedAt).toBeUndefined();
    expect(created.updatedAt).toBeInstanceOf(Date);

    const moved = await run(
      store.moveTeam(1, 0, { node: 'A1', state: { gold: 100 }, finished: false, action: 'start' }),
    );
    expect(moved).toMatchObject({ node: 'A1', state: { gold: 100 }, step: 1 });
    expect(await run(store.ensureTeam(1))).toMatchObject({ node: 'A1', step: 1 });
    expect(await run(store.getTeam(1))).toMatchObject({ node: 'A1', step: 1 });
    expect(await run(store.getTeam(9))).toBeUndefined();
  });

  it('moves a team only from the expected step, or from any step without one', async () => {
    const stale = await run(
      store.moveTeam(1, 0, { node: 'B1', state: {}, finished: false, action: 'choice:0' }),
    );
    expect(stale).toBeUndefined();
    const fresh = await run(
      store.moveTeam(1, 1, {
        node: 'B1',
        state: { gold: 100, hatColor: 'blue' },
        finished: false,
        action: 'choice:0',
      }),
    );
    expect(fresh).toMatchObject({ node: 'B1', step: 2, state: { gold: 100, hatColor: 'blue' } });
    const forced = await run(
      store.moveTeam(1, undefined, {
        node: 'OUTRO',
        state: { gold: 150 },
        finished: true,
        action: 'admin',
      }),
    );
    expect(forced).toMatchObject({ node: 'OUTRO', step: 3, state: { gold: 150 } });
    expect(forced?.finishedAt).toBeInstanceOf(Date);
    // A team without a row cannot be moved.
    expect(
      await run(
        store.moveTeam(9, undefined, { node: 'A1', state: {}, finished: false, action: 'x' }),
      ),
    ).toBeUndefined();

    // The log has every move with the node it came from; the visits count arrivals.
    const log = await run(store.recentLog(10));
    expect(log.map(({ action, fromNode, toNode }) => [action, fromNode, toNode])).toEqual([
      ['admin', 'B1', 'OUTRO'],
      ['choice:0', 'A1', 'B1'],
      ['start', undefined, 'A1'],
    ]);
    expect(log[0]?.state).toEqual({ gold: 150 });
    expect(await run(store.recentLog(1))).toHaveLength(1);
    expect(await run(store.visitCounts())).toEqual(
      new Map([
        ['A1', 1],
        ['B1', 1],
        ['OUTRO', 1],
      ]),
    );
  });

  it('keeps the finish of a finished team and forgets it on a move away', async () => {
    const stillFinished = await run(
      store.moveTeam(1, undefined, { node: 'OUTRO', state: {}, finished: true, action: 'admin' }),
    );
    const first = (await run(store.recentLog(10))).at(-1)!.at;
    expect(stillFinished?.finishedAt?.getTime()).toBeGreaterThanOrEqual(first.getTime());
    const back = await run(
      store.moveTeam(1, undefined, { node: 'A1', state: {}, finished: false, action: 'reset' }),
    );
    expect(back?.finishedAt).toBeUndefined();
  });

  it('starts the game once', async () => {
    expect(await run(store.gameStartedAt())).toBeUndefined();
    const started = await run(store.startGame());
    expect(started).toBeInstanceOf(Date);
    expect(await run(store.startGame())).toEqual(started);
    expect(await run(store.gameStartedAt())).toEqual(started);
  });

  it('records the first login once and clears it with the reading and the sessions', async () => {
    await run(store.createSession('forgotten', 1));
    await run(store.markStarted(1));
    const started = (await run(store.getTeam(1)))!.startedAt;
    expect(started).toBeInstanceOf(Date);
    await run(store.markStarted(1));
    expect((await run(store.getTeam(1)))!.startedAt).toEqual(started);

    const now = Date.now();
    await run(
      store.addReading([
        { teamId: 1, startedAt: new Date(now - 5000), endedAt: new Date(now - 1000) },
        { teamId: 1, startedAt: new Date(now - 3000), endedAt: new Date(now) },
      ]),
    );
    await run(store.ensureTeam(2));
    await run(
      store.addReading([{ teamId: 2, startedAt: new Date(now - 500), endedAt: new Date(now) }]),
    );
    const reading = await run(store.listReading());
    expect(reading.map(({ teamId }) => teamId)).toEqual([1, 1, 2]);
    expect(reading[0]!.startedAt.getTime()).toBe(now - 5000);
    expect(reading[0]!.endedAt.getTime()).toBe(now - 1000);

    await run(store.clearTiming(1));
    expect((await run(store.getTeam(1)))!.startedAt).toBeUndefined();
    expect((await run(store.listReading())).map(({ teamId }) => teamId)).toEqual([2]);
    const old = new Date(Date.now() - 60_000);
    expect(await run(store.touchSession('forgotten', old))).toBeUndefined();
  });

  it('resolves sessions created after the limit and counts the devices', async () => {
    await run(store.createSession('phone', 1));
    await run(store.createSession('tablet', 1));
    await run(store.createSession('other', 2));
    const old = new Date(Date.now() - 60_000);
    expect(await run(store.touchSession('phone', old))).toBe(1);
    expect(await run(store.touchSession('other', old))).toBe(2);
    expect(await run(store.touchSession('nobody', old))).toBeUndefined();
    // A session created before the limit has expired.
    expect(await run(store.touchSession('phone', new Date(Date.now() + 60_000)))).toBeUndefined();

    expect(await run(store.activeDevices(old))).toEqual(
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
    expect(await run(store.activeDevices(new Date(Date.now() + 60_000)))).toEqual(new Map());

    await run(store.deleteSession('tablet'));
    expect(await run(store.activeDevices(old))).toEqual(
      new Map([
        [1, 1],
        [2, 1],
      ]),
    );
    expect(await run(store.touchSession('tablet', old))).toBeUndefined();
  });

  it('turns a failed statement into a StoreError and runs the migration again after it', async () => {
    const calls: string[] = [];
    let failing = true;
    const client = pgliteClient(db);
    const flaky: SqlClient = {
      query: client.query,
      transaction: (statements) => {
        calls.push(statements[0]!.text.slice(0, 12));
        if (failing) return Promise.reject(new Error('connection refused'));
        return client.transaction(statements);
      },
    };
    const unlucky = makePostgresStore(flaky);
    const failed = await Effect.runPromise(Effect.flip(unlucky.listTeams()));
    expect(failed).toMatchObject({ _tag: 'StoreError', message: 'connection refused' });
    failing = false;
    expect((await run(unlucky.listTeams())).map(({ id }) => id)).toEqual([1, 2]);
    // The migration was tried on the first call and again on the second, then not anymore.
    await run(unlucky.listTeams());
    expect(calls).toEqual(['select pg_ad', 'select pg_ad']);
  });

  it('does not run the migration again after a failed query', async () => {
    const calls: string[] = [];
    const client = pgliteClient(db);
    const counting: SqlClient = {
      query: client.query,
      transaction: (statements) => {
        calls.push(statements[0]!.text.slice(0, 12));
        return client.transaction(statements);
      },
    };
    const counted = makePostgresStore(counting);
    await run(counted.listTeams());
    const failed = await Effect.runPromise(
      Effect.flip(
        counted.moveTeam(Number.NaN, 0, { node: 'A1', state: {}, finished: false, action: 'x' }),
      ),
    );
    expect(failed._tag).toBe('StoreError');
    await run(counted.listTeams());
    expect(calls).toEqual(['select pg_ad']);
  });

  it('reads a state with a value it cannot hold leniently', async () => {
    await db.query(
      `update team set state = '{"gold": null, "bag": {"a": 1}, "ok": 3}'::jsonb where id = 2`,
    );
    expect((await run(store.getTeam(2)))?.state).toEqual({ ok: 3 });
    expect((await run(store.listTeams())).map(({ id }) => id)).toEqual([1, 2]);
  });

  it('resets several teams in one go', async () => {
    await run(store.createSession('again', 1));
    await run(store.markStarted(1));
    const rows = await run(
      store.resetTeams([1, 2, 3], {
        node: 'A1',
        state: { gold: 100 },
        finished: false,
        action: 'reset',
      }),
    );
    expect(
      rows.map(({ id, node, state, startedAt, finishedAt }) => [
        id,
        node,
        state,
        startedAt,
        finishedAt,
      ]),
    ).toEqual([
      [1, 'A1', { gold: 100 }, undefined, undefined],
      [2, 'A1', { gold: 100 }, undefined, undefined],
      [3, 'A1', { gold: 100 }, undefined, undefined],
    ]);
    expect(rows.map(({ step }) => step)).toEqual([rows[0]!.step, 1, 1]);
    expect(await run(store.listReading())).toEqual([]);
    // The devices are logged out and the game waits for the organisers to start it again.
    expect(await run(store.touchSession('again', new Date(Date.now() - 60_000)))).toBeUndefined();
    expect(await run(store.gameStartedAt())).toBeUndefined();
    const log = await run(store.recentLog(3));
    expect(log.map(({ teamId, action, toNode }) => [teamId, action, toNode])).toEqual([
      [3, 'reset', 'A1'],
      [2, 'reset', 'A1'],
      [1, 'reset', 'A1'],
    ]);
  });

  it('counts failed admin logins per address', async () => {
    expect(await run(store.adminFailures('1.2.3.4'))).toBeUndefined();
    await run(store.recordAdminFailure('1.2.3.4'));
    await run(store.recordAdminFailure('1.2.3.4'));
    const failures = await run(store.adminFailures('1.2.3.4'));
    expect(failures?.failures).toBe(2);
    expect(failures?.lastAt).toBeInstanceOf(Date);
    await run(store.clearAdminFailures('1.2.3.4'));
    expect(await run(store.adminFailures('1.2.3.4'))).toBeUndefined();
  });
});

describe('the api on postgres', () => {
  const config: ServerConfigShape = {
    adminPassword: 'heslo',
    qrSecret: 'qr-secret',
    sessionSecret: 'session-secret',
    insecureCookies: true,
  };

  it('plays the beginning of a game', async () => {
    const db = new PGlite();
    await db.waitReady;
    const api = makeHandler(
      config,
      Layer.succeed(Store, makePostgresStore(pgliteClient(db))),
      SAMPLE,
    );
    const jar = new Map<string, string>();
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await api.handler(
        new Request(`http://localhost${path}`, {
          method,
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      for (const header of response.headers.getSetCookie()) {
        const [name, value] = header.split(';')[0]!.split('=');
        jar.set(name!, value!);
      }
      const text = await response.text();
      return { status: response.status, body: text === '' ? undefined : JSON.parse(text) };
    };

    // The organisers start the game first; the admin logs out again so the player's cookie jar
    // stays a player's.
    expect((await call('POST', '/api/admin/login', { password: 'heslo' })).status).toBe(204);
    expect((await call('POST', '/api/admin/game/start')).status).toBe(200);
    const login = await call('POST', '/api/player/login', {
      code: await encodeQr(config.qrSecret, { kind: 'T', id: 1 }),
    });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ team: { id: 1, name: 'Vlci' }, step: 1, status: 'playing' });
    expect(login.body.node).toMatchObject({ id: 'A1' });

    const chosen = await call('POST', '/api/player/choose', { index: 0, expectedStep: 1 });
    expect(chosen.status).toBe(200);
    expect(chosen.body).toMatchObject({ step: 2, node: { id: 'B1' } });
    const late = await call('POST', '/api/player/choose', { index: 0, expectedStep: 1 });
    expect(late.status).toBe(409);

    expect((await call('POST', '/api/admin/login', { password: 'heslo' })).status).toBe(204);
    const overview = await call('GET', '/api/admin/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.teams).toMatchObject([
      { id: 1, node: 'B1', step: 2, devices: 1, state: { gold: 100, hatColor: 'blue' } },
      { id: 2, step: 0, devices: 0 },
    ]);
    expect(overview.body.log.map((entry: { action: string }) => entry.action)).toEqual([
      'choice:0',
      'start',
    ]);
    expect(overview.body.visits).toEqual({ A1: 1, B1: 1 });

    const reset = await call('POST', '/api/admin/teams/1/reset');
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({
      node: 'A1',
      step: 3,
      state: { gold: 100, hatColor: 'red' },
    });
    // The reset logged the device out; it logs in again and finds the team on the start.
    expect((await call('GET', '/api/player/state')).status).toBe(401);
    const again = await call('POST', '/api/player/login', {
      code: await encodeQr(config.qrSecret, { kind: 'T', id: 1 }),
    });
    expect(again.body).toMatchObject({ step: 3, node: { id: 'A1' } });

    await api.dispose();
    await db.close();
  });
});
