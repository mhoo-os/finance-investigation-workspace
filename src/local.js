import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestSyntheticEvidence } from './ingest.js';
import { createMemoryEnvironment } from './local-bindings.js';
import worker from './worker.js';

const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

export function createLocalAssets(root = publicRoot) {
  return {
    async fetch(request) {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response('Bad request', { status: 400 });
      }
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      if (!['index.html', 'app.js'].includes(relative)) return new Response('Not found', { status: 404 });
      const file = resolve(root, relative);
      try {
        return new Response(await readFile(file), { headers: { 'content-type': contentTypes[extname(file)] } });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    },
  };
}

export async function createSeededLocalEnvironment({ now = () => new Date(), assets = createLocalAssets() } = {}) {
  const env = createMemoryEnvironment({ assets });
  await ingestSyntheticEvidence(env, { now });
  return env;
}

export async function startLocalWorkspace({ host = '127.0.0.1', port = 8787, now } = {}) {
  const env = await createSeededLocalEnvironment({ now });
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host}`;
      const method = incoming.method;
      const request = new Request(new URL(incoming.url, origin), {
        method,
        headers: incoming.headers,
        body: ['GET', 'HEAD'].includes(method) ? undefined : incoming,
        duplex: ['GET', 'HEAD'].includes(method) ? undefined : 'half',
      });
      const response = await worker.fetch(request, env);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      outgoing.end('Local preview failed');
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, host, accept);
  });
  const address = server.address();
  return {
    env,
    server,
    url: `http://${host}:${address.port}`,
    close: async () => {
      const closed = once(server, 'close');
      server.close();
      await closed;
    },
  };
}
