import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mainAsync } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import { hostAllowed, startServe } from '../../src/node/serve.js';
import type { Serving } from '../../src/node/serve.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-serve-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));

let n = 0;
function tidepool(): string {
  const dir = join(base, `t${n++}`);
  cpSync('examples/tidepool', dir, { recursive: true });
  mkdirSync(join(dir, '.git'));
  return dir;
}

const open: Serving[] = [];
afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});
async function serve(dir: string, over: Partial<Parameters<typeof startServe>[0]> = {}) {
  const logs: string[] = [];
  const s = await startServe({
    cwd: dir,
    env: {},
    now: '2026-11-16',
    git: false,
    host: '127.0.0.1',
    port: 0,
    debounceMs: 20,
    log: (m) => logs.push(m),
    ...over,
  });
  open.push(s);
  return { s, logs };
}

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}
function get(
  s: Serving,
  path: string,
  opts: { method?: string; host?: string } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: s.port,
        path,
        method: opts.method ?? 'GET',
        headers: { Host: opts.host ?? `127.0.0.1:${s.port}` },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Open /events and resolve with the text received until `until` matches (or time runs out). */
function events(
  s: Serving,
  until: RegExp,
  ms = 4000,
): { done: Promise<string>; close: () => void } {
  let close = () => undefined as void;
  const done = new Promise<string>((resolve) => {
    let text = '';
    const timer = setTimeout(() => resolve(text), ms);
    const req = request(
      {
        host: '127.0.0.1',
        port: s.port,
        path: '/events',
        headers: { Host: `127.0.0.1:${s.port}` },
      },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          text += c;
          if (until.test(text)) {
            clearTimeout(timer);
            resolve(text);
          }
        });
      },
    );
    req.on('error', () => resolve(text));
    close = () => req.destroy();
    req.end();
  });
  return { done, close: () => close() };
}

/** Poll until the served body has the text: a slow file watcher can report older events first. */
async function bodyHas(s: Parameters<typeof get>[0], path: string, text: string): Promise<string> {
  let body = '';
  for (let i = 0; i < 100; i++) {
    body = (await get(s, path)).body;
    if (body.includes(text)) return body;
    await new Promise((r) => setTimeout(r, 50));
  }
  return body;
}

describe('hostAllowed', () => {
  it('accepts the bound host and loopback names on a loopback server', () => {
    const b = { host: '127.0.0.1', port: 4173 };
    for (const ok of [
      '127.0.0.1:4173',
      'localhost:4173',
      '[::1]:4173',
      'LOCALHOST:4173',
      '127.0.0.1',
    ])
      expect(hostAllowed(ok, b)).toBe(true);
  });
  it('refuses other names and ports, which blocks DNS rebinding', () => {
    const b = { host: '127.0.0.1', port: 4173 };
    for (const bad of [
      'evil.com',
      'evil.com:4173',
      '127.0.0.1:9999',
      'localhost.evil.com:4173',
      '',
      'a b',
      '[::1',
    ])
      expect(hostAllowed(bad, b)).toBe(false);
    expect(hostAllowed(undefined, b)).toBe(false);
  });
  it('accepts any name when bound to all addresses, but still checks the port', () => {
    const b = { host: '0.0.0.0', port: 8080 };
    expect(hostAllowed('maps.example.com:8080', b)).toBe(true);
    expect(hostAllowed('maps.example.com:81', b)).toBe(false);
    expect(hostAllowed('10.0.0.5:8080', { host: '10.0.0.5', port: 8080 })).toBe(true);
    expect(hostAllowed('localhost:8080', { host: '10.0.0.5', port: 8080 })).toBe(false);
  });
});

describe('startServe', () => {
  it('serves the live page with a CSP, security headers and the data', async () => {
    const { s, logs } = await serve(tidepool());
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(logs[0]).toMatch(/^map ready: 5 versions, 29% done, 0 errors, 0 warnings$/);
    const page = await get(s, '/');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body).toContain('<meta name="opmap-live" content="1">');
    expect(String(page.headers['content-security-policy'])).toContain("connect-src 'self'");
    expect(String(page.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(page.body).toContain(
      String(page.headers['content-security-policy']).replace(/'/g, '&#39;'),
    );
    expect(page.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cross-origin-opener-policy': 'same-origin',
      'cache-control': 'no-store',
    });
    expect((await get(s, '/index.html')).status).toBe(200);
    const data = await get(s, '/data.json');
    expect(JSON.parse(data.body).project.title).toBe('Tidepool');
    expect(await get(s, '/healthz')).toMatchObject({ status: 200, body: 'ok\n' });
  });
  it('answers HEAD without a body, and refuses other methods', async () => {
    const { s } = await serve(tidepool());
    const head = await get(s, '/', { method: 'HEAD' });
    expect(head).toMatchObject({ status: 200, body: '' });
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await get(s, '/', { method });
      expect(r.status).toBe(405);
      expect(r.headers['allow']).toBe('GET, HEAD');
    }
  });
  it('has nothing else to serve: other paths, traversal and odd characters are 404', async () => {
    const { s } = await serve(tidepool());
    for (const p of [
      '/nope',
      '/docs/project/ROADMAP.md',
      '/../../etc/passwd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/index.html/..',
      '/\\windows\\win.ini',
      '/%00',
      '/opmap.config.json',
    ]) {
      expect((await get(s, p)).status, p).toBe(404);
    }
    expect((await get(s, '/?x=1')).status).toBe(200);
  });
  it('refuses a request for another host name (DNS rebinding)', async () => {
    const { s } = await serve(tidepool());
    expect((await get(s, '/', { host: 'evil.example' })).status).toBe(403);
    expect((await get(s, '/data.json', { host: `localhost:${s.port}` })).status).toBe(200);
  });
  it('sends an event stream with a retry hint, and reloads open pages after a change', async () => {
    const dir = tidepool();
    const { s, logs } = await serve(dir);
    const ev = events(s, /event: reload/);
    await new Promise((r) => setTimeout(r, 100));
    const file = join(dir, 'docs/project/ROADMAP.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('**Next step:**', '**Next step:** Changed live. '),
    );
    const text = await ev.done;
    ev.close();
    expect(text).toContain('retry: 2000');
    expect(text).toContain('event: reload\ndata: 1');
    expect(await bodyHas(s, '/', 'Changed live.')).toContain('Changed live.');
    expect(logs.some((l) => l.startsWith('map rebuilt:'))).toBe(true);
  });
  it('follows a file that is replaced, the way editors save', async () => {
    const dir = tidepool();
    const { s } = await serve(dir);
    const ev = events(s, /event: reload/);
    await new Promise((r) => setTimeout(r, 100));
    const file = join(dir, 'docs/project/ROADMAP.md');
    const next = readFileSync(file, 'utf8').replace(
      'Finish the streak reminder',
      'Replaced file reminder',
    );
    writeFileSync(`${file}.tmp`, next);
    cpSync(`${file}.tmp`, file);
    await ev.done;
    ev.close();
    expect(await bodyHas(s, '/data.json', 'Replaced file reminder')).toContain(
      'Replaced file reminder',
    );
  });
  it('keeps the last good map when a rebuild fails', async () => {
    const dir = tidepool();
    const { s, logs } = await serve(dir);
    writeFileSync(join(dir, 'opmap.config.json'), '{ "format": 9 }');
    await s.rebuild();
    expect(
      logs.some((l) => l.startsWith('could not rebuild, still showing the last good map')),
    ).toBe(true);
    expect((await get(s, '/')).status).toBe(200);
    writeFileSync(join(dir, 'opmap.config.json'), '{}');
    await s.rebuild();
    expect(logs.at(-1)).toMatch(/^map rebuilt:/);
  });
  it('reports docs errors in the log but still serves the map', async () => {
    const dir = tidepool();
    const file = join(dir, 'docs/project/ROADMAP.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('opmap: 1', 'opmap: 9'));
    const { logs } = await serve(dir);
    expect(logs[0]).toContain('1 errors');
    expect(logs[1]).toContain('opmap check');
  });
  it('fails to start when there is no roadmap, and when the port is taken', async () => {
    const empty = join(base, `e${n++}`);
    mkdirSync(join(empty, '.git'), { recursive: true });
    await expect(
      startServe({ cwd: empty, env: {}, host: '127.0.0.1', port: 0, log: () => undefined }),
    ).rejects.toMatchObject({ code: 'OPM-E001' });
    const { s } = await serve(tidepool());
    await expect(
      startServe({
        cwd: tidepool(),
        env: {},
        git: false,
        host: '127.0.0.1',
        port: s.port,
        log: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
  it('close() stops the server and open event streams', async () => {
    const { s } = await serve(tidepool());
    const ev = events(s, /never/, 5000);
    await new Promise((r) => setTimeout(r, 100));
    await s.close();
    open.pop();
    await ev.done;
    await expect(get(s, '/healthz')).rejects.toBeTruthy();
  });
  it('caps the number of open pages', async () => {
    const { s } = await serve(tidepool());
    const streams = Array.from({ length: 20 }, () => events(s, /never/, 3000));
    await new Promise((r) => setTimeout(r, 300));
    expect((await get(s, '/events')).status).toBe(503);
    for (const e of streams) e.close();
  });
  it('answers HEAD on /events without holding the connection', async () => {
    const { s } = await serve(tidepool());
    const r = await get(s, '/events', { method: 'HEAD' });
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toContain('text/event-stream');
  });
});

describe('opmap serve', () => {
  function io(over: Partial<Io> = {}): { io: Io; out: () => string; err: () => string } {
    let out = '';
    let err = '';
    return {
      io: {
        stdout: (s) => (out += s),
        stderr: (s) => (err += s),
        env: {},
        cwd: process.cwd(),
        isTTY: false,
        open: () => undefined,
        ask: async () => '',
        ...over,
      },
      out: () => out,
      err: () => err,
    };
  }
  it('serves until told to stop, prints the address and can open it', async () => {
    const dir = tidepool();
    const opened: string[] = [];
    const t = io({ open: (u) => opened.push(u) });
    let health = '';
    t.io.waitForExit = async () => {
      const url = /at (http:\/\/\S+)/.exec(t.out())?.[1] ?? '';
      health = (await fetch(`${url}healthz`)).status.toString();
    };
    const code = await mainAsync(
      ['serve', '--port', '0', '-C', dir, '--now', '2026-11-16', '--no-git', '--open'],
      t.io,
    );
    expect(code).toBe(0);
    expect(t.out()).toContain('Serving the map at http://127.0.0.1:');
    expect(t.out()).toContain('press Ctrl+C to stop');
    expect(health).toBe('200');
    expect(opened).toHaveLength(1);
  });
  it('warns when bound to all addresses, and rejects bad flags', async () => {
    const dir = tidepool();
    const t = io();
    await mainAsync(['serve', '--port', '0', '--host', '0.0.0.0', '-C', dir, '--no-git'], t.io);
    expect(t.err()).toContain('no authentication');
    for (const bad of [
      ['--port', 'abc'],
      ['--port', '70000'],
      ['--port', '-1'],
      ['--host', 'a b;c'],
      ['extra'],
    ]) {
      const x = io();
      expect(await mainAsync(['serve', '-C', dir, ...bad], x.io)).toBe(2);
    }
  });
  it('tells you when the port is taken', async () => {
    const { s } = await serve(tidepool());
    const t = io();
    expect(
      await mainAsync(['serve', '--port', String(s.port), '-C', tidepool(), '--no-git'], t.io),
    ).toBe(2);
    expect(t.err()).toContain(`port ${s.port} is already in use`);
  });
  it('the sync entry point points serve and init at mainAsync', async () => {
    const { main } = await import('../../src/cli/index.js');
    const t = io();
    expect(main(['serve'], t.io)).toBe(2);
    expect(t.err()).toContain('mainAsync');
  });
});
