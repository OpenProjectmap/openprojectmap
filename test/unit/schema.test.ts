import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { main } from '../../src/cli/index.js';
import { parseProject } from '../../src/core/index.js';
import { validateConfig } from '../../src/node/config.js';
import { generate } from '../../scripts/gen-schema.mjs';
import { stressRoadmap } from './helpers.js';

const read = (p: string): string => readFileSync(p, 'utf8');
const projectSchema = JSON.parse(read('schema/project-data.v1.json'));
const configSchema = JSON.parse(read('schema/config.v1.json'));
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat('regex', {
  validate: (s: string) => {
    try {
      new RegExp(s, 'u');
      return true;
    } catch {
      return false;
    }
  },
});
const validateData = ajv.compile(projectSchema);
const validateCfg = ajv.compile(configSchema);

function project(
  root: string,
  files: { roadmap: string; decisions?: string; changelog?: string },
  now = '2026-11-25T00:00:00Z',
) {
  const rd = (f: string) => ({ path: f, text: read(join(root, f)) });
  return parseProject(
    {
      roadmap: rd(files.roadmap),
      decisions: files.decisions ? rd(files.decisions) : undefined,
      changelog: files.changelog ? rd(files.changelog) : undefined,
    },
    { now, toolVersion: '0.2.0' },
  );
}

describe('schema/project-data.v1.json', () => {
  it('is up to date with the TypeScript types (run `pnpm schema` after changing types.ts)', () => {
    expect(read('schema/project-data.v1.json')).toBe(generate());
  }, 60_000);
  it('has an id and the format tag', () => {
    expect(projectSchema.$id).toBe('https://openprojectmap.dev/schema/project-data.v1.json');
    expect(projectSchema.definitions.ProjectData.properties.schema.const).toBe(
      'openprojectmap/project-data@1',
    );
  });
  const cases: [string, ReturnType<typeof project>][] = [
    [
      'Tidepool',
      project('examples/tidepool', {
        roadmap: 'docs/project/ROADMAP.md',
        decisions: 'docs/project/DECISIONS.md',
        changelog: 'CHANGELOG.md',
      }),
    ],
    [
      'the full fixture',
      project('test/fixtures/projects/full', {
        roadmap: 'ROADMAP.md',
        decisions: 'DECISIONS.md',
        changelog: 'CHANGELOG.md',
      }),
    ],
    ['the minimal fixture', project('test/fixtures/projects/minimal', { roadmap: 'ROADMAP.md' })],
    [
      'this repository',
      project(
        '.',
        {
          roadmap: 'docs/project/ROADMAP.md',
          decisions: 'docs/project/DECISIONS.md',
          changelog: 'CHANGELOG.md',
        },
        '2026-11-19T00:00:00Z',
      ),
    ],
  ];
  it.each(cases)('accepts the project data of %s', (_name, data) => {
    expect(
      validateData(JSON.parse(JSON.stringify(data))),
      JSON.stringify(validateData.errors?.slice(0, 3)),
    ).toBe(true);
  });
  it('accepts the stress fixture', () => {
    const data = parseProject(
      { roadmap: { path: 'R.md', text: stressRoadmap() } },
      { now: '2026-11-17T00:00:00Z' },
    );
    expect(validateData(JSON.parse(JSON.stringify(data)))).toBe(true);
  });
  it('accepts data with git facts', () => {
    const data = JSON.parse(JSON.stringify(cases[0]?.[1]));
    const c = { sha: 'abc1234', date: '2026-11-16T09:00:00Z', subject: 's' };
    data.git = {
      root: 'r',
      head: c,
      branches: { live: c, staging: null },
      activity: { weekStarts: ['2026-11-16'], commits: [1], areas: { src: 1 } },
      shallow: false,
    };
    expect(validateData(data), JSON.stringify(validateData.errors?.slice(0, 3))).toBe(true);
  });
  it('rejects data that is missing a field, has a wrong type, or an unknown status', () => {
    const base = JSON.parse(JSON.stringify(cases[0]?.[1]));
    const missing = { ...base };
    delete missing.derived;
    expect(validateData(missing)).toBe(false);
    expect(validateData({ ...base, today: 5 })).toBe(false);
    expect(validateData({ ...base, schema: 'other@2' })).toBe(false);
    const bad = JSON.parse(JSON.stringify(base));
    bad.versions[0].deliverables[0].status = 'finished';
    expect(validateData(bad)).toBe(false);
  });
});

describe('schema/config.v1.json', () => {
  const valid = [
    {},
    {
      format: 1,
      name: 'X',
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
          title: 'Biz',
          file: 'b.md',
          blockPattern: '^(?<id>BM\\d+) (?<title>.+)',
          idPattern: '^BM\\d+$',
        },
      ],
    },
    { theme: { accent: '#2f6fed' } },
  ];
  const invalid = [
    { format: 2 },
    { name: '' },
    { name: 'x'.repeat(81) },
    { unknownKey: 1 },
    { docs: { extra: true } },
    { docs: { roadmap: 7 } },
    { staleAfterDays: 0 },
    { staleAfterDays: 366 },
    { staleAfterDays: 1.5 },
    { requireDoneRef: 'yes' },
    { git: { activityWeeks: 99 } },
    { git: { branches: { live: '../evil' } } },
    { git: { branches: { live: '-x' } } },
    { git: { areas: ['/etc'] } },
    { git: { areas: ['a/../b'] } },
    { theme: { accent: 'red' } },
    { theme: { accent: '#12345' } },
    { theme: { mode: 'neon' } },
    { theme: { density: 'tiny' } },
    { tracks: [{ id: 'Bad Id', title: 'T', file: 'f' }] },
    { tracks: [{ id: 'ok', title: 'T' }] },
    { tracks: {} },
    { idPattern: '(' },
    { output: { dir: '' } },
  ];
  it.each(valid)('accepts %j, as the loader does', (c) => {
    expect(validateCfg(c), JSON.stringify(validateCfg.errors?.slice(0, 2))).toBe(true);
    expect(validateConfig(c).problems).toEqual([]);
  });
  it.each(invalid)('rejects %j, as the loader does', (c) => {
    expect(validateCfg(c)).toBe(false);
    expect(validateConfig(c).problems.length).toBeGreaterThan(0);
  });
  it('accepts the config files in this repository', () => {
    const files = [
      'opmap.config.json',
      'examples/tidepool/opmap.config.json',
      'templates/opmap.config.json',
    ];
    for (const f of files) {
      const c = JSON.parse(read(f).replace(/\{\{(\w+)\}\}/g, 'x'));
      expect(validateCfg(c), `${f}: ${JSON.stringify(validateCfg.errors?.slice(0, 2))}`).toBe(true);
    }
  });
  it('is the file the $schema lines point to', () => {
    expect(readdirSync('schema').sort()).toEqual(['config.v1.json', 'project-data.v1.json']);
    expect(JSON.parse(read('opmap.config.json')).$schema).toBe('./schema/config.v1.json');
  });
});

describe('opmap export', () => {
  const run = (args: string[]) => {
    let out = '';
    let err = '';
    const code = main(['export', ...args, '--no-git', '--now', '2026-11-25'], {
      stdout: (s) => (out += s),
      stderr: (s) => (err += s),
      env: {},
      cwd: process.cwd(),
      isTTY: false,
      open: () => undefined,
      ask: async () => '',
    });
    return { code, out, err };
  };
  it('prints the project data as compact JSON that matches the schema', () => {
    const r = run(['-C', 'examples/tidepool']);
    expect(r.code).toBe(0);
    expect(r.out.endsWith('\n')).toBe(true);
    expect(r.out.trimEnd().split('\n')).toHaveLength(1);
    const data = JSON.parse(r.out);
    expect(data).toMatchObject({
      schema: 'openprojectmap/project-data@1',
      project: { title: 'Tidepool' },
    });
    expect(validateData(data)).toBe(true);
  });
  it('--pretty indents, and --json is accepted', () => {
    const r = run(['-C', 'examples/tidepool', '--pretty', '--json']);
    expect(r.out.startsWith('{\n  "schema"')).toBe(true);
  });
  it('still prints the data but exits 1 for errors, or for warnings with --strict', () => {
    expect(run(['-C', 'examples/tidepool', '--strict']).code).toBe(1); // Tidepool has an overdue decision at this date
    expect(run(['-C', 'examples/tidepool', '--max-warnings', '5']).code).toBe(0);
    expect(run(['-C', 'examples/tidepool', '--max-warnings', 'x']).code).toBe(2);
    expect(
      JSON.parse(run(['-C', 'examples/tidepool', '--strict']).out).diagnostics.length,
    ).toBeGreaterThan(0);
  });
  it('rejects stray arguments', () => {
    expect(run(['extra', '-C', 'examples/tidepool']).code).toBe(2);
  });
});
