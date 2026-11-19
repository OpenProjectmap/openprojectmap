import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { gatherGit, git, isSafeRef } from '../../src/node/git.js';
import type { GitOptions } from '../../src/node/git.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-git-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));

const AUTHOR = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
};

/** Run git in a test setup (tests may call git directly; src may not). */
function sh(cwd: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...AUTHOR, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

let n = 0;
function commit(cwd: string, file: string, date: string, subject: string): void {
  mkdirSync(join(cwd, file, '..'), { recursive: true });
  writeFileSync(join(cwd, file), `${subject}\n`);
  sh(cwd, ['add', '-A']);
  sh(cwd, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', subject], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
}

function repo(): string {
  const dir = join(base, `repo${n++}`);
  mkdirSync(dir);
  sh(dir, ['init', '-q', '-b', 'main']);
  commit(dir, 'old/a.txt', '2026-10-01T10:00:00Z', 'ancient');
  commit(dir, 'src/core/a.ts', '2026-11-10T10:00:00Z', 'one | with pipe');
  commit(dir, 'docs/x.md', '2026-11-10T11:00:00Z', 'two');
  commit(dir, 'apps/web/index.ts', '2026-11-16T09:00:00Z', 'three');
  return dir;
}

const opts = (cwd: string, over: Partial<GitOptions> = {}): GitOptions => ({
  cwd,
  enabled: true,
  branches: { live: 'main' },
  areas: ['src/core', 'docs', 'apps/*'],
  activityWeeks: 4,
  updated: '2026-11-10',
  today: '2026-11-17',
  ...over,
});

describe('isSafeRef', () => {
  it('accepts normal branch names', () => {
    for (const r of ['main', 'release/1.2', 'feature_x-1.y', 'a']) expect(isSafeRef(r)).toBe(true);
  });
  it('rejects anything that could be an option or a range', () => {
    for (const r of [
      '',
      '-x',
      '--upload-pack=x',
      'a..b',
      'a b',
      'a;b',
      '$(x)',
      'a/',
      'x.lock',
      'a'.repeat(101),
      '/abs',
    ]) {
      expect(isSafeRef(r)).toBe(false);
    }
  });
});

describe('git', () => {
  it('returns stdout, or null on failure', () => {
    const dir = repo();
    expect(git(['rev-parse', '--is-inside-work-tree'], dir)?.trim()).toBe('true');
    expect(git(['no-such-command'], dir)).toBeNull();
    expect(git(['rev-parse', 'HEAD'], join(base, 'does-not-exist'))).toBeNull();
  });
});

describe('gatherGit', () => {
  it('returns nothing when disabled', () => {
    expect(gatherGit(opts(repo(), { enabled: false }))).toEqual({
      info: null,
      commitsSince: null,
      diagnostics: [],
    });
  });

  it('reads head, branches, weekly activity, areas and commits since Updated', () => {
    const dir = repo();
    const r = gatherGit(opts(dir));
    expect(r.diagnostics).toEqual([]);
    expect(r.commitsSince).toBe(3);
    expect(r.info).toMatchObject({ root: basename(dir), shallow: false });
    expect(r.info?.head).toMatchObject({
      date: expect.stringContaining('2026-11-16'),
      subject: 'three',
    });
    expect(r.info?.head?.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(r.info?.branches['live']).toEqual(r.info?.head);
    expect(r.info?.activity).toEqual({
      weekStarts: ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'],
      commits: [0, 0, 2, 1],
      areas: { 'src/core': 1, docs: 1, 'apps/web': 1 },
    });
  });
  it('keeps a subject that contains a pipe or the unit separator intact', () => {
    const dir = repo();
    commit(dir, 'z.txt', '2026-11-16T10:00:00Z', 'a | b');
    expect(gatherGit(opts(dir)).info?.head?.subject).toBe('a | b');
  });
  it('counts every top-level folder for `*` and skips root files', () => {
    const dir = repo();
    commit(dir, 'README.md', '2026-11-16T10:00:00Z', 'root file');
    const areas = gatherGit(opts(dir, { areas: ['*'] })).info?.activity.areas;
    expect(areas).toEqual({ src: 1, docs: 1, apps: 1 });
  });
  it('counts apps/* children but not files directly under apps', () => {
    const dir = repo();
    commit(dir, 'apps/README.md', '2026-11-16T10:00:00Z', 'apps readme');
    expect(gatherGit(opts(dir, { areas: ['apps/*'] })).info?.activity.areas).toEqual({
      'apps/web': 1,
    });
  });
  it('lists fixed areas with a zero count', () => {
    expect(gatherGit(opts(repo(), { areas: ['templates'] })).info?.activity.areas).toEqual({
      templates: 0,
    });
  });
  it('leaves commits-since null without an Updated date', () => {
    expect(gatherGit(opts(repo(), { updated: null })).commitsSince).toBeNull();
    expect(gatherGit(opts(repo(), { updated: 'nope' })).commitsSince).toBeNull();
  });
  it('counts only commits after the last edit of the roadmap file', () => {
    const dir = repo();
    expect(gatherGit(opts(dir)).commitsSince).toBe(3);
    expect(gatherGit(opts(dir, { roadmapPath: 'docs/x.md' })).commitsSince).toBe(1);
    commit(dir, 'docs/x.md', '2026-11-16T10:00:00Z', 'now block refreshed');
    expect(gatherGit(opts(dir, { roadmapPath: 'docs/x.md' })).commitsSince).toBe(0);
    expect(gatherGit(opts(dir, { roadmapPath: 'no/such.md' })).commitsSince).toBe(4);
  });
  it('OPM-W803 for a missing branch, and never runs an option as a ref', () => {
    const dir = repo();
    const r = gatherGit(
      opts(dir, {
        branches: { live: 'main', staging: 'beta', evil: '--upload-pack=touch /tmp/x' },
      }),
    );
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      'Branch "beta" (staging) was not found',
      'Branch "--upload-pack=touch /tmp/x" (evil) was not found',
    ]);
    expect(r.info?.branches).toMatchObject({ staging: null, evil: null });
    expect(r.info?.branches['live']).not.toBeNull();
  });
  it('uses HEAD for activity when there is no live branch', () => {
    const dir = repo();
    const r = gatherGit(opts(dir, { branches: { live: 'nope' } }));
    expect(r.diagnostics.map((d) => d.code)).toEqual(['OPM-W803']);
    expect(r.info?.activity.commits).toEqual([0, 0, 2, 1]);
  });
  it('gives zero activity for a repo with no commits', () => {
    const dir = join(base, `empty${n++}`);
    mkdirSync(dir);
    sh(dir, ['init', '-q', '-b', 'main']);
    const r = gatherGit(opts(dir));
    expect(r.info).toMatchObject({
      head: null,
      activity: { commits: [0, 0, 0, 0], areas: { 'src/core': 0, docs: 0 } },
    });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['OPM-W803']);
  });
  it('OPM-I801 outside a git repository', () => {
    const dir = join(base, `plain${n++}`);
    mkdirSync(dir);
    const r = gatherGit(opts(dir));
    expect(r).toMatchObject({ info: null, commitsSince: null });
    expect(r.diagnostics.map((d) => [d.code, d.severity])).toEqual([['OPM-I801', 'info']]);
  });
  it('prefers origin/<branch>, flags a shallow clone, and can fetch', () => {
    const origin = repo();
    const clone = join(base, `clone${n++}`);
    execFileSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(origin).href, clone], {
      env: { ...process.env, ...AUTHOR },
      stdio: 'ignore',
    });
    commit(clone, 'local.txt', '2026-11-16T12:00:00Z', 'local only');
    const r = gatherGit(opts(clone, { fetch: true }));
    expect(r.diagnostics.map((d) => d.code)).toEqual(['OPM-I802']);
    expect(r.info?.shallow).toBe(true);
    expect(r.info?.head?.subject).toBe('local only');
    expect(r.info?.branches['live']?.subject).toBe('three');
  });
  it('ignores GIT_* variables from the environment', () => {
    const dir = repo();
    const saved = process.env['GIT_DIR'];
    process.env['GIT_DIR'] = join(base, 'not-a-repo');
    try {
      expect(gatherGit(opts(dir)).info?.head?.subject).toBe('three');
    } finally {
      if (saved === undefined) delete process.env['GIT_DIR'];
      else process.env['GIT_DIR'] = saved;
    }
  });
});

describe('fixtures OPM-I801, OPM-I802 and OPM-W803', () => {
  const read = (code: string): string =>
    readFileSync(join('test/fixtures/diagnostics', code, 'expected.txt'), 'utf8').replace(
      /\r\n/g,
      '\n',
    );
  const lines = (r: ReturnType<typeof gatherGit>): string =>
    `${r.diagnostics.map((d) => `${d.code} ${d.message}`).join('\n')}\n`;
  const write = (code: string, text: string): void => {
    if (process.env['UPDATE_FIXTURES'] === '1')
      writeFileSync(join('test/fixtures/diagnostics', code, 'expected.txt'), text);
  };

  it('OPM-I801', () => {
    const dir = join(base, `plain${n++}`);
    mkdirSync(dir);
    const text = lines(gatherGit(opts(dir)));
    write('OPM-I801', text);
    expect(text).toBe(read('OPM-I801'));
  });
  it('OPM-I802', () => {
    const origin = repo();
    const clone = join(base, `clone${n++}`);
    execFileSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(origin).href, clone], {
      env: { ...process.env, ...AUTHOR },
      stdio: 'ignore',
    });
    const text = lines(gatherGit(opts(clone)));
    write('OPM-I802', text);
    expect(text).toBe(read('OPM-I802'));
  });
  it('OPM-W803', () => {
    const text = lines(gatherGit(opts(repo(), { branches: { live: 'main', staging: 'beta' } })));
    write('OPM-W803', text);
    expect(text).toBe(read('OPM-W803'));
  });
});
