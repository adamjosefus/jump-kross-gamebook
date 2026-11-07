const encoder = new TextEncoder();

const sign = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const ADMIN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Compares two secrets in a time that does not depend on where they differ, so the admin password
 * or a signature cannot be guessed character by character from the response times.
 */
export const secretsEqual = (expected: string, given: string): boolean => {
  const first = encoder.encode(expected);
  const second = encoder.encode(given);
  // Every byte of both is visited whatever the lengths, which only the result reveals.
  const length = Math.max(first.length, second.length);
  let difference = first.length ^ second.length;
  for (let index = 0; index < length; index += 1)
    difference |= (first[index] ?? 0) ^ (second[index] ?? 0);
  return difference === 0;
};

/** Stateless admin session: `<expiry>.<hmac>`. */
export const createAdminToken = async (secret: string, now = Date.now()): Promise<string> => {
  const expires = String(now + ADMIN_TTL_MS);
  return `${expires}.${await sign(secret, `admin:${expires}`)}`;
};

export const verifyAdminToken = async (
  secret: string,
  token: string,
  now = Date.now(),
): Promise<boolean> => {
  const [expires, signature, ...rest] = token.split('.');
  if (expires === undefined || signature === undefined || rest.length > 0) return false;
  if (!/^\d+$/.test(expires) || Number(expires) < now) return false;
  return secretsEqual(await sign(secret, `admin:${expires}`), signature);
};

export const ADMIN_MAX_AGE = `${ADMIN_TTL_MS / 1000} seconds` as const;
