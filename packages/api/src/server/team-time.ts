import type { PauseRow } from './store.ts';

/** How much of `from`–`to` (ms since the epoch) the game was closed; a running pause lasts till `now`. */
export const pausedMs = (
  from: number,
  to: number,
  pauses: readonly PauseRow[],
  now: number,
): number =>
  pauses.reduce((sum, pause) => {
    const start = Math.max(pause.startedAt.getTime(), from);
    const end = Math.min(pause.endedAt?.getTime() ?? now, to);
    return end > start ? sum + end - start : sum;
  }, 0);

/** The time the clock ran from `from` to `to`: all of it but the pauses. */
export const runningMs = (
  from: number,
  to: number,
  pauses: readonly PauseRow[],
  now: number,
): number => Math.max(0, to - from - pausedMs(from, to, pauses, now));
