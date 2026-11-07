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
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: ['Úvod'], scanTitle: 'Kód týmu', scanText: 'Namiřte na kód týmu.' },
        A: {
          initialState: { gold: 0 },
          blocks: ['A'],
          scanTitle: 'Kde jste?',
          scanText: 'Namiřte na kód místa.',
          scans: [{ location: 1, goto: 'B' }],
        },
        B: { blocks: ['B'] },
      },
    });
    expect(titled.nodes['INTRO']).toMatchObject({
      scanTitle: 'Kód týmu',
      scanText: 'Namiřte na kód týmu.',
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
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: [{ svg: '<svg></svg>', content: 'Úvod' }, 'Pravidla'] },
        A: { initialState: { n: 0 }, blocks: ['A'], choices: [{ label: 'Konec', goto: 'B' }] },
        B: { blocks: ['Konec'] },
      },
    });
    expect(introScreens(withSvg)).toEqual([
      { theme: 'default', svg: '<svg></svg>', content: 'Úvod' },
      { theme: 'default', content: 'Pravidla' },
    ]);
  });

  it('passes the text of the next button on', () => {
    const texts = defineStory<{ n: number }>()({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: [{ content: 'Úvod', next: 'Začít' }, 'Pravidla'] },
        A: { initialState: { n: 0 }, blocks: ['A'], choices: [{ label: 'Konec', goto: 'B' }] },
        B: { blocks: ['B'] },
      },
    });
    expect(introScreens(texts)).toEqual([
      { theme: 'default', content: 'Úvod', next: 'Začít' },
      { theme: 'default', content: 'Pravidla' },
    ]);
  });

  it('gives blocks the team, each team its own text', () => {
    const position = { node: 'OUTRO', state: start.state };
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
    const viaB = applyChoice(story, start, VLCI, 0);
    expect(viaB.ok && viaB.position).toEqual({
      node: 'B1',
      state: { gold: 100, hatColor: 'blue' },
    });
  });

  it('moves on by scanning the QR code of one of the offered locations', () => {
    const moved = applyChoice(story, start, VLCI, 1);
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
    expect(applyChoice(story, atWell, VLCI, 0)).toEqual({ ok: false, error: 'scan-required' });
    expect(applyScan(story, atWell, VLCI, 34)).toEqual({ ok: false, error: 'wrong-location' });

    const viaWell = applyScan(story, atWell, VLCI, 32);
    expect(viaWell.ok && viaWell.position).toEqual({
      node: 'B1',
      state: { gold: 80, hatColor: 'green' },
    });
    const viaGate = applyScan(story, atWell, VLCI, 33);
    expect(viaGate.ok && viaGate.position).toEqual({
      node: 'B1',
      state: { gold: 130, hatColor: 'green' },
    });
    expect(applyScan(story, start, VLCI, 32)).toEqual({ ok: false, error: 'no-scan' });
  });

  it('offers only QR choices whose condition holds', () => {
    const gated = defineStory<{ key: boolean }>()({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'B',
      locations: { 1: 'Místo 1', 2: 'Místo 2' },
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { key: false },
          blocks: ['A'],
          scans: [
            { location: 1, goto: 'B' },
            { location: 2, goto: 'B', when: (state) => state.key },
          ],
        },
        B: { blocks: ['B'] },
      },
    });
    const locked = { node: 'A', state: { key: false } };
    expect(applyScan(gated, locked, VLCI, 2)).toEqual({ ok: false, error: 'wrong-location' });
    expect(applyScan(gated, { ...locked, state: { key: true } }, VLCI, 2)).toMatchObject({
      ok: true,
    });
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
    expect(applyChoice(story, poor, VLCI, 1)).toEqual({ ok: false, error: 'unavailable-choice' });
  });

  it('stops at end nodes', () => {
    const end = { node: 'OUTRO', state: {} };
    expect(renderNode(story, end, VLCI)).toMatchObject({ type: 'end', choices: [], scan: false });
    expect(applyChoice(story, end, VLCI, 0)).toEqual({ ok: false, error: 'finished' });
    expect(applyScan(story, end, VLCI, 32)).toEqual({ ok: false, error: 'finished' });
    expect(renderNode(story, { ...end, node: 'X' }, VLCI)).toBeUndefined();
  });
});

describe('dedent', () => {
  it('strips common indentation and surrounding blank lines', () => {
    expect(dedent('\n    a\n      b\n\n    c\n  ')).toBe('a\n  b\n\nc');
    expect(dedent('jeden řádek')).toBe('jeden řádek');
  });

  it('does not count a first line written right after the backtick', () => {
    // Otherwise the other lines kept their indentation, and four spaces are a code block.
    expect(dedent('Nadpis\n\n    Odstavec\n      odsazený')).toBe('Nadpis\n\nOdstavec\n  odsazený');
    expect(dedent('  a\n  b')).toBe('a\nb');
  });
});

describe('`when` with a team', () => {
  const LISKY = { id: 2, name: 'Lišky' };
  const teamStory = defineStory<{ n: number }>()({
    teams: { 1: 'Vlci', 2: 'Lišky' },
    introNode: 'INTRO',
    outroNode: 'B',
    locations: { 1: 'Studna' },
    nodes: {
      INTRO: { blocks: ['Úvod'] },
      A: {
        initialState: { n: 0 },
        blocks: ['A'],
        choices: [
          { label: 'Všichni', goto: 'S' },
          { label: 'Jen Lišky', goto: 'B', when: (_state, team) => team.name === 'Lišky' },
        ],
      },
      S: {
        blocks: ['S'],
        scans: [{ location: 1, goto: 'B', when: (_state, team) => team.id === 2 }],
      },
      B: { blocks: ['B'] },
    },
  });
  const atStart = startPosition(teamStory)!;
  const atScan = { node: 'S', state: atStart.state };

  it('shows a choice only to the teams that pass', () => {
    const labelsFor = (team: { readonly id: number; readonly name: string }) =>
      renderNode(teamStory, atStart, team)!.choices.map((choice) => choice.label);
    expect(labelsFor(VLCI)).toEqual(['Všichni']);
    expect(labelsFor(LISKY)).toEqual(['Všichni', 'Jen Lišky']);
  });

  it('lets only those teams take it', () => {
    expect(applyChoice(teamStory, atStart, VLCI, 1)).toEqual({
      ok: false,
      error: 'unavailable-choice',
    });
    expect(applyChoice(teamStory, atStart, LISKY, 1)).toMatchObject({ ok: true });
    expect(applyScan(teamStory, atScan, VLCI, 1)).toEqual({ ok: false, error: 'wrong-location' });
    expect(applyScan(teamStory, atScan, LISKY, 1)).toMatchObject({ ok: true });
  });
});

describe('`choices` as a function', () => {
  const LISKY = { id: 2, name: 'Lišky' };
  const dynamic = defineStory<{ gold: number }>()({
    teams: { 1: 'Vlci', 2: 'Lišky' },
    locations: {},
    introNode: 'INTRO',
    outroNode: 'OUTRO',
    nodes: {
      INTRO: { blocks: ['Úvod'] },
      A: {
        initialState: { gold: 1 },
        blocks: ['A'],
        choices: (state, team) => [
          { label: `Dál, ${team.name}`, goto: 'B' },
          team.id === 2 && { label: 'Lišky', goto: 'C' },
          state.gold > 5 && { label: 'Bohatí', goto: 'D' },
          { label: 'Zlato', goto: 'E', when: () => false },
        ],
      },
      B: {
        blocks: ['B'],
        choices: [{ label: 'Zlato', goto: 'F', nextState: () => ({ gold: 9 }) }],
      },
      C: { blocks: ['C'], choices: [{ label: 'Konec', goto: 'OUTRO' }] },
      D: { blocks: ['D'], choices: [{ label: 'Konec', goto: 'OUTRO' }] },
      E: { blocks: ['E'], choices: [{ label: 'Konec', goto: 'OUTRO' }] },
      F: {
        blocks: ['F'],
        choices: (state) => (state.gold > 5 ? [{ label: 'Konec', goto: 'D' }] : []),
      },
      OUTRO: { blocks: ['Konec'] },
    },
  });
  const at = startPosition(dynamic)!;

  it('types `goto` inside the function too', () => {
    const typed = defineStory<{ gold: number }>()({
      teams: { 1: 'Vlci' },
      introNode: 'INTRO',
      outroNode: 'B',
      locations: {},
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { gold: 1 },
          blocks: ['A'],
          // @ts-expect-error a target that is not a node of the story
          choices: () => [{ label: 'Pryč', goto: 'NIKDE' }],
        },
        B: { blocks: ['B'] },
      },
    });
    expect(typed.order).toEqual(['INTRO', 'A', 'B']);
  });

  it('renders the choices for the state and the team, skipping falsy ones', () => {
    expect(renderNode(dynamic, at, VLCI)!.choices).toEqual([{ index: 0, label: 'Dál, Vlci' }]);
    expect(renderNode(dynamic, at, LISKY)!.choices).toEqual([
      { index: 0, label: 'Dál, Lišky' },
      { index: 1, label: 'Lišky' },
    ]);
    expect(renderNode(dynamic, { ...at, state: { gold: 9 } }, VLCI)!.choices).toEqual([
      { index: 0, label: 'Dál, Vlci' },
      { index: 1, label: 'Bohatí' },
    ]);
  });

  it('takes a choice by its position in the list of that team', () => {
    expect(applyChoice(dynamic, at, LISKY, 1)).toMatchObject({ ok: true, position: { node: 'C' } });
    expect(applyChoice(dynamic, at, VLCI, 1)).toEqual({ ok: false, error: 'unavailable-choice' });
  });

  it('draws the edges of all reachable states in the graph', () => {
    const graph = toGraph(dynamic);
    expect(graph.nodes['A']!.choices).toEqual([
      { label: 'Dál, Vlci', target: 'B', conditional: true },
      { label: 'Lišky', target: 'C', conditional: true },
    ]);
    // F offers its only choice just in the state B sets.
    expect(graph.nodes['F']!.choices).toEqual([{ label: 'Konec', target: 'D', conditional: true }]);
    expect(graph.nodes['D']!.reached).toBe(true);
  });
});

describe('graph', () => {
  it('survives a `when` that throws: the choice is offered to nobody', () => {
    const graph = toGraph(
      defineStory<{ n: number }>()({
        teams: { 1: 'Tým' },
        locations: {},
        introNode: 'INTRO',
        outroNode: 'OUTRO',
        nodes: {
          INTRO: { blocks: ['Úvod'] },
          START: {
            initialState: { n: 0 },
            blocks: ['Start'],
            choices: [
              {
                label: 'Dál',
                goto: 'OUTRO',
                when: () => {
                  throw new Error('boom');
                },
              },
            ],
          },
          OUTRO: { blocks: ['Konec'] },
        },
      }),
    );
    expect(graph.nodes['START']!.choices).toEqual([
      { label: 'Dál', target: 'OUTRO', conditional: true, available: false },
    ]);
  });

  it('describes nodes, edges and previews from the first start', () => {
    const graph = toGraph(story);
    expect(graph.order).toEqual(['INTRO', 'A1', 'A2', 'B1', 'OUTRO']);
    expect(graph).toMatchObject({ introNode: 'INTRO', outroNode: 'OUTRO' });
    expect(graph.nodes['INTRO']).toMatchObject({ type: 'intro', reached: true, choices: [] });
    expect(graph.start).toBe('A1');
    // B1 is first reached through „Možnost jedna“, which turns the hat blue.
    expect(graph.nodes['B1']).toEqual({
      id: 'B1',
      type: 'passage',
      dynamic: true,
      reached: true,
      preview: {
        state: { gold: 100, hatColor: 'blue' },
        blocks: ['Pohodlně si nosil svoji chudou pokrývku hlavy.'],
      },
      choices: [
        { label: 'Bojovat', target: 'OUTRO', conditional: false },
        { label: 'Koupit meč', target: 'OUTRO', conditional: true, available: true },
      ],
    });
    expect(graph.nodes['A2']!.preview?.blocks).toHaveLength(2);
    expect(graph.nodes['A2']).toMatchObject({
      preview: { state: { gold: 80, hatColor: 'green' } },
      choices: [
        { label: 'Místo 32', location: 32, target: 'B1', conditional: false },
        { label: 'Místo 33', location: 33, target: 'B1', conditional: false },
      ],
    });
    expect(graphProblems(graph)).toEqual([]);
  });

  it('offers a choice with `when` to any team that passes it', () => {
    const graph = toGraph(
      defineStory<{ n: number }>()({
        teams: { 1: 'Vlci', 2: 'Lišky' },
        introNode: 'INTRO',
        outroNode: 'B',
        locations: {},
        nodes: {
          INTRO: { blocks: ['Úvod'] },
          A: {
            initialState: { n: 0 },
            blocks: ['A'],
            choices: [
              { label: 'Lišky', goto: 'B', when: (_state, team) => team.id === 2 },
              { label: 'Nikdo', goto: 'B', when: (_state, team) => team.id === 3 },
            ],
          },
          B: { blocks: ['B'] },
        },
      }),
    );
    expect(graph.nodes['A']!.choices.map((choice) => choice.available)).toEqual([true, false]);
  });

  it('previews the intro by the text of all its blocks', () => {
    const graph = toGraph(
      defineStory<{ n: number }>()({
        teams: { 1: 'Tým' },
        locations: {},
        introNode: 'INTRO',
        outroNode: 'B',
        nodes: {
          INTRO: { blocks: [{ svg: '<svg />', content: '' }, 'První text', 'Druhý text'] },
          A: { initialState: { n: 1 }, blocks: ['A'], choices: [{ label: 'Konec', goto: 'B' }] },
          B: { blocks: ['B'] },
        },
      }),
    );
    expect(graph.nodes['INTRO']!.preview).toEqual({ blocks: ['', 'První text', 'Druhý text'] });
  });

  it('leaves unreached dynamic nodes without text', () => {
    const define = defineStory<{ n: number }>();
    const graph = toGraph(
      define({
        teams: { 1: 'Tým' },
        locations: {},
        introNode: 'INTRO',
        outroNode: 'OUTRO',
        nodes: {
          INTRO: { blocks: ['Úvod'] },
          A: { initialState: { n: 1 }, blocks: [], choices: [{ label: 'Dál', goto: 'C' }] },
          B: { blocks: ['B'], choices: [{ label: 'Jinam', goto: 'D' }] },
          C: {
            blocks: (state) => [`n = ${state.n}`],
            choices: [{ label: 'Konec', goto: 'OUTRO' }],
          },
          D: {
            blocks: (state) => [`d = ${state.n}`],
            choices: [{ label: 'Konec', goto: 'OUTRO' }],
          },
          OUTRO: { blocks: ['Konec'] },
        },
      }),
    );
    expect(graph.start).toBe('A');
    expect(graph.nodes['C']!.preview?.blocks).toEqual(['n = 1']);
    expect(graph.nodes['D']).toMatchObject({ reached: false, dynamic: true });
    expect(graph.nodes['D']!.preview).toBeUndefined();
    expect(graph.nodes['B']).toMatchObject({ reached: false, preview: { blocks: ['B'] } });
  });

  it('reports a missing start and unreachable nodes', () => {
    const define = defineStory<{ n: number }>();
    const noStart = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'A',
      locations: {},
      nodes: { INTRO: { blocks: ['Úvod'] }, A: { blocks: ['A'] } },
    });
    expect(graphProblems(toGraph(noStart))).toEqual(['Příběh nemá start (uzel s initialState).']);
    const orphan = define({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: { initialState: { n: 0 }, blocks: [], choices: [{ label: 'Dál', goto: 'B' }] },
        B: { blocks: ['B'] },
        C: { blocks: ['C'], choices: [{ label: 'Konec', goto: 'B' }] },
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
      locations: {},
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { gold: 0 },
          blocks: [],
          choices: [
            // @ts-expect-error: goto must name an existing node
            { label: 'Překlep', goto: 'BB' },
            // @ts-expect-error: nextState must match the state type
            { label: 'Špatný typ', goto: 'B', nextState: () => ({ gold: 'hodně' }) },
            // @ts-expect-error: nothing leads to the intro, the login does
            { label: 'Zpět na úvod', goto: 'INTRO' },
          ],
        },
        // @ts-expect-error: a team has only its id and name
        C: { blocks: (_state, team) => [team.color] },
        // @ts-expect-error: unknown theme
        B: { blocks: [{ theme: 'neon', content: 'B' }], choices: [{ label: 'Dál', goto: 'C' }] },
      },
    });
    define({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        // @ts-expect-error: a node that is not the outro needs choices or QR choices
        A: { initialState: { gold: 0 }, blocks: [] },
        B: { blocks: ['B'] },
      },
    });
    define({
      teams: { 1: 'Tým' },
      locations: { 1: 'Místo 1' },
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        // @ts-expect-error: a node offers buttons or QR choices, not both
        A: {
          initialState: { gold: 0 },
          blocks: [],
          choices: [{ label: 'Dál', goto: 'B' }],
          scans: [{ location: 1, goto: 'B' }],
        },
        B: { blocks: ['B'] },
      },
    });
    define({
      teams: { 1: 'Tým' },
      locations: { 1: 'Studna' },
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { gold: 0 },
          blocks: [],
          scans: [
            { location: 1, goto: 'B' },
            // @ts-expect-error: a QR choice must use a place from `locations`
            { location: 2, goto: 'B' },
          ],
        },
        B: { blocks: ['B'] },
      },
    });
    // A wrong id makes the other nodes mistyped too, so these stay on one line each.
    const base = { teams: {}, locations: {} } as const;
    // @ts-expect-error: the intro has to be a node of the story
    define({ ...base, introNode: 'X', outroNode: 'B', nodes: { B: { blocks: [] } } });
    // @ts-expect-error: the outro is another node than the intro
    define({ ...base, introNode: 'B', outroNode: 'B', nodes: { B: { blocks: [] } } });
    define({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        // @ts-expect-error: the intro has no team and no state, so its blocks are a plain list
        INTRO: { blocks: (_state, team) => [team.name] },
        A: { initialState: { gold: 0 }, blocks: [], choices: [{ label: 'Dál', goto: 'B' }] },
        B: { blocks: ['B'] },
      },
    });
  }
};
