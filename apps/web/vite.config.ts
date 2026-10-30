import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'

type NodeHandler = ReturnType<typeof import('@gamebook/api/server').toNodeHandler>

/**
 * Serves `/api/*` in development with the same Web handler the Vercel function uses. Without
 * `DATABASE_URL` the data lives in memory and the draft starts from `examples/demo.gamebook`.
 */
const apiDevServer = (): Plugin => {
  let handler: Promise<NodeHandler> | undefined
  const load = async (server: ViteDevServer): Promise<NodeHandler> => {
    const env = { ...process.env, ...loadEnv(server.config.mode, path.resolve(import.meta.dirname, '../..'), '') }
    const demo = readFileSync(path.resolve(import.meta.dirname, '../../examples/demo.gamebook'), 'utf8')
    const module = (await server.ssrLoadModule('@gamebook/api/server')) as typeof import('@gamebook/api/server')
    return module.toNodeHandler(module.handlerFromEnv(env, demo).handler)
  }

  return {
    name: 'gamebook-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        handler ??= load(server)
        handler
          .then((handle) => handle(req, res))
          .catch((error: unknown) => {
            handler = undefined
            next(error)
          })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevServer()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: { host: true },
  build: {
    target: ['safari16.4', 'chrome111'],
  },
})
