import { describe, expect, it } from 'vitest';

import { defineStory, validateStory, type Story, type Value } from '../src/index.ts';
import { SAMPLE } from './fixtures.ts';

const define = defineStory<{ n: number; bag?: Value }>();

/** A value the type checker cannot see, as in a story checked without types. */
const unchecked = (json: string): readonly [never, ...never[]] => JSON.parse(json);

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
          nodes: { INTRO: { segments: ['Úvod'] }, A: { segments: ['A'] } },
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
        INTRO: { segments: ['Vítejte', '  '] },
        A: { initialState: { n: 0 }, segments: ['A'], choices: [{ label: 'Dál', goto: 'C' }] },
        B: { initialState: { n: 1 }, segments: ['B'], choices: [{ label: 'Dál', goto: 'C' }] },
        C: { segments: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Příběh má víc startů (A, B), smí mít jen jeden.',
      'Úvod má prázdný segment č. 2.',
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
        INTRO: { segments: [{ content: 'Úvod', next: ' ' }] },
        A: {
          initialState: { n: 0 },
          segments: [
            { content: 'A', next: 'Dál' },
            { content: 'A2', next: 'Ke kódu' },
          ],
          scans: [{ code: 1, goto: 'B' }],
        },
        B: {
          segments: [
            { content: 'B', next: ' ' },
            { content: 'B2', next: 'Nikam' },
          ],
          choices: [{ label: 'Konec', goto: 'C' }],
        },
        C: { segments: [{ content: 'C', next: 'Taky nikam' }] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel B má next „Nikam“ v posledním segmentu, kde žádné takové tlačítko není.',
      'Uzel C má next „Taky nikam“ v posledním segmentu, kde žádné takové tlačítko není.',
    ]);
  });

  it('checks the content for every team', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      introNode: 'INTRO',
      outroNode: 'B',
      codes: {},
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: (_state, team) => [team.id === 1 && 'Jen pro Vlky'],
          choices: [{ label: 'Dál', goto: 'B' }],
        },
        B: { segments: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A nemá ve stavu {"n":0} žádný obsah. (týká se: Lišky)',
    ]);
  });

  it('reports unreachable nodes, also behind a choice no reachable state gets', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 1 },
          segments: ['A'],
          choices: (state) =>
            state.n > 5
              ? [
                  { label: 'Dál', goto: 'B' },
                  { label: 'Nikdy', goto: 'C' },
                ]
              : [{ label: 'Dál', goto: 'B' }],
        },
        B: { segments: ['B'] },
        C: { segments: ['C'], choices: [{ label: 'Konec', goto: 'B' }] },
        D: { segments: ['D'], choices: [{ label: 'Konec', goto: 'B' }] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel C je nedosažitelný ze startu.',
      'Uzel D je nedosažitelný ze startu.',
    ]);
  });

  it('follows the state, so a choice given on one path leads on', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'C',
      codes: {},
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: [
            { label: 'Plus', goto: 'B', nextState: (state) => ({ n: state.n + 1 }) },
            { label: 'Rovně', goto: 'B' },
          ],
        },
        B: {
          segments: (state) => [`n = ${state.n}`],
          choices: (state) =>
            state.n > 0
              ? [
                  { label: 'Odměna', goto: 'C' },
                  { label: 'Konec', goto: 'C' },
                ]
              : [{ label: 'Konec', goto: 'C' }],
        },
        C: { segments: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([]);
  });

  it('reports a dead end: a node of an untyped story without choices that is not the end', () => {
    const story: Story = {
      teams: [{ id: 1, name: 'Tým' }],
      codes: [],
      chapters: [],
      introNode: 'I',
      outroNode: 'O',
      order: ['I', 'A', 'B', 'O'],
      nodes: {
        I: { segments: ['Úvod'] },
        A: { initialState: { n: 0 }, segments: ['A'], choices: [{ label: 'Dál', goto: 'B' }] },
        B: { segments: ['B'] },
        O: { segments: ['O'] },
      },
      timers: [],
    };
    expect(validateStory(story)).toEqual([
      'Uzel B je ve stavu {"n":0} slepá ulička: žádná volba není dostupná.',
      'Uzel O je nedosažitelný ze startu.',
    ]);
  });

  it('reports a `choices` or `scans` function that gives an empty list', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      introNode: 'INTRO',
      outroNode: 'C',
      codes: { 1: 'Studna' },
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: (_state, team) =>
            team.id === 1 ? [{ label: 'Dál', goto: 'B' }] : unchecked('[]'),
        },
        B: { segments: ['B'], scans: () => unchecked('[]') },
        C: { segments: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Kód 1 („Studna“) nepoužívá žádná QR volba.',
      'Volby uzlu B jsou ve stavu {"n":0} prázdné: scans musí dát aspoň jednu možnost. (týká se: Vlci)',
      'Volby uzlu A jsou ve stavu {"n":0} prázdné: choices musí dát aspoň jednu možnost. (týká se: Lišky)',
      'Uzel C je nedosažitelný ze startu.',
    ]);
  });

  it('reports empty content, labels and duplicate choices', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A', { theme: 'letter', content: '   ' }, ''],
          choices: [
            { label: ' ', goto: 'B' },
            { label: 'Dál', goto: 'B' },
            { label: 'Dál', goto: 'C' },
          ],
        },
        B: { segments: (state) => [state.n > 0 && 'nikdy'] },
        C: { segments: ['C'], choices: [{ label: 'Konec', goto: 'B' }] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A má volbu s prázdným popiskem; pro tlačítko „Další“ popisek vynech.',
      'Uzel A má dvě volby „Dál“.',
      'Uzel A má prázdný segment č. 2.',
      'Uzel A má prázdný segment č. 3.',
      'Uzel B nemá ve stavu {"n":0} žádný obsah.',
    ]);
  });

  it('accepts a choice without a text only as the single one', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: { initialState: { n: 0 }, segments: ['A'], choices: [{ goto: 'B' }] },
        B: { segments: ['B'], choices: [{ goto: 'C' }, { label: 'Konec', goto: 'C' }] },
        C: { segments: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel B má tlačítko „Další“ bez textu vedle dalších voleb; to může být jen jediná volba.',
    ]);
  });

  it('plays the story for every team, so a function can depend on the team', () => {
    const story = define({
      teams: { 1: 'Vlci', 2: 'Lišky' },
      introNode: 'INTRO',
      outroNode: 'C',
      codes: {},
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: (_state, team) =>
            team.id === 1 ? [{ label: 'Vlci', goto: 'B' }] : [{ label: 'Lišky', goto: 'C' }],
        },
        // Only the wolves get here, so the foxes' lack of a text is no problem.
        B: {
          segments: (_state, team) => [team.id === 1 && 'B'],
          choices: [{ label: 'Dál', goto: 'C' }],
        },
        C: { segments: ['C'] },
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
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: (_state, team) =>
            team.id === 1 ? [{ label: 'Jen Vlci', goto: 'B' }] : [{ label: 'Dokola', goto: 'A' }],
        },
        B: { segments: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
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
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: (_state, team) =>
            team.id === 1
              ? [
                  { label: 'Dál', goto: 'B' },
                  { label: 'Dál', goto: 'B' },
                ]
              : [{ label: 'Dál', goto: 'B' }],
        },
        B: { segments: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual(['Uzel A má dvě volby „Dál“. (týká se: Vlci)']);
  });

  it('reports a `choices` function that throws', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: () => {
            throw new Error('chyba');
          },
        },
        B: { segments: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Volby uzlu A ve stavu {"n":0} spadly: chyba',
      'Uzel B je nedosažitelný ze startu.',
    ]);
  });

  it('accepts a segment with a picture and no text', () => {
    const svg = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'B',
      nodes: {
        INTRO: { segments: [{ svg, content: '' }] },
        A: { initialState: { n: 0 }, segments: ['A'], choices: [{ label: 'Konec', goto: 'B' }] },
        B: { segments: [{ svg, content: ' ' }] },
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
        INTRO: { segments: [{ svg: 'obrázek.svg', content: 'Úvod' }] },
        A: {
          initialState: { n: 0 },
          segments: [
            { svg, content: 'A' },
            { svg: `\n  ${svg}\n`, content: 'B' },
            { svg: '<svg>', content: 'C' },
          ],
          choices: [{ label: 'Konec', goto: 'B' }],
        },
        B: { segments: ['B'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Úvod má neplatné svg v segmentu č. 1.',
      'Uzel A má neplatné svg v segmentu č. 3.',
    ]);
  });

  it('reports bad codes, two QR choices for one code and segments that throw', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'C',
      codes: { 0: 'Místo 0', 3: 'Místo 3' },
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['Sken'],
          scans: [
            { code: 0, goto: 'B' },
            { code: 3, goto: 'B' },
            { code: 3, goto: 'C' },
          ],
        },
        B: {
          segments: () => {
            throw new Error('chyba');
          },
          choices: [{ label: 'Dál', goto: 'C' }],
        },
        C: { segments: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Kód „Místo 0“ má neplatné číslo 0: musí být celé, od 1 do 999999.',
      'Uzel A má ve stavu {"n":0} dvě QR volby pro kód 3.',
      'Obsah uzlu B ve stavu {"n":0} spadl: chyba',
    ]);
  });

  it('checks `scans` functions when played: codes, targets and duplicates', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'C',
      codes: { 1: 'Studna', 2: 'Brána', 3: 'Věž' },
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: [
            { label: 'K bráně', goto: 'B' },
            { label: 'K věži', goto: 'B', nextState: () => ({ n: 1 }) },
          ],
        },
        // Code 3 is used only here, in the state „K věži“ sets.
        B: {
          segments: ['B'],
          scans: (state) =>
            state.n === 0
              ? [
                  { code: 1, goto: 'C' },
                  { code: 2, goto: 'C' },
                  { code: 2, goto: 'B' },
                ]
              : [
                  { code: 1, goto: 'C' },
                  { code: 3, goto: 'C' },
                ],
        },
        C: { segments: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual(['Uzel B má ve stavu {"n":0} dvě QR volby pro kód 2.']);
  });

  it('reports an unknown code and a missing target of a `scans` function', () => {
    const story: Story = {
      teams: [{ id: 1, name: 'Tým' }],
      codes: [{ id: 1, name: 'Studna' }],
      chapters: [],
      introNode: 'I',
      outroNode: 'O',
      order: ['I', 'A', 'O'],
      nodes: {
        I: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          scans: () => [
            { code: 1, goto: 'O' },
            { code: 2, goto: 'O' },
            { code: 1, goto: 'X' },
            { code: 1, goto: 'I' },
          ],
        },
        O: { segments: ['O'] },
      },
      timers: [],
    };
    expect(validateStory(story)).toEqual(
      expect.arrayContaining([
        'QR volba v uzlu A vede přes neznámý kód 2.',
        'QR volba kódu 1 v uzlu A vede na neexistující uzel X.',
        'QR volba kódu 1 v uzlu A vede na úvod.',
      ]),
    );
    expect(validateStory(story)).not.toContain('Kód 1 („Studna“) nepoužívá žádná QR volba.');
  });

  it('reports a goto to a missing node in an untyped story', () => {
    const story: Story = {
      teams: [{ id: 1, name: 'Tým' }],
      codes: [{ id: 1, name: 'Studna' }],
      chapters: [],
      introNode: 'I',
      outroNode: 'O',
      order: ['A'],
      nodes: {
        I: { segments: ['Úvod'] },
        O: { segments: ['O'] },
        A: { initialState: {}, segments: ['A'], scans: [{ code: 2, goto: 'A' }] },
        B: { initialState: {}, segments: ['B'], choices: [{ label: 'Pryč', goto: 'X' }] },
      },
      timers: [],
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
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          scans: [
            { code: 1, goto: 'C' },
            { code: 1000000, goto: 'C' },
          ],
        },
        C: { segments: ['C'] },
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
        INTRO: { segments: ['Úvod'] },
        A: { initialState: { n: 0 }, segments: ['A'], choices: [{ label: 'Dál', goto: 'C' }] },
        C: { segments: ['C'] },
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
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: Number.NaN },
          segments: ['A'],
          choices: [
            { label: 'Dál', goto: 'B', nextState: () => ({ n: 1, bag: parsed('{"gold":1}') }) },
          ],
        },
        B: { segments: ['B'], choices: [{ label: 'Dál', goto: 'C' }] },
        C: { segments: ['C'] },
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
        INTRO: { segments: ['Úvod'] },
        START: {
          initialState: { n: 0 },
          segments: ['Start'],
          choices: (_state, team) =>
            team.id === 1 ? [{ label: 'Konec', goto: 'OUTRO' }] : [{ label: 'Dokola', goto: 'B' }],
        },
        B: { segments: ['B'], choices: [{ label: 'Zpět', goto: 'START' }] },
        OUTRO: { segments: ['Konec'] },
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
        INTRO: { segments: ['Úvod'] },
        START: {
          initialState: { n: 0 },
          segments: ['Start'],
          choices: (state) => {
            const again = {
              label: 'Dál',
              goto: 'START',
              nextState: () => ({ n: state.n + 1 }),
            } as const;
            const aside = { label: 'Nikam', goto: 'C' } as const;
            if (state.n < 2) {
              return [again];
            }
            return state.n < 5 ? [again, aside] : [{ label: 'Konec', goto: 'OUTRO' }, aside];
          },
        },
        C: {
          segments: (state) => [state.n > 9 && 'C'],
          choices: [{ label: 'Nic', goto: 'OUTRO' }],
        },
        OUTRO: { segments: ['Konec'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel C nemá ve stavu {"n":2} žádný obsah. (a v dalších 3 stavech)',
    ]);
  });

  it('accepts a self-closing svg and refuses a numeric node name', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      introNode: 'INTRO',
      outroNode: 'OUTRO',
      nodes: {
        INTRO: { segments: [{ svg: '<svg viewBox="0 0 1 1"/>', content: 'Úvod' }] },
        START: {
          initialState: { n: 0 },
          segments: ['Start'],
          choices: [{ label: 'Dál', goto: 'OUTRO' }],
        },
        OUTRO: { segments: [{ svg: '<svg/>', content: 'Konec' }] },
      },
    });
    expect(validateStory(story)).toEqual([]);
    expect(
      validateStory({
        ...story,
        order: ['INTRO', 'START', 'OUTRO', '10'],
        nodes: { ...story.nodes, 10: { segments: ['x'] } },
      }),
    ).toEqual(['Uzel 10 má číselný název; pojmenujte ho slovem.']);
  });

  it('reports a trap: a reachable state from which the end cannot be reached', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'OUTRO',
      codes: {},
      nodes: {
        INTRO: { segments: ['Úvod'] },
        START: {
          initialState: { n: 0 },
          segments: ['Start'],
          choices: [
            { label: 'Rovnou', goto: 'A' },
            { label: 'Oklikou', goto: 'A', nextState: () => ({ n: 1 }) },
          ],
        },
        // With n = 1 the team walks between A and B forever: both always offer a way on.
        A: {
          segments: ['A'],
          choices: (state) =>
            state.n === 0
              ? [
                  { label: 'Konec', goto: 'OUTRO' },
                  { label: 'Do B', goto: 'B' },
                ]
              : [{ label: 'Do B', goto: 'B' }],
        },
        B: { segments: ['B'], choices: [{ label: 'Do A', goto: 'A' }] },
        OUTRO: { segments: ['Konec'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A je ve stavu {"n":1} past: odtud se nedá dojít na konec OUTRO.',
      'Uzel B je ve stavu {"n":1} past: odtud se nedá dojít na konec OUTRO.',
    ]);
  });

  it('accepts a loop the team can always leave', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'OUTRO',
      codes: {},
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: (state) => {
            const toB = {
              label: 'Do B',
              goto: 'B',
              nextState: () => ({ n: Math.min(state.n + 1, 2) }),
            } as const;
            return state.n >= 2 ? [toB, { label: 'Konec', goto: 'OUTRO' }] : [toB];
          },
        },
        B: { segments: ['B'], choices: [{ label: 'Zpět', goto: 'A' }] },
        OUTRO: { segments: ['Konec'] },
      },
    });
    expect(validateStory(story)).toEqual([]);
  });

  it('does not report traps when the exploration is cut short', () => {
    // Beyond the limit the end could still be reachable, so only the limit is reported.
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'OUTRO',
      codes: {},
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: (state) => {
            const again = {
              label: 'Dál',
              goto: 'A',
              nextState: () => ({ n: state.n + 1 }),
            } as const;
            return state.n === 0 ? [again, { label: 'Konec', goto: 'OUTRO' }] : [again];
          },
        },
        OUTRO: { segments: ['Konec'] },
      },
    });
    expect(validateStory(story, { maxStates: 50 })).toEqual([
      'Příběh má pro jeden tým víc než 50 kombinací uzlu a stavu, kontrola prošla jen část.',
    ]);
  });

  it('stops exploring endless state spaces', () => {
    const story = define({
      teams: { 1: 'Tým' },
      introNode: 'INTRO',
      outroNode: 'B',
      codes: {},
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          initialState: { n: 0 },
          segments: ['A'],
          choices: [
            { label: 'Znovu', goto: 'A', nextState: (state) => ({ n: state.n + 1 }) },
            { label: 'Konec', goto: 'B' },
          ],
        },
        B: { segments: ['B'] },
      },
    });
    expect(validateStory(story, { maxStates: 50 })).toEqual([
      'Příběh má pro jeden tým víc než 50 kombinací uzlu a stavu, kontrola prošla jen část.',
    ]);
  });
  it('reports unknown and empty chapters and chapter ids that would clash in the results', () => {
    const story = define({
      teams: { 1: 'Tým' },
      codes: {},
      chapters: { one: 'První', empty: { name: 'Prázdná', counts: false } },
      introNode: 'INTRO',
      outroNode: 'C',
      nodes: {
        INTRO: { segments: ['Úvod'] },
        A: {
          chapter: 'one',
          initialState: { n: 0 },
          segments: ['A'],
          choices: [{ label: 'B', goto: 'B' }],
        },
        B: { chapter: 'nowhere', segments: ['B'], choices: [{ label: 'C', goto: 'C' }] },
        C: { segments: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Uzel B patří k neznámé kapitole nowhere.',
      'Kapitola empty („Prázdná“) nemá žádný uzel.',
    ]);
    const badIds: Story = {
      ...story,
      chapters: [
        ...story.chapters,
        { id: '', name: 'Bez id', counts: true, timer: '' },
        { id: 'one_two', name: 'Spojená', counts: true, timer: 'one_two' },
        { id: 'start', name: 'Začátek', counts: true, timer: 'start' },
        { id: 'own', name: 'Vlastní stopky', counts: true, timer: 'na_cestu' },
      ],
    };
    expect(validateStory(badIds)).toEqual(
      expect.arrayContaining([
        'Kapitola „Bez id“ má neplatné id „“: smí mít jen písmena bez diakritiky a číslice a začínat písmenem.',
        'Kapitola „Spojená“ má neplatné id „one_two“: smí mít jen písmena bez diakritiky a číslice a začínat písmenem.',
        'Kapitola „Začátek“ nesmí mít id „start“, to označuje začátek nebo konec hry.',
        'Kapitola „Vlastní stopky“ má neplatné stopky „na_cestu“: smí mít jen písmena bez diakritiky a číslice a začínat písmenem.',
      ]),
    );
  });
});
