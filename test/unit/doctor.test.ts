import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import { doctorExit, nodeOk, runDoctor } from '../../src/node/doctor.js';
import { gitVersion } from '../../src/node/git.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-doctor-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));

const ROADMAP = `<!-- opmap: 1 -->
# Demo

## Now

**Updated:** 2026-11-17
**Next step:** Go.

## V

### v0.1.0 — One

**Window:** 2026-11-17 → 2026-12-01
**Goal:** g
**Exit:** e

| ID | Deliverable | Status |
| --- | --- | --- |
| 0.1.0-D1 | One | doing |
`;
let n = 0;
/** A git repo with a roadmap (and optional extras). */
function project(
  files: Record<string, string> = {},
  opts: { git?: boolean; roadmap?: string | null } = {},
): string {
  const dir = join(base, `p${n++}`);
  mkdirSync(join(dir, 'docs/project'), { recursive: true });
  if (opts.git !== false) execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  if (opts.roadmap !== null)
    writeFileSync(join(dir, 'docs/project/ROADMAP.md'), opts.roadmap ?? ROADMAP);
  for (const [f, t] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), t);
  }
  return dir;
}
const by = (checks: ReturnType<typeof runDoctor>, name: string) =>
  checks.find((c) => c.name === name);
const run = (dir: string, over: object = {}) =>
  runDoctor({ cwd: dir, env: {}, now: '2026-11-18', ...over });

describe('nodeOk', () => {
  it('needs 20.11 or newer', () => {
    for (const ok of ['20.11.0', '20.20.2', '22.0.0', '24.1.0']) expect(nodeOk(ok)).toBe(true);
    for (const bad of ['18.19.0', '20.10.9', '19.9.0', '']) expect(nodeOk(bad)).toBe(false);
  });
});

describe('runDoctor', () => {
  it('is all ok for a tidy project', () => {
    const dir = project({
      'opmap.config.json': '{}',
      'CHANGELOG.md': '# Changelog\n',
      'docs/project/DECISIONS.md': '# D\n',
      '.gitignore': '.opmap/\n',
    });
    const c = run(dir);
    expect(c.map((x) => [x.name, x.level])).toEqual([
      ['Node.js', 'ok'],
      ['git', 'ok'],
      ['git repository', 'ok'],
      ['config', 'ok'],
      ['roadmap', 'ok'],
      ['decisions', 'ok'],
      ['changelog', 'ok'],
      ['format marker', 'ok'],
      ['docs', 'ok'],
      ['output folder', 'ok'],
    ]);
    expect(doctorExit(c)).toBe(0);
    expect(by(c, 'roadmap')?.detail).toBe('docs/project/ROADMAP.md');
    expect(by(c, 'config')?.detail).toBe('opmap.config.json is valid');
  });
  it('uses the defaults when there is no config file', () => {
    expect(by(run(project()), 'config')?.detail).toBe('no opmap.config.json; using the defaults');
  });
  it('fails on an old Node, with a fix', () => {
    const c = run(project(), { nodeVersion: '18.19.0' });
    expect(by(c, 'Node.js')).toMatchObject({
      level: 'fail',
      detail: 'v18.19.0 is too old (needs 20.11 or newer)',
    });
    expect(by(c, 'Node.js')?.fix).toContain('nodejs.org');
    expect(doctorExit(c)).toBe(1);
  });
  it('warns when git is missing or the folder is not a repository', () => {
    const noRepo = run(project({}, { git: false }));
    expect(by(noRepo, 'git repository')).toMatchObject({ level: 'warn' });
    expect(by(noRepo, 'git repository')?.fix).toContain('git init');
    expect(by(noRepo, 'output folder')).toBeUndefined();
    const dir = project();
    const saved = process.env['PATH'];
    process.env['PATH'] = '';
    try {
      expect(gitVersion(base)).toBeNull();
      const c = run(dir);
      expect(by(c, 'git')).toMatchObject({ level: 'warn' });
      expect(by(c, 'git repository')).toBeUndefined();
    } finally {
      process.env['PATH'] = saved;
    }
  });
  it('fails with an init hint when there is no roadmap', () => {
    const c = run(project({}, { roadmap: null }));
    expect(by(c, 'config and roadmap')).toMatchObject({ level: 'fail' });
    expect(by(c, 'config and roadmap')?.detail).toContain('OPM-E001');
    expect(by(c, 'config and roadmap')?.fix).toContain('init');
    expect(c.at(-1)?.name).toBe('config and roadmap');
  });
  it('fails on an invalid config, naming the problem', () => {
    const c = run(project({ 'opmap.config.json': '{ "format": 4 }' }));
    expect(by(c, 'config and roadmap')).toMatchObject({ level: 'fail' });
    expect(by(c, 'config and roadmap')?.detail).toContain('OPM-E003');
    expect(by(c, 'config and roadmap')?.fix).toContain('opmap.config.json');
  });
  it('warns about a missing decisions or changelog file', () => {
    const c = run(project());
    expect(by(c, 'decisions')).toMatchObject({ level: 'warn' });
    expect(by(c, 'changelog')?.fix).toContain('optional');
  });
  it('checks the format marker', () => {
    const none = run(project({}, { roadmap: ROADMAP.replace('<!-- opmap: 1 -->\n', '') }));
    expect(by(none, 'format marker')).toMatchObject({ level: 'warn' });
    expect(by(none, 'format marker')?.fix).toContain('<!-- opmap: 1 -->');
    const high = run(project({}, { roadmap: ROADMAP.replace('opmap: 1', 'opmap: 3') }));
    expect(by(high, 'format marker')).toMatchObject({ level: 'fail' });
    expect(doctorExit(high)).toBe(1);
  });
  it('summarises problems in the docs', () => {
    const warn = run(project({}, { roadmap: ROADMAP.replace('| doing |', '| dne |') }));
    expect(by(warn, 'docs')).toMatchObject({ level: 'warn', detail: '1 warning' });
    const err = run(project({}, { roadmap: ROADMAP.replace('opmap: 1', 'opmap: 3') }));
    expect(by(err, 'docs')).toMatchObject({ level: 'fail', detail: '1 error, 0 warnings' });
    expect(by(err, 'docs')?.fix).toContain('check');
  });
  it('warns when the output folder is not ignored', () => {
    const c = run(project({ '.gitignore': 'node_modules/\n' }));
    expect(by(c, 'output folder')).toMatchObject({ level: 'warn' });
    expect(by(c, 'output folder')?.fix).toContain('.opmap/');
    expect(by(run(project({ '.gitignore': '/.opmap\n' })), 'output folder')?.level).toBe('ok');
  });
  it('reports a docs failure when the build itself throws', () => {
    const dir = project({ 'opmap.config.json': '{}' });
    const c = runDoctor({ cwd: dir, env: {}, now: 'not a date' });
    expect(by(c, 'docs')).toMatchObject({ level: 'fail' });
    expect(by(c, 'docs')?.detail).toContain('Not a date');
  });
});

describe('opmap doctor', () => {
  const go = (args: string[], dir: string, over: Partial<Io> = {}) => {
    let out = '';
    let err = '';
    const code = main(['doctor', '-C', dir, '--now', '2026-11-18', ...args], {
      stdout: (s) => (out += s),
      stderr: (s) => (err += s),
      env: {},
      cwd: dir,
      isTTY: false,
      open: () => undefined,
      ask: async () => '',
      ...over,
    });
    return { code, out, err };
  };
  it('prints each check with its fix and a summary, exit 0 when nothing fails', () => {
    const r = go([], project({ '.gitignore': 'x\n' }));
    expect(r.code).toBe(0);
    expect(r.out).toContain('✔ Node.js: v');
    expect(r.out).toContain('⚠ output folder:');
    expect(r.out).toContain('    fix: Add the line `.opmap/` to .gitignore.');
    expect(r.out).toMatch(/All good, \d+ suggestions?\n$/);
  });
  it('exits 1 and says how many problems to fix', () => {
    const r = go([], project({}, { roadmap: null }));
    expect(r.code).toBe(1);
    expect(r.out).toContain('✖ config and roadmap:');
    expect(r.out).toContain('1 problem to fix');
  });
  it('prints json, honours --config, and colours only on a terminal', () => {
    const dir = project({ 'alt.json': '{}' });
    const j = JSON.parse(go(['--format', 'json', '-c', 'alt.json'], dir).out);
    expect(j.ok).toBe(true);
    expect(j.checks.length).toBeGreaterThan(5);
    expect(go([], dir, { isTTY: true }).out).toContain('\u001b[');
    expect(go([], dir).out).not.toContain('\u001b[');
    expect(go(['--format', 'xml'], dir).code).toBe(2);
  });
});
