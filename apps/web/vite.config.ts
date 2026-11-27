import { execSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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
/** Where the story editor keeps its draft; it is not part of the game, only of the repository. */
const DRAFT_DIR = path.resolve(import.meta.dirname, '../../packages/story/draft');
const DRAFT_FILE = path.join(DRAFT_DIR, 'story-draft.json');

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
    // The kept data goes on; a collection the new code added since starts empty.
    memory = { ...emptyMemoryData(), ...memory };
    const { handler, dispose } = handlerFromEnv(env, memory);
    return { handle: toNodeHandler(handler), dispose };
  };

  return {
    name: 'gamebook-api',
    configureServer(server) {
      const packages = path.resolve(import.meta.dirname, '../../packages');
      server.watcher.add(packages);
      server.watcher.on('change', (file) => {
        // The editor saving its draft changes nothing the game runs, so no page reloads for it.
        if (
          !file.startsWith(`${packages}${path.sep}`) ||
          file.startsWith(`${DRAFT_DIR}${path.sep}`) ||
          api === undefined
        ) {
          return;
        }

        // The old one lets go of its database connections.
        void api.then((old) => old.dispose()).catch(() => undefined);
        api = undefined;
        server.environments.ssr.moduleGraph.invalidateAll();
        server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        api ??= load(server);
        api
          .then(({ handle }) => handle(req, res))
          .catch((error: unknown) => {
            // The client left, as a page does when it reloads: nobody waits for an answer, and
            // the error overlay would only cover the reloaded page.
            if (req.socket.destroyed) {
              return;
            }

            api = undefined;
            next(error);
          });
      });
    },
  };
};

/** The whole body of a request, as text. */
const bodyOf = async (request: AsyncIterable<Uint8Array>) => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
};

/**
 * Reads and writes the story editor's draft, `GET` and `PUT /__editor/draft`, only in development:
 * the deployed admin has no editor. The file is written whole and swapped in, so a save cut short
 * never leaves half of it; the editor checks what it reads back.
 */
const storyDraftFile = (): Plugin => ({
  name: 'gamebook-story-draft',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__editor/draft', (req, res, next) => {
      const answer = async () => {
        if (req.method === 'GET') {
          try {
            res.setHeader('Content-Type', 'application/json');
            res.end(await readFile(DRAFT_FILE, 'utf8'));
          } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
              throw error;
            }

            res.statusCode = 404;
            res.end();
          }

          return;
        }

        if (req.method === 'PUT') {
          const draft: unknown = JSON.parse(await bodyOf(req));
          await mkdir(DRAFT_DIR, { recursive: true });
          const temporary = `${DRAFT_FILE}.tmp`;
          await writeFile(temporary, `${JSON.stringify(draft, null, 2)}\n`);
          await rename(temporary, DRAFT_FILE);
          res.statusCode = 204;
          res.end();
          return;
        }

        res.statusCode = 405;
        res.end();
      };

      answer().catch(next);
    });
  },
});

/** The commit being built: Vercel names it, locally git does. */
const commitHash = () => {
  const vercel = process.env['VERCEL_GIT_COMMIT_SHA'];
  if (vercel !== undefined && vercel !== '') {
    return vercel.slice(0, 7);
  }

  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

/** When and from what the app was built, as `yy-mm-hh-mm-hash` in Prague time. */
const appVersion = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Prague',
      year: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['hour']}-${parts['minute']}-${commitHash()}`;
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [react(), tailwindcss(), apiDevServer(), storyDraftFile()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: { host: true },
  build: {
    target: ['safari16.4', 'chrome111'],
    // The story graph in the admin is about 1.7 MB minified, nearly all of it the ELK layout engine.
    // It loads only when an organizer opens the graph, so it is allowed; anything bigger still warns.
    chunkSizeWarningLimit: 2000,
  },
});
