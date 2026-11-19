import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyEdit, writeAtomic } from '../../src/node/edit-file.js';
import type { EditRequest } from '../../src/node/edit-file.js';
import {
  EditError,
  appendStatusLine,
  setDeliverableStatus,
  setDecision,
  setNowField,
} from '../../src/node/editor.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-edit-')));
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
**Status 2026-11-17:** planned.

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.1.0-D1 | One | todo | |
| 0.1.0-D2 | Two | doing | |
`;
const DECISIONS = `<!-- opmap: 1 -->
# D

## Decisions

| ID | Decision | Default | Needed by | Status | Outcome |
| --- | --- | --- | --- | --- | --- |
| D1 | Which? | A | 2026-12-01 | open | |
`;

let n = 0;
function project(config = '{}'): string {
  const dir = join(base, `p${n++}`);
  mkdirSync(join(dir, 'docs/project'), { recursive: true });
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, 'docs/project/ROADMAP.md'), ROADMAP);
  writeFileSync(join(dir, 'docs/project/DECISIONS.md'), DECISIONS);
  writeFileSync(join(dir, 'opmap.config.json'), config);
  return dir;
}
const roadmap = (dir: string): string => readFileSync(join(dir, 'docs/project/ROADMAP.md'), 'utf8');
const req = (
  dir: string,
  over: Partial<EditRequest> & Pick<EditRequest, 'transform'>,
): EditRequest => ({
  cwd: dir,
  env: {},
  now: '2026-11-18',
  file: 'roadmap',
  ...over,
});

describe('applyEdit', () => {
  it('writes the edit, returns a diff and the re-parsed project', () => {
    const dir = project();
    const r = applyEdit(
      req(dir, {
        transform: (t: string) =>
          setDeliverableStatus(t, '0.1.0-D1', { status: 'done', date: '2026-11-18' }),
        expect: (d) =>
          d.versions[0]?.deliverables[0]?.status === 'done' ? null : 'the status is not done',
      }),
    );
    expect(r).toMatchObject({ changed: true, path: 'docs/project/ROADMAP.md' });
    expect(r.diff).toContain('-| 0.1.0-D1 | One | todo | |');
    expect(r.diff).toContain('+| 0.1.0-D1 | One | done 2026-11-18 | |');
    expect(roadmap(dir)).toContain('| 0.1.0-D1 | One | done 2026-11-18 | |');
    expect(r.after.versions[0]?.deliverables[0]?.status).toBe('done');
  });
  it('--dry-run prints the diff and leaves the file alone', () => {
    const dir = project();
    const r = applyEdit(
      req(dir, { dryRun: true, transform: (t: string) => setNowField(t, 'Next step', 'Ship.') }),
    );
    expect(r.changed).toBe(true);
    expect(r.diff).toContain('+**Next step:** Ship.');
    expect(roadmap(dir)).toBe(ROADMAP);
  });
  it('reports no change when the text is the same', () => {
    const dir = project();
    const r = applyEdit(req(dir, { transform: (t: string) => t }));
    expect(r).toMatchObject({ changed: false, diff: '' });
  });
  it('edits the decisions file', () => {
    const dir = project();
    applyEdit(
      req(dir, {
        file: 'decisions',
        transform: (t: string) => setDecision(t, 'D1', 'decided', 'A, 2026-11-18'),
      }),
    );
    expect(readFileSync(join(dir, 'docs/project/DECISIONS.md'), 'utf8')).toContain(
      '| D1 | Which? | A | 2026-12-01 | decided | A, 2026-11-18 |',
    );
  });
  it('refuses an edit that adds a problem, and changes nothing', () => {
    const dir = project('{ "requireDoneRef": true }');
    expect(() =>
      applyEdit(
        req(dir, {
          transform: (t: string) => setDeliverableStatus(t, '0.1.0-D1', { status: 'done' }),
        }),
      ),
    ).toThrow(/would add a problem.*OPM-W305/s);
    expect(roadmap(dir)).toBe(ROADMAP);
    expect(readdirSync(join(dir, 'docs/project')).filter((f) => f.includes('.tmp'))).toEqual([]);
  });
  it('refuses a status line that breaks the date order', () => {
    const dir = project();
    expect(() =>
      applyEdit(
        req(dir, {
          transform: (t: string) => appendStatusLine(t, 'v0.1.0', '2026-01-01', 'older'),
        }),
      ),
    ).toThrow(/OPM-W205/);
  });
  it('refuses an edit that does not produce the intended value', () => {
    const dir = project();
    expect(() =>
      applyEdit(
        req(dir, {
          transform: (t: string) => setNowField(t, 'Next step', 'x'),
          expect: () => 'wrong value',
        }),
      ),
    ).toThrow('intended result (wrong value)');
    expect(roadmap(dir)).toBe(ROADMAP);
  });
  it('passes through editor errors and rejects a missing decisions file', () => {
    const dir = project();
    expect(() =>
      applyEdit(
        req(dir, { transform: (t: string) => setDeliverableStatus(t, 'nope', { status: 'done' }) }),
      ),
    ).toThrow(EditError);
    writeFileSync(join(dir, 'opmap.config.json'), '{ "docs": { "decisions": null } }');
    expect(() => applyEdit(req(dir, { file: 'decisions', transform: (t: string) => t }))).toThrow(
      'not set up',
    );
  });
  it('tolerates an existing problem and a line-number shift in a message', () => {
    const dir = project();
    writeFileSync(join(dir, 'docs/project/ROADMAP.md'), ROADMAP.replace('| doing |', '| dne |'));
    const r = applyEdit(
      req(dir, { transform: (t: string) => setNowField(t, 'Next step', 'Ship.') }),
    );
    expect(r.changed).toBe(true);
    expect(r.after.diagnostics.some((d) => d.code === 'OPM-W301')).toBe(true);
  });
});

describe('writeAtomic', () => {
  it('replaces the file, keeps its permissions and leaves no temporary file', () => {
    const dir = project();
    const file = join(dir, 'docs/project/ROADMAP.md');
    chmodSync(file, 0o640);
    writeAtomic(file, 'new\n');
    expect(readFileSync(file, 'utf8')).toBe('new\n');
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(readdirSync(join(dir, 'docs/project')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
  it('cleans up and rethrows when the target cannot be replaced', () => {
    const dir = project();
    expect(() => writeAtomic(join(dir, 'docs/project/missing.md'), 'x')).toThrow();
    expect(existsSync(join(dir, 'docs/project/.missing.md.opmap-1.tmp'))).toBe(false);
    expect(readdirSync(join(dir, 'docs/project')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
