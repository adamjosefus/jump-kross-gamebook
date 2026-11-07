import { createServer, request, type OutgoingHttpHeaders, type Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toNodeHandler } from '../src/server/node.ts';

/** Sends a raw request to the server; unlike `fetch`, it lets the test set any header. */
const send = (
  server: Server,
  method: string,
  path: string,
  headers: OutgoingHttpHeaders,
  body?: string,
) =>
  new Promise<{
    readonly status: number;
    readonly headers: Readonly<Record<string, string | string[] | undefined>>;
    readonly body: string;
  }>((resolve, reject) => {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Server not listening.');
    const req = request({ host: '127.0.0.1', port: address.port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        }),
      );
    });
    req.on('error', reject);
    req.end(body);
  });

const listening = (server: Server) =>
  new Promise<Server>((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));

describe('toNodeHandler', () => {
  const seen: Request[] = [];
  const server = createServer(
    toNodeHandler(async (incoming) => {
      seen.push(incoming);
      return new Response(JSON.stringify({ body: await incoming.text() }), {
        status: 201,
        headers: [
          ['content-type', 'application/json'],
          ['set-cookie', 'a=1; Path=/'],
          ['set-cookie', 'b=2; Path=/'],
        ],
      });
    }),
  );
  beforeAll(() => listening(server));
  afterAll(() => server.close());

  it('passes the method, the url, the headers and the body through and writes the response', async () => {
    const response = await send(
      server,
      'POST',
      '/api/x?y=1',
      { host: 'example.test', 'x-forwarded-proto': 'https', accept: ['a/b', 'c/d'] },
      '{"k":1}',
    );
    expect(response.status).toBe(201);
    expect(response.body).toBe('{"body":"{\\"k\\":1}"}');
    expect(response.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    const incoming = seen.at(-1)!;
    expect(incoming.url).toBe('https://example.test/api/x?y=1');
    expect(incoming.headers.get('accept')).toBe('a/b, c/d');
  });

  it('takes only http or https from the forwarded protocol', async () => {
    const urls: string[] = [];
    for (const proto of ['javascript', 'https, http', ['http', 'https'], undefined]) {
      await send(server, 'GET', '/', {
        host: 'h',
        ...(proto === undefined ? {} : { 'x-forwarded-proto': proto }),
      });
      urls.push(seen.at(-1)!.url);
    }
    expect(urls).toEqual(['http://h/', 'https://h/', 'http://h/', 'http://h/']);
  });

  it('answers 400 to a request that cannot be built', async () => {
    const response = await send(server, 'GET', '/', { host: 'not a host' });
    expect(response.status).toBe(400);
    expect(response.body).toBe('Bad Request');
  });
});
