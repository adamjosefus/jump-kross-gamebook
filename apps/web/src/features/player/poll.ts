/** How far a poll may land from its nominal interval, as a share of it, either way. */
const JITTER = 0.2;

/** Maps a number to a well-spread fraction in [0, 1). */
const spread = (seed: number): number => {
  let hash = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 2 ** 32;
};

/**
 * Spreads the polls of all phones over time, so they do not hit the server in lockstep, above all
 * when they all retry after the same outage. The seed is the time of the query's last answer or
 * error: the delay stays the same across re-renders, which would otherwise restart the timer with
 * a new delay each time, and changes with every request, which differs from phone to phone.
 */
export const jittered = (ms: number, seed: number): number =>
  Math.round(ms * (1 + JITTER * (2 * spread(seed) - 1)));

/** The seed of a query's next poll: when it last got an answer or failed. */
export const pollSeed = (state: {
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
}): number => Math.max(state.dataUpdatedAt, state.errorUpdatedAt);
