import { request } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mainAsync } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import { startHubServe } from '../../src/node/serve-hub.js';
import type { HubServing } from '../../src/node/serve-hub.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-serve-hub-')));
const open: HubServing[] = [];
afterAll(async () => {
  for (const s of open) await s.close();
  rmSync(base, { recursive: true, force: true });
});

interface Res {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function get(
  s: HubServing,
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

let n = 0;
function site(): string {
  const dir = join(base, `s${n++}`);
  mkdirSync(dir);
  cpSync('examples/tidepool', join(dir, 'tidepool'), { recursive: true });
  cpSync('examples/tidepool', join(dir, 'second'), { recursive: true });
  writeFileSync(
    join(dir, 'hub.json'),
    JSON.stringify({
      title: 'Hosted',
      projects: [
        { name: 'Tidepool', path: 'tidepool' },
        { name: 'Second', path: 'second' },
        { name: 'Broken', path: 'nope' },
      ],
    }),
  );
  return dir;
}

async function serve(dir: string, pullIntervalSec = 0, log: string[] = []): Promise<HubServing> {
  const s = await startHubServe({
    hubFile: 'hub.json',
    cwd: dir,
    env: {},
    now: '2026-11-25',
    host: '127.0.0.1',
    port: 0,
    pullIntervalSec,
    log: (m) => log.push(m),
  });
  open.push(s);
  return s;
}

describe('startHubServe', () => {
  it('serves the index and each project map from memory, and answers /healthz', async () => {
    const s = await serve(site());
    const index = await get(s, '/');
    expect(index.status).toBe(200);
    expect(index.body).toContain('<h1>Hosted</h1>');
    expect(index.body).toContain('Could not build this map.');
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.headers['content-security-policy']).toContain("default-src 'none'");
    expect(index.headers['x-content-type-options']).toBe('nosniff');
    const map = await get(s, '/tidepool/');
    expect(map.status).toBe(200);
    expect(map.body).toContain('opmap-hub');
    expect(map.headers['content-security-policy']).toContain('script-src');
    expect((await get(s, '/tidepool/index.html')).status).toBe(200);
    expect((await get(s, '/second/')).status).toBe(200);
    expect((await get(s, '/healthz')).body).toBe('ok\n');
    expect((await get(s, '/', { method: 'HEAD' })).body).toBe('');
  });
  it('redirects a bare project path, and refuses everything else', async () => {
    const s = await serve(site());
    const redirect = await get(s, '/tidepool');
    expect(redirect.status).toBe(301);
    expect(redirect.headers['location']).toBe('/tidepool/');
    expect((await get(s, '/broken/')).status).toBe(404);
    expect((await get(s, '/nope')).status).toBe(404);
    expect((await get(s, '/../../etc/passwd')).status).toBe(404);
    expect((await get(s, '/%2e%2e/%2e%2e/etc/passwd')).status).toBe(404);
    expect((await get(s, '/', { method: 'POST' })).status).toBe(405);
    expect((await get(s, '/', { host: 'evil.example' })).status).toBe(403);
  });
  it('picks up changes on refresh and keeps the last good site when the hub file breaks', async () => {
    const dir = site();
    const logs: string[] = [];
    const s = await serve(dir, 0, logs);
    const file = join(dir, 'tidepool/docs/project/ROADMAP.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('Finish the streak reminder', 'Changed hosted'),
    );
    expect((await get(s, '/')).body).not.toContain('Changed hosted');
    await s.refresh();
    expect((await get(s, '/')).body).toContain('Changed hosted');
    writeFileSync(join(dir, 'hub.json'), '{ not json');
    await s.refresh();
    expect((await get(s, '/')).body).toContain('Changed hosted');
    expect(logs.some((l) => l.includes('still showing the last good site'))).toBe(true);
  });
  it('rebuilds on its own after the pull interval', async () => {
    const dir = site();
    const s = await serve(dir, 1);
    const file = join(dir, 'second/docs/project/ROADMAP.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('Finish the streak reminder', 'Timer change'),
    );
    let body = '';
    for (let i = 0; i < 80 && !body.includes('Timer change'); i++) {
      await new Promise((r) => setTimeout(r, 100));
      body = (await get(s, '/')).body;
    }
    expect(body).toContain('Timer change');
  });
  it('refuses to start when the hub file is invalid', async () => {
    const dir = site();
    writeFileSync(join(dir, 'hub.json'), '{"projects": []}');
    await expect(serve(dir)).rejects.toThrow('at least one project');
  });
});

describe('opmap serve --hub', () => {
  it('starts, serves and stops, and checks its flags', async () => {
    const dir = site();
    let out = '';
    let err = '';
    let stop = () => undefined as void;
    const io: Io = {
      stdout: (s) => (out += s),
      stderr: (s) => (err += s),
      env: {},
      cwd: dir,
      isTTY: false,
      open: () => undefined,
      ask: async () => '',
      waitForExit: () => new Promise<void>((r) => (stop = r)),
    };
    const running = mainAsync(
      ['serve', '--hub', 'hub.json', '--port', '0', '--now', '2026-11-25', '-C', dir],
      io,
    );
    for (let i = 0; i < 100 && !out.includes('Serving the hub at'); i++)
      await new Promise((r) => setTimeout(r, 50));
    const url = /Serving the hub at (\S+)/.exec(out)?.[1];
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const s = { port: Number(new URL(url ?? '').port) } as HubServing;
    expect((await get(s, '/')).body).toContain('<h1>Hosted</h1>');
    stop();
    expect(await running).toBe(0);
    expect(err).toBe('');
    const bad = await mainAsync(
      ['serve', '--hub', 'hub.json', '--pull-interval', 'soon', '-C', dir],
      io,
    );
    expect(bad).not.toBe(0);
  });
});
