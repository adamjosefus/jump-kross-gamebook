import { describe, expect, it } from 'vitest';

import { deviceLabel } from '@/features/admin/device-label';

describe('deviceLabel', () => {
  it('names common phones and browsers', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone · Safari');
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone · Chrome');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
      ),
    ).toBe('Android · Samsung Internet');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
      ),
    ).toBe('Windows · Edge');
  });

  it('keeps what it recognises and says when it recognises nothing', () => {
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/132.0')).toBe(
      'Linux · Firefox',
    );
    expect(deviceLabel('curl/8.0')).toBe('Neznámé zařízení');
    expect(deviceLabel(undefined)).toBe('Neznámé zařízení');
  });
});
