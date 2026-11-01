import { encodeQr } from '@gamebook/core';
import { afterAll, describe, expect, it } from 'vitest';

import { SAMPLE } from '../../core/test/fixtures.ts';
import { makeHandler, MemoryStoreLayer, type ServerConfigShape } from '../src/server/index.ts';

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
  const jar = new Map<string, string>();
  return async (method: string, path: string, body?: unknown) => {
    const response = await handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
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
    expect(graph.nodes.B1.preview.content).toContain('chudou pokrývku hlavy');
    expect((await admin('GET', '/api/admin/story?start=A1')).body).toEqual(graph);
  });

  it('plays a game end to end', async () => {
    await admin('PUT', '/api/admin/locations/32', { name: 'Studna', kind: 'progress' });
    await admin('PUT', '/api/admin/locations/33', { name: 'Brána', kind: 'progress' });
    await admin('PUT', '/api/admin/locations/34', { name: 'Sklep', kind: 'progress' });
    const team = (await admin('POST', '/api/admin/teams', { name: 'Vlci', startNode: 'A1' })).body;
    expect(team).toMatchObject({ id: 1, name: 'Vlci', step: 0 });

    const codes: { kind: string; id: number; code: string }[] = (
      await admin('GET', '/api/admin/codes')
    ).body;
    const login = codes.find((c) => c.kind === 'T')!.code;
    const studna = codes.find((c) => c.kind === 'L' && c.id === 32)!.code;
    const sklep = codes.find((c) => c.kind === 'L' && c.id === 34)!.code;
    expect(studna).toBe(await encodeQr(config.qrSecret, { kind: 'L', id: 32 }));

    const phone = device();
    const tablet = device();
    expect((await phone('GET', '/api/player/state')).status).toBe(401);
    expect((await phone('POST', '/api/player/login', { code: studna })).status).toBe(400);
    expect((await phone('POST', '/api/player/login', { code: 'T:1:AAAA' })).status).toBe(400);

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
        { theme: 'night', content: 'Setmělo se.' },
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
      (await phone('POST', '/api/player/scan', { code: sklep, expectedStep: view.step })).body
        .reason,
    ).toBe('wrong-location');

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

    const overview = (await admin('GET', '/api/admin/overview')).body;
    expect(overview.teams[0]).toMatchObject({
      node: 'C1',
      finished: true,
      devices: 2,
      state: { gold: 80 },
    });
    expect(overview.visits).toEqual({ A1: 1, A2: 1, B1: 1, C1: 1 });
    expect(overview.log.map((e: { action: string }) => e.action)).toEqual([
      'choice:0',
      'scan:32',
      'choice:1',
      'start',
    ]);
  });

  it('resets a team to its start', async () => {
    const reset = (await admin('POST', '/api/admin/teams/1/reset')).body;
    expect(reset).toMatchObject({ node: 'A1', finished: false, state: { gold: 100 } });
    expect((await admin('GET', '/api/admin/overview')).body.teams[0].node).toBe('A1');
  });
});
