import type { IncomingMessage, ServerResponse } from 'node:http'

type WebHandler = (request: Request) => Promise<Response>

const toRequest = async (req: IncomingMessage): Promise<Request> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) for (const item of value) headers.append(key, item)
  }
  const body = chunks.length === 0 ? undefined : Buffer.concat(chunks)
  const protocol = req.headers['x-forwarded-proto'] ?? 'http'
  return new Request(`${String(protocol)}://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  })
}

const send = async (response: Response, res: ServerResponse) => {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.setHeader(key, value)
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)
  res.end(Buffer.from(await response.arrayBuffer()))
}

/** Adapts a Web `Request => Response` handler to Node's `(req, res)`, used by Vite dev and Vercel. */
export const toNodeHandler =
  (handler: WebHandler) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    await send(await handler(await toRequest(req)), res)
  }
