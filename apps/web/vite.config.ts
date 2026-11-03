import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';

type ApiServer = Pick<
  typeof import('@gamebook/api/server'),
  'toNodeHandler' | 'handlerFromEnv' | 'emptyMemoryData'
>;
interface LoadedApi {
  readonly handle: ReturnType<ApiServer['toNodeHandler']>;
  readonly dispose: () => Promise<void>;
}

/**
 * Serves `/api/*` in development with the same Web handler the Vercel function uses. A change in
 * the packages (the story, say) builds the handler again from the new code and reloads the open
 * pages. Without `DATABASE_URL` the data lives in memory, kept here so that it survives that;
 * it is gone only when the dev server restarts.
 */
const apiDevServer = (): Plugin => {
  // Lazily loaded once and dropped again on failure or a code change so the next request loads it
  // anew; a cache like this has to be reassigned.
  let api: Promise<LoadedApi> | undefined;
  let memory: ReturnType<ApiServer['emptyMemoryData']> | undefined;
  const load = async (server: ViteDevServer): Promise<LoadedApi> => {
    const env = {
      ...process.env,
      ...loadEnv(server.config.mode, path.resolve(import.meta.dirname, '../..'), ''),
    };
    // ssrLoadModule is untyped; the annotation pins the exports this plugin relies on.
    const loaded = await server.ssrLoadModule('@gamebook/api/server');
    const { toNodeHandler, handlerFromEnv, emptyMemoryData }: ApiServer = {
      toNodeHandler: loaded['toNodeHandler'],
      handlerFromEnv: loaded['handlerFromEnv'],
      emptyMemoryData: loaded['emptyMemoryData'],
    };
    memory ??= emptyMemoryData();
    const { handler, dispose } = handlerFromEnv(env, memory);
    return { handle: toNodeHandler(handler), dispose };
  };

  return {
    name: 'gamebook-api',
    configureServer(server) {
      const packages = path.resolve(import.meta.dirname, '../../packages');
      server.watcher.add(packages);
      server.watcher.on('change', (file) => {
        if (!file.startsWith(`${packages}${path.sep}`) || api === undefined) return;
        // The old one lets go of its database connections.
        void api.then((old) => old.dispose()).catch(() => undefined);
        api = undefined;
        server.environments.ssr.moduleGraph.invalidateAll();
        server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        api ??= load(server);
        api
          .then(({ handle }) => handle(req, res))
          .catch((error: unknown) => {
            // The client left, as a page does when it reloads: nobody waits for an answer, and
            // the error overlay would only cover the reloaded page.
            if (req.socket.destroyed) return;
            api = undefined;
            next(error);
          });
      });
    },
  };
};

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevServer()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: { host: true },
  build: {
    target: ['safari16.4', 'chrome111'],
  },
});
