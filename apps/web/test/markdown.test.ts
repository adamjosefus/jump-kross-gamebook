import { describe, expect, it } from 'vitest';

import { paragraphsOf } from '@/features/player/story-text/markdown';

describe('paragraphsOf', () => {
  it('splits headings, paragraphs and marks into runs', () => {
    expect(paragraphsOf('# Hra\n\nText s **tučným** a *kurzívou* a `kódem`.')).toEqual([
      { kind: 'h1', depth: 0, runs: [{ text: 'Hra', marks: [] }] },
      {
        kind: 'p',
        depth: 0,
        runs: [
          { text: 'Text s ', marks: [] },
          { text: 'tučným', marks: ['strong'] },
          { text: ' a ', marks: [] },
          { text: 'kurzívou', marks: ['em'] },
          { text: ' a ', marks: [] },
          { text: 'kódem', marks: ['code'] },
          { text: '.', marks: [] },
        ],
      },
    ]);
  });

  it('continues a paragraph after a hard line break', () => {
    const [first, second] = paragraphsOf('Řádek jeden  \nřádek dva');
    expect(first).toMatchObject({ kind: 'p', runs: [{ text: 'Řádek jeden', marks: [] }] });
    expect(second).toMatchObject({ continued: true, runs: [{ text: 'řádek dva', marks: [] }] });
  });

  it('marks list items with their bullets and depth', () => {
    const items = paragraphsOf('- první\n- druhý\n  1. vnořený');
    expect(items.map(({ marker, depth, runs }) => [marker, depth, runs[0]?.text])).toEqual([
      ['•', 1, 'první'],
      ['•', 1, 'druhý'],
      ['1.', 2, 'vnořený'],
    ]);
  });
});
