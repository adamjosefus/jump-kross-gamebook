import type { Story } from '@gamebook/core';
import { story as defaultStory } from '@gamebook/story';
import { Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '../api.ts';
import { configFromEnv, ServerConfig, type ServerConfigShape } from './config.ts';
import { CurrentStory } from './game.ts';
import { HandlersLayer } from './handlers.ts';
import { MemoryStoreLayer } from './store-memory.ts';
import { PostgresStoreLayer } from './store-postgres.ts';
import type { Store } from './store.ts';

export { configFromEnv, type ServerConfigShape } from './config.ts';
export { MemoryStoreLayer } from './store-memory.ts';
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
    { disableLogger: true },
  );

/** Handler configured from environment variables; without `DATABASE_URL` it keeps data in memory. */
export const handlerFromEnv = (env: Record<string, string | undefined>) => {
  const url = env['DATABASE_URL'];
  const store = url === undefined || url === '' ? MemoryStoreLayer() : PostgresStoreLayer(url);
  return makeHandler(configFromEnv(env), store);
};
