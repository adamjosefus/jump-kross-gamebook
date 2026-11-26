import { describe, expect, it } from 'vitest';

import { pausedMs, runningMs } from '../src/server/team-time.ts';

const at = (seconds: number) => new Date(seconds * 1000);

describe('team time', () => {
  const pauses = [
    { startedAt: at(10), endedAt: at(20) },
    { startedAt: at(50), endedAt: at(70) },
    { startedAt: at(90), endedAt: undefined },
  ];

  it('counts only the part of each pause inside the span', () => {
    expect(pausedMs(0, 100_000, pauses, 100_000)).toBe(10_000 + 20_000 + 10_000);
    expect(pausedMs(15_000, 60_000, pauses, 100_000)).toBe(5_000 + 10_000);
    expect(pausedMs(20_000, 50_000, pauses, 100_000)).toBe(0);
  });

  it('lets a running pause last until now', () => {
    expect(pausedMs(80_000, 200_000, pauses, 95_000)).toBe(5_000);
  });

  it('leaves the pauses out of the running time', () => {
    expect(runningMs(0, 100_000, pauses, 100_000)).toBe(60_000);
    expect(runningMs(95_000, 98_000, pauses, 100_000)).toBe(0);
  });
});
