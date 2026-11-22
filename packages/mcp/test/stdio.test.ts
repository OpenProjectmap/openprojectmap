// Runs the real bin over stdio, the way an agent starts it. The test bundles the entry point itself,
// so it does not depend on `pnpm build` having run.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const bin = resolve('packages/mcp/dist/bin.test.mjs');
let dir = '';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'opmap-mcp-stdio-'));
  cpSync('examples/two-tracks', dir, { recursive: true });
  await build({
    entryPoints: ['packages/mcp/src/bin.ts'],
    outfile: bin,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // The CLI package is the one in this repo, so it is bundled too; the SDK stays external.
    packages: 'external',
    alias: { openprojectmap: resolve('src/index.ts') },
    define: { __OPMAP_VERSION__: '"0.0.0-test"', __MCP_VERSION__: '"0.0.0-test"' },
    logLevel: 'silent',
  });
}, 60_000);
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(bin, { force: true });
});

async function start(args: string[]): Promise<Client> {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [bin, '--cwd', dir, ...args],
      stderr: 'ignore',
    }),
  );
  return client;
}

describe('openprojectmap-mcp over stdio', () => {
  it('serves the tools and answers `now`', async () => {
    const c = await start([]);
    try {
      expect((await c.listTools()).tools.map((t) => t.name)).toContain('set_status');
      const r = (await c.callTool({ name: 'now', arguments: {} })) as {
        content: { text: string }[];
      };
      expect(JSON.parse(r.content[0]?.text ?? '{}')).toMatchObject({ project: 'Lantern' });
    } finally {
      await c.close();
    }
  });

  it('--read-only leaves the write tools out', async () => {
    const c = await start(['--read-only']);
    try {
      expect((await c.listTools()).tools.map((t) => t.name)).not.toContain('set_status');
    } finally {
      await c.close();
    }
  });
});
