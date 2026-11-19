import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';

const root = join(import.meta.dirname, '../..');
const read = (f: string): string => readFileSync(join(root, f), 'utf8');
const work = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-recipes-')));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Every `npx ... openprojectmap@X <args>` line in the recipes, as a list of CLI arguments. */
function commands(text: string): string[][] {
  return [...text.matchAll(/openprojectmap@[\d.]+((?: [^\s"'`\n]+| "[^"]*")+)/g)].map((m) =>
    [...(m[1] ?? '').matchAll(/"([^"]*)"|(\S+)/g)].map((a) => a[1] ?? a[2] ?? ''),
  );
}

function run(
  args: string[],
  cwd: string,
  now = '2026-11-25',
): { code: number; out: string; err: string } {
  let out = '';
  let err = '';
  const io: Io = {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    env: {},
    cwd,
    isTTY: false,
    open: () => undefined,
    ask: async () => '',
  };
  return { code: main([...args, '--now', now], io), out, err };
}

describe('examples/ci recipes', () => {
  const files = [
    'examples/ci/gitlab-ci.yml',
    'examples/ci/netlify.toml',
    'examples/ci/vercel.json',
  ];
  it('use build commands the CLI accepts, and a "public" output folder', () => {
    const dir = join(work, 'site');
    cpSync(join(root, 'examples/tidepool'), dir, { recursive: true });
    for (const f of files.filter((x) => !x.endsWith('gitlab-ci.yml'))) {
      const cmds = commands(read(f)).filter((c) => c[0] === 'build');
      expect(cmds, f).toEqual([['build', '--out', 'public']]);
      const r = run([...(cmds[0] ?? []), '--no-git'], dir);
      expect(r.code, `${f}: ${r.err}`).toBe(0);
      expect(existsSync(join(dir, 'public/index.html'))).toBe(true);
    }
    expect(read('examples/ci/netlify.toml')).toContain('publish = "public"');
    expect(JSON.parse(read('examples/ci/vercel.json')).outputDirectory).toBe('public');
  });
  it('gitlab: publishes only from the default branch and uses real flags', () => {
    const text = read('examples/ci/gitlab-ci.yml');
    expect(text).toContain('rules:\n    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH');
    expect(text).toContain('paths:\n      - public');
    const dir = join(work, 'gl');
    cpSync(join(root, 'examples/tidepool'), dir, { recursive: true });
    const subs = commands(text).map((c) => c[0]);
    expect(subs).toEqual(['build', 'check', 'diff']);
    expect(run(['build', '--out', 'public', '--no-git'], dir).code).toBe(0);
    // Tidepool has a decision that is overdue from 2026-11-20 on, so check it before that date.
    expect(run(['check', '--strict', '--no-git'], dir, '2026-11-16').code).toBe(0);
  });
  it('every recipe warns about who can open the page', () => {
    for (const f of files) expect(read(f).toLowerCase()).toMatch(/public/);
    const guide = read('docs/guide/other-hosts.md');
    expect(guide).toContain('treat it as public');
    for (const host of ['GitLab', 'Netlify', 'Cloudflare Pages', 'Vercel'])
      expect(guide).toContain(host);
    expect(guide).toContain('NODE_VERSION');
  });
});
