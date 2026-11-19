// `opmap serve` (spec 04 §2, spec 07 §4): a tiny local server that rebuilds the map when the docs
// change and tells open pages to reload. Nothing is read from disk to answer a request: the page and
// the data are held in memory, so there is no path to traverse. Only GET and HEAD are answered.
import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, dirname } from 'node:path';
import { buildData, renderMapLive } from './build.js';
import type { BuildOptions } from './build.js';

export interface ServeOptions extends BuildOptions {
  host: string;
  /** 0 picks a free port. */
  port: number;
  /** Quiet period after a change before rebuilding. Default 150 ms. */
  debounceMs?: number;
  /** Where messages for the person at the terminal go. */
  log: (message: string) => void;
}

export interface Serving {
  url: string;
  port: number;
  /** Rebuild now (also what a file change triggers). Resolves when the new page is live. */
  rebuild: () => Promise<void>;
  close: () => Promise<void>;
}

const MAX_CLIENTS = 20;
const HEARTBEAT_MS = 25_000;
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',
} as const;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** A Host header we expect: the bound host and port, or a loopback name when bound to loopback. */
export function hostAllowed(
  header: string | undefined,
  bound: { host: string; port: number },
): boolean {
  if (!header) return false;
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(header.trim());
  if (!m) return false;
  const name = (m[1] ?? '').toLowerCase();
  if (m[2] !== undefined && Number(m[2]) !== bound.port) return false;
  if (bound.host === '0.0.0.0' || bound.host === '::') return true; // reachable on any name; the user was warned
  return (
    name === bound.host.toLowerCase() ||
    (LOOPBACK.has(bound.host.toLowerCase()) && LOOPBACK.has(name))
  );
}

export async function startServe(options: ServeOptions): Promise<Serving> {
  const { log } = options;
  let page: { html: string; json: string; csp: string } | null = null;
  let building: Promise<void> | null = null;
  const clients = new Set<ServerResponse>();
  let watchers: FSWatcher[] = [];
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const doBuild = (): void => {
    try {
      const { data, config } = buildData(options);
      const result = renderMapLive(data, config.theme);
      const first = page === null;
      page = { html: result.html, json: `${JSON.stringify(data)}\n`, csp: result.csp };
      const errors = data.diagnostics.filter((d) => d.severity === 'error').length;
      const warnings = data.diagnostics.filter((d) => d.severity === 'warning').length;
      log(
        `${first ? 'map ready' : 'map rebuilt'}: ${data.versions.length} versions, ${data.derived.overall.pct}% done, ${errors} errors, ${warnings} warnings`,
      );
      if (errors > 0) log('the docs have errors: run `opmap check` to see them');
      rewatch(config.configPath, [
        config.docs.roadmap,
        config.docs.decisions,
        config.docs.changelog,
      ]);
      if (!first) for (const c of clients) c.write('event: reload\ndata: 1\n\n');
    } catch (e) {
      if (page === null) throw e;
      log(
        `could not rebuild, still showing the last good map: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`,
      );
    }
  };

  const rebuild = (): Promise<void> => {
    if (building) return building;
    building = Promise.resolve()
      .then(doBuild)
      .finally(() => {
        building = null;
      });
    return building;
  };

  const schedule = (): void => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void rebuild().catch((e: unknown) => log(`rebuild failed: ${String(e)}`));
    }, options.debounceMs ?? 150);
  };

  function rewatch(configPath: string | null, docs: readonly (string | null)[]): void {
    const files = [configPath, ...docs].filter((f): f is string => f !== null);
    for (const w of watchers) w.close();
    watchers = [];
    // Watch the folders, not the files: editors save by replacing the file.
    for (const dir of new Set(files.map((f) => dirname(f)))) {
      const names = new Set(files.filter((f) => dirname(f) === dir).map((f) => basename(f)));
      try {
        const w = watch(dir, { persistent: false }, (_event, name) => {
          if (name === null || names.has(String(name))) schedule();
        });
        w.on('error', () => undefined);
        watchers.push(w);
      } catch {
        log(`could not watch ${dir}; changes there will not reload the page`);
      }
    }
  }

  await rebuild();

  const bound = { host: options.host, port: 0 };
  const server: Server = createServer((req, res) => handle(req, res, bound));

  function send(
    res: ServerResponse,
    status: number,
    headers: Record<string, string>,
    body = '',
  ): void {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  }

  function handle(
    req: IncomingMessage,
    res: ServerResponse,
    b: { host: string; port: number },
  ): void {
    if (!hostAllowed(req.headers.host, b))
      return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden host\n');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(
        res,
        405,
        { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
        'Method not allowed\n',
      );
    }
    const path = (req.url ?? '/').split('?', 1)[0] ?? '/';
    const head = req.method === 'HEAD';
    if (path === '/' || path === '/index.html') {
      if (!page)
        return send(res, 503, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not ready\n');
      return send(
        res,
        200,
        { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': page.csp },
        head ? '' : page.html,
      );
    }
    if (path === '/data.json') {
      if (!page)
        return send(res, 503, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not ready\n');
      return send(
        res,
        200,
        { 'Content-Type': 'application/json; charset=utf-8' },
        head ? '' : page.json,
      );
    }
    if (path === '/healthz')
      return send(res, 200, { 'Content-Type': 'text/plain; charset=utf-8' }, head ? '' : 'ok\n');
    if (path === '/events') {
      if (clients.size >= MAX_CLIENTS)
        return send(
          res,
          503,
          { 'Content-Type': 'text/plain; charset=utf-8' },
          'Too many open pages\n',
        );
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      if (head) return void res.end();
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found\n');
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  bound.port = address.port;
  const heartbeat = setInterval(() => {
    for (const c of clients) c.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const shown = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return {
    url: `http://${shown}:${address.port}/`,
    port: address.port,
    rebuild,
    close: async () => {
      closed = true;
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
      for (const c of clients) c.end();
      clients.clear();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
