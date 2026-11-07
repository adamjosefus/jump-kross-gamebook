import { describe, expect, it } from 'vitest';

import { encodeQr, isQrId, MAX_QR_ID, parseQr, verifyQr } from '../src/index.ts';

const SECRET = 'test-secret';

describe('qr', () => {
  it('round-trips and is human readable', async () => {
    const text = await encodeQr(SECRET, { kind: 'T', id: 12 });
    expect(text).toMatch(/^T-12-[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(text).not.toContain(':');
    expect(await verifyQr(SECRET, text)).toEqual({ kind: 'T', id: 12 });
    expect(await verifyQr(SECRET, ` ${text.toLowerCase()} `)).toEqual({ kind: 'T', id: 12 });
  });

  it('still reads the old spelling with colons', async () => {
    const text = await encodeQr(SECRET, { kind: 'L', id: 32 });
    expect(await verifyQr(SECRET, text.replaceAll('-', ':'))).toEqual({ kind: 'L', id: 32 });
  });

  it('rejects edited codes and other secrets', async () => {
    const text = await encodeQr(SECRET, { kind: 'L', id: 32 });
    const check = parseQr(text)!.check;
    expect(await verifyQr(SECRET, `L-33-${check}`)).toBeUndefined();
    expect(await verifyQr(SECRET, `T-32-${check}`)).toBeUndefined();
    expect(await verifyQr('other', text)).toBeUndefined();
    expect(await verifyQr(SECRET, 'L-32')).toBeUndefined();
    expect(await verifyQr(SECRET, 'hello')).toBeUndefined();
  });

  it('refuses a check of the old, shorter length', async () => {
    const text = await encodeQr(SECRET, { kind: 'L', id: 32 });
    expect(await verifyQr(SECRET, text.slice(0, -2))).toBeUndefined();
    expect(parseQr(text.slice(0, -2))).toBeUndefined();
  });

  it('carries only ids that fit the format', async () => {
    expect(isQrId(1)).toBe(true);
    expect(isQrId(MAX_QR_ID)).toBe(true);
    expect(isQrId(0)).toBe(false);
    expect(isQrId(1.5)).toBe(false);
    expect(isQrId(MAX_QR_ID + 1)).toBe(false);
    await expect(encodeQr(SECRET, { kind: 'T', id: MAX_QR_ID + 1 })).rejects.toThrow(RangeError);
    const text = await encodeQr(SECRET, { kind: 'T', id: MAX_QR_ID });
    expect(await verifyQr(SECRET, text)).toEqual({ kind: 'T', id: MAX_QR_ID });
  });

  it('gives different checks to different codes', async () => {
    const ids = Array.from({ length: 200 }, (_, index) => index + 1);
    const codes = await Promise.all(ids.map((id) => encodeQr(SECRET, { kind: 'L', id })));
    const checks = new Set(codes.map((code) => parseQr(code)!.check));
    expect(checks.size).toBeGreaterThan(195);
  });
});
