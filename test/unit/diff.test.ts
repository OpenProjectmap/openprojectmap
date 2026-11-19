import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import { DIFF_MARKER, diffProjects, formatDiff } from '../../src/core/diff.js';
import { parseProject } from '../../src/core/index.js';
import { diffRefs } from '../../src/node/diff.js';

const ROADMAP = (status: string, extra = '', now = 'Ship it.'): string => `<!-- opmap: 1 -->
# Demo

## Now

**Updated:** 2026-11-10
**Current version:** v0.1.0
**Next step:** ${now}

## Versions

### v0.1.0 — First

**Window:** 2026-11-01 → 2026-11-30
**Goal:** g
**Exit:** e

| ID | Deliverable | Status | Notes |
| --- | --- | --- | --- |
| 0.1.0-D1 | First thing | ${status} | |
${extra}`;

const DECISIONS = (status: string, outcome: string): string => `<!-- opmap: 1 -->
# Demo: Decisions

## Decisions

| ID | Decision | Options | Default | Needed by | Status | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Which licence? | MIT · AGPL | MIT | 2026-12-01 | ${status} | ${outcome} |
`;

function parse(roadmap: string, decisions = DECISIONS('open', '')) {
  return parseProject(
    {
      roadmap: { path: 'ROADMAP.md', text: roadmap },
      decisions: { path: 'D.md', text: decisions },
    },
    { now: '2026-11-15T00:00:00Z', toolVersion: 't' },
  );
}

describe('diffProjects', () => {
  it('is empty for the same docs', () => {
    const d = diffProjects(parse(ROADMAP('todo')), parse(ROADMAP('todo')));
    expect(d.empty).toBe(true);
    expect(formatDiff(d, 'text', { base: 'a', head: 'b' })).toContain('No roadmap changes.');
  });
  it('reports status changes, new and removed deliverables, the Now block and decisions', () => {
    const base = parse(ROADMAP('todo', '| 0.1.0-D2 | Gone soon | todo | |\n'));
    const head = parse(
      ROADMAP('done', '| 0.1.0-D3 | Brand new | doing | |\n', 'Ship it, then rest.'),
      DECISIONS('decided', 'AGPL'),
    );
    const d = diffProjects(base, head);
    expect(d.empty).toBe(false);
    expect(d.statusChanges).toMatchObject([{ id: '0.1.0-D1', from: 'todo', to: 'done' }]);
    expect(d.addedDeliverables.map((x) => x.id)).toEqual(['0.1.0-D3']);
    expect(d.removedDeliverables.map((x) => x.id)).toEqual(['0.1.0-D2']);
    expect(d.now).toMatchObject([
      { field: 'nextStep', from: 'Ship it.', to: 'Ship it, then rest.' },
    ]);
    expect(d.decisionsClosed).toMatchObject([{ id: 'D1', status: 'decided', outcome: 'AGPL' }]);
    expect(d.decisionsOpened).toEqual([]);
    expect(d.progress.to).toBeGreaterThan(d.progress.from);
  });
  it('reports a reopened decision and a changed window and version list', () => {
    const base = parse(ROADMAP('todo'), DECISIONS('decided', 'MIT'));
    const moved =
      ROADMAP('todo').replace('2026-11-30', '2026-12-15') +
      '\n### v0.2.0 — Second\n\n**Window:** 2026-12-16 → 2026-12-31\n**Goal:** g\n**Exit:** e\n';
    const d = diffProjects(base, parse(moved, DECISIONS('open', '')));
    expect(d.windowChanges).toMatchObject([{ id: 'v0.1.0', to: '2026-11-01 → 2026-12-15' }]);
    expect(d.addedVersions.map((v) => v.id)).toEqual(['v0.2.0']);
    expect(d.decisionsOpened.map((x) => x.id)).toEqual(['D1']);
  });
  it('formats markdown with the sticky-comment marker and keeps cells safe', () => {
    const base = parse(ROADMAP('todo'));
    const head = parse(ROADMAP('done', '', 'a | b `code`\nsecond line'));
    const md = formatDiff(diffProjects(base, head), 'markdown', {
      base: 'origin/main',
      head: 'HEAD',
    });
    expect(md.startsWith(`${DIFF_MARKER}\n### Roadmap changes`)).toBe(true);
    expect(md).toContain('- 0.1.0-D1 First thing: todo → done');
    expect(md).not.toContain('a | b');
    expect(md).toContain('a \\| b');
    expect(
      JSON.parse(formatDiff(diffProjects(base, head), 'json', { base: 'a', head: 'b' })).empty,
    ).toBe(false);
  });
});

const dir0 = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-diff-')));
afterAll(() => rmSync(dir0, { recursive: true, force: true }));
const sh = (cwd: string, args: string[]): void => {
  execFileSync(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    {
      cwd,
      stdio: 'ignore',
    },
  );
};

function repo(): string {
  const dir = join(dir0, 'repo');
  cpSync('examples/tidepool', dir, { recursive: true });
  sh(dir, ['init', '-q', '-b', 'main']);
  sh(dir, ['add', '-A']);
  sh(dir, ['commit', '-q', '-m', 'one']);
  const file = join(dir, 'docs/project/ROADMAP.md');
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      'Finish the streak reminder',
      'Finish the streak reminder, then more',
    ),
  );
  sh(dir, ['commit', '-q', '-am', 'two']);
  return dir;
}

describe('diffRefs and the CLI', () => {
  const dir = repo();
  const opts = { cwd: dir, now: '2026-11-16' };
  it('compares two commits and a commit with the working tree', () => {
    const r = diffRefs({ ...opts, base: 'HEAD', head: 'HEAD' });
    expect(r.diff.empty).toBe(true);
    const file = join(dir, 'docs/project/ROADMAP.md');
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, text.replace(/\| (0\.2\.0-D2 \|[^|]*\|) doing /, '| $1 done '));
    const live = diffRefs({ ...opts, base: 'HEAD' });
    expect(live.labels).toEqual({ base: 'HEAD', head: 'working tree' });
    expect(live.diff.statusChanges.map((c) => c.to)).toEqual(['done']);
    writeFileSync(file, text);
  });
  it('rejects an unsafe ref and a ref without the roadmap', () => {
    expect(() => diffRefs({ ...opts, base: '--upload-pack=x' })).toThrow('not a ref');
    expect(() => diffRefs({ ...opts, base: 'no-such-branch' })).toThrow(
      'could not be read at no-such-branch',
    );
  });
  it('runs as opmap diff in three formats and complains about a missing base', () => {
    const run = (args: string[]) => {
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
      const code = main([...args, '-C', dir, '--now', '2026-11-16'], io);
      return { code, out, err };
    };
    const md = run(['diff', 'HEAD', '--format', 'markdown']);
    expect(md.code).toBe(0);
    expect(md.out).toContain(DIFF_MARKER);
    expect(run(['diff', 'HEAD', 'HEAD', '--format', 'json']).out).toContain('"empty": true');
    const bad = run(['diff']);
    expect(bad.code).not.toBe(0);
    expect(bad.err).toContain('diff needs a base ref');
    expect(run(['diff', 'HEAD', '--format', 'github']).code).not.toBe(0);
  });
});
