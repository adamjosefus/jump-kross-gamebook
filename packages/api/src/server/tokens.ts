const encoder = new TextEncoder()

const sign = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

const ADMIN_TTL_MS = 14 * 24 * 60 * 60 * 1000

/** Stateless admin session: `<expiry>.<hmac>`. */
export const createAdminToken = async (secret: string, now = Date.now()): Promise<string> => {
  const expires = String(now + ADMIN_TTL_MS)
  return `${expires}.${await sign(secret, `admin:${expires}`)}`
}

export const verifyAdminToken = async (
  secret: string,
  token: string,
  now = Date.now(),
): Promise<boolean> => {
  const [expires, signature] = token.split('.')
  if (expires === undefined || signature === undefined || Number(expires) < now) return false
  return (await sign(secret, `admin:${expires}`)) === signature
}

export const ADMIN_MAX_AGE = `${ADMIN_TTL_MS / 1000} seconds` as const
