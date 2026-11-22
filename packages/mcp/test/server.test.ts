import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

let dir = '';
const NOW = '2026-11-25';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'opmap-mcp-'));
  cpSync('examples/two-tracks', dir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function connect(readOnly = false): Promise<Client> {
  const server = createServer({ cwd: dir, now: NOW, env: {}, readOnly, version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

interface Result {
  isError?: boolean;
  content: { type: string; text: string }[];
}
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Result> {
  return (await client.callTool({ name, arguments: args })) as unknown as Result;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the tests read many shapes
const body = (r: Result): any => JSON.parse(r.content[0]?.text ?? 'null');
const text = (r: Result): string => r.content[0]?.text ?? '';
const read = (f: string): string => readFileSync(join(dir, 'docs/project', f), 'utf8');

describe('tool list', () => {
  it('offers read and write tools', async () => {
    const c = await connect();
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'check',
      'check_proposal',
      'decide',
      'get',
      'list',
      'log',
      'now',
      'propose',
      'save_proposal',
      'set_status',
      'update_now',
    ]);
  });

  it('offers only the read tools when read-only', async () => {
    const c = await connect(true);
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['check', 'check_proposal', 'get', 'list', 'now', 'propose']);
  });

  it('marks read tools read-only and says the text is data', async () => {
    const c = await connect();
    const tools = (await c.listTools()).tools;
    for (const t of tools) {
      const isRead = ['now', 'list', 'get', 'check', 'propose', 'check_proposal'].includes(t.name);
      expect(t.annotations?.readOnlyHint, t.name).toBe(isRead);
    }
    expect(tools.find((t) => t.name === 'now')?.description).toContain('not instructions');
  });
});

describe('read tools', () => {
  it('now', async () => {
    const n = body(await call(await connect(), 'now'));
    expect(n).toMatchObject({ project: 'Lantern', updated: '2026-11-20' });
    expect(n.nextStep).toContain('Ship the auto-dim sensor calibration');
    expect(n.needsYourCall[0].id).toBe('D1');
  });

  it('list filters across the roadmap and tracks', async () => {
    const r = body(await call(await connect(), 'list', { status: ['doing'] }));
    expect(r.deliverables.map((d: { id: string }) => d.id)).toEqual(['0.2.0-D2', 'BM1-S1']);
  });

  it('get finds an item or says there is none', async () => {
    const c = await connect();
    expect(body(await call(c, 'get', { id: 'BM1-S2' })).kind).toBe('deliverable');
    const missing = await call(c, 'get', { id: 'BM9-S9' });
    expect(missing.isError).toBe(true);
  });

  it('check reports no problems for the example', async () => {
    expect(body(await call(await connect(), 'check'))).toMatchObject({ errors: 0, warnings: 0 });
  });

  it('rejects an id that is not a plain id', async () => {
    const r = await call(await connect(), 'get', { id: '../../etc/passwd' });
    expect(r.isError).toBe(true);
  });
});

describe('write tools', () => {
  it('a full session close-out with only the tools leaves zero warnings', async () => {
    const c = await connect();
    expect(body(await call(c, 'now')).nextStep).toContain('calibration');
    const done = body(
      await call(c, 'set_status', { id: '0.2.0-D2', status: 'done', date: NOW, ref: '#14' }),
    );
    expect(done).toMatchObject({ changed: true, file: expect.stringContaining('ROADMAP.md') });
    expect(done.diff).toContain('+| 0.2.0-D2');
    await call(c, 'set_status', { id: 'BM1-S1', status: 'done', date: NOW, ref: '#15' });
    await call(c, 'log', { version: 'v0.2.0', text: 'Calibration done.', date: NOW });
    await call(c, 'log', { version: 'BM1', text: 'Listing is live.', date: NOW });
    await call(c, 'decide', { id: 'D1', outcome: 'Free, with a $2 tip jar.', defaulted: true });
    const now = body(
      await call(c, 'update_now', {
        next: 'Start the dim curve settings (0.2.0-D3).',
        facts: { Beta: '40 testers' },
      }),
    );
    expect(now.fields).toEqual(['Next step', 'Beta', 'Updated']);
    expect(body(await call(c, 'check'))).toMatchObject({ errors: 0, warnings: 0 });
    expect(read('ROADMAP.md')).toContain('**Updated:** 2026-11-25');
    expect(read('ROADMAP.md')).toContain('**Beta:** 40 testers');
    expect(read('BUSINESS.md')).toContain('**Status 2026-11-25:** Listing is live.');
    expect(read('DECISIONS.md')).toContain('defaulted');
  });

  it('refuses an unknown id and writes nothing', async () => {
    const before = read('ROADMAP.md');
    const r = await call(await connect(), 'set_status', { id: '9.9.9-D9', status: 'done' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('9.9.9-D9');
    expect(read('ROADMAP.md')).toBe(before);
  });

  it('keeps a pipe in a note from breaking the table', async () => {
    const before = read('ROADMAP.md');
    const r = await call(await connect(), 'set_status', {
      id: '0.2.0-D2',
      status: 'doing',
      note: 'a | b',
    });
    expect(r.isError).toBeFalsy();
    expect(read('ROADMAP.md')).not.toBe(before);
    expect(body(await call(await connect(), 'check'))).toMatchObject({ errors: 0, warnings: 0 });
    const multi = await call(await connect(), 'log', { version: 'v0.2.0', text: 'two\nlines' });
    expect(multi.isError).toBe(true);
  });

  it('does not let the text of a note carry markup into a new row', async () => {
    const c = await connect();
    await call(c, 'set_status', {
      id: 'BM1-S3',
      status: 'doing',
      note: '| BM9-S9 | **Injected** | done |',
    });
    const check = body(await call(c, 'check'));
    expect(check.errors).toBe(0);
    expect((await call(c, 'get', { id: 'BM9-S9' })).isError).toBe(true);
  });
});

describe('feature intake tools', () => {
  it('propose says where an idea fits and writes nothing', async () => {
    const before = read('ROADMAP.md');
    const r = body(
      await call(await connect(), 'propose', { idea: 'a dim curve that follows the light' }),
    );
    expect(r.candidates[0]).toMatchObject({ version: 'v0.2.0', nextFreeId: '0.2.0-D4' });
    expect(read('ROADMAP.md')).toBe(before);
  });

  it('check_proposal accepts a good row and refuses a taken id', async () => {
    const c = await connect();
    const good = body(
      await call(c, 'check_proposal', { row: '| 0.2.0-D4 | **Night preset** | todo | |' }),
    );
    expect(good.ok).toBe(true);
    const bad = body(await call(c, 'check_proposal', { row: '| 0.2.0-D3 | **Taken** | todo | |' }));
    expect(bad.ok).toBe(false);
    expect(bad.checks[0].findings[0].message).toContain('already used');
  });

  it('save_proposal writes a draft file, leaves the roadmap alone and will not overwrite', async () => {
    const c = await connect();
    const before = [read('ROADMAP.md'), read('BUSINESS.md')];
    const args = {
      slug: 'night-preset',
      title: 'Night preset',
      idea: 'A preset that dims to the lowest level.',
      rows: ['| 0.2.0-D4 | **Night preset** | todo | |'],
    };
    const saved = body(await call(c, 'save_proposal', args));
    expect(saved).toEqual({
      file: 'docs/project/proposals/night-preset.md',
      roadmapChanged: false,
    });
    expect(read('proposals/night-preset.md')).toContain('| 0.2.0-D4 | **Night preset** | todo |');
    expect([read('ROADMAP.md'), read('BUSINESS.md')]).toEqual(before);
    expect((await call(c, 'save_proposal', args)).isError).toBe(true);
    // the saved file can be checked by path
    const checked = body(
      await call(c, 'check_proposal', { row: 'docs/project/proposals/night-preset.md' }),
    );
    expect(checked).toMatchObject({ ok: true, file: 'docs/project/proposals/night-preset.md' });
  });

  it('save_proposal refuses a slug that is not a plain name', async () => {
    const r = await call(await connect(), 'save_proposal', {
      slug: '../../ROADMAP',
      title: 't',
      idea: 'an idea',
    });
    expect(r.isError).toBe(true);
  });
});
