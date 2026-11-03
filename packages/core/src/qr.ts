/**
 * QR code content: `KIND-ID-CHECK`, e.g. `T-12-K7QM`. No colons: phone cameras read `L:2:…` as a
 * link with an unknown scheme and refuse it, while plain text they show. The old `KIND:ID:CHECK`
 * spelling is still accepted when reading.
 *
 * - `T` logs a team in, `L` is a location: scanning it takes the QR choice of that place.
 * - `CHECK` is 4 Crockford base32 characters of HMAC-SHA256(`KIND:ID`) keyed by a server secret.
 *   The signed message keeps the colon, so the check is the same in both spellings.
 *   It is readable but cannot be computed by hand, so codes cannot be forged in the field.
 */

export type QrKind = 'T' | 'L';

export interface QrPayload {
  readonly kind: QrKind;
  readonly id: number;
}

/** Crockford base32: no I, L, O, U, so the check survives being read aloud or retyped. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CHECK_LENGTH = 4;
const isQrKind = (value: string | undefined): value is QrKind => value === 'T' || value === 'L';

const FORMAT = /^([TL])[-:]([1-9]\d{0,5})[-:]([0-9A-Z]{4})$/;

const encoder = new TextEncoder();

const hmac = async (secret: string, message: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
};

const checkOf = async (secret: string, { kind, id }: QrPayload): Promise<string> => {
  const digest = await hmac(secret, `${kind}:${id}`);
  // First 20 bits of the digest, 5 bits per character, most significant first.
  const bits = ((digest[0]! << 16) | (digest[1]! << 8) | digest[2]!) >>> 4;
  return Array.from(
    { length: CHECK_LENGTH },
    (_, index) => ALPHABET[(bits >>> (5 * (CHECK_LENGTH - 1 - index))) & 31]!,
  ).join('');
};

export const encodeQr = async (secret: string, payload: QrPayload): Promise<string> =>
  `${payload.kind}-${payload.id}-${await checkOf(secret, payload)}`;

/** Parses the format without verifying the check (e.g. to show what was scanned). */
export const parseQr = (text: string): (QrPayload & { readonly check: string }) | undefined => {
  const match = FORMAT.exec(text.trim().toUpperCase());
  if (!match) return undefined;
  const kind = match[1];
  if (!isQrKind(kind)) return undefined;
  return { kind, id: Number(match[2]), check: match[3]! };
};

/** Returns the payload only when the check matches the secret. */
export const verifyQr = async (secret: string, text: string): Promise<QrPayload | undefined> => {
  const parsed = parseQr(text);
  if (parsed === undefined) return undefined;
  const expected = await checkOf(secret, parsed);
  return expected === parsed.check ? { kind: parsed.kind, id: parsed.id } : undefined;
};
