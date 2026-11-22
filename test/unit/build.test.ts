import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildData, buildProject, resolveNow, VERSION } from '../../src/node/build.js';
import { displayPath, readSources } from '../../src/node/sources.js';
import { loadConfig } from '../../src/node/config.js';
import { OpmapError } from '../../src/core/errors.js';
import * as api from '../../src/index.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-build-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('resolveNow', () => {
  it('takes a date or a timestamp as given', () => {
    expect(resolveNow('2026-11-17', 'utc')).toEqual({ now: '2026-11-17T00:00:00.000Z' });
    expect(resolveNow('2026-11-17T09:30:00+02:00', 'local')).toEqual({
      now: '2026-11-17T07:30:00.000Z',
    });
  });
  it('uses the real clock when there is no override, and the local date for --tz local', () => {
    const utc = resolveNow(undefined, 'utc');
    expect(utc.now).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(utc.today).toBeUndefined();
    expect(resolveNow(undefined, 'local').today).toMatch(/^\d{4}-\d\d-\d\d$/);
  });
  it('rejects nonsense', () => {
    expect(() => resolveNow('soon', 'utc')).toThrow(RangeError);
  });
});

describe('buildData and buildProject', () => {
  const opts = { cwd: 'examples/tidepool', now: '2026-11-25', git: false } as const;
  it('parses a project with config defaults and the tool version', () => {
    const { data, config } = buildData(opts);
    expect(data.project).toMatchObject({ name: 'Tidepool', title: 'Tidepool' });
    expect(data.tool.version).toBe(VERSION);
    expect(data.git).toBeNull();
    expect(config.git.enabled).toBe(false);
  });
  it('renders the same data into one self-contained page', () => {
    const { data, html } = buildProject(opts);
    expect(html).toContain(`<title>${data.project.title} · Project map</title>`);
    expect(html).toContain('--accent:#0f8b8d');
  });
  it('adds git facts and a commits-since count in a git repo', () => {
    const { data } = buildData({ cwd: '.', now: '2026-11-17', git: true });
    expect(data.git?.head?.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(data.derived.stale.commitsSince).toEqual(expect.any(Number));
  });
  it('keeps a failed git lookup as an info diagnostic', () => {
    const dir = join(base, 'nogit');
    mkdirSync(join(dir, 'docs/project'), { recursive: true });
    writeFileSync(
      join(dir, 'docs/project/ROADMAP.md'),
      '<!-- opmap: 1 -->\n# T\n## Now\n**Next step:** x\n',
    );
    writeFileSync(join(dir, 'opmap.config.json'), '{}');
    const { data } = buildData({ cwd: dir, now: '2026-11-17', git: true });
    expect(data.git).toBeNull();
    expect(data.diagnostics.map((d) => d.code)).toContain('OPM-I801');
  });
});

describe('sources', () => {
  it('uses repo-relative display paths with forward slashes', () => {
    expect(displayPath('/r', '/r/docs/project/ROADMAP.md')).toBe('docs/project/ROADMAP.md');
    const s = readSources(loadConfig({ cwd: 'examples/tidepool', env: {} }));
    expect(s.roadmap?.path).toBe('examples/tidepool/docs/project/ROADMAP.md');
    expect(s.decisions?.path).toBe('examples/tidepool/docs/project/DECISIONS.md');
    expect(s.changelog?.path).toBe('examples/tidepool/CHANGELOG.md');
  });
  it('OPM-E001 when the roadmap cannot be read', () => {
    const config = loadConfig({ cwd: 'examples/tidepool', env: {} });
    const bad = { ...config, docs: { ...config.docs, roadmap: join(base, 'missing.md') } };
    expect(() => readSources(bad)).toThrow(OpmapError);
  });
  it('leaves out files that are not configured', () => {
    const config = loadConfig({ cwd: 'examples/tidepool', env: {} });
    const s = readSources({
      ...config,
      docs: { ...config.docs, decisions: null, changelog: null },
    });
    expect(s.decisions).toBeUndefined();
    expect(s.changelog).toBeUndefined();
  });
});

describe('public API', () => {
  it('exports the documented functions', () => {
    expect(Object.keys(api).sort()).toEqual([
      'EditError',
      'OpmapError',
      'VERSION',
      'buildData',
      'buildProject',
      'checkProposal',
      'loadConfig',
      'opDecide',
      'opLog',
      'opSetStatus',
      'opUpdateNow',
      'parseProject',
      'proposalFor',
      'queryCheck',
      'queryGet',
      'queryList',
      'queryNow',
      'renderMap',
      'saveProposal',
    ]);
  });
});
