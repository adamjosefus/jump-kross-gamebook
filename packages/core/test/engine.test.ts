import { describe, expect, it } from 'vitest';

import {
  applyChoice,
  applyScan,
  checkpoint,
  dedent,
  defineStory,
  graphProblems,
  renderNode,
  startPosition,
  toGraph,
} from '../src/index.ts';
import { SAMPLE } from './fixtures.ts';

const story = SAMPLE;

describe('engine', () => {
  const start = startPosition(story, 'A1')!;

  it('starts only on nodes with an initial state', () => {
    expect(start).toEqual({ node: 'A1', state: { gold: 100, hatColor: 'red' }, checkpoints: 0 });
    expect(startPosition(story, 'B1')).toBeUndefined();
  });

  it('renders screens with themes and dedented markdown', () => {
    expect(renderNode(story, start)).toEqual({
      id: 'A1',
      type: 'start',
      screens: [{ theme: 'intro', content: '# Začátek\n\nAdipisicing commodo veniam **aliqua**.' }],
      choices: [
        { index: 0, label: 'Možnost jedna' },
        { index: 1, label: 'Možnost dvě' },
      ],
    });
  });

  it('applies choices and merges the next state', () => {
    const viaB = applyChoice(story, start, 0);
    expect(viaB.ok && viaB.position).toEqual({
      node: 'B1',
      state: { gold: 100, hatColor: 'blue' },
      checkpoints: 0,
    });
  });

  it('stops at checkpoints until the right location is scanned', () => {
    const moved = applyChoice(story, start, 1);
    if (!moved.ok) throw new Error(moved.error);
    const atWell = moved.position;
    expect(atWell.state).toEqual({ gold: 80, hatColor: 'green' });

    expect(renderNode(story, atWell)).toMatchObject({
      screens: [
        { theme: 'default', content: 'Jděte ke studni na nádvoří.' },
        { content: 'Naskenujte QR kód u studny.', checkpoint: { location: 32, unlocked: false } },
      ],
      choices: [],
    });
    expect(applyChoice(story, atWell, 0)).toEqual({ ok: false, error: 'scan-required' });
    expect(applyScan(story, atWell, 33)).toEqual({ ok: false, error: 'wrong-location' });

    const scanned = applyScan(story, atWell, 32);
    if (!scanned.ok) throw new Error(scanned.error);
    expect(renderNode(story, scanned.position)!.screens).toEqual([
      { theme: 'default', content: 'Jděte ke studni na nádvoří.' },
      {
        theme: 'default',
        content: 'Naskenujte QR kód u studny.',
        checkpoint: { location: 32, unlocked: true },
      },
      { theme: 'night', content: 'Ve studni něco leží.' },
      { theme: 'night', content: 'Teď ke bráně.', checkpoint: { location: 33, unlocked: false } },
    ]);

    const done = applyScan(story, scanned.position, 33);
    if (!done.ok) throw new Error(done.error);
    expect(renderNode(story, done.position)!.choices).toEqual([{ index: 0, label: 'Pokračovat' }]);
    expect(applyScan(story, done.position, 33)).toEqual({ ok: false, error: 'no-scan' });

    const next = applyChoice(story, done.position, 0);
    expect(next.ok && next.position).toMatchObject({ node: 'B1', checkpoints: 0 });
  });

  it('evaluates blocks from the state and hides unavailable choices', () => {
    const red = renderNode(story, {
      node: 'B1',
      state: { hatColor: 'red', gold: 100 },
      checkpoints: 0,
    })!;
    expect(red.screens).toEqual([
      { theme: 'default', content: 'Pohodlně si nosil svoji červenou čepici.' },
      { theme: 'letter', content: 'Drahý poutníku…' },
    ]);
    expect(red.choices.map((c) => c.label)).toEqual(['Bojovat', 'Koupit meč']);

    const poor = { node: 'B1', state: { hatColor: 'green', gold: 80 }, checkpoints: 0 };
    expect(renderNode(story, poor)!.screens).toEqual([
      { theme: 'default', content: 'Pohodlně si nosil svoji chudou pokrývku hlavy.' },
    ]);
    expect(renderNode(story, poor)!.choices.map((c) => c.label)).toEqual(['Bojovat']);
    expect(applyChoice(story, poor, 1)).toEqual({ ok: false, error: 'unavailable-choice' });
  });

  it('stops at end nodes', () => {
    const end = { node: 'C1', state: {}, checkpoints: 0 };
    expect(renderNode(story, end)).toMatchObject({ type: 'end', choices: [] });
    expect(applyChoice(story, end, 0)).toEqual({ ok: false, error: 'finished' });
    expect(applyScan(story, end, 32)).toEqual({ ok: false, error: 'finished' });
    expect(renderNode(story, { ...end, node: 'X' })).toBeUndefined();
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
        checkpoints: [],
      },
      choices: [
        { label: 'Bojovat', target: 'C1', conditional: false },
        { label: 'Koupit meč', target: 'C2', conditional: true, available: true },
      ],
    });
    expect(graph.nodes['A2']!.preview).toMatchObject({
      state: { gold: 80, hatColor: 'green' },
      screens: 4,
      checkpoints: [32, 33],
    });
    expect(graphProblems(graph)).toEqual([]);
  });

  it('previews from the chosen start and leaves unreached dynamic nodes without text', () => {
    const define = defineStory<{ n: number }>();
    const twoStarts = define({
      A: { initialState: { n: 1 }, blocks: [], choices: [{ label: 'Dál', goto: 'C' }] },
      B: { initialState: { n: 2 }, blocks: ['B'], choices: [{ label: 'Jinam', goto: 'D' }] },
      C: { end: true, blocks: (s) => [`n = ${s.n}`] },
      D: { end: true, blocks: (s) => [`d = ${s.n}`] },
    });
    const fromA = toGraph(twoStarts);
    expect(fromA.nodes['C']!.preview?.content).toBe('n = 1');
    expect(fromA.nodes['D']).toMatchObject({ reached: false, dynamic: true });
    expect(fromA.nodes['D']!.preview).toBeUndefined();
    expect(fromA.nodes['B']).toMatchObject({ reached: false, preview: { content: 'B' } });

    const fromB = toGraph(twoStarts, 'B');
    expect(fromB.start).toBe('B');
    expect(fromB.nodes['D']!.preview?.content).toBe('d = 2');
    expect(toGraph(twoStarts, 'C').start).toBe('A');
  });

  it('reports a missing start and unreachable nodes', () => {
    const define = defineStory<{ n: number }>();
    const noStart = define({ A: { end: true, blocks: ['A'] } });
    expect(graphProblems(toGraph(noStart))).toEqual([
      'Příběh nemá žádný start (uzel s initialState).',
    ]);
    const orphan = define({
      A: { initialState: { n: 0 }, blocks: [], choices: [{ label: 'Dál', goto: 'B' }] },
      B: { end: true, blocks: ['B'] },
      C: { end: true, blocks: [checkpoint(1, 'C')] },
    });
    expect(graphProblems(toGraph(orphan))).toEqual(['Uzel C je nedosažitelný z žádného startu.']);
  });
});

// Never called: `pnpm typecheck` verifies that each mistake below is a type error.
const _typeErrors = () => {
  {
    const define = defineStory<{ gold: number }>();
    define({
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
      // @ts-expect-error: unknown theme
      B: { end: true, blocks: [{ theme: 'neon', content: 'B' }] },
    });
    // @ts-expect-error: a node without end needs choices
    define({ A: { initialState: { gold: 0 }, blocks: [] } });
  }
};
