import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import {
  CSV_MAX_ROWS,
  buildDraft,
  cleanText,
  fromCsv,
  fromGithub,
  mapStatus,
  parseCsv,
  parseProject,
} from '../../src/core/index.js';
import { PAGE_SIZE, ghList, isSafeRepo, repoFromRemote } from '../../src/node/gh.js';
import { importCsv, importGithub } from '../../src/node/import.js';

const TODAY = '2026-11-25';
const parse = (text: string) =>
  parseProject({ roadmap: { path: 'ROADMAP.import.md', text } }, { now: TODAY });

describe('cleanText', () => {
  it('makes one inert line', () => {
    expect(cleanText('a\nb\r\nc\td')).toBe('a b c d');
    expect(cleanText('x | y')).toBe('x / y');
    expect(cleanText('**bold** `code` \\')).toBe('bold code');
    expect(cleanText('### Heading')).toBe('Heading');
    expect(cleanText('- item')).toBe('item');
    expect(cleanText('a b‮c\u0000d')).toBe('a b c d');
    expect(cleanText(42)).toBe('');
    expect(cleanText('x'.repeat(500)).length).toBe(200);
  });
});

describe('mapStatus', () => {
  it.each([
    ['Done', 'done'],
    ['In Progress', 'doing'],
    ['In review', 'review'],
    ['Blocked', 'blocked'],
    ['Backlog', 'parked'],
    ['To Do', 'todo'],
    ['Open', 'todo'],
    ['Closed', 'done'],
  ])('%s -> %s', (word, status) => {
    expect(mapStatus(word)).toEqual({ status, guessed: false });
  });
  it('guesses for a word it does not know', () => {
    expect(mapStatus('Zorb')).toEqual({ status: 'todo', guessed: true });
    expect(mapStatus('', true)).toEqual({ status: 'done', guessed: false });
  });
});

const MILESTONES = [
  {
    number: 2,
    title: 'v0.2.0 Reminders',
    description: 'Nudges.\nSecond line',
    created_at: '2026-10-01T00:00:00Z',
    due_on: '2026-12-01T00:00:00Z',
  },
  {
    number: 1,
    title: 'First beta',
    description: null,
    created_at: '2026-09-01T00:00:00Z',
    due_on: null,
  },
];
const ISSUES = [
  {
    number: 11,
    title: 'Streak counter',
    state: 'closed',
    closed_at: '2026-11-02T10:00:00Z',
    labels: [{ name: 'feature' }],
    assignee: { login: 'ana' },
    milestone: { number: 2 },
  },
  {
    number: 12,
    title: 'Reminder time picker',
    state: 'open',
    labels: [{ name: 'in progress' }],
    assignee: null,
    milestone: { number: 2 },
  },
  {
    number: 13,
    title: 'Widgets',
    state: 'closed',
    state_reason: 'not_planned',
    closed_at: '2026-11-03T00:00:00Z',
    labels: [],
    milestone: null,
  },
  { number: 14, title: 'Dark mode', state: 'open', labels: [], milestone: { number: 1 } },
  {
    number: 15,
    title: 'A pull request',
    state: 'open',
    pull_request: {},
    labels: [],
    milestone: null,
  },
  { number: 16, title: 'No milestone idea', state: 'open', labels: ['idea'], milestone: null },
];

describe('GitHub draft', () => {
  const input = fromGithub('acme/app', MILESTONES, ISSUES, { today: TODAY });
  const draft = buildDraft(input);

  it('has versions in due order, deliverables, and a Parked table', () => {
    expect(draft.versions).toBe(2);
    expect(draft.deliverables).toBe(3);
    expect(draft.parked).toBe(2);
    expect(draft.text).toContain('### v0.2.0 — Reminders');
    expect(draft.text).toContain('### v0.1.0 — First beta');
    expect(draft.text).toContain(
      '| 0.2.0-D1 | **Streak counter** | done 2026-11-02 (#11) | labels: feature; owner ana |',
    );
    expect(draft.text).toContain('| 0.2.0-D2 | **Reminder time picker** | doing (#12) |');
    expect(draft.text).toContain('**Window:** 2026-10-01 → 2026-12-01');
    expect(draft.text).toContain('| Widgets | from #13 | |');
    expect(draft.text).toContain('1 pull request was left out.');
  });

  it('parses as a roadmap with no errors', () => {
    const d = parse(draft.text);
    expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
    expect(d.versions.map((v) => v.id)).toEqual(['v0.2.0', 'v0.1.0']);
    expect(d.versions.flatMap((v) => v.deliverables)).toHaveLength(3);
    expect(d.parked).toHaveLength(2);
  });

  it('milestones only leaves out the issues', () => {
    const d = buildDraft(
      fromGithub('acme/app', MILESTONES, ISSUES, { today: TODAY, milestonesOnly: true }),
    );
    expect(d.deliverables).toBe(0);
    expect(d.parked).toBe(0);
  });

  it('keeps hostile text from opening a row, heading or block', () => {
    const evil = {
      number: 99,
      title: 'x |\n### v9.9.9 — Evil\n| 9.9.9-D1 | **Owned** | done |\n<script>alert(1)</script>',
      state: 'open',
      labels: [{ name: '`|`\n## Parked' }],
      milestone: { number: 2 },
    };
    const d = parse(
      buildDraft(fromGithub('acme/app', [MILESTONES[0]], [evil], { today: TODAY })).text,
    );
    expect(d.versions.map((v) => v.id)).toEqual(['v0.2.0']);
    expect(d.versions[0]?.deliverables).toHaveLength(1);
    expect(d.parked).toEqual([]);
    expect(d.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('ignores junk in the API answer', () => {
    const d = buildDraft(
      fromGithub('acme/app', [null, 'x', { number: 'n' }], [1, null, {}], { today: TODAY }),
    );
    expect(d.versions + d.deliverables + d.parked).toBe(0);
  });

  it('caps the number of issues', () => {
    const many = Array.from({ length: 1005 }, (_, i) => ({
      number: i + 1,
      title: `t${i}`,
      state: 'open',
      labels: [],
      milestone: null,
    }));
    const i = fromGithub('a/b', [], many, { today: TODAY });
    expect(i.items).toHaveLength(1000);
    expect(i.notes?.join(' ')).toContain('first 1000');
  });
});

describe('CSV', () => {
  it('reads quotes, escaped quotes, newlines in cells, CRLF and a BOM', () => {
    const rows = parseCsv(
      '﻿Title,Status,Notes\r\n"Say ""hi"", then go",Done,"two\nlines"\r\nPlain,Todo,\r\n',
    );
    expect(rows).toEqual([
      ['Title', 'Status', 'Notes'],
      ['Say "hi", then go', 'Done', 'two\nlines'],
      ['Plain', 'Todo', ''],
    ]);
  });

  it('guesses a semicolon or tab delimiter', () => {
    expect(parseCsv('a;b\n1;2')[1]).toEqual(['1', '2']);
    expect(parseCsv('a\tb\n1\t2')[1]).toEqual(['1', '2']);
  });

  it('stops at the row cap', () => {
    const big = `title\n${'x\n'.repeat(CSV_MAX_ROWS + 5)}`;
    expect(() => parseCsv(big)).toThrow(RangeError);
  });

  it('builds a draft from Jira-like columns', () => {
    const rows = parseCsv(
      'Issue key,Summary,Status,Sprint,Assignee,Resolved\nAPP-1,Login screen,Done,Sprint 1,ana,2026-11-03\nAPP-2,Push tokens,In Progress,Sprint 1,,\nAPP-3,Idea,Zorb,,,\n',
    );
    const input = fromCsv('issues.csv', rows, { today: TODAY });
    const draft = buildDraft(input);
    expect(draft.versions).toBe(1);
    expect(draft.deliverables).toBe(2);
    expect(draft.parked).toBe(1);
    expect(draft.text).toContain('### v0.1.0 — Sprint 1');
    expect(draft.text).toContain(
      '| 0.1.0-D1 | **Login screen** | done 2026-11-03 (APP-1) | owner ana |',
    );
    expect(draft.text).toContain('status was "Zorb"');
    expect(parse(draft.text).diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('says what is missing when there is no title column', () => {
    expect(() =>
      fromCsv(
        'x.csv',
        [
          ['foo', 'bar'],
          ['1', '2'],
        ],
        { today: TODAY },
      ),
    ).toThrow(/title column/);
  });
});

describe('gh', () => {
  it('validates repository names', () => {
    expect(isSafeRepo('acme/app')).toBe(true);
    expect(isSafeRepo('acme/app; rm -rf /')).toBe(false);
    expect(isSafeRepo('../etc/passwd')).toBe(false);
    expect(isSafeRepo('acme')).toBe(false);
    expect(isSafeRepo('a/b/c')).toBe(false);
  });

  it('finds the repository in a remote url', () => {
    expect(repoFromRemote('https://github.com/acme/app.git')).toBe('acme/app');
    expect(repoFromRemote('git@github.com:acme/app.git')).toBe('acme/app');
    expect(repoFromRemote('https://x-access-token:abc@github.com/acme/app')).toBe('acme/app');
    expect(repoFromRemote('https://gitlab.com/acme/app.git')).toBeNull();
    expect(repoFromRemote('')).toBeNull();
  });

  it('reads every page, with fixed arguments', () => {
    const calls: string[][] = [];
    const pages = [Array.from({ length: PAGE_SIZE }, (_, i) => ({ n: i })), [{ n: 'last' }]];
    const r = ghList('issues', 'acme/app', (args) => {
      calls.push([...args]);
      return JSON.stringify(pages[calls.length - 1]);
    });
    expect(r.items).toHaveLength(PAGE_SIZE + 1);
    expect(r.truncated).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      'api',
      `repos/acme/app/issues?state=all&sort=created&direction=asc&per_page=${PAGE_SIZE}&page=1`,
    ]);
  });

  it('refuses a bad repo and an answer that is not a list', () => {
    expect(() => ghList('issues', 'a b/c', () => '[]')).toThrow(/owner\/repo/);
    expect(() => ghList('issues', 'a/b', () => '{}')).toThrow(/list/);
    expect(() => ghList('issues', 'a/b', () => 'nope')).toThrow(/JSON/);
  });
});

describe('writing the draft', () => {
  let dir = '';
  const read = (f: string): string => readFileSync(join(dir, 'docs/project', f), 'utf8');
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opmap-import-'));
    cpSync('examples/two-tracks', dir, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const gh = (args: readonly string[]): string =>
    args[1]?.includes('/milestones') ? JSON.stringify(MILESTONES) : JSON.stringify(ISSUES);

  it('writes ROADMAP.import.md next to the roadmap and leaves the roadmap alone', () => {
    const before = read('ROADMAP.md');
    const r = importGithub({ cwd: dir, repo: 'acme/app', now: TODAY, env: {}, gh });
    expect(r).toMatchObject({
      path: 'docs/project/ROADMAP.import.md',
      written: true,
      deliverables: 3,
    });
    expect(read('ROADMAP.import.md')).toContain('# Draft: imported from GitHub acme/app');
    expect(read('ROADMAP.md')).toBe(before);
  });

  it('refuses to overwrite a draft without --force', () => {
    importGithub({ cwd: dir, repo: 'acme/app', now: TODAY, env: {}, gh });
    expect(() => importGithub({ cwd: dir, repo: 'acme/app', now: TODAY, env: {}, gh })).toThrow(
      /already exists/,
    );
    expect(
      importGithub({ cwd: dir, repo: 'acme/app', now: TODAY, env: {}, gh, force: true }).written,
    ).toBe(true);
  });

  it('with --force it replaces a link at that name instead of writing through it', () => {
    const victim = join(dir, 'victim.txt');
    writeFileSync(victim, 'keep me');
    symlinkSync(victim, join(dir, 'docs/project/ROADMAP.import.md'));
    expect(() => importGithub({ cwd: dir, repo: 'acme/app', now: TODAY, env: {}, gh })).toThrow(
      /already exists/,
    );
    importGithub({ cwd: dir, repo: 'acme/app', now: TODAY, env: {}, gh, force: true });
    expect(readFileSync(victim, 'utf8')).toBe('keep me');
    expect(read('ROADMAP.import.md')).toContain('# Draft: imported from GitHub');
  });

  it('a dry run writes nothing', () => {
    const r = importGithub({ cwd: dir, repo: 'acme/app', now: TODAY, env: {}, gh, dryRun: true });
    expect(r.written).toBe(false);
    expect(existsSync(join(dir, 'docs/project/ROADMAP.import.md'))).toBe(false);
  });

  it('needs a repository when the git remote does not say', () => {
    expect(() => importGithub({ cwd: dir, now: TODAY, env: {}, gh })).toThrow(
      /Could not tell which GitHub repository/,
    );
  });

  it('imports a CSV file through the CLI and explains the draft', () => {
    writeFileSync(
      join(dir, 'tasks.csv'),
      'Title,Status,Release\nSign the app,Done,Launch\nWrite docs,Todo,Launch\n',
    );
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
    expect(main(['import', 'csv', 'tasks.csv', '--now', TODAY], io)).toBe(0);
    expect(out).toContain(
      'wrote docs/project/ROADMAP.import.md: 1 version, 2 deliverables, 0 parked',
    );
    expect(out).toContain('Nothing else was changed');
    expect(main(['import', 'csv', 'tasks.csv'], io)).toBe(2);
    expect(err).toContain('already exists');
    expect(main(['import', 'csv', 'tasks.csv', '--dry-run'], io)).toBe(0);
    expect(main(['import'], io)).toBe(2);
    expect(main(['import', 'jira'], io)).toBe(2);
    expect(main(['import', 'csv'], io)).toBe(2);
    expect(main(['import', 'github', 'extra'], io)).toBe(2);
  });

  it('reports a missing or oversized CSV file', () => {
    expect(() => importCsv({ cwd: dir, file: join(dir, 'nope.csv'), env: {} })).toThrow(
      /could not be read/,
    );
  });
});
