/**
 * Builds the app in Vercel's Build Output API format, so the deployment does not depend on how
 * Vercel would compile a TypeScript workspace:
 *
 *   .vercel/output/static/          the SPA (apps/web/dist)
 *   .vercel/output/functions/api.func  one bundled Node function serving /api/*
 *   .vercel/output/config.json      routes: /api/* to the function, everything else to the SPA
 *
 * Every response carries X-Robots-Tag, so search engines and AI crawlers skip even files that have
 * no <meta name="robots"> of their own (API responses, images, the manifest).
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.vercel/output');
const fn = path.join(output, 'functions/api.func');

rmSync(output, { recursive: true, force: true });

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: path.join(root, 'packages/api/src/server/vercel.ts'),
    outDir: fn,
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'index.mjs', format: 'es' } },
  },
  ssr: { noExternal: true, target: 'node' },
});

writeFileSync(
  path.join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      // A new game resets every team in one transaction; well within this, and a hung database
      // call does not run up to the platform's limit.
      maxDuration: 30,
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
    },
    null,
    2,
  ),
);

mkdirSync(path.join(output, 'static'), { recursive: true });
cpSync(path.join(root, 'apps/web/dist'), path.join(output, 'static'), { recursive: true });

writeFileSync(
  path.join(output, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '^/(.*)$',
          headers: {
            'X-Robots-Tag':
              'noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai',
          },
          continue: true,
        },
        { src: '^/api/(.*)$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

console.log(`Vercel output written to ${path.relative(root, output)}`);
