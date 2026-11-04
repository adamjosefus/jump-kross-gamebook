import { encodeQr } from '@gamebook/core';
import { afterAll, describe, expect, it } from 'vitest';

import { SAMPLE } from '../../core/test/fixtures.ts';
import {
  emptyMemoryData,
  makeHandler,
  MemoryStoreLayer,
  type ServerConfigShape,
} from '../src/server/index.ts';

const config: ServerConfigShape = {
  adminPassword: 'heslo',
  qrSecret: 'qr-secret',
  sessionSecret: 'session-secret',
  insecureCookies: true,
};
const { handler, dispose } = makeHandler(config, MemoryStoreLayer(), SAMPLE);
afterAll(() => dispose());

/** Minimal client with its own cookie jar, like one phone. */
const device = () => {
  // The jar is updated in place as cookies arrive, like a browser's.
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const response = await handler(
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
      const [pair] = header.split(';');
      const [name, value] = pair!.split('=');
      jar.set(name!, value!);
    }
    const text = await response.text();
    return { status: response.status, body: text === '' ? undefined : JSON.parse(text) };
  };
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
    expect(graph.order).toEqual(['A1', 'A2', 'B1', 'C1', 'C2']);
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
      'Tento tým už ve hře není.',
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
    expect(end.body).toMatchObject({ status: 'finished', node: { id: 'C1', type: 'end' } });
    expect(end.body.node.screens[0].content).toBe('Prohráli jste, týme Vlci.');

    const overview = (await admin('GET', '/api/admin/overview')).body;
    expect(overview.teams[0]).toMatchObject({
      node: 'C1',
      finished: true,
      devices: 2,
      state: { gold: 80 },
    });
    expect(overview.visits).toEqual({ A1: 1, A2: 1, B1: 1, C1: 1 });
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

    // Two phones reading at the same time are one team reading.
    const read = (who: typeof phone, ms: number, agoMs: number) =>
      who('POST', '/api/player/reading', { intervals: [{ ms, agoMs }] });
    await read(phone, 60_000, 100_000);
    await read(tablet, 60_000, 70_000);
    // 100–40 s ago and 70–10 s ago make 90 s, give or take the milliseconds of the test.
    expect((await team()).readingMs).toBeGreaterThanOrEqual(89_000);
    expect((await team()).readingMs).toBeLessThanOrEqual(91_000);

    // A phone left on a text counts for 5 minutes at most; nonsense counts for nothing.
    await read(phone, 3_600_000, 1_000_000);
    await read(phone, -5, 0);
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

    // A reset starts over; with the phones still logged in, the next scan starts the clock.
    const reset = (await admin('POST', '/api/admin/teams/2/reset')).body;
    expect(reset).toMatchObject({ readingMs: 0 });
    expect(reset.playMs).toBeUndefined();
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
