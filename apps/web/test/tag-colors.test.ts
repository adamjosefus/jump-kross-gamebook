import { describe, expect, it } from 'vitest';

import { TAG_COLORS, tagColor } from '@/features/editor/tag-colors';

describe('tagColor', () => {
  const order = Array.from({ length: TAG_COLORS.length }, (_, index) => {
    return TAG_COLORS.indexOf(tagColor(index));
  });

  it('takes every color once in a round, then starts over', () => {
    expect(new Set(order).size).toBe(TAG_COLORS.length);
    expect(tagColor(TAG_COLORS.length)).toBe(tagColor(0));
  });

  it('never gives two neighbouring nodes colors close in the palette', () => {
    for (const [index, color] of order.entries()) {
      const next = order[(index + 1) % order.length]!;
      const apart = Math.abs(next - color);
      // Round the palette, the shorter way between the two colors.
      expect(Math.min(apart, TAG_COLORS.length - apart)).toBeGreaterThanOrEqual(3);
    }
  });
});
