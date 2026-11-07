import { describe, expect, it } from 'vitest';

import { formatDateTime, formatTime, timeAgo } from '@/features/admin/format';

describe('timeAgo', () => {
  const now = new Date('2026-11-07T10:00:00');
  const at = (iso: string) => new Date(iso).toISOString();

  it('counts seconds and minutes while they are short', () => {
    expect(timeAgo(at('2026-11-07T09:59:40'), now)).toBe('před 20 s');
    expect(timeAgo(at('2026-11-07T09:35:00'), now)).toBe('před 25 min');
  });

  it('shows the time alone only for today', () => {
    const today = at('2026-11-07T07:30:00');
    expect(timeAgo(today, now)).toBe(formatTime(today));
    // Yesterday's afternoon would read as today's without the date.
    const yesterday = at('2026-11-06T14:30:00');
    expect(timeAgo(yesterday, now)).toBe(formatDateTime(yesterday));
    expect(timeAgo(yesterday, now)).not.toBe(formatTime(yesterday));
  });

  it('never counts into the future', () => {
    expect(timeAgo(at('2026-11-07T10:00:05'), now)).toBe('před 0 s');
  });
});
