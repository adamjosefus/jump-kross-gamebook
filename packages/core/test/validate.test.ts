import { describe, expect, it } from 'vitest';

import { checkpoint, defineStory, validateStory, type Story } from '../src/index.ts';
import { SAMPLE } from './fixtures.ts';

const define = defineStory<{ n: number }>();

describe('validateStory', () => {
  it('accepts a sound story', () => {
    expect(validateStory(SAMPLE)).toEqual([]);
  });

  it('requires a start', () => {
    expect(validateStory(define({ A: { end: true, blocks: ['A'] } }))).toEqual([
      'Příběh nemá žádný start (uzel s initialState).',
    ]);
  });

  it('reports unreachable nodes and choices nobody can take', () => {
    const story = define({
      A: {
        initialState: { n: 1 },
        blocks: ['A'],
        choices: [
          { label: 'Dál', goto: 'B' },
          { label: 'Nikdy', goto: 'C', when: (s) => s.n > 5 },
        ],
      },
      B: { end: true, blocks: ['B'] },
      C: { end: true, blocks: ['C'] },
      D: { end: true, blocks: ['D'] },
    });
    expect(validateStory(story)).toEqual([
      'Volba „Nikdy“ v uzlu A není dostupná v žádném dosažitelném stavu.',
      'Uzel C je nedosažitelný z žádného startu.',
      'Uzel D je nedosažitelný z žádného startu.',
    ]);
  });

  it('follows the state, so a choice used on one path is not unused', () => {
    const story = define({
      A: {
        initialState: { n: 0 },
        blocks: ['A'],
        choices: [
          { label: 'Plus', goto: 'B', nextState: (s) => ({ n: s.n + 1 }) },
          { label: 'Rovně', goto: 'B' },
        ],
      },
      B: {
        blocks: (s) => [`n = ${s.n}`],
        choices: [
          { label: 'Odměna', goto: 'C', when: (s) => s.n > 0 },
          { label: 'Konec', goto: 'C' },
        ],
      },
      C: { end: true, blocks: ['C'] },
    });
    expect(validateStory(story)).toEqual([]);
  });

  it('reports dead ends in a reachable state', () => {
    const story = define({
      A: {
        initialState: { n: 0 },
        blocks: ['A'],
        choices: [
          { label: 'Jen s jedničkou', goto: 'B', when: (s) => s.n === 1 },
          { label: 'Jindy', goto: 'B', when: (s) => s.n === 2 },
        ],
      },
      B: { end: true, blocks: ['B'] },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A je ve stavu {"n":0} slepá ulička: žádná volba není dostupná.',
      'Volba „Jen s jedničkou“ v uzlu A není dostupná v žádném dosažitelném stavu.',
      'Volba „Jindy“ v uzlu A není dostupná v žádném dosažitelném stavu.',
      'Uzel B je nedosažitelný z žádného startu.',
    ]);
  });

  it('reports empty content, labels and duplicate choices', () => {
    const story = define({
      A: {
        initialState: { n: 0 },
        blocks: ['A', { theme: 'letter', content: '   ' }, checkpoint(1, '')],
        choices: [
          { label: ' ', goto: 'B' },
          { label: 'Dál', goto: 'B' },
          { label: 'Dál', goto: 'C' },
        ],
      },
      B: { end: true, blocks: (s) => [s.n > 0 && 'nikdy'] },
      C: { end: true, blocks: ['C'] },
    });
    expect(validateStory(story)).toEqual([
      'Uzel A má volbu bez popisku.',
      'Uzel A má dvě volby „Dál“.',
      'Uzel A má prázdnou obrazovku č. 2.',
      'Uzel A má prázdnou obrazovku č. 3.',
      'Uzel B nemá ve stavu {"n":0} žádný obsah.',
    ]);
  });

  it('reports checkpoints in endings, bad locations and blocks that throw', () => {
    const story = define({
      A: {
        initialState: { n: 0 },
        blocks: [checkpoint(0, 'Sken')],
        choices: [{ label: 'Dál', goto: 'B' }],
      },
      B: {
        blocks: () => {
          throw new Error('chyba');
        },
        choices: [{ label: 'Dál', goto: 'C' }],
      },
      C: { end: true, blocks: ['C', checkpoint(2, 'Sken na konci')] },
    });
    expect(validateStory(story)).toEqual([
      'Checkpoint v uzlu A má neplatné číslo místa 0.',
      'Obsah uzlu B ve stavu {"n":0} spadl: chyba',
      'Konec C obsahuje checkpoint, přes který by se tým nedostal.',
    ]);
  });

  it('reports a goto to a missing node in an untyped story', () => {
    const story: Story = {
      order: ['A'],
      nodes: {
        A: { initialState: {}, blocks: ['A'], choices: [{ label: 'Pryč', goto: 'X' }] },
      },
    };
    expect(validateStory(story)).toEqual(['Volba „Pryč“ v uzlu A vede na neexistující uzel X.']);
  });

  it('stops exploring endless state spaces', () => {
    const story = define({
      A: {
        initialState: { n: 0 },
        blocks: ['A'],
        choices: [
          { label: 'Znovu', goto: 'A', nextState: (s) => ({ n: s.n + 1 }) },
          { label: 'Konec', goto: 'B' },
        ],
      },
      B: { end: true, blocks: ['B'] },
    });
    expect(validateStory(story, { maxStates: 50 })).toEqual([
      'Příběh má víc než 50 kombinací uzlu a stavu, kontrola prošla jen část.',
    ]);
  });
});
