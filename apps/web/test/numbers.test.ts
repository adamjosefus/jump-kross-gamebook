import { describe, expect, it } from 'vitest';

import { differenceText } from '@/features/editor/numbers';

describe('differenceText', () => {
  it('writes whole characters below a thousand, with a sign', () => {
    expect(differenceText(35)).toBe('+35');
    expect(differenceText(-35.4)).toBe('−35');
    expect(differenceText(999.4)).toBe('+999');
  });

  it('writes thousands with one decimal and a no-break space before „k“', () => {
    expect(differenceText(-1234)).toBe('−1,2 k');
    expect(differenceText(999.6)).toBe('+1,0 k');
    expect(differenceText(12_345)).toBe('+12,3 k');
  });

  it('writes „±0“ for no difference', () => {
    expect(differenceText(0)).toBe('±0');
    expect(differenceText(-0.4)).toBe('±0');
  });
});
