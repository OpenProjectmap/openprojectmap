// `opmap serve --hub` (spec 06 §3-4): the hub site held in memory and served on one port, rebuilt
// on a timer. Nothing is read from disk to answer a request, so there is no path to traverse.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHub } from './hub.js';
import type { HubOptions } from './hub.js';
import { SECURITY_HEADERS, hostAllowed } from './serve.js';

export interface HubServeOptions extends Omit<HubOptions, 'out' | 'log'> {
  host: string;
  /** 0 picks a free port. */
  port: number;
  /** Seconds between rebuilds (and `git fetch` of repo entries). 0 builds once. */
  pullIntervalSec: number;
  log: (message: string) => void;
}

export interface HubServing {
  url: string;
  port: number;
  /** Rebuild now. Resolves when the new site is live (or the old one is kept). */
  refresh: () => Promise<void>;
  close: () => Promise<void>;
}

interface Page {
  body: string;
  csp: string | null;
}

/** The CSP the page itself carries in its meta tag, also sent as a header. */
function cspOf(html: string): string | null {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  if (!m) return null;
  return (m[1] ?? '').replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

const TEXT = { 'Content-Type': 'text/plain; charset=utf-8' } as const;

export async function startHubServe(options: HubServeOptions): Promise<HubServing> {
  const { log } = options;
  let site: Map<string, Page> | null = null;
  let running: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  /** Build into a temporary folder, read it into memory, delete it. Throws if the hub file is bad. */
  const build = async (): Promise<Map<string, Page>> => {
    const tmp = mkdtempSync(join(tmpdir(), 'opmap-hub-'));
    try {
      const result = await buildHub({ ...options, out: tmp, log });
      const next = new Map<string, Page>();
      const put = (url: string, file: string): void => {
        const body = readFileSync(join(tmp, file), 'utf8');
        next.set(url, { body, csp: cspOf(body) });
      };
      put('/', 'index.html');
      for (const card of result.cards)
        if (card.error === null) put(`/${card.slug}/`, join(card.slug, 'index.html'));
      return next;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };

  const refresh = (): Promise<void> => {
    if (running) return running;
    running = build()
      .then((next) => {
        site = next;
        log(`hub ready: ${next.size - 1} project maps`);
      })
      .catch((e: unknown) => {
        if (site === null) throw e;
        log(`could not rebuild the hub, still showing the last good site: ${String(e)}`);
      })
      .finally(() => {
        running = null;
      });
    return running;
  };

  const schedule = (): void => {
    if (closed || options.pullIntervalSec <= 0) return;
    timer = setTimeout(() => {
      void refresh().finally(schedule);
    }, options.pullIntervalSec * 1000);
    timer.unref();
  };

  await refresh();

  const bound = { host: options.host, port: 0 };
  const send = (
    res: ServerResponse,
    status: number,
    headers: Record<string, string>,
    body = '',
  ): void => {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  };
  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    if (!hostAllowed(req.headers.host, bound)) return send(res, 403, TEXT, 'Forbidden host\n');
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { ...TEXT, Allow: 'GET, HEAD' }, 'Method not allowed\n');
    const head = req.method === 'HEAD';
    let path = (req.url ?? '/').split('?', 1)[0] ?? '/';
    if (path === '/healthz') return send(res, 200, TEXT, head ? '' : 'ok\n');
    if (path.endsWith('/index.html')) path = path.slice(0, -'index.html'.length);
    const page = site?.get(path);
    if (page) {
      const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
      if (page.csp !== null) headers['Content-Security-Policy'] = page.csp;
      return send(res, 200, headers, head ? '' : page.body);
    }
    // /tidepool -> /tidepool/, so relative links on the page keep working.
    if (site?.has(`${path}/`)) return send(res, 301, { Location: `${path}/` });
    return send(res, 404, TEXT, 'Not found\n');
  };
  const server = createServer(handle);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  bound.port = address.port;
  schedule();

  const shown = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return {
    url: `http://${shown}:${address.port}/`,
    port: address.port,
    refresh,
    close: async () => {
      closed = true;
      if (timer) clearTimeout(timer);
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
