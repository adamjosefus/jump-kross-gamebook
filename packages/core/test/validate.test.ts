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
          intro: ['Úvod'],
          locations: {},
          nodes: { A: { end: true, blocks: ['A'] } },
        }),
      ),
    ).toEqual(['Příběh nemá start (uzel s initialState).']);
  });

  it('requires one start, an intro and teams', () => {
    const story = define({
      teams: { 0: ' ' },
      intro: ['Vítejte', '  '],
      locations: {},
      nodes: {
        A: { initialState: { n: 0 }, blocks: ['A'], choices: [{ label: 'Dál', goto: 'C' }] },
        B: { initialState: { n: 1 }, blocks: ['B'], choices: [{ label: 'Dál', goto: 'C' }] },
        C: { end: true, blocks: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([
      'Příběh má víc startů (A, B), smí mít jen jeden.',
      'Úvod má prázdnou obrazovku č. 2.',
      'Tým „ “ má neplatné číslo 0.',
      'Tým 0 nemá název.',
      'Uzel B je nedosažitelný ze startu.',
    ]);
    expect(validateStory({ ...story, intro: [], teams: [] })).toEqual(
      expect.arrayContaining(['Příběh nemá úvod (intro).', 'Příběh nemá žádný tým.']),
    );
  });

  it('reports unreachable nodes and choices nobody can take', () => {
    const story = define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: {},
      nodes: {
        A: {
          initialState: { n: 1 },
          blocks: ['A'],
          choices: [
            { label: 'Dál', goto: 'B' },
            { label: 'Nikdy', goto: 'C', when: (state) => state.n > 5 },
          ],
        },
        B: { end: true, blocks: ['B'] },
        C: { end: true, blocks: ['C'] },
        D: { end: true, blocks: ['D'] },
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
      intro: ['Úvod'],
      locations: {},
      nodes: {
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
        C: { end: true, blocks: ['C'] },
      },
    });
    expect(validateStory(story)).toEqual([]);
  });

  it('reports dead ends in a reachable state', () => {
    const story = define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: {},
      nodes: {
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: [
            { label: 'Jen s jedničkou', goto: 'B', when: (state) => state.n === 1 },
            { label: 'Jindy', goto: 'B', when: (state) => state.n === 2 },
          ],
        },
        B: { end: true, blocks: ['B'] },
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
      intro: ['Úvod'],
      locations: {},
      nodes: {
        A: {
          initialState: { n: 0 },
          blocks: ['A', { theme: 'letter', content: '   ' }, ''],
          choices: [
            { label: ' ', goto: 'B' },
            { label: 'Dál', goto: 'B' },
            { label: 'Dál', goto: 'C' },
          ],
        },
        B: { end: true, blocks: (state) => [state.n > 0 && 'nikdy'] },
        C: { end: true, blocks: ['C'] },
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

  it('reports bad locations, two QR choices for one location and blocks that throw', () => {
    const story = define({
      teams: { 1: 'Tým' },
      intro: ['Úvod'],
      locations: { 0: 'Místo 0', 3: 'Místo 3' },
      nodes: {
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
        C: { end: true, blocks: ['C'] },
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
      intro: ['Úvod'],
      order: ['A'],
      nodes: {
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
      intro: ['Úvod'],
      locations: {},
      nodes: {
        A: {
          initialState: { n: 0 },
          blocks: ['A'],
          choices: [
            { label: 'Znovu', goto: 'A', nextState: (state) => ({ n: state.n + 1 }) },
            { label: 'Konec', goto: 'B' },
          ],
        },
        B: { end: true, blocks: ['B'] },
      },
    });
    expect(validateStory(story, { maxStates: 50 })).toEqual([
      'Příběh má víc než 50 kombinací uzlu a stavu, kontrola prošla jen část.',
    ]);
  });
});
