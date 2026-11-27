import { describe, expect, it } from 'vitest';

import {
  applyChoice,
  applyScan,
  choicesOf,
  dedent,
  defineStory,
  EmptyActionsError,
  graphProblems,
  introSegments,
  renderNode,
  scansOf,
  startPosition,
  toGraph,
} from '../src/index.ts';
import { SAMPLE } from './fixtures.ts';

const story = SAMPLE;
const VLCI = { id: 1, name: 'Vlci' };

/** A value the type checker cannot see, as in a story checked without types. */
const unchecked = (json: string): readonly [never, ...never[]] => JSON.parse(json);

describe('engine', () => {
  const start = startPosition(story)!;

  it('starts every team on the node with an initial state', () => {
    expect(start).toEqual({ node: 'A1', state: { gold: 100, hatColor: 'red' } });
  });

  it('passes the scan texts of a node to the player', () => {
    const titled = defineStory<{ gold: number }>()({
      teams: { 1: 'Tým' },
      codes: { 1: 'Studna' },
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'], scanTitle: 'Kód týmu', scanText: 'Namiřte na kód týmu.' },
        A: {
          initialState: { gold: 0 },
          segments: ['A'],
          scanTitle: 'Kde jste?',
          scanText: 'Namiřte na kód.',
          scans: [{ code: 1, goto: 'B' }],
        },
        B: { segments: ['B'] },
      },
    });
    expect(titled.nodes['INTRO']).toMatchObject({
      scanTitle: 'Kód týmu',
      scanText: 'Namiřte na kód týmu.',
    });
    expect(renderNode(titled, startPosition(titled)!, VLCI)).toMatchObject({
      scanTitle: 'Kde jste?',
      scanText: 'Namiřte na kód.',
    });
    expect(renderNode(titled, { node: 'B', state: { gold: 0 } }, VLCI)).not.toHaveProperty(
      'scanTitle',
    );
  });

  it('renders the intro', () => {
    expect(introSegments(story)).toEqual([
      { theme: 'intro', content: '# Hra\n\nNaskenujte kód svého týmu.' },
    ]);
  });

  it('keeps the svg of a segment', () => {
    const withSvg = defineStory<{ readonly n: number }>()({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: [{ svg: '<svg></svg>', content: 'Úvod' }, 'Pravidla'] },
        A: { initialState: { n: 0 }, segments: ['A'], choices: [{ label: 'Konec', goto: 'B' }] },
        B: { segments: ['Konec'] },
      },
    });
    expect(introSegments(withSvg)).toEqual([
      { theme: 'default', svg: '<svg></svg>', content: 'Úvod' },
      { theme: 'default', content: 'Pravidla' },
    ]);
  });

  it('passes the text of the next button on', () => {
    const texts = defineStory<{ n: number }>()({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: [{ content: 'Úvod', next: 'Začít' }, 'Pravidla'] },
        A: { initialState: { n: 0 }, segments: ['A'], choices: [{ label: 'Konec', goto: 'B' }] },
        B: { segments: ['B'] },
      },
    });
    expect(introSegments(texts)).toEqual([
      { theme: 'default', content: 'Úvod', next: 'Začít' },
      { theme: 'default', content: 'Pravidla' },
    ]);
  });

  it('gives segments the team, each team its own text', () => {
    const position = { node: 'OUTRO', state: start.state };
    expect(renderNode(story, position, VLCI)!.segments[0]!.content).toBe(
      'Prohráli jste, týme Vlci.',
    );
    expect(renderNode(story, position, { id: 2, name: 'Lišky' })!.segments[0]!.content).toBe(
      'Prohráli jste, týme Lišky.',
    );
  });

  it('renders segments with themes and dedented markdown', () => {
    expect(renderNode(story, start, VLCI)).toEqual({
      id: 'A1',
      type: 'start',
      segments: [
        { theme: 'intro', content: '# Začátek\n\nAdipisicing commodo veniam **aliqua**.' },
      ],
      choices: [
        { index: 0, label: 'Možnost jedna' },
        { index: 1, label: 'Možnost dvě' },
      ],
      scan: false,
      timeStops: false,
    });
  });

  it('stops the time in a chapter that does not count', () => {
    const chaptered = defineStory<{ n: number }>()({
      teams: { 1: 'Vlci' },
      codes: {},
      chapters: { intro: { name: 'Úvod', counts: false }, game: 'Hra' },
      introNode: 'INTRO',
      outroNode: 'END',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          chapter: 'intro',
          initialState: { n: 0 },
          segments: ['A'],
          choices: [{ label: 'Dál', goto: 'B' }],
        },
        B: { chapter: 'game', segments: ['B'], choices: [{ label: 'Konec', goto: 'END' }] },
        END: { segments: ['Konec'] },
      },
    });
    expect(renderNode(chaptered, { node: 'A', state: { n: 0 } }, VLCI)?.timeStops).toBe(true);
    expect(renderNode(chaptered, { node: 'B', state: { n: 0 } }, VLCI)?.timeStops).toBe(false);
    expect(chaptered.chapters).toEqual([
      { id: 'intro', name: 'Úvod', counts: false, timer: 'intro' },
      { id: 'game', name: 'Hra', counts: true, timer: 'game' },
    ]);
  });

  it('lists the timers of the chapters, shared ones once, named by the story or the chapter', () => {
    const lines = defineStory<{ n: number }>()({
      teams: { 1: 'Vlci' },
      codes: {},
      chapters: {
        intro: { name: 'Úvod', counts: false },
        bakery: { name: 'Pekárna', timer: 'shop' },
        butcher: { name: 'Řeznictví', timer: 'shop' },
      },
      timers: { shop: 'Obchod' },
      introNode: 'INTRO',
      outroNode: 'END',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: { chapter: 'intro', initialState: { n: 0 }, segments: ['A'], choices: [{ goto: 'B' }] },
        B: { chapter: 'bakery', segments: ['B'], choices: [{ goto: 'C' }] },
        C: { chapter: 'butcher', segments: ['C'], choices: [{ goto: 'END' }] },
        END: { segments: ['Konec'] },
      },
    });
    expect(lines.chapters.map(({ id, counts, timer }) => [id, counts, timer])).toEqual([
      ['intro', false, 'intro'],
      ['bakery', true, 'shop'],
      ['butcher', true, 'shop'],
    ]);
    expect(lines.timers).toEqual([
      { key: 'intro', name: 'Úvod' },
      { key: 'shop', name: 'Obchod' },
    ]);
  });

  it('applies choices and merges the next state', () => {
    const viaB = applyChoice(story, start, VLCI, 0);
    expect(viaB.ok && viaB.position).toEqual({
      node: 'B1',
      state: { gold: 100, hatColor: 'blue' },
    });
  });

  it('moves on by scanning the QR code of one of the offered codes', () => {
    const moved = applyChoice(story, start, VLCI, 1);
    if (!moved.ok) throw new Error(moved.error);
    const atWell = moved.position;
    expect(atWell.state).toEqual({ gold: 80, hatColor: 'green' });

    expect(renderNode(story, atWell, VLCI)).toEqual({
      id: 'A2',
      type: 'passage',
      segments: [
        { theme: 'default', content: 'Jděte ke studni na nádvoří, nebo k bráně.' },
        { theme: 'description', content: 'Setmělo se.' },
      ],
      choices: [],
      scan: true,
      timeStops: false,
    });
    expect(applyChoice(story, atWell, VLCI, 0)).toEqual({ ok: false, error: 'scan-required' });
    expect(applyScan(story, atWell, VLCI, 34)).toEqual({ ok: false, error: 'wrong-code' });

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

  it('offers the QR choices a `scans` function gives for the state', () => {
    const gated = defineStory<{ key: boolean }>()({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'B',
      codes: { 1: 'Místo 1', 2: 'Místo 2' },
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { key: false },
          segments: ['A'],
          scans: (state) =>
            state.key
              ? [
                  { code: 1, goto: 'B' },
                  { code: 2, goto: 'B' },
                ]
              : [{ code: 1, goto: 'B' }],
        },
        B: { segments: ['B'] },
      },
    });
    const locked = { node: 'A', state: { key: false } };
    expect(applyScan(gated, locked, VLCI, 2)).toEqual({ ok: false, error: 'wrong-code' });
    expect(applyScan(gated, { ...locked, state: { key: true } }, VLCI, 2)).toMatchObject({
      ok: true,
    });
  });

  it('renders a choice without a text as an empty label and names it „Další“ in the graph', () => {
    const plain = defineStory<{ n: number }>()({
      teams: { 1: 'Vlci' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: { initialState: { n: 0 }, segments: ['A'], choices: [{ goto: 'B' }] },
        B: { segments: ['B'] },
      },
    });
    const position = startPosition(plain)!;
    expect(renderNode(plain, position, VLCI)!.choices).toEqual([{ index: 0, label: '' }]);
    expect(applyChoice(plain, position, VLCI, 0)).toEqual({
      ok: true,
      position: { node: 'B', state: { n: 0 } },
    });
    expect(toGraph(plain).nodes['A']!.choices).toMatchObject([{ label: 'Další', target: 'B' }]);
  });

  it('evaluates segments from the state and hides unavailable choices', () => {
    const red = renderNode(
      story,
      {
        node: 'B1',
        state: { hatColor: 'red', gold: 100 },
      },
      VLCI,
    )!;
    expect(red.segments).toEqual([
      { theme: 'default', content: 'Pohodlně si nosil svoji červenou čepici.' },
      { theme: 'letter', content: 'Drahý poutníku…' },
    ]);
    expect(red.choices.map((choice) => choice.label)).toEqual(['Bojovat', 'Koupit meč']);

    const poor = { node: 'B1', state: { hatColor: 'green', gold: 80 } };
    expect(renderNode(story, poor, VLCI)!.segments).toEqual([
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

describe('`choices` and `scans` functions with a team', () => {
  const LISKY = { id: 2, name: 'Lišky' };
  const teamStory = defineStory<{ n: number }>()({
    teams: { 1: 'Vlci', 2: 'Lišky' },
    introNode: 'INTRO',
    outroNode: 'B',
    codes: { 1: 'Studna', 2: 'Brána' },
    nodes: {
      INTRO: { segments: ['Úvod'] },
      A: {
        initialState: { n: 0 },
        segments: ['A'],
        choices: (_state, team) =>
          team.name === 'Lišky'
            ? [
                { label: 'Všichni', goto: 'S' },
                { label: 'Jen Lišky', goto: 'B' },
              ]
            : [{ label: 'Všichni', goto: 'S' }],
      },
      S: {
        segments: ['S'],
        scans: (_state, team) => [{ code: team.id === 2 ? 1 : 2, goto: 'B' }],
      },
      B: { segments: ['B'] },
    },
  });
  const atStart = startPosition(teamStory)!;
  const atScan = { node: 'S', state: atStart.state };

  it('shows a choice only to the teams the function gives it to', () => {
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
    expect(applyScan(teamStory, atScan, VLCI, 1)).toEqual({ ok: false, error: 'wrong-code' });
    expect(applyScan(teamStory, atScan, LISKY, 1)).toMatchObject({ ok: true });
    expect(applyScan(teamStory, atScan, VLCI, 2)).toMatchObject({ ok: true });
    expect(applyScan(teamStory, atScan, LISKY, 2)).toEqual({ ok: false, error: 'wrong-code' });
  });
});

describe('`choices` as a function', () => {
  const LISKY = { id: 2, name: 'Lišky' };
  const dynamic = defineStory<{ gold: number }>()({
    teams: { 1: 'Vlci', 2: 'Lišky' },
    codes: {},
    introNode: 'INTRO',
    outroNode: 'OUTRO',
    nodes: {
      INTRO: { segments: ['Úvod'] },
      A: {
        initialState: { gold: 1 },
        segments: ['A'],
        choices: (state, team) => {
          const onward = { label: `Dál, ${team.name}`, goto: 'B' } as const;
          const foxes = { label: 'Lišky', goto: 'C' } as const;
          const rich = { label: 'Bohatí', goto: 'D' } as const;
          if (team.id === 2) return state.gold > 5 ? [onward, foxes, rich] : [onward, foxes];
          return state.gold > 5 ? [onward, rich] : [onward];
        },
      },
      B: {
        segments: ['B'],
        choices: [{ label: 'Zlato', goto: 'F', nextState: () => ({ gold: 9 }) }],
      },
      C: { segments: ['C'], choices: [{ label: 'Konec', goto: 'OUTRO' }] },
      D: { segments: ['D'], choices: [{ label: 'Konec', goto: 'OUTRO' }] },
      F: {
        segments: ['F'],
        choices: (state) =>
          state.gold > 5 ? [{ label: 'Konec', goto: 'D' }] : [{ label: 'Chudí', goto: 'OUTRO' }],
      },
      OUTRO: { segments: ['Konec'] },
    },
  });
  const at = startPosition(dynamic)!;

  it('types `goto` inside the function too', () => {
    const typed = defineStory<{ gold: number }>()({
      teams: { 1: 'Vlci' },
      introNode: 'INTRO',
      outroNode: 'B',
      codes: {},
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { gold: 1 },
          segments: ['A'],
          // @ts-expect-error a target that is not a node of the story
          choices: () => [{ label: 'Pryč', goto: 'NIKDE' }],
        },
        B: { segments: ['B'] },
      },
    });
    expect(typed.order).toEqual(['INTRO', 'A', 'B']);
  });

  it('types a function that may give no choice as a mistake', () => {
    const typed = defineStory<{ key: boolean }>()({
      teams: { 1: 'Vlci' },
      introNode: 'INTRO',
      outroNode: 'D',
      codes: { 1: 'Studna' },
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { key: false },
          segments: ['A'],
          // @ts-expect-error a function has to give at least one choice
          choices: () => [],
        },
        B: {
          segments: ['B'],
          // @ts-expect-error a function has to give a list
          choices: () => undefined,
        },
        C: {
          segments: ['C'],
          // @ts-expect-error the list may be empty for some states
          scans: (state) => (state.key ? [{ code: 1, goto: 'D' }] : []),
        },
        D: { segments: ['D'] },
      },
    });
    expect(typed.order).toEqual(['INTRO', 'A', 'B', 'C', 'D']);
  });

  it('throws when a function gives no list, an empty one or an empty item', () => {
    const broken = defineStory<{ gold: number }>()({
      teams: { 1: 'Vlci' },
      introNode: 'INTRO',
      outroNode: 'OUTRO',
      codes: { 1: 'Studna' },
      nodes: {
        INTRO: { segments: ['Úvod'] },
        EMPTY: { initialState: { gold: 0 }, segments: ['A'], choices: () => unchecked('[]') },
        NONE: { segments: ['B'], choices: () => unchecked('null') },
        FALSY: { segments: ['C'], choices: () => unchecked('[false]') },
        SCAN: { segments: ['D'], scans: () => unchecked('[]') },
        OUTRO: { segments: ['Konec'] },
      },
    });
    const state = { gold: 0 };
    const errorOf = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return error;
      }
      return undefined;
    };
    for (const id of ['EMPTY', 'NONE', 'FALSY']) {
      const node = broken.nodes[id]!;
      expect(errorOf(() => choicesOf(node, state, VLCI))).toMatchObject({
        name: 'EmptyActionsError',
        list: 'choices',
      });
      expect(() => renderNode(broken, { node: id, state }, VLCI)).toThrow(EmptyActionsError);
      expect(() => applyChoice(broken, { node: id, state }, VLCI, 0)).toThrow(EmptyActionsError);
    }
    const scanNode = broken.nodes['SCAN']!;
    expect(errorOf(() => scansOf(scanNode, state, VLCI))).toBeInstanceOf(EmptyActionsError);
    expect(errorOf(() => scansOf(scanNode, state, VLCI))).toMatchObject({ list: 'scans' });
    expect(() => applyScan(broken, { node: 'SCAN', state }, VLCI, 1)).toThrow(EmptyActionsError);
  });

  it('renders the list the function gives for the state and the team', () => {
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
    // The same index means another choice for another team or state.
    const rich = { ...at, state: { gold: 9 } };
    expect(applyChoice(dynamic, rich, LISKY, 1)).toMatchObject({ position: { node: 'C' } });
    expect(applyChoice(dynamic, rich, VLCI, 1)).toMatchObject({ position: { node: 'D' } });
    expect(applyChoice(dynamic, rich, LISKY, 2)).toMatchObject({ position: { node: 'D' } });
  });

  it('draws the edges of all reachable states in the graph', () => {
    const graph = toGraph(dynamic);
    expect(graph.nodes['A']!.choices).toEqual([
      { label: 'Dál, Vlci', target: 'B', conditional: true, available: true },
      { label: 'Lišky', target: 'C', conditional: true, available: true },
    ]);
    // F is reached only in the state B sets, so it draws just the choice of that state.
    expect(graph.nodes['F']!.choices).toEqual([
      { label: 'Konec', target: 'D', conditional: true, available: true },
    ]);
    expect(graph.nodes['D']!.reached).toBe(true);
  });
});

describe('graph', () => {
  it('keeps two codes of a `scans` function leading to the same node apart', () => {
    const graph = toGraph(
      defineStory<{ key: boolean }>()({
        teams: { 1: 'Vlci' },
        codes: { 1: 'Studna', 2: 'Mlýn' },
        introNode: 'INTRO',
        outroNode: 'B',
        nodes: {
          INTRO: { segments: ['Úvod'] },
          A: {
            initialState: { key: false },
            segments: ['A'],
            choices: [
              {
                label: 'Klíč',
                goto: 'S',
                nextState: () => {
                  return { key: true };
                },
              },
              { label: 'Bez klíče', goto: 'S' },
            ],
          },
          S: {
            segments: ['S'],
            scans: (state) => {
              if (state.key) return [{ code: 2, goto: 'B' }];
              return [{ code: 1, goto: 'B' }];
            },
          },
          B: { segments: ['B'] },
        },
      }),
    );
    expect(graph.nodes['S']!.choices.map(({ code }) => code)).toEqual(
      expect.arrayContaining([1, 2]),
    );
    expect(graph.nodes['S']!.choices).toHaveLength(2);
  });

  it('survives a `choices` function that throws: it draws no edge', () => {
    const graph = toGraph(
      defineStory<{ n: number }>()({
        teams: { 1: 'Tým' },
        codes: {},
        introNode: 'INTRO',
        outroNode: 'OUTRO',
        nodes: {
          INTRO: { segments: ['Úvod'] },
          START: {
            initialState: { n: 0 },
            segments: ['Start'],
            choices: () => {
              throw new Error('boom');
            },
          },
          OUTRO: { segments: ['Konec'] },
        },
      }),
    );
    expect(graph.nodes['START']!.choices).toEqual([]);
    expect(graph.nodes['OUTRO']!.reached).toBe(false);
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
        segments: ['Pohodlně si nosil svoji chudou pokrývku hlavy.'],
      },
      choices: [
        { label: 'Bojovat', target: 'OUTRO', conditional: true, available: true },
        { label: 'Koupit meč', target: 'OUTRO', conditional: true, available: true },
      ],
    });
    expect(graph.nodes['A2']!.preview?.segments).toHaveLength(2);
    expect(graph.nodes['A2']).toMatchObject({
      preview: { state: { gold: 80, hatColor: 'green' } },
      choices: [
        { label: 'Místo 32', code: 32, target: 'B1', conditional: false },
        { label: 'Místo 33', code: 33, target: 'B1', conditional: false },
      ],
    });
    expect(graphProblems(graph)).toEqual([]);
  });

  it('marks an edge of a function available when it is offered to any team in the preview state', () => {
    const graph = toGraph(
      defineStory<{ n: number }>()({
        teams: { 1: 'Vlci', 2: 'Lišky' },
        introNode: 'INTRO',
        outroNode: 'B',
        codes: {},
        nodes: {
          INTRO: { segments: ['Úvod'] },
          A: {
            initialState: { n: 0 },
            segments: ['A'],
            choices: (state, team) => {
              if (state.n > 0) return [{ label: 'Konec', goto: 'B' }];
              const again = { label: 'Znovu', goto: 'A', nextState: () => ({ n: 1 }) } as const;
              return team.id === 2 ? [again, { label: 'Lišky', goto: 'B' }] : [again];
            },
          },
          B: { segments: ['B'] },
        },
      }),
    );
    // The preview state is the initial one; „Konec“ is offered only after „Znovu“.
    expect(graph.nodes['A']!.choices).toEqual([
      { label: 'Znovu', target: 'A', conditional: true, available: true },
      { label: 'Lišky', target: 'B', conditional: true, available: true },
      { label: 'Konec', target: 'B', conditional: true, available: false },
    ]);
  });

  it('draws the QR choices of a `scans` function with their code', () => {
    const graph = toGraph(
      defineStory<{ key: boolean }>()({
        teams: { 1: 'Vlci' },
        introNode: 'INTRO',
        outroNode: 'C',
        codes: { 1: 'Studna', 2: 'Brána' },
        nodes: {
          INTRO: { segments: ['Úvod'] },
          A: {
            initialState: { key: false },
            segments: ['A'],
            choices: [
              { label: 'Rovnou', goto: 'S' },
              { label: 'Pro klíč', goto: 'S', nextState: () => ({ key: true }) },
            ],
          },
          S: {
            segments: ['S'],
            scans: (state) => (state.key ? [{ code: 2, goto: 'C' }] : [{ code: 1, goto: 'B' }]),
          },
          B: { segments: ['B'], choices: [{ label: 'Konec', goto: 'C' }] },
          C: { segments: ['C'] },
        },
      }),
    );
    // S is first reached through „Rovnou“, without the key.
    expect(graph.nodes['S']!.preview?.state).toEqual({ key: false });
    expect(graph.nodes['S']!.choices).toEqual([
      { label: 'Studna', code: 1, target: 'B', conditional: true, available: true },
      { label: 'Brána', code: 2, target: 'C', conditional: true, available: false },
    ]);
    expect(graphProblems(graph)).toEqual([]);
  });

  it('previews the intro by the text of all its segments', () => {
    const graph = toGraph(
      defineStory<{ n: number }>()({
        teams: { 1: 'Tým' },
        codes: {},
        introNode: 'INTRO',
        outroNode: 'B',
        nodes: {
          INTRO: { segments: [{ svg: '<svg />', content: '' }, 'První text', 'Druhý text'] },
          A: { initialState: { n: 1 }, segments: ['A'], choices: [{ label: 'Konec', goto: 'B' }] },
          B: { segments: ['B'] },
        },
      }),
    );
    expect(graph.nodes['INTRO']!.preview).toEqual({ segments: ['', 'První text', 'Druhý text'] });
  });

  it('leaves unreached dynamic nodes without text', () => {
    const define = defineStory<{ n: number }>();
    const graph = toGraph(
      define({
        teams: { 1: 'Tým' },
        codes: {},
        introNode: 'INTRO',
        outroNode: 'OUTRO',
        nodes: {
          INTRO: { segments: ['Úvod'] },
          A: { initialState: { n: 1 }, segments: [], choices: [{ label: 'Dál', goto: 'C' }] },
          B: { segments: ['B'], choices: [{ label: 'Jinam', goto: 'D' }] },
          C: {
            segments: (state) => [`n = ${state.n}`],
            choices: [{ label: 'Konec', goto: 'OUTRO' }],
          },
          D: {
            segments: (state) => [`d = ${state.n}`],
            choices: [{ label: 'Konec', goto: 'OUTRO' }],
          },
          OUTRO: { segments: ['Konec'] },
        },
      }),
    );
    expect(graph.start).toBe('A');
    expect(graph.nodes['C']!.preview?.segments).toEqual(['n = 1']);
    expect(graph.nodes['D']).toMatchObject({ reached: false, dynamic: true });
    expect(graph.nodes['D']!.preview).toBeUndefined();
    expect(graph.nodes['B']).toMatchObject({ reached: false, preview: { segments: ['B'] } });
  });

  it('reports a missing start and unreachable nodes', () => {
    const define = defineStory<{ n: number }>();
    const noStart = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'A',
      codes: {},
      nodes: { INTRO: { segments: ['Úvod'] }, A: { segments: ['A'] } },
    });
    expect(graphProblems(toGraph(noStart))).toEqual(['Příběh nemá start (uzel s initialState).']);
    const orphan = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: { initialState: { n: 0 }, segments: [], choices: [{ label: 'Dál', goto: 'B' }] },
        B: { segments: ['B'] },
        C: { segments: ['C'], choices: [{ label: 'Konec', goto: 'B' }] },
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
      codes: {},
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { gold: 0 },
          segments: [],
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
        C: { segments: (_state, team) => [team.color] },
        // @ts-expect-error: unknown theme
        B: { segments: [{ theme: 'neon', content: 'B' }], choices: [{ label: 'Dál', goto: 'C' }] },
      },
    });
    define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        // @ts-expect-error: a node that is not the outro needs choices or QR choices
        A: { initialState: { gold: 0 }, segments: [] },
        B: { segments: ['B'] },
      },
    });
    define({
      teams: { 1: 'Tým' },
      codes: { 1: 'Místo 1' },
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        // @ts-expect-error: a node offers buttons or QR choices, not both
        A: {
          initialState: { gold: 0 },
          segments: [],
          choices: [{ label: 'Dál', goto: 'B' }],
          scans: [{ code: 1, goto: 'B' }],
        },
        B: { segments: ['B'] },
      },
    });
    define({
      teams: { 1: 'Tým' },
      codes: { 1: 'Studna' },
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { gold: 0 },
          segments: [],
          scans: [
            { code: 1, goto: 'B' },
            // @ts-expect-error: a QR choice must use a code from `codes`
            { code: 2, goto: 'B' },
          ],
        },
        B: { segments: ['B'] },
      },
    });
    // A wrong id makes the other nodes mistyped too, so these stay on one line each.
    const base = { teams: {}, codes: {} } as const;
    // @ts-expect-error: the intro has to be a node of the story
    define({ ...base, introNode: 'X', outroNode: 'B', nodes: { B: { segments: [] } } });
    // @ts-expect-error: the outro is another node than the intro
    define({ ...base, introNode: 'B', outroNode: 'B', nodes: { B: { segments: [] } } });
    define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        // @ts-expect-error: the intro has no team and no state, so its segments are a plain list
        INTRO: { segments: (_state, team) => [team.name] },
        A: { initialState: { gold: 0 }, segments: [], choices: [{ label: 'Dál', goto: 'B' }] },
        B: { segments: ['B'] },
      },
    });
  }
};
