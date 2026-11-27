import { describe, expect, it } from 'vitest';

import {
  draftNodeId,
  draftProblems,
  endsOf,
  incoming,
  meanCharactersOf,
  rootsOf,
  routesTo,
  sameLabelChoices,
  startsOf,
  toMermaid,
  type Draft,
} from '@/features/editor/draft';
import { SAMPLE_DRAFT } from '@/features/editor/sample-draft';

describe('draftNodeId', () => {
  it('drops diacritics and punctuation and joins the words by underscores', () => {
    expect(draftNodeId('Tým jde do pekárny')).toBe('tym_jde_do_pekarny');
    expect(draftNodeId('  „Ven!“ — řekla pekařka.  ')).toBe('ven_rekla_pekarka');
    expect(draftNodeId('Kód 4, nebo 5?')).toBe('kod_4_nebo_5');
  });

  it('cuts after the last whole word that fits 24 characters', () => {
    // „chleba“ would make 29 characters.
    expect(draftNodeId('Tým jde do pekárny pro chleba')).toBe('tym_jde_do_pekarny_pro');
    expect(draftNodeId('Nejneobhospodařovávatelnějšími cestami')).toBe('nejneobhospodarovavateln');
  });

  it('falls back to „uzel“ for a summary without letters', () => {
    expect(draftNodeId('')).toBe('uzel');
    expect(draftNodeId('…?!')).toBe('uzel');
  });

  it('adds a number when the id is taken', () => {
    expect(draftNodeId('Pekárna', new Set(['pekarna']))).toBe('pekarna_2');
    expect(draftNodeId('Pekárna', new Set(['pekarna', 'pekarna_2']))).toBe('pekarna_3');
    expect(draftNodeId('', new Set(['uzel']))).toBe('uzel_2');
  });
});

describe('the shape of a draft', () => {
  const draft: Draft = {
    version: 1,
    nodes: [
      { id: 'a', summary: 'A', segments: [{ text: '' }], choices: [{ label: '', to: 'b' }] },
      {
        id: 'b',
        summary: 'B',
        segments: [{ text: '' }],
        choices: [
          { label: 'Znovu', to: 'b' },
          { label: 'Dál', to: 'c' },
        ],
      },
      { id: 'c', summary: 'C', segments: [{ text: '' }], choices: [] },
      { id: 'd', summary: 'D', segments: [{ text: '' }], choices: [{ label: 'Taky', to: 'c' }] },
    ],
  };

  it('finds the nodes no other node leads into, a choice back to the node itself aside', () => {
    expect(rootsOf(draft).map((node) => node.id)).toEqual(['a', 'd']);
  });

  it('begins at the first of them without starts written; the others hang loose', () => {
    expect(startsOf(draft).map((node) => node.id)).toEqual(['a']);
    expect(draftProblems(draft)).toEqual([{ id: 'd', problems: ['loose'] }]);
  });

  it('begins where the starts point, and reports none or more than one', () => {
    expect(startsOf({ ...draft, starts: ['d', 'gone'] }).map((node) => node.id)).toEqual(['d']);
    expect(draftProblems({ ...draft, starts: ['a', 'd'] })).toEqual([
      { id: 'a', problems: ['manyStarts'] },
      { id: 'd', problems: ['manyStarts'] },
    ]);
    expect(draftProblems({ ...draft, starts: [] })).toEqual([
      { id: undefined, problems: ['noStart'] },
      { id: 'a', problems: ['loose'] },
      { id: 'd', problems: ['loose'] },
    ]);
  });

  it('reports choices of the same text with the other problems of their node', () => {
    const same: Draft = {
      ...draft,
      nodes: draft.nodes.map((node) => {
        if (node.id !== 'd') {
          return node;
        }

        return { ...node, choices: [...node.choices, { label: 'taky', to: 'b' }] };
      }),
    };
    expect(draftProblems(same)).toEqual([{ id: 'd', problems: ['sameLabels', 'loose'] }]);
    expect(draftProblems(SAMPLE_DRAFT)).toEqual([]);
  });

  it('ends where a node has no choice', () => {
    expect(endsOf(draft).map((node) => node.id)).toEqual(['c']);
  });

  it('lists the choices leading into a node with their positions', () => {
    expect(
      incoming(draft, 'c').map(({ from, choice, index }) => [from.id, choice.label, index]),
    ).toEqual([
      ['b', 'Dál', 1],
      ['d', 'Taky', 0],
    ]);
  });

  it('holds for the sample draft: one start, one end, every choice to a node there', () => {
    expect(startsOf(SAMPLE_DRAFT).map((node) => node.id)).toEqual(['patek_odpoledne_doma']);
    expect(endsOf(SAMPLE_DRAFT).map((node) => node.id)).toEqual(['konec_hry']);
    const ids = new Set(SAMPLE_DRAFT.nodes.map((node) => node.id));
    const targets = SAMPLE_DRAFT.nodes.flatMap((node) => node.choices.map((choice) => choice.to));
    expect(targets.filter((target) => !ids.has(target))).toEqual([]);
  });
});

describe('routesTo', () => {
  const text = (length: number) => [{ text: 'x'.repeat(length) }];
  const draft: Draft = {
    version: 1,
    nodes: [
      {
        id: 'a',
        summary: '',
        segments: text(10),
        choices: [
          { label: 'Krátce', to: 'end' },
          { label: 'Oklikou', to: 'b' },
        ],
      },
      {
        id: 'b',
        summary: '',
        segments: [{ text: 'xx' }, { text: 'yyy' }],
        choices: [
          { label: 'Znovu', to: 'b' },
          { label: 'Dál', to: 'end' },
        ],
      },
      { id: 'end', summary: '', segments: text(1), choices: [] },
      { id: 'lost', summary: '', segments: text(1), choices: [] },
      { id: 'island', summary: '', segments: text(1), choices: [{ label: '', to: 'island_2' }] },
      { id: 'island_2', summary: '', segments: text(1), choices: [{ label: '', to: 'island' }] },
    ],
  };

  it('measures the shortest and the longest way, each node once, in nodes and text', () => {
    // a → end, or a → b → end; going round b again does not make a way of its own.
    expect(routesTo(draft, 'end')).toEqual({
      steps: { min: 2, max: 3 },
      ways: 2,
      meanCharacters: (11 + 16) / 2,
    });
  });

  it('counts two choices to one node as one way', () => {
    const twice: Draft = {
      version: 1,
      nodes: [
        {
          id: 'start',
          summary: '',
          segments: text(4),
          choices: [
            { label: 'Vzít 20 mincí', to: 'shop' },
            { label: 'Vzít 30 mincí', to: 'shop' },
            { label: 'Zůstat doma', to: 'home' },
          ],
        },
        { id: 'shop', summary: '', segments: text(20), choices: [{ label: '', to: 'home' }] },
        { id: 'home', summary: '', segments: text(1), choices: [] },
      ],
    };
    // start → home and start → shop → home, not start → shop → home twice.
    expect(routesTo(twice, 'home')).toEqual({
      steps: { min: 2, max: 3 },
      ways: 2,
      meanCharacters: (5 + 25) / 2,
    });
  });

  it('counts the start when it is an end too', () => {
    const alone: Draft = {
      version: 1,
      nodes: [{ id: 'one', summary: '', segments: text(1), choices: [] }],
    };
    expect(routesTo(alone, 'one')).toEqual({
      steps: { min: 1, max: 1 },
      ways: 1,
      meanCharacters: 1,
    });
  });

  it('walks only from the start: a loose node begins no way', () => {
    expect(routesTo(draft, 'lost')).toBeUndefined();
  });

  it('averages the characters over all the ways to all the ends', () => {
    const ends = [routesTo(draft, 'end')!, routesTo(draft, 'end')!];
    // The ways have 11 and 16 characters, counted twice here.
    expect(meanCharactersOf(ends)).toBe((11 + 16) / 2);
    expect(meanCharactersOf([])).toBeUndefined();
  });

  it('gives nothing for a node no start leads to', () => {
    expect(routesTo(draft, 'island')).toBeUndefined();
  });

  it('holds for the sample draft: through either shop, with or without the neighbours', () => {
    expect(routesTo(SAMPLE_DRAFT, 'konec_hry')?.steps).toEqual({ min: 6, max: 8 });
  });
});

describe('sameLabelChoices', () => {
  it('marks every choice whose text another one has, trimmed and case aside', () => {
    const choices = [
      { label: 'Autobus', to: 'a' },
      { label: 'Park', to: 'b' },
      { label: ' autobus ', to: 'c' },
    ];
    expect([...sameLabelChoices(choices)]).toEqual([0, 2]);
  });

  it('takes an empty text for the plain arrow „Další“', () => {
    const choices = [
      { label: '', to: 'a' },
      { label: 'Další', to: 'b' },
      { label: 'Park', to: 'c' },
    ];
    expect([...sameLabelChoices(choices)]).toEqual([0, 1]);
  });

  it('marks nothing when every text differs', () => {
    expect(
      sameLabelChoices(SAMPLE_DRAFT.nodes.find((node) => node.id === 'cesta_domu')!.choices).size,
    ).toBe(0);
  });
});

describe('toMermaid', () => {
  it('draws the start, the nodes by their summaries and the choices by their texts', () => {
    const draft: Draft = {
      version: 1,
      starts: ['a'],
      nodes: [
        {
          id: 'a',
          summary: 'Řekne „ahoj“',
          segments: [{ text: '' }],
          choices: [
            { label: '', to: 'end' },
            { label: 'Pryč', to: 'gone' },
          ],
        },
        { id: 'end', summary: '', segments: [{ text: '' }], choices: [] },
      ],
    };
    expect(toMermaid(draft)).toBe(
      [
        'flowchart TD',
        '  _start([Začátek])',
        '  a["Řekne „ahoj“"]',
        '  end_["end"]',
        '  _start --> a',
        '  a -->|"Další"| end_',
      ].join('\n'),
    );
  });

  it('keeps the quotes inside a label from closing it', () => {
    const draft: Draft = {
      version: 1,
      nodes: [{ id: 'a', summary: 'Pak "dál"', segments: [{ text: '' }], choices: [] }],
    };
    expect(toMermaid(draft)).toContain('a["Pak #quot;dál#quot;"]');
  });
});
