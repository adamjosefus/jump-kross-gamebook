import { describe, expect, it } from 'vitest';

import {
  draftNodeId,
  endsOf,
  incoming,
  routesTo,
  startsOf,
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

  it('starts where no other node leads, a choice back to the node itself aside', () => {
    expect(startsOf(draft).map((node) => node.id)).toEqual(['a', 'd']);
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
      characters: { min: 11, max: 16 },
    });
  });

  it('counts a start that is an end too', () => {
    expect(routesTo(draft, 'lost')).toEqual({
      steps: { min: 1, max: 1 },
      characters: { min: 1, max: 1 },
    });
  });

  it('gives nothing for a node no start leads to', () => {
    expect(routesTo(draft, 'island')).toBeUndefined();
  });

  it('holds for the sample draft: through either shop, with or without the neighbours', () => {
    expect(routesTo(SAMPLE_DRAFT, 'konec_hry')?.steps).toEqual({ min: 6, max: 8 });
  });
});
