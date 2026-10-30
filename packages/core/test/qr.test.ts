import { describe, expect, it } from 'vitest'
import { encodeQr, parseQr, verifyQr } from '../src/index.ts'

const SECRET = 'test-secret'

describe('qr', () => {
  it('round-trips and is human readable', async () => {
    const text = await encodeQr(SECRET, { kind: 'T', id: 12 })
    expect(text).toMatch(/^T:12:[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(await verifyQr(SECRET, text)).toEqual({ kind: 'T', id: 12 })
    expect(await verifyQr(SECRET, ` ${text.toLowerCase()} `)).toEqual({ kind: 'T', id: 12 })
  })

  it('rejects edited codes and other secrets', async () => {
    const text = await encodeQr(SECRET, { kind: 'L', id: 32 })
    const check = parseQr(text)!.check
    expect(await verifyQr(SECRET, `L:33:${check}`)).toBeUndefined()
    expect(await verifyQr(SECRET, `T:32:${check}`)).toBeUndefined()
    expect(await verifyQr('other', text)).toBeUndefined()
    expect(await verifyQr(SECRET, 'L:32')).toBeUndefined()
    expect(await verifyQr(SECRET, 'hello')).toBeUndefined()
  })

  it('gives different checks to different codes', async () => {
    const checks = new Set<string>()
    for (let id = 1; id <= 200; id++) checks.add(parseQr(await encodeQr(SECRET, { kind: 'L', id }))!.check)
    expect(checks.size).toBeGreaterThan(195)
  })
})
