import {
  cpSync,
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
import { main } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import { splitLines } from '../../src/node/editor.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-author-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));

let n = 0;
/** A fresh copy of the Tidepool example, as a git repo. */
function tidepool(): string {
  const dir = join(base, `t${n++}`);
  cpSync('examples/tidepool', dir, { recursive: true });
  mkdirSync(join(dir, '.git'));
  return dir;
}
const NOW = '2026-11-16';

function run(dir: string, args: string[], over: Partial<Io> = {}) {
  let out = '';
  let err = '';
  const code = main([...args, '-C', dir, ...(args.includes('--now') ? [] : ['--now', NOW])], {
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
}
const read = (dir: string, f = 'docs/project/ROADMAP.md'): string =>
  readFileSync(join(dir, f), 'utf8');

/** Line numbers that differ, plus how many lines were added or removed. */
function lineDiff(a: string, b: string): { changed: number; delta: number } {
  const x = splitLines(a).lines;
  const y = splitLines(b).lines;
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (
    suf < x.length - pre &&
    suf < y.length - pre &&
    x[x.length - 1 - suf] === y[y.length - 1 - suf]
  )
    suf++;
  return {
    changed: Math.max(x.length - pre - suf, y.length - pre - suf),
    delta: y.length - x.length,
  };
}

describe('set-status', () => {
  it('changes one cell and says so', () => {
    const dir = tidepool();
    const before = read(dir);
    const r = run(dir, [
      'set-status',
      '0.2.0-D2',
      'done',
      '--date',
      '2026-11-16',
      '--ref',
      '#21',
      '--note',
      'merged',
    ]);
    expect(r).toMatchObject({ code: 0, out: 'updated docs/project/ROADMAP.md: 0.2.0-D2 → done\n' });
    const after = read(dir);
    expect(after).toContain('done 2026-11-16 (#21)');
    expect(lineDiff(before, after)).toEqual({ changed: 1, delta: 0 });
  });
  it('--dry-run prints the diff and changes nothing', () => {
    const dir = tidepool();
    const before = read(dir);
    const r = run(dir, ['set-status', '0.2.0-D2', 'review', '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('--- a/docs/project/ROADMAP.md');
    expect(r.out).toMatch(/\n\+\| 0\.2\.0-D2 .*\| review \|/);
    expect(r.out).toContain('(dry run: docs/project/ROADMAP.md was not changed)');
    expect(read(dir)).toBe(before);
  });
  it('accepts status aliases and writes the canonical word', () => {
    const dir = tidepool();
    run(dir, ['set-status', '0.2.0-D3', 'in progress']);
    expect(read(dir)).toMatch(/\| 0\.2\.0-D3 .*\| doing/);
  });
  it('says nothing to change when the cell already has the value', () => {
    const dir = tidepool();
    expect(run(dir, ['set-status', '0.2.0-D3', 'todo']).out).toBe(
      'nothing to change in docs/project/ROADMAP.md\n',
    );
  });
  it('reports bad input: unknown ID (1), bad status, bad date, missing arguments, extra arguments (2)', () => {
    const dir = tidepool();
    const missing = run(dir, ['set-status', '9.9.9-D1', 'done']);
    expect(missing).toMatchObject({ code: 1 });
    expect(missing.err).toContain('There is no deliverable 9.9.9-D1');
    expect(run(dir, ['set-status', '0.2.0-D2', 'finished'])).toMatchObject({ code: 2 });
    expect(run(dir, ['set-status', '0.2.0-D2', 'finished']).err).toContain(
      'use todo, doing, review, blocked, done or parked',
    );
    expect(run(dir, ['set-status', '0.2.0-D2', 'done', '--date', 'soon']).code).toBe(2);
    expect(run(dir, ['set-status']).err).toContain('missing <ID>');
    expect(run(dir, ['set-status', '0.2.0-D2']).err).toContain('missing <status>');
    expect(run(dir, ['set-status', '0.2.0-D2', 'done', 'extra']).err).toContain(
      'unexpected argument "extra"',
    );
  });
  it('refuses an edit that would add a problem, when done needs a reference', () => {
    const dir = tidepool();
    writeFileSync(
      join(dir, 'opmap.config.json'),
      readFileSync(join(dir, 'opmap.config.json'), 'utf8').replace(
        '"format": 1,',
        '"format": 1,\n  "requireDoneRef": true,',
      ),
    );
    const r = run(dir, ['set-status', '0.2.0-D3', 'done']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('would add a problem');
    expect(r.err).toContain('OPM-W305');
    expect(run(dir, ['set-status', '0.2.0-D3', 'done', '--ref', '#9']).code).toBe(0);
  });
});

describe('add', () => {
  it('adds a deliverable with the next ID', () => {
    const dir = tidepool();
    const before = read(dir);
    const r = run(dir, [
      'add',
      'v0.2.0',
      'Weekly summary email',
      '--status',
      'doing',
      '--notes',
      'nice to have',
    ]);
    expect(r.out).toBe('updated docs/project/ROADMAP.md: added 0.2.0-D6\n');
    expect(read(dir)).toMatch(/\| 0\.2\.0-D6 \| Weekly summary email \| doing \| nice to have/);
    expect(lineDiff(before, read(dir))).toEqual({ changed: 1, delta: 1 });
  });
  it('rejects a bad status, an unknown version and missing text', () => {
    const dir = tidepool();
    expect(run(dir, ['add', 'v0.2.0', 'x', '--status', 'later']).code).toBe(2);
    expect(run(dir, ['add', 'v9.0.0', 'x']).code).toBe(1);
    expect(run(dir, ['add', 'v0.2.0']).err).toContain('missing <deliverable>');
  });
});

describe('new-version', () => {
  it('adds a version block that parses with no new warnings', () => {
    const dir = tidepool();
    const r = run(dir, [
      'new-version',
      '0.5.0',
      '--title',
      'Teams',
      '--window',
      '2027-03',
      '--goal',
      'Share streaks.',
      '--exit',
      '10 teams.',
    ]);
    expect(r.out).toBe('updated docs/project/ROADMAP.md: added v0.5.0\n');
    expect(read(dir)).toContain('### v0.5.0 — Teams');
    expect(run(dir, ['check', '--strict']).code).toBe(0);
  });
  it('adds after a chosen version, and rejects duplicates, bad numbers and a missing title', () => {
    const dir = tidepool();
    run(dir, ['new-version', 'v0.2.5', '--title', 'Patch', '--after', 'v0.2.0']);
    const text = read(dir);
    expect(text.indexOf('### v0.2.5')).toBeLessThan(text.indexOf('### v0.3.0'));
    expect(run(dir, ['new-version', '0.2.5', '--title', 'x']).code).toBe(1);
    expect(run(dir, ['new-version', '1.0', '--title', 'x']).err).toContain('not a version');
    expect(run(dir, ['new-version', '0.9.0']).err).toContain('needs --title');
  });
});

describe('log', () => {
  it('adds a dated status line after the last one', () => {
    const dir = tidepool();
    const r = run(dir, ['log', 'v0.2.0', 'permission flow merged.', '--date', '2026-11-16']);
    expect(r.out).toBe('updated docs/project/ROADMAP.md: v0.2.0: logged 2026-11-16\n');
    expect(read(dir)).toContain('**Status 2026-11-16:** permission flow merged.');
  });
  it('defaults to today and refuses an older date than the last line', () => {
    const dir = tidepool();
    expect(run(dir, ['log', 'v0.2.0', 'today.']).out).toContain('logged 2026-11-16');
    const old = run(dir, ['log', 'v0.2.0', 'too old.', '--date', '2026-01-01']);
    expect(old.code).toBe(1);
    expect(old.err).toContain('OPM-W205');
  });
});

describe('now', () => {
  it('always sets Updated, and sets the other fields and facts', () => {
    const dir = tidepool();
    const before = read(dir);
    const r = run(dir, [
      'now',
      '--next',
      'Finish reminders.',
      '--why',
      'They drive retention.',
      '--fact',
      'Beta users=30',
    ]);
    expect(r.out).toBe(
      'updated docs/project/ROADMAP.md: Now block updated (Next step, Why, Beta users, Updated)\n',
    );
    const after = read(dir);
    expect(after).toContain('**Updated:** 2026-11-16');
    expect(after).toContain('**Next step:** Finish reminders.');
    expect(after).toContain('**Why:** They drive retention.');
    expect(after).toContain('**Beta users:** 30');
    expect(lineDiff(before, after).changed).toBeLessThanOrEqual(8);
  });
  it('with no flags it only touches Updated', () => {
    const dir = tidepool();
    const before = read(dir);
    const r = run(dir, ['now', '--now', '2026-11-18']);
    expect(r.out).toContain('(Updated)');
    expect(lineDiff(before, read(dir))).toEqual({ changed: 1, delta: 0 });
  });
  it('sets the current version, and rejects a bad fact', () => {
    const dir = tidepool();
    run(dir, ['now', '--current', 'v0.3.0']);
    expect(read(dir)).toContain('**Current version:** v0.3.0');
    expect(run(dir, ['now', '--fact', 'nokeyvalue']).code).toBe(2);
    expect(run(dir, ['now', 'extra']).code).toBe(2);
  });
});

describe('decide', () => {
  it('records the outcome in the decisions file', () => {
    const dir = tidepool();
    const before = read(dir, 'docs/project/DECISIONS.md');
    const r = run(dir, ['decide', 'D1', 'Both, decided 2026-11-16.']);
    expect(r.out).toBe('updated docs/project/DECISIONS.md: D1 → decided\n');
    const after = read(dir, 'docs/project/DECISIONS.md');
    expect(after).toMatch(/\| D1 \|.*\| decided \| Both, decided 2026-11-16\. \|/);
    expect(lineDiff(before, after)).toEqual({ changed: 1, delta: 0 });
  });
  it('--defaulted marks it defaulted, and an unknown ID fails', () => {
    const dir = tidepool();
    run(dir, ['decide', 'D2', 'Nobody decided by 2026-11-20.', '--defaulted']);
    expect(read(dir, 'docs/project/DECISIONS.md')).toMatch(/\| D2 \|.*\| defaulted \|/);
    expect(run(dir, ['decide', 'D9', 'x']).code).toBe(1);
    expect(run(dir, ['decide', 'D1']).err).toContain('missing <outcome>');
  });
});

describe('a full session close-out with commands only', () => {
  it('changes only the intended lines and leaves zero warnings', () => {
    const dir = tidepool();
    const roadmap = read(dir);
    const decisions = read(dir, 'docs/project/DECISIONS.md');
    const steps = [
      ['set-status', '0.2.0-D2', 'done', '--date', '2026-11-16', '--ref', '#22'],
      ['set-status', '0.2.0-D3', 'doing'],
      ['add', 'v0.2.0', 'Reminder sound options'],
      ['log', 'v0.2.0', 'streak reminder merged; quiet hours next.'],
      ['now', '--next', 'Build quiet hours (0.2.0-D3).', '--why', 'Testers asked for it.'],
    ];
    for (const s of steps) expect(run(dir, s).code, s.join(' ')).toBe(0);
    expect(run(dir, ['decide', 'D2', 'Wait, decided 2026-11-16.']).code).toBe(0);
    const d = lineDiff(roadmap, read(dir));
    expect(d.delta).toBe(2); // one new row and one new status line
    expect(lineDiff(decisions, read(dir, 'docs/project/DECISIONS.md'))).toEqual({
      changed: 1,
      delta: 0,
    });
    const check = run(dir, ['check', '--strict', '--format', 'json']);
    expect(check.code).toBe(0);
    expect(JSON.parse(check.out).summary).toMatchObject({ errors: 0, warnings: 0 });
  });
});

describe('help', () => {
  it('lists the editing commands', () => {
    const r = run(tidepool(), ['--help']);
    for (const c of ['set-status', 'new-version', 'decide', '--dry-run'])
      expect(r.out).toContain(c);
  });
});
