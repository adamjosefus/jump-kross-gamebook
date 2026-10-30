import { Context } from 'effect';

export interface ServerConfigShape {
  readonly adminPassword: string;
  /** Signs QR codes. Changing it invalidates every printed code. */
  readonly qrSecret: string;
  /** Signs the admin cookie. */
  readonly sessionSecret: string;
  /** Cookies without `Secure`, for plain-http local development. */
  readonly insecureCookies: boolean;
}

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigShape>()(
  'gamebook/ServerConfig',
) {}

const DEV_FALLBACKS = {
  ADMIN_PASSWORD: 'admin',
  QR_SECRET: 'dev-qr-secret',
  SESSION_SECRET: 'dev-session-secret',
};

/**
 * Reads the environment. Any deployment (production or preview) must set every secret; only local
 * development falls back to known values.
 */
export const configFromEnv = (env: Record<string, string | undefined>): ServerConfigShape => {
  const deployed = env['VERCEL'] !== undefined || env['NODE_ENV'] === 'production';
  const read = (name: keyof typeof DEV_FALLBACKS) => {
    const value = env[name];
    if (value !== undefined && value !== '') return value;
    if (deployed) throw new Error(`Missing environment variable ${name}`);
    return DEV_FALLBACKS[name];
  };
  return {
    adminPassword: read('ADMIN_PASSWORD'),
    qrSecret: read('QR_SECRET'),
    sessionSecret: read('SESSION_SECRET'),
    insecureCookies: !deployed,
  };
};
