import { describe, expect, it } from 'vitest';

import { escapeAttribute, qrCodeSvg, qrRuns, QUIET_ZONE } from '@/components/qr/qr-svg';

describe('qr svg', () => {
  it('draws one svg element with the code in its title', () => {
    const svg = qrCodeSvg('L-32-9FZM7K');
    expect(svg).toMatch(/^<svg[\s>][\s\S]*<\/svg>$/);
    expect(svg).toContain('<title>L-32-9FZM7K</title>');
  });

  it('keeps the quiet zone white, with and without noise around it', () => {
    const plain = qrRuns('L-32-9FZM7K');
    expect(plain.code).toEqual({ at: 0, size: plain.size, quietZone: QUIET_ZONE });
    const noisy = qrRuns('L-32-9FZM7K', { noise: { shape: 'square', width: 3 } });
    expect(noisy.code).toEqual({ at: 3, size: plain.size, quietZone: QUIET_ZONE });
    expect(noisy.size).toBe(plain.size + 6);
    // No dark module in the quiet zone: the first and last rows and columns of the code are white.
    const edge = (position: number) =>
      position - noisy.code.at < QUIET_ZONE ||
      position - noisy.code.at >= noisy.code.size - QUIET_ZONE;
    const inCode = (position: number) =>
      position >= noisy.code.at && position < noisy.code.at + noisy.code.size;
    const inQuietZone = noisy.runs.filter(
      (run) =>
        inCode(run.row) &&
        [...Array(run.length).keys()].some((offset) => {
          const column = run.column + offset;
          return inCode(column) && (edge(run.row) || edge(column));
        }),
    );
    expect(inQuietZone).toEqual([]);
  });

  it('escapes attribute values', () => {
    expect(escapeAttribute('a "b" <c> & d')).toBe('a &quot;b&quot; &lt;c> &amp; d');
  });
});
