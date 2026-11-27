/** No-break space, so a number and its unit stay on one line. */
const NBSP = ' ';

/** Real minus sign, as Czech typography has it, not a hyphen. */
const MINUS = '−';

/**
 * A difference in characters with its sign: whole characters below a thousand, else thousands
 * with one decimal, e.g. „+35“, „−1,2 k“, and „±0“ for none.
 */
export const differenceText = (difference: number): string => {
  const rounded = Math.round(difference);
  if (rounded === 0) {
    return '±0';
  }

  const sign = rounded > 0 ? '+' : MINUS;
  const size = Math.abs(rounded);
  if (size < 1000) {
    return `${sign}${size}`;
  }

  const thousands = (size / 1000).toLocaleString('cs-CZ', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${sign}${thousands}${NBSP}k`;
};
