import { describe, expect, it } from 'vitest';

import { defineStory, validateStory, type Story, type Value } from '../src/index.ts';
import { SAMPLE } from './fixtures.ts';

const define = defineStory<{ n: number; bag?: Value }>();

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
          codes: {},
          nodes: { INTRO: { blocks: ['Úvod'] }, A: { blocks: ['A'] } },
        }),
      ),
    ).toEqual(['Příběh nemá start (uzel s initialState).']);
  });

  it('requires one start, an intro and teams', () => {
    const story = define({
      teams: { 0: ' ' },
      codes: {},
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
      'Tým „ “ má neplatné číslo 0: musí být celé, od 1 do 999999.',
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
      codes: { 1: 'Místo' },
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
          scans: [{ code: 1, goto: 'B' }],
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
      codes: {},
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
      codes: {},
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
      codes: {},
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
      codes: {},
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
      codes: {},
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
      codes: {},
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
      codes: {},
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
      'Konec B je ze startu nedosažitelný: tým nemůže hru dohrát. (týká se: Lišky)',
    ]);
  });

  it('checks `choices` functions when played', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      introNode: 'INTRO',
      outroNode: 'B',
      codes: {},
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
      'Konec B je ze startu nedosažitelný: tým nemůže hru dohrát. (týká se: Lišky)',
    ]);
  });

  it('reports a `choices` function that throws', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
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
      codes: {},
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
      codes: {},
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

  it('reports bad codes, two QR choices for one code and blocks that throw', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'C',
      codes: { 0: 'Místo 0', 3: 'Místo 3' },
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['Sken'],
          scans: [
            { code: 0, goto: 'B' },
            { code: 3, goto: 'B' },
            { code: 3, goto: 'C' },
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
      'Kód „Místo 0“ má neplatné číslo 0: musí být celé, od 1 do 999999.',
      'Uzel A má ve stavu {"n":0} dvě QR volby pro kód 3.',
      'Obsah uzlu B ve stavu {"n":0} spadl: chyba',
    ]);
  });

  it('reports a goto to a missing node in an untyped story', () => {
    const story: Story = {
      teams: [{ id: 1, name: 'Tým' }],
      codes: [{ id: 1, name: 'Studna' }],
      introNode: 'I',
      outroNode: 'O',
      order: ['A'],
      nodes: {
        I: { blocks: ['Úvod'] },
        O: { blocks: ['O'] },
        A: { initialState: {}, blocks: ['A'], scans: [{ code: 2, goto: 'A' }] },
        B: { initialState: {}, blocks: ['B'], choices: [{ label: 'Pryč', goto: 'X' }] },
      },
    };
    expect(validateStory(story)).toEqual([
      'Kód 1 („Studna“) nepoužívá žádná QR volba.',
      'QR volba v uzlu A vede přes neznámý kód 2.',
    ]);
    expect(validateStory({ ...story, order: ['B'] })).toContain(
      'Volba „Pryč“ v uzlu B vede na neexistující uzel X.',
    );
  });

  it('reports ids that do not fit a QR code and ids used twice', () => {
    const story = define({
      teams: { 1: 'Tým', 1000000: 'Daleký' },
      codes: { 1: 'Místo', 1000000: 'Daleké' },
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          scans: [
            { code: 1, goto: 'C' },
            { code: 1000000, goto: 'C' },
          ],
        },
        C: { blocks: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Tým „Daleký“ má neplatné číslo 1000000: musí být celé, od 1 do 999999.',
      'Kód „Daleké“ má neplatné číslo 1000000: musí být celé, od 1 do 999999.',
    ]);
    const twice: Story = {
      ...story,
      teams: [
        { id: 1, name: 'Tým' },
        { id: 1, name: 'Zase tým' },
      ],
      codes: [
        { id: 1, name: 'Místo' },
        { id: 1, name: 'Zase místo' },
      ],
    };
    expect(validateStory(twice)).toEqual(
      expect.arrayContaining([
        'Číslo týmu 1 je použito dvakrát.',
        'Číslo kódu 1 je použito dvakrát.',
      ]),
    );
  });

  it('reports order and nodes that disagree before anything else', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: { initialState: { n: 0 }, blocks: ['A'], choices: [{ label: 'Dál', goto: 'C' }] },
        C: { blocks: ['C'] },
      },
    });
    expect(validateStory({ ...story, order: ['INTRO', 'A', 'A', 'X'] })).toEqual([
      'Uzel A je v order dvakrát.',
      'Uzel X z order není v nodes.',
    ]);
  });

  it('reports state values that are not a string, a number or a boolean', () => {
    // The type forbids it; a value parsed from JSON gets through the type checker.
    const parsed = (json: string): Value => JSON.parse(json);
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        A: {
          initialState: { n: Number.NaN },
          blocks: ['A'],
          choices: [
            { label: 'Dál', goto: 'B', nextState: () => ({ n: 1, bag: parsed('{"gold":1}') }) },
          ],
        },
        B: { blocks: ['B'], choices: [{ label: 'Dál', goto: 'C' }] },
        C: { blocks: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Start A má ve stavu hodnoty, které nejsou text, číslo ani ano/ne: n.',
      'nextState volby „Dál“ v uzlu A má ve stavu hodnoty, které nejsou text, číslo ani ano/ne: bag.',
      'Uzel B je nedosažitelný ze startu.',
      'Uzel C je nedosažitelný ze startu.',
    ]);
  });

  it('reports a team that can never reach the end', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'OUTRO',
      nodes: {
        INTRO: { blocks: ['Úvod'] },
        START: {
          initialState: { n: 0 },
          blocks: ['Start'],
          choices: [
            { label: 'Konec', goto: 'OUTRO', when: (_state, team) => team.id === 1 },
            { label: 'Dokola', goto: 'B', when: (_state, team) => team.id === 2 },
          ],
        },
        B: { blocks: ['B'], choices: [{ label: 'Zpět', goto: 'START' }] },
        OUTRO: { blocks: ['Konec'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Konec OUTRO je ze startu nedosažitelný: tým nemůže hru dohrát. (týká se: Lišky)',
    ]);
  });

  it('names a problem of many states once, with their count', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
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
              goto: 'START',
              nextState: (state) => ({ n: state.n + 1 }),
              when: (state) => state.n < 5,
            },
            { label: 'Konec', goto: 'OUTRO', when: (state) => state.n >= 5 },
            { label: 'Nikam', goto: 'C', when: (state) => state.n >= 2 },
          ],
        },
        C: { blocks: ['C'], choices: [{ label: 'Nic', goto: 'OUTRO', when: () => false }] },
        OUTRO: { blocks: ['Konec'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel C je ve stavu {"n":2} slepá ulička: žádná volba není dostupná. (a v dalších 3 stavech)',
      'Volba „Nic“ v uzlu C není dostupná v žádném dosažitelném stavu.',
    ]);
  });

  it('accepts a self-closing svg and refuses a numeric node name', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'OUTRO',
      nodes: {
        INTRO: { blocks: [{ svg: '<svg viewBox="0 0 1 1"/>', content: 'Úvod' }] },
        START: {
          initialState: { n: 0 },
          blocks: ['Start'],
          choices: [{ label: 'Dál', goto: 'OUTRO' }],
        },
        OUTRO: { blocks: [{ svg: '<svg/>', content: 'Konec' }] },
      },
    });
    expect(validateStory(story)).toEqual([]);
    expect(
      validateStory({
        ...story,
        order: ['INTRO', 'START', 'OUTRO', '10'],
        nodes: { ...story.nodes, 10: { blocks: ['x'] } },
      }),
    ).toEqual(['Uzel 10 má číselný název; pojmenujte ho slovem.']);
  });

  it('stops exploring endless state spaces', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'B',
      codes: {},
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
      'Příběh má pro jeden tým víc než 50 kombinací uzlu a stavu, kontrola prošla jen část.',
    ]);
  });
});
