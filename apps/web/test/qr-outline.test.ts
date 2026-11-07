import { describe, expect, it } from 'vitest';

import { type GridPoint, qrOutlines } from '@/components/qr/qr-outline';
import { qrRuns, type QrRun } from '@/components/qr/qr-svg';

/** Runs of the cells marked `#` in the picture, one string per row. */
const runsOf = (rows: readonly string[]): readonly QrRun[] =>
  rows.flatMap((line, row) =>
    line.split('').flatMap((cell, column) => (cell === '#' ? [{ column, row, length: 1 }] : [])),
  );

/** Signed area by the shoelace formula; positive for clockwise outlines with y down. */
const area = (corners: readonly GridPoint[]) =>
  corners.reduce((sum, [column, row], index) => {
    const [nextColumn, nextRow] = corners[(index + 1) % corners.length]!;
    return sum + column * nextRow - nextColumn * row;
  }, 0) / 2;

describe('qr outlines', () => {
  it('joins modules sharing a side into one shape with corners only where it turns', () => {
    expect(qrOutlines(3, runsOf(['##.', '#..', '...']))).toEqual([
      [
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 2],
        [0, 2],
        [0, 0],
      ],
    ]);
  });

  it('keeps modules touching only at a corner apart', () => {
    const outlines = qrOutlines(2, runsOf(['#.', '.#']));
    expect(outlines).toHaveLength(2);
    expect(outlines.map(area)).toEqual([1, 1]);
  });

  it('draws a hole as an outline of its own running the other way', () => {
    const outlines = qrOutlines(3, runsOf(['###', '#.#', '###']));
    expect(outlines.map(area).toSorted((first, second) => first - second)).toEqual([-1, 9]);
  });

  it('covers exactly the dark modules of a real code', () => {
    const { size, runs } = qrRuns('L-32-9FZM7K', { noise: { shape: 'circle', width: 4 } });
    const dark = runs.reduce((sum, run) => sum + run.length, 0);
    const outlines = qrOutlines(size, runs);
    expect(outlines.reduce((sum, corners) => sum + area(corners), 0)).toBe(dark);
    expect(outlines.length).toBeLessThan(runs.length);
  });
});
