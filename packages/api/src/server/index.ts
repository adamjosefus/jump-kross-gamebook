import type { Story } from '@gamebook/core';
import { story as defaultStory } from '@gamebook/story';
import { Cause, Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '../api.ts';
import {
  configFromEnv,
  isDatabaseUrl,
  misconfiguredHandler,
  missingMessage,
  missingSecrets,
  ServerConfig,
  type ServerConfigShape,
} from './config.ts';
import { CurrentStory } from './game.ts';
import { HandlersLayer } from './handlers.ts';
import { MemoryStoreLayer, type MemoryData } from './store-memory.ts';
import { PostgresStoreLayer } from './store-postgres.ts';
import type { Store } from './store.ts';

export { configFromEnv, type ServerConfigShape } from './config.ts';
export { emptyMemoryData, MemoryStoreLayer, type MemoryData } from './store-memory.ts';
export { PostgresStoreLayer } from './store-postgres.ts';
export { toNodeHandler } from './node.ts';

/** Builds the whole API as a Web standard `Request => Response` handler. */
export const makeHandler = (
  config: ServerConfigShape,
  store: Layer.Layer<Store>,
  story: Story = defaultStory,
) =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(Api).pipe(
      Layer.provide(HandlersLayer),
      Layer.provide(store),
      Layer.provide(Layer.succeed(ServerConfig, config)),
      Layer.provide(Layer.succeed(CurrentStory, story)),
      Layer.provide(HttpServer.layerServices),
    ),
    {
      disableLogger: true,
      // Declared errors become their responses inside the API; what arrives here is a defect (a
      // failed database call, a bug) that turns into an anonymous 500. It goes to the function log.
      middleware: (effect) =>
        Effect.tapCause(effect, (cause) =>
          Effect.sync(() => console.error(`API request failed\n${Cause.pretty(cause)}`)),
        ),
    },
  );

/**
 * Handler configured from environment variables; without `DATABASE_URL` it keeps data in memory,
 * in `memory` when given, so the data can outlive this handler. A deployment without its secrets
 * gets a stand-in that answers every request with what to set.
 */
export const handlerFromEnv = (
  env: Readonly<Record<string, string | undefined>>,
  memory?: MemoryData,
) => {
  const missing = missingSecrets(env);
  if (missing.length > 0) return misconfiguredHandler(missingMessage(missing));
  const url = env['DATABASE_URL'];
  if (url === undefined || url === '')
    return makeHandler(configFromEnv(env), MemoryStoreLayer(memory));
  // The driver would report a malformed URL with the password in it; this message names only the variable.
  if (!isDatabaseUrl(url)) {
    return misconfiguredHandler(
      'DATABASE_URL is not a postgres:// URL (a password with special characters has to be percent-encoded). Fix it in the Vercel project settings and redeploy.',
    );
  }
  return makeHandler(configFromEnv(env), PostgresStoreLayer(url));
};
