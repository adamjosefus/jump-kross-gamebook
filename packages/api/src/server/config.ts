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
} as const;

type SecretName = keyof typeof DEV_FALLBACKS;

const SECRET_NAMES: readonly SecretName[] = ['ADMIN_PASSWORD', 'QR_SECRET', 'SESSION_SECRET'];

/**
 * Variables a deployment cannot run without. Besides the secrets that is the database: without it
 * the API would keep the game in the memory of one function instance, where it is lost with every
 * cold start and differs between instances, without anyone noticing.
 */
const REQUIRED_NAMES: readonly (SecretName | 'DATABASE_URL')[] = [...SECRET_NAMES, 'DATABASE_URL'];

const isDeployed = (env: Readonly<Record<string, string | undefined>>) =>
  env['VERCEL'] !== undefined || env['NODE_ENV'] === 'production';

const isUnset = (env: Readonly<Record<string, string | undefined>>, name: string) =>
  env[name] === undefined || env[name] === '';

/**
 * Variables a deployment (production or preview) has not set: the secrets and the database. Always
 * empty in local development, which falls back to known values and to the memory store.
 */
export const missingSecrets = (
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] =>
  isDeployed(env) ? REQUIRED_NAMES.filter((name) => isUnset(env, name)) : [];

/** Reads the environment; throws when a deployment lacks a secret (see `missingSecrets`). */
export const configFromEnv = (
  env: Readonly<Record<string, string | undefined>>,
): ServerConfigShape => {
  const missing = missingSecrets(env);
  if (missing.length > 0) throw new Error(`Missing environment variables ${missing.join(', ')}`);
  const read = (name: SecretName) => (isUnset(env, name) ? DEV_FALLBACKS[name] : env[name]!);
  return {
    adminPassword: read('ADMIN_PASSWORD'),
    qrSecret: read('QR_SECRET'),
    sessionSecret: read('SESSION_SECRET'),
    insecureCookies: !isDeployed(env),
  };
};

export const missingMessage = (missing: readonly string[]) =>
  `Missing environment variables ${missing.join(', ')}. Set them in the Vercel project settings and redeploy.`;

/** Whether the connection string is one the driver takes, checked without echoing it anywhere. */
export const isDatabaseUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') &&
      parsed.hostname !== ''
    );
  } catch {
    return false;
  }
};

/**
 * Stands in for the API while a deployment is misconfigured: every request gets a 503 with the
 * message, instead of the function crashing on start with an anonymous 500. The message is
 * technical, for the console, and never contains a secret; the app shows players its own.
 */
export const misconfiguredHandler = (message: string) => {
  console.error(`${message} Until then the API answers every request with 503.`);
  return {
    handler: async (_request: Request): Promise<Response> =>
      Response.json({ _tag: 'ServerMisconfigured', message }, { status: 503 }),
    dispose: async (): Promise<void> => undefined,
  };
};
