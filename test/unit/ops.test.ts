import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryCheck, queryGet, queryList, queryNow } from '../../src/core/index.js';
import { buildData } from '../../src/node/build.js';
import { opDecide, opLog, opSetStatus, opUpdateNow } from '../../src/node/ops.js';
import { EditError } from '../../src/node/editor.js';

let dir = '';
const NOW = '2026-11-25';
const ctx = () => ({ cwd: dir, now: NOW, env: {} });
const data = () => buildData({ cwd: dir, now: NOW, git: false }).data;
const read = (f: string): string => readFileSync(join(dir, 'docs/project', f), 'utf8');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'opmap-ops-'));
  cpSync('examples/two-tracks', dir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('editing operations across the roadmap and tracks', () => {
  it('sets the status of a roadmap deliverable', () => {
    const r = opSetStatus(ctx(), {
      id: '0.2.0-D2',
      status: 'done',
      date: '2026-11-24',
      ref: '#12',
    });
    expect(r.changed).toBe(true);
    expect(read('ROADMAP.md')).toContain(
      '| 0.2.0-D2 | **Sensor calibration** | done 2026-11-24 (#12) |',
    );
    expect(read('BUSINESS.md')).not.toContain('2026-11-24');
  });

  it('sets the status of a track deliverable, in the track file only', () => {
    const r = opSetStatus(ctx(), { id: 'BM1-S1', status: 'done', date: '2026-11-24', ref: '#13' });
    expect(r.path).toBe('docs/project/BUSINESS.md');
    expect(read('BUSINESS.md')).toContain(
      '| BM1-S1 | **Store listing** and screenshots | done 2026-11-24 (#13) |',
    );
    expect(data().tracks[0]?.versions[1]?.deliverables[0]?.status).toBe('done');
  });

  it('refuses an unknown id and leaves the files alone', () => {
    const before = read('ROADMAP.md');
    expect(() => opSetStatus(ctx(), { id: 'BM9-S9', status: 'done' })).toThrow(EditError);
    expect(read('ROADMAP.md')).toBe(before);
  });

  it('adds a status line to a track block and to a roadmap version', () => {
    opLog(ctx(), { version: 'BM1', text: 'Listing drafted.', date: '2026-11-24' });
    expect(read('BUSINESS.md')).toContain('**Status 2026-11-24:** Listing drafted.');
    opLog(ctx(), { version: 'v0.2.0', text: 'Calibration under test.' });
    expect(read('ROADMAP.md')).toContain('**Status 2026-11-25:** Calibration under test.');
    expect(data().diagnostics).toEqual([]);
  });

  it('refuses a status line for a block that does not exist', () => {
    expect(() => opLog(ctx(), { version: 'BM7', text: 'x' })).toThrow(
      /no block BM7|no version BM7/,
    );
  });

  it('records a decision', () => {
    opDecide(ctx(), { id: 'D1', outcome: 'Free, with a $2 tip jar.' });
    expect(data().decisions[0]).toMatchObject({ id: 'D1', status: 'decided' });
    expect(() => opDecide(ctx(), { id: 'D9', outcome: 'x' })).toThrow(EditError);
  });

  it('updates the Now block and sets Updated to today', () => {
    const { fields } = opUpdateNow(ctx(), { next: 'Write the launch post (BM1-S2).' });
    expect(fields).toEqual(['Next step', 'Updated']);
    expect(data().now).toMatchObject({ updated: NOW, nextStep: 'Write the launch post (BM1-S2).' });
  });

  it('does not write on a dry run', () => {
    const before = read('BUSINESS.md');
    const r = opSetStatus({ ...ctx(), dryRun: true }, { id: 'BM1-S2', status: 'doing' });
    expect(r.diff).toContain('-| BM1-S2');
    expect(read('BUSINESS.md')).toBe(before);
  });

  it('a full session close-out leaves no warnings', () => {
    opSetStatus(ctx(), { id: '0.2.0-D2', status: 'done', date: NOW, ref: '#14' });
    opSetStatus(ctx(), { id: 'BM1-S1', status: 'done', date: NOW, ref: '#15' });
    opLog(ctx(), { version: 'v0.2.0', text: 'Calibration done.', date: NOW });
    opUpdateNow(ctx(), { next: 'Start the dim curve settings (0.2.0-D3).' });
    const check = queryCheck(data());
    expect(check.errors + check.warnings).toBe(0);
  });
});

describe('queries', () => {
  it('summarises the Now block', () => {
    const n = queryNow(data());
    expect(n).toMatchObject({ project: 'Lantern', updated: '2026-11-20' });
    expect(n.currentVersion?.id).toBe('v0.2.0');
    expect(n.needsYourCall.map((d) => d.id)).toEqual(['D1']);
  });

  it('lists deliverables across the roadmap and tracks, with filters and a limit', () => {
    const all = queryList(data());
    expect(all.total).toBe(10);
    expect(queryList(data(), { status: ['doing'] }).deliverables.map((d) => d.id)).toEqual([
      '0.2.0-D2',
      'BM1-S1',
    ]);
    expect(queryList(data(), { version: 'BM1' }).deliverables).toHaveLength(3);
    expect(queryList(data(), { q: 'launch post' }).deliverables.map((d) => d.track)).toEqual([
      'business',
    ]);
    expect(queryList(data(), { limit: 2 })).toMatchObject({ total: 10, shown: 2 });
    expect(queryList(data(), { limit: 9999 }).shown).toBe(10);
  });

  it('gets any kind of item by id', () => {
    const d = data();
    expect(queryGet(d, 'BM1-S2')).toMatchObject({ kind: 'deliverable' });
    expect(queryGet(d, 'v0.2.0')).toMatchObject({ kind: 'version' });
    expect(queryGet(d, '0.2.0')).toMatchObject({ kind: 'version' });
    expect(queryGet(d, 'BM0')).toMatchObject({ kind: 'version' });
    expect(queryGet(d, 'D1')).toMatchObject({ kind: 'decision' });
    expect(queryGet(d, 'nope')).toBeNull();
  });
});

describe('input that tries to change the structure of the docs', () => {
  it('refuses a Now field name that could end the marker or start a heading', () => {
    const before = read('ROADMAP.md');
    for (const key of [
      'A:**\n\n### v9.9.9 — Evil\n\n**B',
      '**Next step',
      'Next step:** hijack **X',
      'a'.repeat(61),
      '',
      '1abc',
    ])
      expect(() => opUpdateNow(ctx(), { facts: [[key, 'v']] }), key).toThrow(EditError);
    expect(read('ROADMAP.md')).toBe(before);
    opUpdateNow(ctx(), { facts: [['Beta users', '40']] });
    expect(read('ROADMAP.md')).toContain('**Beta users:** 40');
  });

  it('refuses a reference that could close the cell’s parenthesis or split the row', () => {
    const before = read('ROADMAP.md');
    for (const ref of ['#1) | x |', '#1)', '(x', 'a|b', '#1\n#2'])
      expect(
        () => opSetStatus(ctx(), { id: '0.2.0-D3', status: 'done', date: NOW, ref }),
        ref,
      ).toThrow(EditError);
    expect(read('ROADMAP.md')).toBe(before);
    opSetStatus(ctx(), {
      id: '0.2.0-D3',
      status: 'done',
      date: NOW,
      ref: 'https://github.com/o/r/pull/7',
    });
    expect(data().diagnostics).toEqual([]);
  });
});
