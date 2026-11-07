import { describe, expect, it } from 'vitest';

import { fileName } from '@/features/admin/download';

describe('fileName', () => {
  it('is readable, without diacritics and unique per code', () => {
    expect(fileName({ kind: 'T', id: 12, label: 'Vlčí smečka', code: 'T-12-K7QM3F' }, 'svg')).toBe(
      'qr-tym-vlci-smecka-T-12.svg',
    );
    expect(
      fileName({ kind: 'L', id: 3, label: 'Studna na nádvoří', code: 'L-3-AAAAAA' }, 'png', 'a4'),
    ).toBe('qr-kod-studna-na-nadvori-L-3-a4.png');
  });

  it('survives a label of only punctuation', () => {
    expect(fileName({ kind: 'L', id: 7, label: '???', code: 'L-7-AAAAAA' }, 'svg')).toBe(
      'qr-kod-L-7.svg',
    );
  });
});
