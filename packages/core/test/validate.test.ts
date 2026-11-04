import { describe, expect, it } from 'vitest';

import { defineStory, validateStory, type Story } from '../src/index.ts';
import { SAMPLE } from './fixtures.ts';

const define = defineStory<{ n: number }>();

describe('validateStory', () => {
  it('accepts a sound story', () => {
    expect(validateStory(SAMPLE)).toEqual([]);
  });

  it('requires a start', () => {
    expect(
      validateStory(
        define({
          teams: { 1: 'Tým' },
          introNode: 'INTRO',
          outroNode: 'A',
          locations: {},
          nodes: { INTRO: { blocks: ['Úvod'] }, A: { blocks: ['A'] } },
        }),
      ),
    ).toEqual(['Příběh nemá start (uzel s initialState).']);
  });

  it('requires one start, an intro and teams', () => {
    const story = define({
      teams: { 0: ' ' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { blocks: ['Vítejte', '  '] },
        A: { initialState: { n: 0 }, blocks: ['A'], choices: [{ label: 'Dál', goto: 'C' }] },
        B: { initialState: { n: 1 }, blocks: ['B'], choices: [{ label: 'Dál', goto: 'C' }] },
        C: { blocks: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Příběh má víc startů (A, B), smí mít jen jeden.',
      'Úvod má prázdnou obrazovku č. 2.',
      'Tým „ “ má neplatné číslo 0.',
      'Tým 0 nemá název.',
      'Uzel B je nedosažitelný ze startu.',
    ]);
    expect(validateStory({ ...story, introNode: 'NIKDE', outroNode: 'NIKDE', teams: [] })).toEqual(
      expect.arrayContaining([
        'Příběh nemá uzel úvodu NIKDE.',
        'Příběh nemá uzel konce NIKDE.',
        'Příběh nemá žádný tým.',
      ]),
    );
  });

  it('reports a next button that would never show; an empty one is just an arrow', () => {
    const story = define({
      teams: { 1: 'Tým' },
      locations: { 1: 'Místo' },
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { blocks: [{ content: 'Úvod', next: ' ' }] },
        A: {
          initialState: { n: 0 },
          blocks: [
            { content: 'A', next: 'Dál' },
            { content: 'A2', next: 'Ke kódu' },
          ],
          scans: [{ location: 1, goto: 'B' }],
        },
        B: {
          blocks: [
            { content: 'B', next: ' ' },
            { content: 'B2', next: 'Nikam' },
          ],
          choices: [{ label: 'Konec', goto: 'C' }],
        },
        C: { blocks: [{ content: 'C', next: 'Taky nikam' }] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel B má next „Nikam“ na poslední obrazovce, kde žádné takové tlačítko není.',
      'Uzel C má next „Taky nikam“ na poslední obrazovce, kde žádné takové tlačítko není.',
    ]);
  });

  it('checks the content for every team', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      introNode: 'INTRO',
      outroNode: 'B',
      locations: {},
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: (_state, team) => [team.id === 1 && 'Jen pro Vlky'],
          choices: [{ label: 'Dál', goto: 'B' }],
        },
        B: { blocks: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A nemá ve stavu {"n":0} žádný obsah. (týká se: Lišky)',
    ]);
  });

  it('reports unreachable nodes and choices nobody can take', () => {
    const story = define({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 1 },
          blocks: ['A'],
          choices: [
            { label: 'Dál', goto: 'B' },
            { label: 'Nikdy', goto: 'C', when: (state) => state.n > 5 },
          ],
        },
        B: { blocks: ['B'] },
        C: { blocks: ['C'], choices: [{ label: 'Konec', goto: 'B' }] },
        D: { blocks: ['D'], choices: [{ label: 'Konec', goto: 'B' }] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Volba „Nikdy“ v uzlu A není dostupná v žádném dosažitelném stavu.',
      'Uzel C je nedosažitelný ze startu.',
      'Uzel D je nedosažitelný ze startu.',
    ]);
  });

  it('follows the state, so a choice used on one path is not unused', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'C',
      locations: {},
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: [
            { label: 'Plus', goto: 'B', nextState: (state) => ({ n: state.n + 1 }) },
            { label: 'Rovně', goto: 'B' },
          ],
        },
        B: {
          blocks: (state) => [`n = ${state.n}`],
          choices: [
            { label: 'Odměna', goto: 'C', when: (state) => state.n > 0 },
            { label: 'Konec', goto: 'C' },
          ],
        },
        C: { blocks: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([]);
  });

  it('reports dead ends in a reachable state', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'B',
      locations: {},
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: [
            { label: 'Jen s jedničkou', goto: 'B', when: (state) => state.n === 1 },
            { label: 'Jindy', goto: 'B', when: (state) => state.n === 2 },
          ],
        },
        B: { blocks: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A je ve stavu {"n":0} slepá ulička: žádná volba není dostupná.',
      'Volba „Jen s jedničkou“ v uzlu A není dostupná v žádném dosažitelném stavu.',
      'Volba „Jindy“ v uzlu A není dostupná v žádném dosažitelném stavu.',
      'Uzel B je nedosažitelný ze startu.',
    ]);
  });

  it('reports empty content, labels and duplicate choices', () => {
    const story = define({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A', { theme: 'letter', content: '   ' }, ''],
          choices: [
            { label: ' ', goto: 'B' },
            { label: 'Dál', goto: 'B' },
            { label: 'Dál', goto: 'C' },
          ],
        },
        B: { blocks: (state) => [state.n > 0 && 'nikdy'] },
        C: { blocks: ['C'], choices: [{ label: 'Konec', goto: 'B' }] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A má volbu bez popisku.',
      'Uzel A má dvě volby „Dál“.',
      'Uzel A má prázdnou obrazovku č. 2.',
      'Uzel A má prázdnou obrazovku č. 3.',
      'Uzel B nemá ve stavu {"n":0} žádný obsah.',
    ]);
  });

  it('plays the story for every team, so `when` can depend on the team', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      introNode: 'INTRO',
      outroNode: 'C',
      locations: {},
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: [
            { label: 'Vlci', goto: 'B', when: (_state, team) => team.id === 1 },
            { label: 'Lišky', goto: 'C', when: (_state, team) => team.id === 2 },
          ],
        },
        // Only the wolves get here, so the foxes' lack of a choice is no dead end.
        B: {
          blocks: ['B'],
          choices: [{ label: 'Dál', goto: 'C', when: (_state, team) => team.id === 1 }],
        },
        C: { blocks: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([]);
  });

  it('names the teams a problem concerns', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      introNode: 'INTRO',
      outroNode: 'B',
      locations: {},
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: [{ label: 'Jen Vlci', goto: 'B', when: (_state, team) => team.id === 1 }],
        },
        B: { blocks: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A je ve stavu {"n":0} slepá ulička: žádná volba není dostupná. (týká se: Lišky)',
    ]);
  });

  it('checks `choices` functions when played', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      introNode: 'INTRO',
      outroNode: 'B',
      locations: {},
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: (_state, team) =>
            team.id === 1
              ? [
                  { label: 'Dál', goto: 'B' },
                  { label: 'Dál', goto: 'B' },
                ]
              : [],
        },
        B: { blocks: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A má dvě volby „Dál“. (týká se: Vlci)',
      'Uzel A je ve stavu {"n":0} slepá ulička: žádná volba není dostupná. (týká se: Lišky)',
    ]);
  });

  it('reports a `choices` function that throws', () => {
    const story = define({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: () => {
            throw new Error('chyba');
          },
        },
        B: { blocks: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Podmínka volby v uzlu A ve stavu {"n":0} spadla: chyba',
      'Uzel B je nedosažitelný ze startu.',
    ]);
  });

  it('accepts a screen with a picture and no text', () => {
    const svg = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
    const story = define({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: [{ svg, content: '' }] },
        A: { initialState: { n: 0 }, blocks: ['A'], choices: [{ label: 'Konec', goto: 'B' }] },
        B: { blocks: [{ svg, content: ' ' }] },
      },
    });
    expect(validateStory(story)).toEqual([]);
  });

  it('reports an svg that is not one svg element', () => {
    const svg = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
    const story = define({
      teams: { 1: 'Tým' },
      locations: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { blocks: [{ svg: 'obrázek.svg', content: 'Úvod' }] },
        A: {
          initialState: { n: 0 },
          blocks: [
            { svg, content: 'A' },
            { svg: `\n  ${svg}\n`, content: 'B' },
            { svg: '<svg>', content: 'C' },
          ],
          choices: [{ label: 'Konec', goto: 'B' }],
        },
        B: { blocks: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Úvod má neplatné svg na obrazovce č. 1.',
      'Uzel A má neplatné svg na obrazovce č. 3.',
    ]);
  });

  it('reports bad locations, two QR choices for one location and blocks that throw', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'C',
      locations: { 0: 'Místo 0', 3: 'Místo 3' },
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['Sken'],
          scans: [
            { location: 0, goto: 'B' },
            { location: 3, goto: 'B' },
            { location: 3, goto: 'C' },
          ],
        },
        B: {
          blocks: () => {
            throw new Error('chyba');
          },
          choices: [{ label: 'Dál', goto: 'C' }],
        },
        C: { blocks: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Místo „Místo 0“ má neplatné číslo 0.',
      'Uzel A má ve stavu {"n":0} dvě QR volby pro místo 3.',
      'Obsah uzlu B ve stavu {"n":0} spadl: chyba',
    ]);
  });

  it('reports a goto to a missing node in an untyped story', () => {
    const story: Story = {
      teams: [{ id: 1, name: 'Tým' }],
      locations: [{ id: 1, name: 'Studna' }],
      introNode: 'I',
      outroNode: 'O',
      order: ['A'],
      nodes: {
        I: { blocks: ['Úvod'] },
        O: { blocks: ['O'] },
        A: { initialState: {}, blocks: ['A'], scans: [{ location: 2, goto: 'A' }] },
        B: { initialState: {}, blocks: ['B'], choices: [{ label: 'Pryč', goto: 'X' }] },
      },
    };
    expect(validateStory(story)).toEqual([
      'Místo 1 („Studna“) nepoužívá žádná QR volba.',
      'QR volba v uzlu A vede přes neznámé místo 2.',
    ]);
    expect(validateStory({ ...story, order: ['B'] })).toContain(
      'Volba „Pryč“ v uzlu B vede na neexistující uzel X.',
    );
  });

  it('stops exploring endless state spaces', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'B',
      locations: {},
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: [
            { label: 'Znovu', goto: 'A', nextState: (state) => ({ n: state.n + 1 }) },
            { label: 'Konec', goto: 'B' },
          ],
        },
        B: { blocks: ['B'] },
      },
    });
    expect(validateStory(story, { maxStates: 50 })).toEqual([
      'Příběh má víc než 50 kombinací uzlu a stavu, kontrola prošla jen část.',
    ]);
  });
});
