import { encodeQr } from '@gamebook/core';
import { Effect, Layer } from 'effect';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { SAMPLE } from '../../core/test/fixtures.ts';
import {
  emptyMemoryData,
  handlerFromEnv,
  makeHandler,
  MemoryStoreLayer,
  type ServerConfigShape,
} from '../src/server/index.ts';
import { makeMemoryStore } from '../src/server/store-memory.ts';
import { Store, StoreError, type StoreShape } from '../src/server/store.ts';

const config: ServerConfigShape = {
  adminPassword: 'heslo',
  qrSecret: 'qr-secret',
  sessionSecret: 'session-secret',
  insecureCookies: true,
};
/** The data behind the shared handler, so a test can put a team's first scan into the past. */
const shared = emptyMemoryData();
const { handler, dispose } = makeHandler(config, MemoryStoreLayer(shared), SAMPLE);
afterAll(() => dispose());

/** Minimal client with its own cookie jar, like one phone. */
const device = (
  handle = handler,
  extraHeaders: Readonly<Record<string, string>> = {},
  // The jar is updated in place as cookies arrive, like a browser's.
  jar = new Map<string, string>(),
) => {
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...extraHeaders,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const [name, value] = pair!.split('=');
      jar.set(name!, value!);
    }
    const text = await response.text();
    return { status: response.status, body: text === '' ? undefined : JSON.parse(text) };
  };
  return Object.assign(call, { jar });
};

describe('api', () => {
  const admin = device();

  it('protects admin endpoints', async () => {
    expect((await admin('GET', '/api/admin/overview')).status).toBe(401);
    expect((await admin('POST', '/api/admin/login', { password: 'špatně' })).status).toBe(401);
    expect((await admin('POST', '/api/admin/login', { password: 'heslo' })).status).toBe(204);
    expect((await admin('GET', '/api/admin/overview')).status).toBe(200);
  });

  it('serves the story graph to the admin', async () => {
    const graph = (await admin('GET', '/api/admin/story')).body;
    expect(graph.order).toEqual(['INTRO', 'A1', 'A2', 'B1', 'OUTRO']);
    expect(graph).toMatchObject({ start: 'A1', nodes: { A1: { type: 'start', reached: true } } });
    expect(graph.nodes.B1.preview.blocks[0]).toContain('chudou pokrývku hlavy');
  });

  it('shows the intro to anyone', async () => {
    expect((await device()('GET', '/api/player/intro')).body).toEqual({
      screens: [{ theme: 'intro', content: '# Hra\n\nNaskenujte kód svého týmu.' }],
    });
  });

  it('plays a test run without storing anything', async () => {
    const play = (body: unknown) => admin('POST', '/api/admin/playtest', body);
    const at = (step: { readonly node: string; readonly state: unknown }) => ({
      node: step.node,
      state: step.state,
    });
    // From the intro a team's login code (or skipping it) leads to the start.
    const start = (await play({})).body;
    expect(start).toMatchObject({ node: 'A1', state: { gold: 100 }, view: { choices: [{}, {}] } });
    const lisky = await encodeQr(config.qrSecret, { kind: 'T', id: 2 });
    // The login code decides the team the content is shown for; skipping it means the first one.
    expect(start.team).toEqual({ id: 1, name: 'Vlci' });
    const asLisky = (await play({ move: { code: lisky } })).body;
    expect(asLisky).toEqual({ ...start, team: { id: 2, name: 'Lišky' } });
    const b1Path = (await play({ position: at(start), team: 2, move: { choice: 0 } })).body;
    expect(b1Path.team.name).toBe('Lišky');
    const c1 = await play({ position: at(b1Path), team: 2, move: { choice: 0 } });
    expect(c1.body.view.screens[0].content).toBe('Prohráli jste, týme Lišky.');
    const place = await encodeQr(config.qrSecret, { kind: 'L', id: 32 });
    expect((await play({ move: { code: place } })).body._tag).toBe('InvalidCode');

    const a2 = (await play({ position: at(start), move: { choice: 1 } })).body;
    // The test run names the places, so the admin can skip the QR code.
    expect(a2).toMatchObject({
      node: 'A2',
      state: { gold: 80, hatColor: 'green' },
      view: { scan: true, scans: [{ id: 32, name: 'Místo 32' }, { id: 33 }] },
    });
    // A real code works too and is checked like in the game.
    expect((await play({ position: at(a2), move: { code: place } })).body.node).toBe('B1');
    expect((await play({ position: at(a2), move: { code: 'L-32-AAAA' } })).body._tag).toBe(
      'InvalidCode',
    );
    const b1 = (await play({ position: at(a2), move: { scan: 33 } })).body;
    expect(b1).toMatchObject({ node: 'B1', state: { gold: 130 } });
    expect(b1.view.choices.map((choice: { readonly label: string }) => choice.label)).toEqual([
      'Bojovat',
      'Koupit meč',
    ]);

    expect((await play({ position: at(b1), move: { scan: 32 } })).body.reason).toBe('no-scan');
    expect((await admin('GET', '/api/admin/overview')).body.log).toEqual([]);
  });

  it('plays a game end to end', async () => {
    // Teams come from the story; one that never logged in has not started.
    const before = (await admin('GET', '/api/admin/overview')).body.teams;
    expect(before).toMatchObject([
      { id: 1, name: 'Vlci', step: 0 },
      { id: 2, name: 'Lišky', step: 0 },
    ]);
    expect(before[0].node).toBeUndefined();

    const codes: readonly { readonly kind: string; readonly id: number; readonly code: string }[] =
      (await admin('GET', '/api/admin/codes')).body;
    const login = codes.find((entry) => entry.kind === 'T')!.code;
    const studna = codes.find((entry) => entry.kind === 'L' && entry.id === 32)!.code;
    // Places come from the story; a valid code of a place it does not have is refused.
    expect(codes.filter((entry) => entry.kind === 'L').map((entry) => entry.id)).toEqual([32, 33]);
    expect(codes.filter((entry) => entry.kind === 'T').map((entry) => entry.id)).toEqual([1, 2]);
    const gone = await encodeQr(config.qrSecret, { kind: 'T', id: 3 });
    const sklep = await encodeQr(config.qrSecret, { kind: 'L', id: 34 });
    expect(studna).toBe(await encodeQr(config.qrSecret, { kind: 'L', id: 32 }));

    const phone = device();
    const tablet = device();
    expect((await phone('GET', '/api/player/state')).status).toBe(401);
    expect((await phone('POST', '/api/player/login', { code: studna })).status).toBe(400);
    expect((await phone('POST', '/api/player/login', { code: 'T-1-AAAA' })).status).toBe(400);
    expect((await phone('POST', '/api/player/login', { code: gone })).body.message).toBe(
      'Tento tým už ve hře není.',
    );

    const start = await phone('POST', '/api/player/login', { code: login });
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({
      team: { name: 'Vlci' },
      status: 'playing',
      node: { id: 'A1', screens: [{ theme: 'intro' }] },
    });
    await tablet('POST', '/api/player/login', { code: login });

    // Both devices see the same step; the tablet decides first, the phone gets a conflict.
    const step = start.body.step;
    const moved = await tablet('POST', '/api/player/choose', { index: 1, expectedStep: step });
    // Which codes lead where stays on the server; the client only learns it has to scan.
    expect(moved.body.node).toEqual({
      id: 'A2',
      type: 'passage',
      screens: [
        { theme: 'default', content: 'Jděte ke studni na nádvoří, nebo k bráně.' },
        { theme: 'description', content: 'Setmělo se.' },
      ],
      choices: [],
      scan: true,
    });
    const late = await phone('POST', '/api/player/choose', { index: 0, expectedStep: step });
    expect(late).toMatchObject({ status: 409, body: { _tag: 'StepConflict' } });

    const view = (await phone('GET', '/api/player/state')).body;
    expect(view.node.id).toBe('A2');
    expect(
      (await phone('POST', '/api/player/choose', { index: 0, expectedStep: view.step })).body
        .reason,
    ).toBe('scan-required');
    expect(
      (await phone('POST', '/api/player/scan', { code: login, expectedStep: view.step })).status,
    ).toBe(400);
    expect(
      (await phone('POST', '/api/player/scan', { code: sklep, expectedStep: view.step })).body,
    ).toMatchObject({ _tag: 'InvalidCode', message: 'Tento QR kód už neplatí.' });

    const b1 = await phone('POST', '/api/player/scan', { code: studna, expectedStep: view.step });
    expect(b1.body).toMatchObject({ status: 'playing', node: { id: 'B1', scan: false } });
    expect(
      (await phone('POST', '/api/player/scan', { code: studna, expectedStep: b1.body.step })).body
        .reason,
    ).toBe('no-scan');
    expect(b1.body.node.screens[0].content).toContain('chudou pokrývku hlavy');
    expect(b1.body.node.choices).toEqual([{ index: 0, label: 'Bojovat' }]);

    const end = await phone('POST', '/api/player/choose', { index: 0, expectedStep: b1.body.step });
    expect(end.body).toMatchObject({ status: 'finished', node: { id: 'OUTRO', type: 'end' } });
    expect(end.body.node.screens[0].content).toBe('Prohráli jste, týme Vlci.');

    const overview = (await admin('GET', '/api/admin/overview')).body;
    expect(overview.teams[0]).toMatchObject({
      node: 'OUTRO',
      finished: true,
      devices: 2,
      state: { gold: 80 },
    });
    expect(overview.visits).toEqual({ A1: 1, A2: 1, B1: 1, OUTRO: 1 });
    expect(overview.log.map((entry: { readonly action: string }) => entry.action)).toEqual([
      'choice:0',
      'scan:32',
      'choice:1',
      'start',
    ]);
  });

  it('measures the game and the reading', async () => {
    const lisky = await encodeQr(config.qrSecret, { kind: 'T', id: 2 });
    const team = async () => (await admin('GET', '/api/admin/overview')).body.teams[1];
    expect(await team()).toMatchObject({ readingMs: 0 });
    expect((await team()).playMs).toBeUndefined();

    const phone = device();
    const tablet = device();
    const anonymous = { intervals: [{ ms: 1000, agoMs: 0 }] };
    expect((await phone('POST', '/api/player/reading', anonymous)).status).toBe(401);

    // The clock runs from the first scan, which is the login.
    const start = (await phone('POST', '/api/player/login', { code: lisky })).body;
    await tablet('POST', '/api/player/login', { code: lisky });
    expect((await team()).playMs).toBeGreaterThanOrEqual(0);
    // Reading counts from the first scan on, so for the test the scan was ten minutes ago.
    shared.teams.set(2, { ...shared.teams.get(2)!, startedAt: new Date(Date.now() - 600_000) });

    // Two phones reading at the same time are one team reading.
    const read = (who: typeof phone, ms: number, agoMs: number) =>
      who('POST', '/api/player/reading', { intervals: [{ ms, agoMs }] });
    await read(phone, 60_000, 100_000);
    await read(tablet, 60_000, 70_000);
    // 100–40 s ago and 70–10 s ago make 90 s, give or take the milliseconds of the test.
    expect((await team()).readingMs).toBeGreaterThanOrEqual(89_000);
    expect((await team()).readingMs).toBeLessThanOrEqual(91_000);

    // A phone left on a text counts for 5 minutes at most; nonsense counts for nothing, and
    // neither does reading before the first scan or reading reported for another team.
    await read(phone, 3_600_000, 200_000);
    await read(phone, -5, 0);
    await read(phone, 60_000, 1_000_000);
    await phone('POST', '/api/player/reading', {
      teamId: 1,
      intervals: [{ ms: 60_000, agoMs: 0 }],
    });
    const capped = (await team()).readingMs;
    expect(capped).toBeGreaterThanOrEqual(389_000);
    expect(capped).toBeLessThanOrEqual(391_000);

    // The clock stops at the end.
    const a2 = await phone('POST', '/api/player/choose', { index: 1, expectedStep: start.step });
    const studna = await encodeQr(config.qrSecret, { kind: 'L', id: 32 });
    const b1 = await phone('POST', '/api/player/scan', {
      code: studna,
      expectedStep: a2.body.step,
    });
    await phone('POST', '/api/player/choose', { index: 0, expectedStep: b1.body.step });
    const finished = (await team()).playMs;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await team()).playMs).toBe(finished);
    // Reading after the end is clipped to the end: with an end right at the start nothing is left.
    const readBefore = (await team()).readingMs;
    const row = shared.teams.get(2)!;
    shared.teams.set(2, { ...row, finishedAt: row.startedAt });
    await read(phone, 60_000, 0);
    expect((await team()).readingMs).toBe(readBefore);
    shared.teams.set(2, row);

    // A reset starts over; with the phones still logged in, the next scan that moves the team
    // starts the clock, one at a wrong place does not.
    const reset = (await admin('POST', '/api/admin/teams/2/reset')).body;
    expect(reset).toMatchObject({ readingMs: 0 });
    expect(reset.playMs).toBeUndefined();
    expect(
      (await phone('POST', '/api/player/scan', { code: studna, expectedStep: reset.step })).status,
    ).toBe(422);
    expect((await team()).playMs).toBeUndefined();
    const again = await phone('POST', '/api/player/choose', { index: 1, expectedStep: reset.step });
    expect((await team()).playMs).toBeUndefined();
    await phone('POST', '/api/player/scan', { code: studna, expectedStep: again.body.step });
    expect((await team()).playMs).toBeGreaterThanOrEqual(0);
  });

  it('resets a team to the start', async () => {
    const reset = (await admin('POST', '/api/admin/teams/1/reset')).body;
    expect(reset).toMatchObject({ node: 'A1', finished: false, state: { gold: 100 } });
    expect((await admin('GET', '/api/admin/overview')).body.teams[0].node).toBe('A1');
    expect((await admin('POST', '/api/admin/teams/3/reset')).status).toBe(404);
  });

  it('resets every team for a new game', async () => {
    const teams = (await admin('POST', '/api/admin/teams/reset')).body;
    expect(teams).toMatchObject([
      { id: 1, node: 'A1', state: { gold: 100 } },
      { id: 2, node: 'A1', state: { gold: 100 } },
    ]);
  });
});

describe('admin against the players', () => {
  it('resets and moves a team whatever its devices do at the same moment', async () => {
    // Between the admin's read of the team and its write, a player's move gets in: the memory
    // store's `ensureTeam` (how the admin reads the team) moves the team right after reading it.
    const inner = makeMemoryStore();
    const racing: StoreShape = {
      ...inner,
      ensureTeam: (id) =>
        Effect.gen(function* () {
          const team = yield* inner.ensureTeam(id);
          yield* inner.moveTeam(id, team.step, {
            node: 'B1',
            state: { gold: 0 },
            finished: false,
            action: 'choice:0',
          });
          return team;
        }),
    };
    const raced = makeHandler(config, Layer.succeed(Store, racing), SAMPLE);
    const call = device(raced.handler);
    await call('POST', '/api/admin/login', { password: config.adminPassword });

    const reset = await call('POST', '/api/admin/teams/1/reset');
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ node: 'A1', state: { gold: 100 } });
    const afterReset = await Effect.runPromise(inner.getTeam(1));
    expect(afterReset).toMatchObject({ node: 'A1', state: { gold: 100 }, step: 2 });

    const moved = await call('POST', '/api/admin/teams/1/move', { node: 'A2', state: { gold: 5 } });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ node: 'A2', state: { gold: 5 } });
    const afterMove = await Effect.runPromise(inner.getTeam(1));
    expect(afterMove).toMatchObject({ node: 'A2', state: { gold: 5 }, step: 4 });

    const log = await Effect.runPromise(inner.recentLog(10));
    expect(log.map((entry) => entry.action)).toEqual(['admin', 'choice:0', 'reset', 'choice:0']);
    await raced.dispose();
  });
});

describe('a state the game cannot hold', () => {
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

  it('fills the keys an admin leaves out from the start and refuses NaN', async () => {
    const data = emptyMemoryData();
    const fresh = makeHandler(config, MemoryStoreLayer(data), SAMPLE);
    const admin = device(fresh.handler);
    await admin('POST', '/api/admin/login', { password: config.adminPassword });
    // `{}` alone would make the story count `gold - 20` of nothing: the start's gold fills in.
    const moved = await admin('POST', '/api/admin/teams/1/move', { node: 'A1', state: {} });
    expect(moved.status).toBe(200);
    expect(moved.body.state).toEqual({ gold: 100, hatColor: 'red' });
    expect(
      (await admin('POST', '/api/admin/teams/1/move', { node: 'toString', state: {} })).status,
    ).toBe(404);
    expect(
      (await admin('POST', '/api/admin/playtest', { position: { node: '__proto__', state: {} } }))
        .status,
    ).toBe(404);

    // A move whose nextState gives NaN is refused and the team stays; the row stays readable.
    const phone = device(fresh.handler);
    const login = (await admin('GET', '/api/admin/codes')).body.find(
      (entry: { kind: string; id: number }) => entry.kind === 'T' && entry.id === 1,
    ).code;
    await phone('POST', '/api/player/login', { code: login });
    const before = await run(makeMemoryStore(data).getTeam(1));
    const broken = { ...before!, state: { gold: 'sto' } };
    data.teams.set(1, broken);
    const chosen = await phone('POST', '/api/player/choose', {
      index: 1,
      expectedStep: broken.step,
    });
    expect(chosen.status).toBe(422);
    expect(chosen.body).toMatchObject({ _tag: 'InvalidMove', reason: 'broken-state' });
    expect((await run(makeMemoryStore(data).getTeam(1)))?.step).toBe(broken.step);
    expect((await admin('GET', '/api/admin/overview')).status).toBe(200);
    await fresh.dispose();
  });
});

describe('admin password', () => {
  it('locks an address out after repeated wrong passwords and lets the right one in', async () => {
    const fresh = makeHandler(config, MemoryStoreLayer(), SAMPLE);
    const attacker = device(fresh.handler);
    const wrong = () => attacker('POST', '/api/admin/login', { password: 'nope' });
    const statuses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) statuses.push((await wrong()).body.message);
    expect(statuses.slice(0, 3)).toEqual(['Špatné heslo.', 'Špatné heslo.', 'Špatné heslo.']);
    expect(statuses[3]).toMatch(/^Příliš mnoho pokusů/);
    // Even the right password waits while the address is locked.
    const right = await attacker('POST', '/api/admin/login', { password: config.adminPassword });
    expect(right.status).toBe(401);
    expect(right.body.message).toMatch(/^Příliš mnoho pokusů/);
    // Another address is not affected.
    const other = device(fresh.handler, { 'x-forwarded-for': '10.0.0.2, 10.0.0.1' });
    expect(
      (await other('POST', '/api/admin/login', { password: config.adminPassword })).status,
    ).toBe(204);
    await fresh.dispose();
  }, 15_000);

  it('logs every admin out when the password changes', async () => {
    const first = makeHandler(config, MemoryStoreLayer(), SAMPLE);
    const admin = device(first.handler);
    await admin('POST', '/api/admin/login', { password: config.adminPassword });
    expect((await admin('GET', '/api/admin/me')).status).toBe(204);
    const changed = makeHandler({ ...config, adminPassword: 'jiné' }, MemoryStoreLayer(), SAMPLE);
    // The same cookie jar against the server with the new password.
    const sameJar = device(changed.handler, undefined, admin.jar);
    expect((await sameJar('GET', '/api/admin/me')).status).toBe(401);
    await first.dispose();
    await changed.dispose();
  });
});

describe('memory data', () => {
  it('outlives the handler, as when the code reloads in development', async () => {
    const memory = emptyMemoryData();
    const login = async (send: (request: Request) => Promise<Response>) => {
      const code = await encodeQr(config.qrSecret, { kind: 'T', id: 1 });
      return send(
        new Request('http://localhost/api/player/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        }),
      );
    };
    const before = makeHandler(config, MemoryStoreLayer(memory), SAMPLE);
    const response = await login(before.handler);
    const cookie = response.headers.getSetCookie()[0]!.split(';')[0]!;
    await before.handler(
      new Request('http://localhost/api/player/choose', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ index: 1, expectedStep: 1 }),
      }),
    );
    await before.dispose();

    const after = makeHandler(config, MemoryStoreLayer(memory), SAMPLE);
    const state = await after.handler(
      new Request('http://localhost/api/player/state', { headers: { cookie } }),
    );
    expect(await state.json()).toMatchObject({ team: { id: 1 }, node: { id: 'A2' } });
    await after.dispose();
  });
});

describe('player session', () => {
  it('expires two days after the login, even when the cookie is kept', async () => {
    const memory = emptyMemoryData();
    const { handler: send, dispose: close } = makeHandler(config, MemoryStoreLayer(memory), SAMPLE);
    const code = await encodeQr(config.qrSecret, { kind: 'T', id: 1 });
    const response = await send(
      new Request('http://localhost/api/player/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
    );
    const [cookie, ...attributes] = response.headers.getSetCookie()[0]!.split('; ');
    expect(attributes).toContain(`Max-Age=${2 * 24 * 60 * 60}`);
    const state = () =>
      send(new Request('http://localhost/api/player/state', { headers: { cookie: cookie! } }));
    expect((await state()).status).toBe(200);

    const [sessionId, session] = [...memory.sessions][0]!;
    const almostTwoDays = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 60_000);
    memory.sessions.set(sessionId, { ...session, createdAt: almostTwoDays });
    expect((await state()).status).toBe(200);

    const overTwoDays = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 60_000);
    memory.sessions.set(sessionId, { ...session, createdAt: overTwoDays });
    expect((await state()).status).toBe(401);
    await close();
  });
});

describe('server failures', () => {
  it('answers 503 naming the missing secrets of a deployment', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handler: stand } = handlerFromEnv({ VERCEL: '1', ADMIN_PASSWORD: 'heslo' });
    const response = await stand(new Request('http://localhost/api/player/intro'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      _tag: 'ServerMisconfigured',
      message: expect.stringContaining('QR_SECRET, SESSION_SECRET, DATABASE_URL'),
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('refuses to run a deployment on the memory store', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secrets = { ADMIN_PASSWORD: 'heslo', QR_SECRET: 'qr', SESSION_SECRET: 'session' };
    const deployed = handlerFromEnv({ ...secrets, NODE_ENV: 'production' });
    const response = await deployed.handler(new Request('http://localhost/api/player/intro'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('DATABASE_URL'),
    });
    // Local development keeps the memory store and the known fallbacks.
    const local = handlerFromEnv({});
    expect((await local.handler(new Request('http://localhost/api/player/intro'))).status).toBe(
      200,
    );
    await local.dispose();
    log.mockRestore();
  });

  it('logs a defect such as a failed database call', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Every call fails, as with an unreachable database.
    const fail = () => Effect.fail(new StoreError({ message: 'connection refused' }));
    const broken: StoreShape = {
      listTeams: fail,
      getTeam: fail,
      ensureTeam: fail,
      moveTeam: fail,
      resetTeams: fail,
      markStarted: fail,
      clearTiming: fail,
      addReading: fail,
      listReading: fail,
      createSession: fail,
      touchSession: fail,
      deleteSession: fail,
      activeDevices: fail,
      adminFailures: fail,
      recordAdminFailure: fail,
      clearAdminFailures: fail,
      recentLog: fail,
      visitCounts: fail,
    };
    const failing = makeHandler(config, Layer.succeed(Store, broken), SAMPLE);
    const response = await failing.handler(
      new Request('http://localhost/api/player/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: await encodeQr(config.qrSecret, { kind: 'T', id: 1 }) }),
      }),
    );
    await failing.dispose();
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
    log.mockRestore();
  });
});
