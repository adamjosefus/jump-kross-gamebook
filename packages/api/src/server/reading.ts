import type { ReadingRow } from './store.ts';

/**
 * Reading time per team in ms. Phones of one team often show a text at the same moment, and
 * that is one team reading, so overlapping intervals count once.
 */
export const readingTotals = (rows: readonly ReadingRow[]) => {
  const totals = new Map<number, number>();
  const covered = new Map<number, number>();
  const sorted = rows.toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  for (const { teamId, startedAt, endedAt } of sorted) {
    const from = Math.max(startedAt.getTime(), covered.get(teamId) ?? 0);
    const to = endedAt.getTime();
    if (to <= from) continue;
    totals.set(teamId, (totals.get(teamId) ?? 0) + to - from);
    covered.set(teamId, to);
  }
  return totals;
};
