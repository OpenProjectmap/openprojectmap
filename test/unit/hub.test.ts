import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
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
import {
  cardFor,
  failedCard,
  isSafeBranch,
  isSafeRepoUrl,
  parseHubConfig,
  plainText,
  slugify,
  uniqueSlugs,
} from '../../src/core/hub.js';
import { buildHub, MANAGED_MARKER } from '../../src/node/hub.js';
import { tidepool } from './helpers.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-hub-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));
let n = 0;
const fresh = (): string => {
  const dir = join(base, `h${n++}`);
  mkdirSync(dir);
  return dir;
};

describe('parseHubConfig', () => {
  const ok = JSON.stringify({
    title: 'My projects',
    projects: [
      { name: 'Tidepool', path: '/repos/tidepool' },
      { name: 'Side quest', repo: 'git@github.com:me/side-quest.git', branch: 'main' },
    ],
  });
  it('reads the documented example', () => {
    const hub = parseHubConfig(ok);
    expect(hub.title).toBe('My projects');
    expect(hub.projects).toHaveLength(2);
    expect(hub.projects[1]).toEqual({
      name: 'Side quest',
      repo: 'git@github.com:me/side-quest.git',
      branch: 'main',
    });
    expect(parseHubConfig('{"projects":[{"name":"a","path":"."}]}').title).toBe('Projects');
  });
  it('says which key is wrong', () => {
    const bad = (value: unknown): string => {
      try {
        parseHubConfig(typeof value === 'string' ? value : JSON.stringify(value));
      } catch (e) {
        return (e as Error).message;
      }
      return 'no error';
    };
    expect(bad('{nope')).toContain('not valid JSON');
    expect(bad([])).toContain('must be an object');
    expect(bad({ projects: [{ name: 'a', path: '.' }], extra: 1 })).toContain(
      'Unknown key "extra"',
    );
    expect(bad({ projects: [] })).toContain('at least one project');
    expect(bad({ projects: [{ name: 'a' }] })).toContain('exactly one of "path" and "repo"');
    expect(bad({ projects: [{ name: 'a', path: '.', repo: 'https://x.dev/r' }] })).toContain(
      'exactly one',
    );
    expect(bad({ projects: [{ name: '', path: '.' }] })).toContain('projects[0].name');
    expect(bad({ projects: [{ name: 'a', path: '.', branch: 'main' }] })).toContain(
      'only goes with',
    );
    expect(bad({ projects: [{ name: 'a', path: '.', color: 'x' }] })).toContain(
      'projects[0].color',
    );
    expect(bad({ projects: [{ name: 'a', repo: 'https://x.dev/r', branch: '--evil' }] })).toContain(
      'plain branch name',
    );
  });
  it('only lets a repo be a plain git remote', () => {
    for (const good of [
      'https://github.com/me/r.git',
      'ssh://git@host.dev/me/r.git',
      'git@github.com:me/r.git',
      'file:///srv/git/r.git',
    ])
      expect(isSafeRepoUrl(good)).toBe(true);
    for (const evil of [
      'ext::sh -c touch /tmp/x',
      '--upload-pack=touch /tmp/x',
      '-oProxyCommand=x',
      'http://x.dev/r',
      'https://x.dev/r with space',
      'https://x.dev/../r',
      'git@host:r; rm -rf /',
      'fd::3',
      '',
    ])
      expect(isSafeRepoUrl(evil)).toBe(false);
    expect(isSafeBranch('release/1.2')).toBe(true);
    for (const evil of ['-x', 'a..b', 'a b', 'x.lock', '', 'a/'])
      expect(isSafeBranch(evil)).toBe(false);
  });
});

describe('slugs and cards', () => {
  it('lowercases, joins with dashes and never repeats', () => {
    expect(slugify('Side Quest!')).toBe('side-quest');
    expect(slugify('  --Ünï/cødé  ')).toBe('n-c-d');
    expect(slugify('***')).toBe('project');
    expect(uniqueSlugs(['Tidepool', 'tidepool', 'TIDEPOOL!', 'Other'])).toEqual([
      'tidepool',
      'tidepool-2',
      'tidepool-3',
      'other',
    ]);
  });
  it('reduces inline markdown to words', () => {
    expect(
      plainText('Ship **the `hub`** and [read this](https://x.dev) <https://y.dev>\nnext'),
    ).toBe('Ship the hub and read this https://y.dev next');
  });
  it('summarises a built project in one card', () => {
    const card = cardFor('Tidepool', 'tidepool', tidepool());
    expect(card).toMatchObject({
      name: 'Tidepool',
      slug: 'tidepool',
      error: null,
      version: 'v0.2.0',
      state: 'active',
      pct: 20,
      needsCall: 2,
      stale: false,
      lastCommit: null,
    });
    expect(card.nextStep).toContain('Finish the streak reminder');
    expect(failedCard('A', 'a', 'boom')).toMatchObject({ error: 'boom', version: null, pct: null });
  });
});

const sh = (cwd: string, args: string[]): void => {
  execFileSync(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    { cwd, stdio: 'ignore' },
  );
};

/** A bare "remote" made from Tidepool, and a helper that changes the next step and pushes it. */
function remote(): { url: string; change: (text: string) => void } {
  const work = fresh();
  cpSync('examples/tidepool', work, { recursive: true });
  sh(work, ['init', '-q', '-b', 'main']);
  sh(work, ['add', '-A']);
  sh(work, ['commit', '-q', '-m', 'one']);
  const bare = join(fresh(), 'remote.git');
  sh(work, ['clone', '-q', '--bare', work, bare]);
  sh(work, ['remote', 'add', 'origin', bare]);
  return {
    url: `file://${bare}`,
    change: (text) => {
      const file = join(work, 'docs/project/ROADMAP.md');
      writeFileSync(file, readFileSync(file, 'utf8').replace('Finish the streak reminder', text));
      sh(work, ['commit', '-q', '-am', 'two']);
      sh(work, ['push', '-q', 'origin', 'main']);
    },
  };
}

describe('buildHub', () => {
  it('builds path projects, an index, and a card that says what failed', async () => {
    const dir = fresh();
    cpSync('examples/tidepool', join(dir, 'tidepool'), { recursive: true });
    writeFileSync(
      join(dir, 'opmap.hub.json'),
      JSON.stringify({
        title: 'Mine',
        projects: [
          { name: 'Tidepool', path: 'tidepool' },
          { name: 'Gone', path: 'nope' },
          { name: 'tidepool', path: 'tidepool' },
        ],
      }),
    );
    const lines: string[] = [];
    const r = await buildHub({
      hubFile: 'opmap.hub.json',
      out: 'site',
      cwd: dir,
      env: {},
      now: '2026-11-25',
      log: (l) => lines.push(l),
    });
    expect(r.failed).toBe(1);
    expect(r.cards.map((c) => c.slug)).toEqual(['tidepool', 'gone', 'tidepool-2']);
    expect(r.cards[1]?.error).toContain('does not exist');
    expect(lines.some((l) => l.startsWith('could not build Gone'))).toBe(true);
    const index = readFileSync(join(dir, 'site/index.html'), 'utf8');
    expect(index).toContain('<h1>Mine</h1>');
    expect(index).toContain('href="tidepool/index.html"');
    expect(index).toContain('href="tidepool-2/index.html"');
    expect(index).toContain('Could not build this map.');
    expect(existsSync(join(dir, 'site/gone'))).toBe(false);
    const child = readFileSync(join(dir, 'site/tidepool/index.html'), 'utf8');
    expect(child).toContain('<meta name="opmap-hub" content="1">');
  });
  it('clones a repo into its own cache folder, refreshes it, and follows the branch', async () => {
    const dir = fresh();
    const r = remote();
    writeFileSync(
      join(dir, 'h.json'),
      JSON.stringify({ projects: [{ name: 'Remote one', repo: r.url, branch: 'main' }] }),
    );
    const cache = join(dir, 'cache');
    const opts = {
      hubFile: 'h.json',
      out: 'site',
      cwd: dir,
      env: {},
      now: '2026-11-25',
      cacheDir: cache,
    };
    expect((await buildHub(opts)).failed).toBe(0);
    expect(existsSync(join(cache, 'remote-one', MANAGED_MARKER))).toBe(true);
    expect(readFileSync(join(dir, 'site/index.html'), 'utf8')).toContain(
      'Finish the streak reminder',
    );
    r.change('Ship the new thing');
    expect((await buildHub({ ...opts, fetch: false })).cards[0]?.nextStep).toContain(
      'Finish the streak',
    );
    expect((await buildHub(opts)).cards[0]?.nextStep).toContain('Ship the new thing');
  });
  it('never touches a folder it did not make, and says so', async () => {
    const dir = fresh();
    const r = remote();
    writeFileSync(
      join(dir, 'h.json'),
      JSON.stringify({ projects: [{ name: 'Mine', repo: r.url }] }),
    );
    const cache = join(dir, 'cache');
    mkdirSync(join(cache, 'mine'), { recursive: true });
    writeFileSync(join(cache, 'mine', 'precious.txt'), 'keep me');
    const res = await buildHub({
      hubFile: 'h.json',
      out: 'site',
      cwd: dir,
      env: {},
      cacheDir: cache,
    });
    expect(res.cards[0]?.error).toContain('was not made by openprojectmap');
    expect(readFileSync(join(cache, 'mine', 'precious.txt'), 'utf8')).toBe('keep me');
  });
  it('explains a missing clone with fetching off, a bad remote and a missing hub file', async () => {
    const dir = fresh();
    const r = remote();
    writeFileSync(
      join(dir, 'h.json'),
      JSON.stringify({ projects: [{ name: 'Mine', repo: r.url }] }),
    );
    const cache = join(dir, 'cache');
    const offline = await buildHub({
      hubFile: 'h.json',
      out: 'o',
      cwd: dir,
      env: {},
      cacheDir: cache,
      fetch: false,
    });
    expect(offline.cards[0]?.error).toContain('has not been cloned yet');
    const online = await buildHub({
      hubFile: 'h.json',
      out: 'o',
      cwd: dir,
      env: {},
      cacheDir: cache,
    });
    expect(online.failed).toBe(0);
    const other = remote();
    writeFileSync(
      join(dir, 'h2.json'),
      JSON.stringify({ projects: [{ name: 'Mine', repo: other.url }] }),
    );
    const swapped = await buildHub({
      hubFile: 'h2.json',
      out: 'o',
      cwd: dir,
      env: {},
      cacheDir: cache,
    });
    expect(swapped.cards[0]?.error).toContain('different remote');
    await expect(
      buildHub({ hubFile: 'missing.json', out: 'o', cwd: dir, env: {} }),
    ).rejects.toThrow('could not be read');
  });
  it('does not let one OPMAP_CONFIG point every project at one config', async () => {
    const dir = fresh();
    cpSync('examples/tidepool', join(dir, 't'), { recursive: true });
    writeFileSync(join(dir, 'h.json'), JSON.stringify({ projects: [{ name: 'T', path: 't' }] }));
    const r = await buildHub({
      hubFile: 'h.json',
      out: 'o',
      cwd: dir,
      env: { OPMAP_CONFIG: '/nonexistent/opmap.config.json' },
    });
    expect(r.failed).toBe(0);
  });
});

describe('opmap hub', () => {
  it('runs from the command line and exits 1 when a project fails', async () => {
    const dir = fresh();
    cpSync('examples/tidepool', join(dir, 't'), { recursive: true });
    writeFileSync(
      join(dir, 'h.json'),
      JSON.stringify({
        projects: [
          { name: 'T', path: 't' },
          { name: 'X', path: 'nope' },
        ],
      }),
    );
    const run = async (args: string[]) => {
      let out = '';
      let err = '';
      const io: Io = {
        stdout: (s) => (out += s),
        stderr: (s) => (err += s),
        env: {},
        cwd: dir,
        isTTY: false,
        open: () => undefined,
        ask: async () => '',
      };
      return { code: await mainAsync([...args, '-C', dir, '--now', '2026-11-25'], io), out, err };
    };
    const r = await run(['hub', 'h.json', '--out', 'site']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('hub built: 1 of 2 projects, 1 failed');
    expect(r.err).toContain('could not build X');
    expect(existsSync(join(dir, 'site/index.html'))).toBe(true);
    const quiet = await run(['hub', 'h.json', '--out', 'site', '-q']);
    expect(quiet.err).toBe('');
    expect((await run(['hub'])).code).not.toBe(0);
  });
});
