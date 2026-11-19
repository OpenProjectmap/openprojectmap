// Source-preserving editor (spec 04 §5). Every function takes the file text and returns new text in
// which only the intended cell, field or line differs: bytes outside the edit are untouched, line
// endings and a leading BOM are kept, and a table keeps its alignment when it had one.
import { cellRanges, scan } from '../core/scan.js';
import type { Block, FieldBlock, TableBlock } from '../core/scan.js';
import { findColumns, plainText } from '../core/parse-roadmap.js';
import { parseStatus } from '../core/status.js';
import type { Status } from '../core/types.js';

export class EditError extends Error {}

interface Lines {
  lines: string[];
  /** The line terminator after each line ('' after the last line when the file has no final newline). */
  eols: string[];
  /** The terminator to use for inserted lines. */
  eol: string;
}

export function splitLines(text: string): Lines {
  const lines: string[] = [];
  const eols: string[] = [];
  const re = /\r\n|\n|\r/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    lines.push(text.slice(last, m.index));
    eols.push(m[0]);
    last = m.index + m[0].length;
  }
  lines.push(text.slice(last));
  eols.push('');
  return { lines, eols, eol: eols.find((e) => e !== '') ?? '\n' };
}

export function joinLines(l: Lines): string {
  return l.lines.map((line, i) => line + (l.eols[i] ?? '')).join('');
}

/** Insert `newLines` after 1-based line `after` (0 = at the top). */
function insertAfter(l: Lines, after: number, newLines: readonly string[]): void {
  const isLast = after === l.lines.length;
  l.lines.splice(after, 0, ...newLines);
  l.eols.splice(after, 0, ...newLines.map(() => l.eol));
  if (isLast) {
    // The anchor was the last line, which had no terminator: it now needs one, and the file still
    // ends without a final newline.
    l.eols[after - 1] = l.eol;
    l.eols[l.eols.length - 1] = '';
  }
}

function oneLine(value: string, what: string): string {
  if (/[\r\n]/.test(value)) throw new EditError(`${what} must be a single line`);
  return value.trim();
}

const escapePipes = (s: string): string => s.replace(/\|/g, '\\|');

// ---------- locating things ----------

function blocksOf(text: string): Block[] {
  return scan(text).blocks;
}

export interface RowRef {
  table: TableBlock;
  /** 0-based index of the row in `table.rows`. */
  index: number;
  /** 1-based line of the row. */
  line: number;
}

/** The row whose ID cell is `id`, in the tables whose header has an ID column. */
export function findRowById(
  text: string,
  id: string,
  scope?: { from: number; to: number },
): RowRef | null {
  for (const b of blocksOf(text)) {
    if (b.type !== 'table') continue;
    if (scope && (b.line < scope.from || b.line > scope.to)) continue;
    const idCol = findColumns(b.head, { id: ['id'] }).id;
    if (idCol === undefined) continue;
    const index = b.rows.findIndex((r) => plainText(r[idCol] ?? '') === id);
    if (index !== -1) return { table: b, index, line: b.rowLines[index] ?? b.line };
  }
  return null;
}

export interface VersionSpan {
  id: string;
  semver: string;
  /** 1-based heading line. */
  line: number;
  /** Last line of the block (before the next H2 or H3, or the end of the file). */
  end: number;
}

const VERSION_HEADING = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) +[—–-] +(.+)$/;

export function findVersions(text: string): VersionSpan[] {
  const blocks = blocksOf(text);
  const total = splitLines(text).lines.length;
  const spans: VersionSpan[] = [];
  blocks.forEach((b, i) => {
    if (b.type !== 'heading' || b.level !== 3) return;
    const m = VERSION_HEADING.exec(b.text.trim());
    if (!m) return;
    const next = blocks.slice(i + 1).find((n) => n.type === 'heading' && n.level <= 3);
    spans.push({
      id: `v${m[1]}`,
      semver: m[1] ?? '',
      line: b.line,
      end: next ? next.line - 1 : total,
    });
  });
  return spans;
}

export function findVersion(text: string, id: string): VersionSpan {
  const want = id.replace(/^v/i, '').toLowerCase();
  const v = findVersions(text).find((s) => s.semver.toLowerCase() === want);
  if (!v) throw new EditError(`There is no version ${id} in the roadmap`);
  return v;
}

/** The Now block: from its H2 to the line before the next H2. */
export function findNowSpan(text: string): { line: number; end: number } {
  const blocks = blocksOf(text);
  const total = splitLines(text).lines.length;
  const i = blocks.findIndex(
    (b) =>
      b.type === 'heading' &&
      b.level === 2 &&
      ['now', 'status', 'current state'].includes(plainText(b.text).toLowerCase()),
  );
  const head = blocks[i];
  if (!head) throw new EditError('The roadmap has no Now block');
  const next = blocks.slice(i + 1).find((n) => n.type === 'heading' && n.level <= 2);
  return { line: head.line, end: next ? next.line - 1 : total };
}

function fieldsIn(text: string, from: number, to: number): FieldBlock[] {
  return blocksOf(text).filter(
    (b): b is FieldBlock => b.type === 'field' && b.line >= from && b.line <= to,
  );
}

// ---------- cells ----------

/** Replace the content of one table cell, keeping the rest of the line and the table's alignment. */
export function setCell(text: string, line: number, column: number, value: string): string {
  const l = splitLines(text);
  const raw = l.lines[line - 1];
  if (raw === undefined) throw new EditError(`There is no line ${line}`);
  const ranges = cellRanges(raw);
  const r = ranges[column];
  if (!r) throw new EditError(`Line ${line} has no column ${column + 1}`);
  const clean = escapePipes(oneLine(value, 'A table cell'));
  let cell = clean === '' ? ' ' : ` ${clean} `;
  const aligned = isAligned(text, line);
  if (aligned && cell.length < r.to - r.from) cell = cell.padEnd(r.to - r.from, ' ');
  l.lines[line - 1] = raw.slice(0, r.from) + cell + raw.slice(r.to);
  return joinLines(l);
}

/** True when every line of the table around `line` has the same length (a tidy, aligned table). */
function isAligned(text: string, line: number): boolean {
  const t = blocksOf(text).find(
    (b): b is TableBlock => b.type === 'table' && b.rowLines.includes(line),
  );
  if (!t) return false;
  const l = splitLines(text).lines;
  const rows = [t.line, t.line + 1, ...t.rowLines].map((n) => (l[n - 1] ?? '').length);
  return rows.every((n) => n === rows[0]);
}

export function columnOf(table: TableBlock, ...names: string[]): number {
  const found = findColumns(table.head, { c: names });
  if (found.c === undefined) throw new EditError(`The table has no ${names[0]} column`);
  return found.c;
}

// ---------- statuses and notes ----------

export interface StatusInput {
  status: Status;
  date?: string | undefined;
  ref?: string | undefined;
}

/** `done 2026-12-01 (#14)`: the cell text for a status. */
export function statusCell(s: StatusInput): string {
  return [s.status, s.date, s.ref ? `(${s.ref})` : undefined]
    .filter((x): x is string => x !== undefined && x !== '')
    .join(' ');
}

export function setDeliverableStatus(
  text: string,
  id: string,
  s: StatusInput,
  note?: string,
): string {
  const row = findRowById(text, id);
  if (!row) throw new EditError(`There is no deliverable ${id}`);
  let out = setCell(text, row.line, columnOf(row.table, 'status'), statusCell(s));
  if (note !== undefined) out = setCell(out, row.line, columnOf(row.table, 'notes'), note);
  return out;
}

// ---------- fields ----------

const FIELD_ALIASES: Record<string, string[]> = {
  updated: ['updated', 'last updated'],
  'current version': ['current version', 'version'],
  'next step': ['next step', 'next'],
  target: ['target', 'launch target'],
};

function sameKey(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return (
    x === y || (FIELD_ALIASES[x]?.includes(y) ?? false) || (FIELD_ALIASES[y]?.includes(x) ?? false)
  );
}

/** Set (or add) a `**Key:** value` line inside lines `[from, to]`, where `heading` is the block's heading line. */
function setFieldIn(
  text: string,
  heading: number,
  from: number,
  to: number,
  key: string,
  value: string,
): string {
  const v = oneLine(value, 'A field value');
  if (v === '') throw new EditError(`${key} cannot be empty`);
  const found = fieldsIn(text, from, to).find((f) => sameKey(f.key, key));
  const l = splitLines(text);
  if (found) {
    const raw = l.lines[found.line - 1] ?? '';
    const m = /^(\*\*[^*]+?:\*\*[ \t]+)/.exec(raw);
    if (!m) throw new EditError(`Could not read the ${key} line`);
    const prefix = m[1] ?? '';
    const trailing = /[ \t]*$/.exec(raw)?.[0] ?? '';
    l.lines[found.line - 1] = `${prefix}${v}${raw.length > prefix.length ? trailing : ''}`;
    return joinLines(l);
  }
  const existing = fieldsIn(text, from, to);
  const anchor = existing.length > 0 ? Math.max(...existing.map((f) => f.line)) : heading;
  insertAfter(l, anchor, existing.length > 0 ? [`**${key}:** ${v}`] : ['', `**${key}:** ${v}`]);
  return joinLines(l);
}

/** Set a field of the Now block (`Updated`, `Current version`, `Next step`, `Why`, or any fact). */
export function setNowField(text: string, key: string, value: string): string {
  const now = findNowSpan(text);
  return setFieldIn(text, now.line, now.line + 1, now.end, key, value);
}

export function setVersionField(
  text: string,
  versionId: string,
  key: string,
  value: string,
): string {
  const v = findVersion(text, versionId);
  return setFieldIn(text, v.line, v.line + 1, v.end, key, value);
}

// ---------- status lines ----------

/** Add `**Status <date>:** <text>` after the version's last status line (so newest stays last). */
export function appendStatusLine(
  text: string,
  versionId: string,
  date: string | null,
  value: string,
): string {
  const v = findVersion(text, versionId);
  const v1 = oneLine(value, 'A status line');
  if (v1 === '') throw new EditError('A status line cannot be empty');
  const fields = fieldsIn(text, v.line + 1, v.end);
  const statuses = fields.filter((f) => /^status(?: \S+)?$/i.test(f.key));
  const anchor =
    statuses.length > 0
      ? Math.max(...statuses.map((f) => f.line))
      : fields.length > 0
        ? Math.max(...fields.map((f) => f.line))
        : v.line;
  const l = splitLines(text);
  insertAfter(
    l,
    anchor,
    fields.length > 0 || statuses.length > 0
      ? [`**Status${date ? ` ${date}` : ''}:** ${v1}`]
      : ['', `**Status${date ? ` ${date}` : ''}:** ${v1}`],
  );
  return joinLines(l);
}

// ---------- adding rows ----------

/** The next free deliverable ID for a version: one more than the highest number used anywhere. */
export function nextDeliverableId(text: string, semver: string): string {
  let max = 0;
  const re = new RegExp(`^${semver.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')}-D(\\d+)$`);
  for (const b of blocksOf(text)) {
    if (b.type !== 'table') continue;
    const idCol = findColumns(b.head, { id: ['id'] }).id;
    if (idCol === undefined) continue;
    for (const r of b.rows) {
      const m = re.exec(plainText(r[idCol] ?? ''));
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `${semver}-D${max + 1}`;
}

export interface NewDeliverable {
  title: string;
  status?: Status;
  notes?: string | undefined;
}

/** Append a deliverable row to the version's last deliverables table. Returns the new text and the ID. */
export function addDeliverable(
  text: string,
  versionId: string,
  d: NewDeliverable,
): { text: string; id: string } {
  const v = findVersion(text, versionId);
  const tables = blocksOf(text).filter(
    (b): b is TableBlock =>
      b.type === 'table' &&
      b.line > v.line &&
      b.line <= v.end &&
      findColumns(b.head, { id: ['id'] }).id !== undefined,
  );
  const table = tables[tables.length - 1];
  if (!table) throw new EditError(`${versionId} has no deliverables table`);
  const id = nextDeliverableId(text, v.semver);
  const title = escapePipes(oneLine(d.title, 'A deliverable title'));
  if (title === '') throw new EditError('A deliverable needs a title');
  const cols = findColumns(table.head, {
    id: ['id'],
    title: ['deliverable', 'title', 'what'],
    status: ['status'],
    notes: ['notes'],
  });
  const values = table.head.map((_, i) =>
    i === cols.id
      ? id
      : i === cols.title
        ? title
        : i === cols.status
          ? (d.status ?? 'todo')
          : i === cols.notes
            ? escapePipes(oneLine(d.notes ?? '', 'Notes'))
            : '',
  );
  const l = splitLines(text);
  const lastLine =
    table.rowLines.length > 0
      ? (table.rowLines[table.rowLines.length - 1] ?? table.line)
      : table.line + 1;
  const sample = l.lines[lastLine - 1] ?? '';
  const aligned = table.rowLines.length > 0 && isAligned(text, lastLine);
  let widths: number[] = [];
  if (aligned) widths = cellRanges(sample).map((r) => r.to - r.from);
  const indent = /^[ \t]*/.exec(sample)?.[0] ?? '';
  const row = `${indent}|${values.map((c, i) => (c === '' ? ' ' : ` ${c} `).padEnd(widths[i] ?? 0, ' ')).join('|')}|`;
  insertAfter(l, lastLine, [row]);
  return { text: joinLines(l), id };
}

// ---------- new version ----------

export interface NewVersion {
  semver: string;
  title: string;
  window?: string | undefined;
  goal?: string | undefined;
  exit?: string | undefined;
  today: string;
  /** Insert after this version (default: the last one). */
  after?: string | undefined;
}

export function addVersion(text: string, v: NewVersion): string {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v.semver))
    throw new EditError(`"${v.semver}" is not a version like 0.5.0`);
  const versions = findVersions(text);
  if (versions.some((x) => x.semver === v.semver))
    throw new EditError(`Version v${v.semver} already exists`);
  const anchorVersion = v.after ? findVersion(text, v.after) : versions[versions.length - 1];
  if (!anchorVersion) throw new EditError('The roadmap has no version to add this one after');
  const title = oneLine(v.title, 'A version title');
  if (title === '') throw new EditError('A version needs a title');
  const l = splitLines(text);
  const block = [
    '',
    `### v${v.semver} — ${title}`,
    '',
    ...(v.window ? [`**Window:** ${oneLine(v.window, 'A window')}`] : []),
    `**Goal:** ${oneLine(v.goal ?? 'To be written.', 'A goal')}`,
    `**Exit:** ${oneLine(v.exit ?? 'To be written.', 'An exit')}`,
    `**Status ${v.today}:** planned.`,
    '',
    '| ID | Deliverable | Status | Notes |',
    '| --- | --- | --- | --- |',
  ];
  // Insert after the last non-blank line of the anchor block, so blank lines before the next heading stay.
  let at = anchorVersion.end;
  while (at > anchorVersion.line && (l.lines[at - 1] ?? '').trim() === '') at--;
  insertAfter(l, at, block);
  return joinLines(l);
}

// ---------- decisions ----------

export function setDecision(
  text: string,
  id: string,
  status: 'decided' | 'defaulted',
  outcome: string,
): string {
  const row = findRowById(text, id);
  if (!row) throw new EditError(`There is no decision ${id}`);
  const statusCol = columnOf(row.table, 'status');
  const outcomeCol = columnOf(row.table, 'outcome');
  let out = setCell(text, row.line, statusCol, status);
  out = setCell(out, row.line, outcomeCol, outcome);
  return out;
}

/** Whether a status word is one the vocabulary knows. */
export function knownStatus(word: string): Status | null {
  const p = parseStatus(word);
  return p.unknown ? null : p.status;
}

// ---------- diff ----------

/** A unified diff (3 lines of context) between two texts. Empty when they are equal. */
export function unifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return '';
  const a = splitLines(before).lines;
  const b = splitLines(after).lines;
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  )
    suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  // LCS on the (small) changed middle.
  const n = am.length;
  const m = bm.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] =
        am[i] === bm[j]
          ? (dp[i + 1]![j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
  const ops: { t: ' ' | '-' | '+'; s: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (am[i] === bm[j]) {
      ops.push({ t: ' ', s: am[i] ?? '' });
      i++;
      j++;
    } else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) ops.push({ t: '-', s: am[i++] ?? '' });
    else ops.push({ t: '+', s: bm[j++] ?? '' });
  }
  while (i < n) ops.push({ t: '-', s: am[i++] ?? '' });
  while (j < m) ops.push({ t: '+', s: bm[j++] ?? '' });
  const ctx = 3;
  const lead = a
    .slice(Math.max(0, pre - ctx), pre)
    .map((s): { t: ' '; s: string } => ({ t: ' ', s }));
  const trail = a
    .slice(a.length - suf, a.length - suf + ctx)
    .map((s): { t: ' '; s: string } => ({ t: ' ', s }));
  const all = [...lead, ...ops, ...trail];
  const oldStart = Math.max(0, pre - ctx) + 1;
  const newStart = oldStart;
  const oldCount = all.filter((o) => o.t !== '+').length;
  const newCount = all.filter((o) => o.t !== '-').length;
  return (
    [
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      ...all.map((o) => `${o.t}${o.s}`),
    ].join('\n') + '\n'
  );
}
