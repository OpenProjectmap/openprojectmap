import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, codeInfo, withHints } from '../../src/core/codes.js';
import { OpmapError, parseProject } from '../../src/core/index.js';
import type { Source } from '../../src/core/index.js';

const ROOT = 'test/fixtures/diagnostics';
const NOW = '2026-11-17T00:00:00Z';
/** Codes raised outside the core (config, git). Their fixtures arrive with 0.1.0-D8 and D9. */
const OUTSIDE_CORE = new Set(['OPM-E003', 'OPM-I801', 'OPM-I802', 'OPM-W803']);

const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

function read(dir: string, file: string): Source | undefined {
  const p = join(ROOT, dir, file);
  return existsSync(p) ? { path: file, text: readFileSync(p, 'utf8') } : undefined;
}

function run(dir: string): string[] {
  const optionsPath = join(ROOT, dir, 'options.json');
  const options = existsSync(optionsPath)
    ? (JSON.parse(readFileSync(optionsPath, 'utf8')) as object)
    : {};
  try {
    const data = parseProject(
      {
        roadmap: read(dir, 'ROADMAP.md'),
        decisions: read(dir, 'DECISIONS.md'),
        changelog: read(dir, 'CHANGELOG.md'),
      },
      { now: NOW, ...options },
    );
    return data.diagnostics.map((d) => `${d.code} ${d.file}:${d.line}`);
  } catch (e) {
    if (e instanceof OpmapError) return [`throws ${e.code}`];
    throw e;
  }
}

describe('catalogue', () => {
  it('matches the table in spec 02 §9', () => {
    const spec = readFileSync('docs/spec/02-doc-format.md', 'utf8');
    const section = spec.slice(spec.indexOf('## 9. Diagnostic catalogue'), spec.indexOf('## 10.'));
    const rows = [...section.matchAll(/^\| (OPM-[EWI]\d+) \| ([EWI]) \| (.*?) \| (.*) \|$/gm)].map(
      (m) => ({
        code: m[1],
        severity: { E: 'error', W: 'warning', I: 'info' }[m[2] as 'E' | 'W' | 'I'],
        condition: (m[3] ?? '').replace(/\\\|/g, '|'),
        hint: (m[4] ?? '').replace(/\\\|/g, '|'),
      }),
    );
    expect(CATALOGUE).toEqual(rows);
  });
  it('has unique codes whose letter matches the severity', () => {
    const codes = CATALOGUE.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of CATALOGUE) {
      expect(c.severity).toBe(
        { E: 'error', W: 'warning', I: 'info' }[c.code.charAt(4) as 'E' | 'W' | 'I'],
      );
      expect(c.hint.length).toBeGreaterThan(0);
    }
  });
  it('looks codes up and fills in missing hints only', () => {
    expect(codeInfo('OPM-W201')?.hint).toContain('Window');
    expect(codeInfo('OPM-X999')).toBeUndefined();
    const out = withHints([
      { code: 'OPM-W201', severity: 'warning', message: 'm' },
      { code: 'OPM-W201', severity: 'warning', message: 'm', hint: 'mine' },
      { code: 'OPM-W999' as 'OPM-W201', severity: 'warning', message: 'unknown' },
    ]);
    expect(out.map((d) => d.hint)).toEqual([codeInfo('OPM-W201')?.hint, 'mine', undefined]);
  });
});

describe('diagnostic fixtures', () => {
  it('has a fixture for every code the core can raise', () => {
    const missing = CATALOGUE.map((c) => c.code).filter(
      (c) => !OUTSIDE_CORE.has(c) && !dirs.includes(c),
    );
    expect(missing).toEqual([]);
  });
  it('has no fixture for an unknown code', () => {
    expect(dirs.filter((d) => !codeInfo(d))).toEqual([]);
  });

  for (const dir of dirs) {
    it(`${dir}: raises exactly the expected diagnostics`, () => {
      const actual = run(dir);
      const expectedPath = join(ROOT, dir, 'expected.txt');
      if (process.env['UPDATE_FIXTURES'] === '1')
        writeFileSync(expectedPath, `${actual.join('\n')}\n`);
      const expected = readFileSync(expectedPath, 'utf8')
        .split('\n')
        .filter((l) => l !== '');
      expect(actual).toEqual(expected);
      // The fixture must raise the code it is named after.
      expect(actual.some((l) => l.includes(dir))).toBe(true);
    });
  }
});
