import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, parse } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { OpmapError } from '../../src/core/errors.js';
import {
  findConfig,
  findRepoRoot,
  isInside,
  loadConfig,
  realpathLoose,
  validateConfig,
} from '../../src/node/config.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-config-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));

let n = 0;
/** A fresh repo with a `.git` folder and the given files. */
function repo(files: Record<string, string>): string {
  const dir = join(base, `r${n++}`);
  mkdirSync(join(dir, '.git'), { recursive: true });
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
}
const ROADMAP = { 'docs/project/ROADMAP.md': '# R\n' };
const load = (dir: string, extra: object = {}) => loadConfig({ cwd: dir, env: {}, ...extra });
function error(fn: () => unknown): OpmapError {
  try {
    fn();
  } catch (e) {
    if (e instanceof OpmapError) return e;
    throw e;
  }
  throw new Error('expected an OpmapError');
}

describe('validateConfig', () => {
  it('fills in every default', () => {
    const { config, problems } = validateConfig({});
    expect(problems).toEqual([]);
    expect(config).toMatchObject({
      name: null,
      docs: { roadmap: null, decisions: undefined, changelog: undefined },
      requireDoneRef: false,
      staleAfterDays: 14,
      git: { enabled: true, branches: { live: 'main' }, areas: ['*'], activityWeeks: 12 },
      output: { dir: '.opmap', json: false },
      theme: { accent: '#2f6fed', mode: 'auto', density: 'comfortable' },
      tracks: [],
    });
    expect(config?.idPattern.test('0.1.0-D3')).toBe(true);
  });
  it('accepts a full valid config', () => {
    const { config, problems } = validateConfig({
      $schema: 'x',
      format: 1,
      name: 'Tidepool',
      docs: { roadmap: 'r.md', decisions: null, changelog: 'c.md' },
      idPattern: '^T-\\d+$',
      requireDoneRef: true,
      staleAfterDays: 30,
      git: {
        enabled: false,
        branches: { live: 'main', staging: 'release/beta' },
        areas: ['apps/*', 'docs', '*'],
        activityWeeks: 4,
      },
      output: { dir: 'out', json: true },
      theme: { accent: '#0F8B8D', mode: 'dark', density: 'compact' },
      tracks: [
        {
          id: 'biz',
          title: 'Business',
          file: 'b.md',
          blockPattern: '^(?<id>BM\\d+) (?<title>.+)',
          idPattern: '^BM\\d+$',
        },
      ],
    });
    expect(problems).toEqual([]);
    expect(config).toMatchObject({
      name: 'Tidepool',
      docs: { decisions: null },
      git: { enabled: false },
      theme: { mode: 'dark' },
    });
    expect(config?.tracks[0]).toMatchObject({
      id: 'biz',
      blockPattern: expect.any(RegExp),
      idPattern: expect.any(RegExp),
    });
  });
  it('lists every problem with the key', () => {
    const { config, problems } = validateConfig({
      format: 2,
      name: '',
      docs: { roadmap: 7, extra: true, decisions: 5 },
      idPattern: '(',
      staleAfterDays: 0,
      requireDoneRef: 'yes',
      git: {
        branches: { live: '../evil', ok: 'main' },
        areas: ['/etc', 'a/../b', 4],
        activityWeeks: 99,
        enabled: 1,
      },
      output: { dir: '', json: 'no' },
      theme: { accent: 'red; x', mode: 'neon', density: 3 },
      tracks: [
        { id: 'Bad Id', title: 'T' },
        'x',
        { id: 'a', title: 'A', file: 'f', blockPattern: '(', idPattern: 'x'.repeat(201) },
        { id: 'a', title: 'A', file: 'g' },
      ],
      unknownKey: 1,
    });
    expect(config).toBeNull();
    expect(problems).toEqual(
      expect.arrayContaining([
        'unknownKey: unknown key',
        'format: must be 1',
        'name: expected a string of 1 to 80 characters',
        'docs.roadmap: expected a string of 1 to 4096 characters',
        'docs.extra: unknown key',
        'docs.decisions: expected a string of 1 to 4096 characters',
        'idPattern: not a valid regular expression (flag u)',
        'staleAfterDays: expected a whole number from 1 to 365',
        'requireDoneRef: expected true or false',
        'git.branches.live: not a valid branch name',
        'git.areas[0]: expected a folder prefix, optionally ending in /*',
        'git.areas[1]: expected a folder prefix, optionally ending in /*',
        'git.areas[2]: expected a folder prefix, optionally ending in /*',
        'git.activityWeeks: expected a whole number from 1 to 52',
        'git.enabled: expected true or false',
        'output.dir: expected a string of 1 to 4096 characters',
        'output.json: expected true or false',
        'theme.accent: expected a colour like #2f6fed',
        'theme.mode: expected one of auto, light, dark',
        'theme.density: expected one of comfortable, compact',
        'tracks[0].id: use 1 to 32 characters from a-z, 0-9 and -',
        'tracks[0].file: required',
        'tracks[1]: expected an object',
        'tracks[2].blockPattern: not a valid regular expression (flag u)',
        'tracks[2].idPattern: at most 200 characters',
        'tracks[3].id: "a" is used twice',
      ]),
    );
  });
  it('rejects non-objects, bad sections and bad lists', () => {
    for (const bad of [null, [], 'x', 3])
      expect(validateConfig(bad).problems).toEqual(['the file must contain a JSON object']);
    expect(validateConfig({ docs: 1, git: [], output: 'x', theme: null }).problems).toEqual([
      'docs: expected an object',
      'git: expected an object',
      'output: expected an object',
      'theme: expected an object',
    ]);
    expect(validateConfig({ git: { branches: [], areas: 'x' }, tracks: {} }).problems).toEqual([
      'git.branches: expected an object of role: branch',
      'git.areas: expected a list of folder prefixes',
      'tracks: expected a list',
    ]);
  });
  it('reports a track missing several keys', () => {
    expect(validateConfig({ tracks: [{}] }).problems).toEqual([
      'tracks[0].id: required',
      'tracks[0].title: required',
      'tracks[0].file: required',
    ]);
  });
});

describe('discovery helpers', () => {
  it('finds the repo root and the nearest config, stopping at the git root', () => {
    const dir = repo({ 'opmap.config.json': '{}', 'a/b/c.txt': '' });
    expect(findRepoRoot(join(dir, 'a/b'))).toBe(dir);
    expect(findConfig(join(dir, 'a/b'))).toBe(join(dir, 'opmap.config.json'));
    const bare = repo({ 'a/x.txt': '' });
    expect(findConfig(join(bare, 'a'))).toBeNull();
  });
  it('has no root or config above a folder outside any repo', () => {
    const plain = join(base, 'plain');
    mkdirSync(plain);
    expect(findConfig(plain)).toBeNull();
    expect(findRepoRoot('/')).toBeNull();
    expect(findConfig('/')).toBeNull();
  });
  it('isInside accepts the root and its children only', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a')).toBe(false);
    expect(isInside('/a/b', '/a/b/../x')).toBe(false);
  });
  it('realpathLoose resolves paths that do not exist yet', () => {
    expect(realpathLoose(join(base, 'nope/deeper/file.md'))).toBe(
      join(base, 'nope/deeper/file.md'),
    );
    expect(realpathLoose(parse(base).root)).toBe(parse(base).root);
  });
});

describe('loadConfig', () => {
  it('uses defaults when there is no config but the default roadmap exists', () => {
    const dir = repo({ ...ROADMAP, 'docs/project/DECISIONS.md': '# D\n', 'CHANGELOG.md': '# C\n' });
    const c = load(join(dir, 'docs'));
    expect(c).toMatchObject({ format: 1, configPath: null, root: dir, name: basename(dir) });
    expect(c.docs).toEqual({
      roadmap: join(dir, 'docs/project/ROADMAP.md'),
      decisions: join(dir, 'docs/project/DECISIONS.md'),
      changelog: join(dir, 'CHANGELOG.md'),
    });
    expect(c.output.dir).toBe(join(dir, '.opmap'));
  });
  it('OPM-E001 with no config and no roadmap', () => {
    const e = error(() => load(repo({})));
    expect(e).toMatchObject({ code: 'OPM-E001' });
    expect(e.hint).toContain('opmap init');
  });
  it('reads a config from a parent folder and resolves paths against it', () => {
    const dir = repo({
      'opmap.config.json': JSON.stringify({
        name: 'Mine',
        docs: { roadmap: 'plan/R.md', decisions: 'plan/missing.md', changelog: null },
        git: { enabled: false },
      }),
      'plan/R.md': '# R\n',
      'src/x.ts': '',
    });
    const c = load(join(dir, 'src'));
    expect(c).toMatchObject({
      name: 'Mine',
      configPath: join(dir, 'opmap.config.json'),
      git: { enabled: false },
    });
    expect(c.docs).toEqual({ roadmap: join(dir, 'plan/R.md'), decisions: null, changelog: null });
  });
  it('OPM-E001 when the configured roadmap does not exist', () => {
    const dir = repo({ 'opmap.config.json': '{ "docs": { "roadmap": "nope.md" } }' });
    expect(error(() => load(dir))).toMatchObject({ code: 'OPM-E001' });
  });
  it('--config wins over OPMAP_CONFIG, which wins over discovery', () => {
    const dir = repo({
      'opmap.config.json': '{ "name": "found" }',
      'a.json': '{ "name": "flag" }',
      'b.json': '{ "name": "env" }',
      ...ROADMAP,
    });
    expect(load(dir).name).toBe('found');
    expect(loadConfig({ cwd: dir, env: { OPMAP_CONFIG: 'b.json' } }).name).toBe('env');
    expect(
      loadConfig({ cwd: dir, env: { OPMAP_CONFIG: 'b.json' }, configPath: 'a.json' }).name,
    ).toBe('flag');
    expect(loadConfig({ cwd: dir, env: { OPMAP_CONFIG: '' } }).name).toBe('found');
  });
  it('OPM-E003 when the given config file is missing, not JSON, or invalid', () => {
    const dir = repo({ 'bad.json': '{ nope', 'list.json': '{ "format": 3 }', ...ROADMAP });
    expect(error(() => load(dir, { configPath: 'missing.json' }))).toMatchObject({
      code: 'OPM-E003',
    });
    expect(error(() => load(dir, { configPath: 'bad.json' })).message).toContain('not valid JSON');
    const e = error(() => load(dir, { configPath: 'list.json' }));
    expect(e.message).toContain('- format: must be 1');
  });
  it('strips a BOM from the config file', () => {
    const dir = repo({ 'opmap.config.json': '﻿{ "name": "bom" }', ...ROADMAP });
    expect(load(dir).name).toBe('bom');
  });
  it('OPM-E003 when a path escapes the repository', () => {
    const dir = repo({ 'opmap.config.json': '{ "docs": { "roadmap": "../../etc/passwd" } }' });
    expect(error(() => load(dir))).toMatchObject({ code: 'OPM-E003' });
    expect(error(() => load(dir)).message).toContain('escapes the repository');
    const out = repo({
      'opmap.config.json': '{ "output": { "dir": "../elsewhere" } }',
      ...ROADMAP,
    });
    expect(error(() => load(out)).message).toContain('output.dir');
    const tr = repo({
      'opmap.config.json': '{ "tracks": [{ "id": "t", "title": "T", "file": "/etc/hosts" }] }',
      ...ROADMAP,
    });
    expect(error(() => load(tr)).message).toContain('tracks[0].file');
  });
  it('OPM-E003 when a symlink points outside the repository', () => {
    const outside = join(base, `outside${n++}`);
    mkdirSync(outside);
    writeFileSync(join(outside, 'R.md'), '# R\n');
    const dir = repo({ 'opmap.config.json': '{ "docs": { "roadmap": "link/R.md" } }' });
    try {
      symlinkSync(outside, join(dir, 'link'), 'dir');
    } catch {
      return; // symlinks need extra rights on Windows
    }
    expect(error(() => load(dir)).message).toContain('escapes the repository');
  });
  it('resolves tracks and output inside the repo', () => {
    const dir = repo({
      'opmap.config.json': JSON.stringify({
        output: { dir: 'site/map', json: true },
        tracks: [{ id: 'biz', title: 'Biz', file: 'docs/BIZ.md' }],
        idPattern: '^X-\\d+$',
        requireDoneRef: true,
        staleAfterDays: 7,
      }),
      ...ROADMAP,
    });
    const c = load(dir);
    expect(c.output).toEqual({ dir: join(dir, 'site/map'), json: true });
    expect(c.tracks).toEqual([
      {
        id: 'biz',
        title: 'Biz',
        file: join(dir, 'docs/BIZ.md'),
        blockPattern: null,
        idPattern: null,
      },
    ]);
    expect(c).toMatchObject({ requireDoneRef: true, staleAfterDays: 7 });
    expect(c.idPattern.test('X-4')).toBe(true);
  });
  it('uses the config folder as the root when there is no git folder', () => {
    const dir = join(base, `nogit${n++}`);
    mkdirSync(join(dir, 'docs/project'), { recursive: true });
    writeFileSync(join(dir, 'docs/project/ROADMAP.md'), '# R\n');
    writeFileSync(join(dir, 'opmap.config.json'), '{}');
    expect(load(dir).root).toBe(dir);
  });
});

describe('fixture OPM-E003', () => {
  it('reports every problem in the fixture config', () => {
    const dir = 'test/fixtures/diagnostics/OPM-E003';
    const e = error(() => loadConfig({ cwd: dir, env: {} }));
    expect(e.code).toBe('OPM-E003');
    const expected = readFileSync(join(dir, 'expected.txt'), 'utf8').replace(/\r\n/g, '\n');
    if (process.env['UPDATE_FIXTURES'] === '1')
      writeFileSync(join(dir, 'expected.txt'), `${e.message}\n`);
    else expect(`${e.message}\n`).toBe(expected);
  });
});
