import type { ReadingRow } from './store.ts';

interface Coverage {
  readonly total: number;
  /** End of the latest interval counted so far; the next one counts only past it. */
  readonly coveredTo: number;
}

/** Total ms of the intervals, sorted by start, with overlaps counted once. */
const coveredMs = (intervals: readonly ReadingRow[]): number =>
  intervals.reduce<Coverage>(
    ({ total, coveredTo }, { startedAt, endedAt }) => {
      const from = Math.max(startedAt.getTime(), coveredTo);
      const to = endedAt.getTime();
      return to <= from ? { total, coveredTo } : { total: total + to - from, coveredTo: to };
    },
    { total: 0, coveredTo: 0 },
  ).total;

/**
 * Reading time per team in ms. Phones of one team often show a text at the same moment, and
 * that is one team reading, so overlapping intervals count once.
 */
export const readingTotals = (rows: readonly ReadingRow[]): ReadonlyMap<number, number> => {
  const sorted = rows.toSorted(
    (first, second) => first.startedAt.getTime() - second.startedAt.getTime(),
  );
  const teamIds = new Set(sorted.map((row) => row.teamId));
  return new Map(
    [...teamIds].map((teamId) => [
      teamId,
      coveredMs(sorted.filter((row) => row.teamId === teamId)),
    ]),
  );
};
