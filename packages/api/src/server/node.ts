import type { IncomingMessage, ServerResponse } from 'node:http';

type WebHandler = (request: Request) => Promise<Response>;

/** The request headers as `[name, value]` pairs, one per value of a repeated header. */
const headerPairs = (req: IncomingMessage): [string, string][] =>
  Object.entries(req.headers).flatMap(([key, value]): [string, string][] =>
    typeof value === 'string'
      ? [[key, value]]
      : Array.isArray(value)
        ? value.map((item): [string, string] => [key, item])
        : [],
  );

/** The scheme the proxy reports, only ever `http` or `https`; the header is the client's otherwise. */
const protocolOf = (req: IncomingMessage) => {
  const forwarded = req.headers['x-forwarded-proto'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first === 'https' ? 'https' : 'http';
};

const toRequest = async (req: IncomingMessage): Promise<Request> => {
  // The body arrives as an async stream, so its chunks are collected in a loop.
  const chunks: Buffer[] = [];
  for await (const chunk of req)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const body = chunks.length === 0 ? undefined : Buffer.concat(chunks);
  return new Request(`${protocolOf(req)}://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers: new Headers(headerPairs(req)),
    ...(body === undefined ? {} : { body }),
  });
};

// Node's response is written in place; that is its API.
const send = async (response: Response, res: ServerResponse) => {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
};

/** Adapts a Web `Request => Response` handler to Node's `(req, res)`, used by Vite dev and Vercel. */
export const toNodeHandler =
  (handler: WebHandler) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // A request that cannot be built (a host header that is no host) is the client's mistake.
    const request = await toRequest(req).catch(() => undefined);
    if (request === undefined) {
      await send(new Response('Bad Request', { status: 400 }), res);
      return;
    }
    await send(await handler(request), res);
  };
