import { describe, expect, it } from 'vitest';
import {
  EditError,
  addDeliverable,
  addVersion,
  appendStatusLine,
  columnOf,
  findNowSpan,
  findRowById,
  findVersion,
  findVersions,
  joinLines,
  knownStatus,
  nextDeliverableId,
  setCell,
  setDecision,
  setDeliverableStatus,
  setNowField,
  setVersionField,
  splitLines,
  statusCell,
  unifiedDiff,
} from '../../src/node/editor.js';
import { scan } from '../../src/core/scan.js';

const ALIGNED = `<!-- opmap: 1 -->
# Demo

## Now

**Updated:** 2026-11-16
**Current version:** v0.1.0
**Next step:** Build it.
**Live:** nothing

## Versions

### v0.1.0 — First

**Window:** 2026-11-17 → 2026-12-01
**Goal:** g
**Exit:** e
**Status 2026-11-16:** planned.

| ID       | Deliverable | Status | Notes     |
| -------- | ----------- | ------ | --------- |
| 0.1.0-D1 | One         | todo   |           |
| 0.1.0-D2 | Two         | doing  | note here |

### v0.2.0 — Second

**Window:** 2026-12-02 → 2026-12-20
**Goal:** g2
**Exit:** e2

| ID | Deliverable | Status |
| --- | --- | --- |
| 0.2.0-D1 | Later \\| piped | todo |

## Decisions

| ID | Decision | Default | Status | Outcome |
| --- | --- | --- | --- | --- |
| D1 | Which? | A | open | |
`;

/** The 1-based line numbers whose text differs (same line count), or null when the count changed. */
function changedLines(a: string, b: string): number[] | null {
  const x = splitLines(a).lines;
  const y = splitLines(b).lines;
  if (x.length !== y.length) return null;
  return x.flatMap((l, i) => (l === y[i] ? [] : [i + 1]));
}
/** Lines inserted: the new lines that are not in the old text, in order, when old lines are untouched. */
function inserted(a: string, b: string): string[] {
  const x = splitLines(a).lines;
  const y = splitLines(b).lines;
  let pre = 0;
  while (pre < x.length && x[pre] === y[pre]) pre++;
  const extra = y.length - x.length;
  expect(extra).toBeGreaterThan(0);
  expect(y.slice(pre + extra)).toEqual(x.slice(pre));
  return y.slice(pre, pre + extra);
}

const BOM = String.fromCharCode(0xfeff);

describe('lines', () => {
  it('splits and joins without changing a byte, for LF, CRLF, CR and no final newline', () => {
    for (const t of ['a\nb\n', 'a\r\nb\r\n', 'a\rb', 'a\nb', '', '\n', 'a\r\nb\nc\r'])
      expect(joinLines(splitLines(t))).toBe(t);
    expect(splitLines('a\r\nb').eol).toBe('\r\n');
    expect(splitLines('abc').eol).toBe('\n');
  });
});

describe('locating', () => {
  it('finds rows by ID, versions, and the Now block', () => {
    expect(findRowById(ALIGNED, '0.1.0-D2')).toMatchObject({ index: 1, line: 23 });
    expect(findRowById(ALIGNED, 'D1')?.table.head).toContain('Outcome');
    expect(findRowById(ALIGNED, 'nope')).toBeNull();
    expect(findVersions(ALIGNED).map((v) => [v.id, v.line])).toEqual([
      ['v0.1.0', 13],
      ['v0.2.0', 25],
    ]);
    expect(findVersion(ALIGNED, '0.2.0').id).toBe('v0.2.0');
    expect(() => findVersion(ALIGNED, 'v9.0.0')).toThrow(EditError);
    expect(findNowSpan(ALIGNED)).toEqual({ line: 4, end: 10 });
    expect(() => findNowSpan('# T\n')).toThrow('no Now block');
  });
  it('limits findRowById to a scope', () => {
    expect(findRowById(ALIGNED, '0.1.0-D1', { from: 25, to: 40 })).toBeNull();
  });
  it('columnOf finds a column or throws', () => {
    const t = findRowById(ALIGNED, '0.1.0-D1')?.table;
    expect(columnOf(t!, 'status')).toBe(2);
    expect(columnOf(t!, 'what', 'deliverable')).toBe(1);
    expect(() => columnOf(t!, 'owner')).toThrow('no owner column');
  });
});

describe('setCell', () => {
  it('replaces one cell and keeps an aligned table aligned', () => {
    const out = setCell(ALIGNED, 22, 2, 'done');
    expect(changedLines(ALIGNED, out)).toEqual([22]);
    expect(splitLines(out).lines[21]).toBe('| 0.1.0-D1 | One         | done   |           |');
  });
  it('inserts as-is in a table that is not aligned, and escapes pipes', () => {
    const out = setCell(ALIGNED, 33, 2, 'a|b');
    expect(splitLines(out).lines[32]).toBe('| 0.2.0-D1 | Later \\| piped | a\\|b |');
    expect(changedLines(ALIGNED, out)).toEqual([33]);
  });
  it('can grow past the old width, clear a cell, and rejects bad input', () => {
    expect(splitLines(setCell(ALIGNED, 22, 2, 'a much longer value')).lines[21]).toBe(
      '| 0.1.0-D1 | One         | a much longer value |           |',
    );
    expect(splitLines(setCell(ALIGNED, 23, 3, '')).lines[22]).toBe(
      '| 0.1.0-D2 | Two         | doing  |           |',
    );
    expect(() => setCell(ALIGNED, 22, 9, 'x')).toThrow('no column 10');
    expect(() => setCell(ALIGNED, 999, 0, 'x')).toThrow('no line 999');
    expect(() => setCell(ALIGNED, 22, 2, 'a\nb')).toThrow('single line');
  });
  it('keeps CRLF line endings and everything else byte for byte', () => {
    const crlf = ALIGNED.replace(/\n/g, '\r\n');
    const out = setCell(crlf, 22, 2, 'done');
    expect(out.split('\r\n').length).toBe(crlf.split('\r\n').length);
    expect(out.replace(/\r\n/g, '\n')).toBe(setCell(ALIGNED, 22, 2, 'done'));
    expect(/[^\r]\n/.test(out)).toBe(false);
  });
  it('keeps a BOM and a missing final newline', () => {
    const t = `${BOM}${ALIGNED.trimEnd()}`;
    const out = setCell(t, 22, 2, 'done');
    expect(out.startsWith(`${BOM}<!-- opmap`)).toBe(true);
    expect(out.endsWith('| open |  |')).toBe(false);
    expect(out.endsWith('| A | open | |')).toBe(true);
  });
});

describe('statuses', () => {
  it('builds the cell text', () => {
    expect(statusCell({ status: 'done', date: '2026-12-01', ref: '#14' })).toBe(
      'done 2026-12-01 (#14)',
    );
    expect(statusCell({ status: 'doing' })).toBe('doing');
    expect(statusCell({ status: 'done', ref: '' })).toBe('done');
  });
  it('knows status words', () => {
    expect(knownStatus('in progress')).toBe('doing');
    expect(knownStatus('shipped')).toBe('done');
    expect(knownStatus('finished')).toBeNull();
  });
  it('sets the status cell, and the notes cell with a note', () => {
    const out = setDeliverableStatus(
      ALIGNED,
      '0.1.0-D2',
      { status: 'done', date: '2026-12-01', ref: '#7' },
      'merged',
    );
    expect(changedLines(ALIGNED, out)).toEqual([23]);
    expect(splitLines(out).lines[22]).toContain('| done 2026-12-01 (#7) |');
    expect(splitLines(out).lines[22]).toContain('merged');
    expect(() => setDeliverableStatus(ALIGNED, '9.9.9-D1', { status: 'done' })).toThrow(
      'no deliverable 9.9.9-D1',
    );
    expect(() => setDeliverableStatus(ALIGNED, '0.2.0-D1', { status: 'done' }, 'x')).toThrow(
      'no notes column',
    );
  });
});

describe('fields', () => {
  it('replaces a Now field value in place, by alias too', () => {
    const out = setNowField(ALIGNED, 'Updated', '2026-11-18');
    expect(changedLines(ALIGNED, out)).toEqual([6]);
    expect(splitLines(out).lines[5]).toBe('**Updated:** 2026-11-18');
    expect(splitLines(setNowField(ALIGNED, 'Next', 'Ship it.')).lines[7]).toBe(
      '**Next step:** Ship it.',
    );
    expect(splitLines(setNowField(ALIGNED, 'Last updated', '2026-11-19')).lines[5]).toBe(
      '**Updated:** 2026-11-19',
    );
  });
  it('adds a missing field after the last one in the block', () => {
    const out = setNowField(ALIGNED, 'Why', 'Because.');
    expect(inserted(ALIGNED, out)).toEqual(['**Why:** Because.']);
    expect(splitLines(out).lines[9]).toBe('**Why:** Because.');
  });
  it('sets a fact that already exists', () => {
    expect(splitLines(setNowField(ALIGNED, 'live', 'v0.1.0')).lines[8]).toBe('**Live:** v0.1.0');
  });
  it('sets and adds version fields', () => {
    expect(splitLines(setVersionField(ALIGNED, 'v0.1.0', 'Goal', 'New goal.')).lines[15]).toBe(
      '**Goal:** New goal.',
    );
    const out = setVersionField(ALIGNED, 'v0.2.0', 'Milestone', 'M1');
    expect(inserted(ALIGNED, out)).toEqual(['**Milestone:** M1']);
  });
  it('rejects empty and multi-line values', () => {
    expect(() => setNowField(ALIGNED, 'Why', '  ')).toThrow('cannot be empty');
    expect(() => setNowField(ALIGNED, 'Why', 'a\nb')).toThrow('single line');
  });
  it('adds a field to an empty Now block after a blank line', () => {
    const t = '# T\n\n## Now\n\n## Versions\n';
    expect(setNowField(t, 'Next step', 'Go.')).toBe(
      '# T\n\n## Now\n\n**Next step:** Go.\n\n## Versions\n',
    );
  });
});

describe('status lines', () => {
  it('adds a dated line after the last status line', () => {
    const out = appendStatusLine(ALIGNED, 'v0.1.0', '2026-11-18', 'scanner done.');
    expect(inserted(ALIGNED, out)).toEqual(['**Status 2026-11-18:** scanner done.']);
    expect(splitLines(out).lines[18]).toBe('**Status 2026-11-18:** scanner done.');
  });
  it('adds after the last field when there is no status line yet, and an undated line', () => {
    const out = appendStatusLine(ALIGNED, 'v0.2.0', null, 'started.');
    expect(inserted(ALIGNED, out)).toEqual(['**Status:** started.']);
    expect(splitLines(out).lines[29]).toBe('**Status:** started.');
  });
  it('adds after the heading when a version has no fields', () => {
    const t = '## V\n\n### v1.0.0 — X\n\n| ID | Deliverable | Status |\n| --- | --- | --- |\n';
    expect(appendStatusLine(t, 'v1.0.0', '2026-01-01', 'hi.')).toBe(
      '## V\n\n### v1.0.0 — X\n\n**Status 2026-01-01:** hi.\n\n| ID | Deliverable | Status |\n| --- | --- | --- |\n',
    );
  });
  it('rejects empty text and an unknown version', () => {
    expect(() => appendStatusLine(ALIGNED, 'v0.1.0', null, ' ')).toThrow('cannot be empty');
    expect(() => appendStatusLine(ALIGNED, 'v7.0.0', null, 'x')).toThrow('no version');
  });
});

describe('adding deliverables', () => {
  it('picks the next free ID, counting the highest number used', () => {
    expect(nextDeliverableId(ALIGNED, '0.1.0')).toBe('0.1.0-D3');
    expect(nextDeliverableId(ALIGNED, '0.2.0')).toBe('0.2.0-D2');
    expect(nextDeliverableId(ALIGNED, '5.5.5')).toBe('5.5.5-D1');
    expect(nextDeliverableId(ALIGNED.replace('0.1.0-D2', '0.1.0-D7'), '0.1.0')).toBe('0.1.0-D8');
  });
  it('appends an aligned row after the last row', () => {
    const r = addDeliverable(ALIGNED, 'v0.1.0', { title: 'Three', notes: 'n' });
    expect(r.id).toBe('0.1.0-D3');
    expect(inserted(ALIGNED, r.text)).toEqual(['| 0.1.0-D3 | Three       | todo   | n         |']);
  });
  it('appends an unaligned row without padding, filling extra columns', () => {
    const r = addDeliverable(ALIGNED, 'v0.2.0', { title: 'Next | one', status: 'doing' });
    expect(inserted(ALIGNED, r.text)).toEqual(['| 0.2.0-D2 | Next \\| one | doing |']);
  });
  it('adds a row to a table with no rows yet', () => {
    const t =
      '## V\n\n### v1.0.0 — X\n\n| ID | Deliverable | Status | Notes |\n| --- | --- | --- | --- |\n\n### v2.0.0 — Y\n';
    const r = addDeliverable(t, 'v1.0.0', { title: 'First' });
    expect(r.text).toBe(
      '## V\n\n### v1.0.0 — X\n\n| ID | Deliverable | Status | Notes |\n| --- | --- | --- | --- |\n| 1.0.0-D1 | First | todo | |\n\n### v2.0.0 — Y\n',
    );
  });
  it('rejects a missing table, an empty title and an unknown version', () => {
    expect(() => addDeliverable('## V\n\n### v1.0.0 — X\n', 'v1.0.0', { title: 'a' })).toThrow(
      'no deliverables table',
    );
    expect(() => addDeliverable(ALIGNED, 'v0.1.0', { title: ' ' })).toThrow('needs a title');
    expect(() => addDeliverable(ALIGNED, 'v8.0.0', { title: 'a' })).toThrow('no version');
  });
  it('indents like the row above it', () => {
    const t =
      '## V\n\n### v1.0.0 — X\n\n  | ID | Deliverable | Status |\n  | --- | --- | --- |\n  | 1.0.0-D1 | A | todo |\n';
    expect(inserted(t, addDeliverable(t, 'v1.0.0', { title: 'B' }).text)).toEqual([
      '  | 1.0.0-D2 | B | todo |',
    ]);
  });
});

describe('adding versions', () => {
  it('adds a block after the last version, leaving the blank lines before the next heading', () => {
    const out = addVersion(ALIGNED, {
      semver: '0.3.0',
      title: 'Third',
      window: '2027-01',
      today: '2026-11-18',
    });
    const lines = splitLines(out).lines;
    const at = lines.indexOf('### v0.3.0 — Third');
    expect(at).toBeGreaterThan(0);
    expect(lines.slice(at, at + 9)).toEqual([
      '### v0.3.0 — Third',
      '',
      '**Window:** 2027-01',
      '**Goal:** To be written.',
      '**Exit:** To be written.',
      '**Status 2026-11-18:** planned.',
      '',
      '| ID | Deliverable | Status | Notes |',
      '| --- | --- | --- | --- |',
    ]);
    expect(lines[at + 9]).toBe('');
    expect(lines[at + 10]).toBe('## Decisions');
  });
  it('adds after a chosen version, with a goal and exit and no window', () => {
    const out = addVersion(ALIGNED, {
      semver: '0.1.5',
      title: 'Patch',
      goal: 'Fix.',
      exit: 'Fixed.',
      today: '2026-11-18',
      after: 'v0.1.0',
    });
    const lines = splitLines(out).lines;
    expect(lines.indexOf('### v0.1.5 — Patch')).toBeLessThan(lines.indexOf('### v0.2.0 — Second'));
    expect(out).toContain('**Goal:** Fix.');
    expect(out).not.toContain('**Window:** undefined');
  });
  it('rejects a bad or duplicate version, and an empty title', () => {
    expect(() => addVersion(ALIGNED, { semver: '1.0', title: 'x', today: 't' })).toThrow(
      'not a version',
    );
    expect(() => addVersion(ALIGNED, { semver: '0.1.0', title: 'x', today: 't' })).toThrow(
      'already exists',
    );
    expect(() => addVersion(ALIGNED, { semver: '0.9.0', title: ' ', today: 't' })).toThrow(
      'needs a title',
    );
    expect(() => addVersion('# T\n', { semver: '0.9.0', title: 'x', today: 't' })).toThrow(
      'no version to add',
    );
  });
});

describe('decisions', () => {
  it('sets the status and outcome', () => {
    const out = setDecision(ALIGNED, 'D1', 'decided', 'Chose A on 2026-11-18');
    expect(changedLines(ALIGNED, out)).toEqual([39]);
    expect(splitLines(out).lines[38]).toBe('| D1 | Which? | A | decided | Chose A on 2026-11-18 |');
    expect(() => setDecision(ALIGNED, 'D9', 'decided', 'x')).toThrow('no decision D9');
    expect(() => setDecision(ALIGNED, '0.1.0-D1', 'decided', 'x')).toThrow('no outcome column');
  });
});

describe('unifiedDiff', () => {
  it('is empty for equal text', () => {
    expect(unifiedDiff('f.md', 'a\n', 'a\n')).toBe('');
  });
  it('shows a changed line with context', () => {
    const d = unifiedDiff('docs/R.md', 'a\nb\nc\nd\ne\nf\ng\nh\n', 'a\nb\nc\nX\ne\nf\ng\nh\n');
    expect(d).toBe(
      '--- a/docs/R.md\n+++ b/docs/R.md\n@@ -1,7 +1,7 @@\n a\n b\n c\n-d\n+X\n e\n f\n g\n',
    );
  });
  it('shows inserted and deleted lines', () => {
    expect(unifiedDiff('f', 'a\nb\n', 'a\nx\ny\nb\n')).toContain('+x\n+y\n');
    expect(unifiedDiff('f', 'a\nx\nb\n', 'a\nb\n')).toContain('-x\n');
  });
  it('works on a real edit', () => {
    const d = unifiedDiff('R.md', ALIGNED, setCell(ALIGNED, 22, 2, 'done'));
    expect(d).toContain('-| 0.1.0-D1 | One         | todo   |           |');
    expect(d).toContain('+| 0.1.0-D1 | One         | done   |           |');
  });
});

describe('the scanner exposes cell ranges for the editor', () => {
  it('matches the cells it reports', () => {
    const t = scan(ALIGNED).blocks.find((b) => b.type === 'table');
    expect(t?.type).toBe('table');
  });
});
