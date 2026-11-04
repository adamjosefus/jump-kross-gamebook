import { describe, expect, it } from 'vitest';

import {
  applyChoice,
  applyScan,
  dedent,
  defineStory,
  graphProblems,
  introScreens,
  renderNode,
  startPosition,
  toGraph,
} from '../src/index.ts';
import { SAMPLE } from './fixtures.ts';

const story = SAMPLE;
const VLCI = { id: 1, name: 'Vlci' };

describe('engine', () => {
  const start = startPosition(story)!;

  it('starts every team on the node with an initial state', () => {
    expect(start).toEqual({ node: 'A1', state: { gold: 100, hatColor: 'red' } });
  });

  it('passes the scan texts of a node to the player', () => {
    const titled = defineStory<{ gold: number }>()({
      teams: { 1: 'Tým' },
      locations: { 1: 'Studna' },
      intro: ['Úvod'],
      introScanTitle: 'Kód týmu',
      introScanText: 'Namiřte na kód týmu.',
      nodes: {
        A: {
          initialState: { gold: 0 },
          blocks: ['A'],
          scanTitle: 'Kde jste?',
          scanText: 'Namiřte na kód místa.',
          scans: [{ location: 1, goto: 'B' }],
        },
        B: { end: true, blocks: ['B'] },
      },
    });
    expect(titled).toMatchObject({
      introScanTitle: 'Kód týmu',
      introScanText: 'Namiřte na kód týmu.',
    });
    expect(renderNode(titled, startPosition(titled)!, VLCI)).toMatchObject({
      scanTitle: 'Kde jste?',
      scanText: 'Namiřte na kód místa.',
    });
    expect(renderNode(titled, { node: 'B', state: { gold: 0 } }, VLCI)).not.toHaveProperty(
      'scanTitle',
    );
  });

  it('renders the intro', () => {
    expect(introScreens(story)).toEqual([
      { theme: 'intro', content: '# Hra\n\nNaskenujte kód svého týmu.' },
    ]);
  });

  it('keeps the svg of a screen', () => {
    const withSvg = defineStory<{ readonly n: number }>()({
      teams: { 1: 'Tým' },
      locations: {},
      intro: [{ svg: '<svg></svg>', content: 'Úvod' }, 'Pravidla'],
      nodes: { A: { initialState: { n: 0 }, end: true, blocks: ['Konec'] } },
    });
    expect(introScreens(withSvg)).toEqual([
      { theme: 'default', svg: '<svg></svg>', content: 'Úvod' },
      { theme: 'default', content: 'Pravidla' },
    ]);
  });

  it('passes the text of the next button on', () => {
    const texts = defineStory<{ n: number }>()({
      teams: { 1: 'Tým' },
      intro: [{ content: 'Úvod', next: 'Začít' }, 'Pravidla'],
      locations: {},
      nodes: { A: { initialState: { n: 0 }, end: true, blocks: ['A'] } },
    });
    expect(introScreens(texts)).toEqual([
      { theme: 'default', content: 'Úvod', next: 'Začít' },
      { theme: 'default', content: 'Pravidla' },
    ]);
  });

  it('gives blocks the team, each team its own text', () => {
    const position = { node: 'C1', state: start.state };
    expect(renderNode(story, position, VLCI)!.screens[0]!.content).toBe(
      'Prohráli jste, týme Vlci.',
    );
    expect(renderNode(story, position, { id: 2, name: 'Lišky' })!.screens[0]!.content).toBe(
      'Prohráli jste, týme Lišky.',
    );
  });

  it('renders screens with themes and dedented markdown', () => {
    expect(renderNode(story, start, VLCI)).toEqual({
      id: 'A1',
      type: 'start',
      screens: [{ theme: 'intro', content: '# Začátek\n\nAdipisicing commodo veniam **aliqua**.' }],
      choices: [
        { index: 0, label: 'Možnost jedna' },
        { index: 1, label: 'Možnost dvě' },
      ],
      scan: false,
    });
  });

  it('applies choices and merges the next state', () => {
    const viaB = applyChoice(story, start, 0);
    expect(viaB.ok && viaB.position).toEqual({
      node: 'B1',
      state: { gold: 100, hatColor: 'blue' },
    });
  });

  it('moves on by scanning the QR code of one of the offered locations', () => {
    const moved = applyChoice(story, start, 1);
    if (!moved.ok) throw new Error(moved.error);
    const atWell = moved.position;
    expect(atWell.state).toEqual({ gold: 80, hatColor: 'green' });

    expect(renderNode(story, atWell, VLCI)).toEqual({
      id: 'A2',
      type: 'passage',
      screens: [
        { theme: 'default', content: 'Jděte ke studni na nádvoří, nebo k bráně.' },
        { theme: 'description', content: 'Setmělo se.' },
      ],
      choices: [],
      scan: true,
    });
    expect(applyChoice(story, atWell, 0)).toEqual({ ok: false, error: 'scan-required' });
    expect(applyScan(story, atWell, 34)).toEqual({ ok: false, error: 'wrong-location' });

    const viaWell = applyScan(story, atWell, 32);
    expect(viaWell.ok && viaWell.position).toEqual({
      node: 'B1',
      state: { gold: 80, hatColor: 'green' },
    });
    const viaGate = applyScan(story, atWell, 33);
    expect(viaGate.ok && viaGate.position).toEqual({
      node: 'B1',
      state: { gold: 130, hatColor: 'green' },
    });
    expect(applyScan(story, start, 32)).toEqual({ ok: false, error: 'no-scan' });
  });

  it('offers only QR choices whose condition holds', () => {
    const gated = defineStory<{ key: boolean }>()({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: { 1: 'Místo 1', 2: 'Místo 2' },
      nodes: {
        A: {
          initialState: { key: false },
          blocks: ['A'],
          scans: [
            { location: 1, goto: 'B' },
            { location: 2, goto: 'B', when: (state) => state.key },
          ],
        },
        B: { end: true, blocks: ['B'] },
      },
    });
    const locked = { node: 'A', state: { key: false } };
    expect(applyScan(gated, locked, 2)).toEqual({ ok: false, error: 'wrong-location' });
    expect(applyScan(gated, { ...locked, state: { key: true } }, 2)).toMatchObject({ ok: true });
  });

  it('evaluates blocks from the state and hides unavailable choices', () => {
    const red = renderNode(
      story,
      {
        node: 'B1',
        state: { hatColor: 'red', gold: 100 },
      },
      VLCI,
    )!;
    expect(red.screens).toEqual([
      { theme: 'default', content: 'Pohodlně si nosil svoji červenou čepici.' },
      { theme: 'letter', content: 'Drahý poutníku…' },
    ]);
    expect(red.choices.map((choice) => choice.label)).toEqual(['Bojovat', 'Koupit meč']);

    const poor = { node: 'B1', state: { hatColor: 'green', gold: 80 } };
    expect(renderNode(story, poor, VLCI)!.screens).toEqual([
      { theme: 'default', content: 'Pohodlně si nosil svoji chudou pokrývku hlavy.' },
    ]);
    expect(renderNode(story, poor, VLCI)!.choices.map((choice) => choice.label)).toEqual([
      'Bojovat',
    ]);
    expect(applyChoice(story, poor, 1)).toEqual({ ok: false, error: 'unavailable-choice' });
  });

  it('stops at end nodes', () => {
    const end = { node: 'C1', state: {} };
    expect(renderNode(story, end, VLCI)).toMatchObject({ type: 'end', choices: [], scan: false });
    expect(applyChoice(story, end, 0)).toEqual({ ok: false, error: 'finished' });
    expect(applyScan(story, end, 32)).toEqual({ ok: false, error: 'finished' });
    expect(renderNode(story, { ...end, node: 'X' }, VLCI)).toBeUndefined();
  });
});

describe('dedent', () => {
  it('strips common indentation and surrounding blank lines', () => {
    expect(dedent('\n    a\n      b\n\n    c\n  ')).toBe('a\n  b\n\nc');
    expect(dedent('jeden řádek')).toBe('jeden řádek');
  });
});

describe('graph', () => {
  it('describes nodes, edges and previews from the first start', () => {
    const graph = toGraph(story);
    expect(graph.order).toEqual(['A1', 'A2', 'B1', 'C1', 'C2']);
    expect(graph.start).toBe('A1');
    // B1 is first reached through „Možnost jedna“, which turns the hat blue.
    expect(graph.nodes['B1']).toEqual({
      id: 'B1',
      type: 'passage',
      dynamic: true,
      reached: true,
      preview: {
        state: { gold: 100, hatColor: 'blue' },
        content: 'Pohodlně si nosil svoji chudou pokrývku hlavy.',
        screens: 1,
      },
      choices: [
        { label: 'Bojovat', target: 'C1', conditional: false },
        { label: 'Koupit meč', target: 'C2', conditional: true, available: true },
      ],
    });
    expect(graph.nodes['A2']).toMatchObject({
      preview: { state: { gold: 80, hatColor: 'green' }, screens: 2 },
      choices: [
        { label: 'Místo 32', location: 32, target: 'B1', conditional: false },
        { label: 'Místo 33', location: 33, target: 'B1', conditional: false },
      ],
    });
    expect(graphProblems(graph)).toEqual([]);
  });

  it('previews the intro by its first screen with text', () => {
    const graph = toGraph(
      defineStory<{ n: number }>()({
        teams: { 1: 'Tým' },
        intro: [{ svg: '<svg />', content: '' }, 'První text', 'Druhý text'],
        locations: {},
        nodes: { A: { initialState: { n: 1 }, end: true, blocks: ['A'] } },
      }),
    );
    expect(graph.intro).toEqual({ content: 'První text', screens: 3 });
  });

  it('leaves unreached dynamic nodes without text', () => {
    const define = defineStory<{ n: number }>();
    const graph = toGraph(
      define({
        teams: { 1: 'Tým' },
        intro: ['Úvod'],
        locations: {},
        nodes: {
          A: { initialState: { n: 1 }, blocks: [], choices: [{ label: 'Dál', goto: 'C' }] },
          B: { blocks: ['B'], choices: [{ label: 'Jinam', goto: 'D' }] },
          C: { end: true, blocks: (state) => [`n = ${state.n}`] },
          D: { end: true, blocks: (state) => [`d = ${state.n}`] },
        },
      }),
    );
    expect(graph.start).toBe('A');
    expect(graph.nodes['C']!.preview?.content).toBe('n = 1');
    expect(graph.nodes['D']).toMatchObject({ reached: false, dynamic: true });
    expect(graph.nodes['D']!.preview).toBeUndefined();
    expect(graph.nodes['B']).toMatchObject({ reached: false, preview: { content: 'B' } });
  });

  it('reports a missing start and unreachable nodes', () => {
    const define = defineStory<{ n: number }>();
    const noStart = define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: {},
      nodes: { A: { end: true, blocks: ['A'] } },
    });
    expect(graphProblems(toGraph(noStart))).toEqual(['Příběh nemá start (uzel s initialState).']);
    const orphan = define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: {},
      nodes: {
        A: { initialState: { n: 0 }, blocks: [], choices: [{ label: 'Dál', goto: 'B' }] },
        B: { end: true, blocks: ['B'] },
        C: { end: true, blocks: ['C'] },
      },
    });
    expect(graphProblems(toGraph(orphan))).toEqual(['Uzel C je nedosažitelný ze startu.']);
  });
});

// Never called: `pnpm typecheck` verifies that each mistake below is a type error.
const _typeErrors = () => {
  {
    const define = defineStory<{ gold: number }>();
    define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: {},
      nodes: {
        A: {
          initialState: { gold: 0 },
          blocks: [],
          choices: [
            // @ts-expect-error: goto must name an existing node
            { label: 'Překlep', goto: 'BB' },
            // @ts-expect-error: nextState must match the state type
            { label: 'Špatný typ', goto: 'B', nextState: () => ({ gold: 'hodně' }) },
          ],
        },
        // @ts-expect-error: a team has only its id and name
        C: { end: true, blocks: (_state, team) => [team.color] },
        // @ts-expect-error: unknown theme
        B: { end: true, blocks: [{ theme: 'neon', content: 'B' }] },
      },
    });
    define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: {},
      // @ts-expect-error: a node without end needs choices
      nodes: { A: { initialState: { gold: 0 }, blocks: [] } },
    });
    define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: { 1: 'Místo 1' },
      nodes: {
        // @ts-expect-error: a node offers buttons or QR choices, not both
        A: {
          initialState: { gold: 0 },
          blocks: [],
          choices: [{ label: 'Dál', goto: 'A' }],
          scans: [{ location: 1, goto: 'A' }],
        },
      },
    });
    define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: { 1: 'Studna' },
      nodes: {
        A: {
          initialState: { gold: 0 },
          blocks: [],
          scans: [
            { location: 1, goto: 'A' },
            // @ts-expect-error: a QR choice must use a place from `locations`
            { location: 2, goto: 'A' },
          ],
        },
      },
    });
  }
};
