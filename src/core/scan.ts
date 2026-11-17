// Block scanner (spec 01 §4.1, spec 02 §2). Pure and linear: no regex with nested quantifiers,
// no node:* imports, no clock.

export interface Position {
  /** 1-based line number. */
  line: number;
  /** 1-based column of the first character of the block. */
  column: number;
}

export interface HeadingBlock extends Position {
  type: 'heading';
  level: number;
  text: string;
}

export interface FieldBlock extends Position {
  type: 'field';
  /** The key without the colon, whitespace collapsed. Compare case-insensitively. */
  key: string;
  value: string;
}

export interface TableBlock extends Position {
  type: 'table';
  head: string[];
  /** Every row has exactly `head.length` cells. */
  rows: string[][];
  /** 1-based line of each row in `rows`. */
  rowLines: number[];
}

export interface ParagraphBlock extends Position {
  type: 'paragraph';
  text: string;
}

export type Block = HeadingBlock | FieldBlock | TableBlock | ParagraphBlock;

export interface ScanNote extends Position {
  /** Only `OPM-I702` (row has more cells than the header) comes from the scanner. */
  code: 'OPM-I702';
  message: string;
}

export interface FormatMarker {
  version: number;
  line: number;
}

export interface ScanResult {
  blocks: Block[];
  marker: FormatMarker | null;
  notes: ScanNote[];
}

/** Strip a UTF-8 BOM and turn CRLF and lone CR into LF. Tabs are kept. */
export function normalizeText(text: string): string {
  const noBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return noBom.replace(/\r\n?/g, '\n');
}

const MARKER_RE = /^<!--[ \t]*opmap:[ \t]*(\d{1,6})[ \t]*-->[ \t]*$/;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const FIELD_RE = /^\*\*([^*]+?):\*\*[ \t]+(.*)$/;
const DELIMITER_RE = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/;

/**
 * Index of the first character after the code span that starts at `start` (a run of backticks),
 * or `start + runLength` when the run has no matching closer on the line.
 */
function skipCodeSpan(line: string, start: number, missing: Set<number>): number {
  let end = start;
  while (line.charCodeAt(end) === 96) end++;
  const runLength = end - start;
  if (missing.has(runLength)) return end;
  let from = end;
  for (;;) {
    const open = line.indexOf('`', from);
    if (open === -1) {
      missing.add(runLength);
      return end;
    }
    let close = open;
    while (line.charCodeAt(close) === 96) close++;
    if (close - open === runLength) return close;
    from = close;
  }
}

/**
 * Blank out HTML comments in a line (replacing them with spaces so columns stay put). A comment
 * that does not end on this line keeps `inComment` set for the following lines. Comment markers
 * inside inline code spans are left alone.
 */
function blankComments(line: string, inComment: boolean): { text: string; inComment: boolean } {
  if (!inComment && line.indexOf('<!--') === -1) return { text: line, inComment: false };
  const missing = new Set<number>();
  let out = '';
  let i = 0;
  let open = inComment;
  while (i < line.length) {
    if (open) {
      const end = line.indexOf('-->', i);
      if (end === -1) {
        out += ' '.repeat(line.length - i);
        return { text: out, inComment: true };
      }
      out += ' '.repeat(end + 3 - i);
      i = end + 3;
      open = false;
    } else if (line.charCodeAt(i) === 96) {
      const next = skipCodeSpan(line, i, missing);
      out += line.slice(i, next);
      i = next;
    } else if (line.startsWith('<!--', i)) {
      open = true;
      out += '    ';
      i += 4;
    } else {
      out += line[i];
      i++;
    }
  }
  return { text: out, inComment: open };
}

interface Cell {
  text: string;
  column: number;
}

/** Split a table row on `|` that is neither escaped (`\|`) nor inside a backtick code span. */
function splitRow(line: string): Cell[] {
  const cells: Cell[] = [];
  const missing = new Set<number>();
  const start = line.indexOf('|') + 1;
  let i = start;
  let cur = '';
  let curStart = start;
  const push = (): void => {
    const lead = cur.length - cur.trimStart().length;
    cells.push({ text: cur.trim(), column: curStart + lead + 1 });
    cur = '';
  };
  while (i < line.length) {
    const ch = line.charCodeAt(i);
    if (ch === 92 && line.charCodeAt(i + 1) === 124) {
      cur += '|';
      i += 2;
    } else if (ch === 96) {
      const next = skipCodeSpan(line, i, missing);
      cur += line.slice(i, next).replace(/\\\|/g, '|');
      i = next;
    } else if (ch === 124) {
      push();
      i++;
      curStart = i;
    } else {
      cur += line[i];
      i++;
    }
  }
  // A trailing `|` closes the last cell; text after the last `|` is one more cell.
  if (cur.trim() !== '') push();
  return cells;
}

function isTableStart(line: string): boolean {
  return line.trimStart().startsWith('|');
}

function leadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && (line[n] === ' ' || line[n] === '\t')) n++;
  return n;
}

function headingText(raw: string | undefined): string {
  let t = (raw ?? '').trim();
  // Closing hashes: only when preceded by a space (or the whole text is hashes).
  let end = t.length;
  while (end > 0 && t.charCodeAt(end - 1) === 35) end--;
  if (end === 0) return '';
  if (end < t.length && (t[end - 1] === ' ' || t[end - 1] === '\t')) t = t.slice(0, end).trimEnd();
  return t;
}

/** Scan markdown into blocks. Everything not in a recognised block shape becomes a paragraph. */
export function scan(input: string): ScanResult {
  const lines = normalizeText(input).split('\n');
  const blocks: Block[] = [];
  const notes: ScanNote[] = [];

  let marker: FormatMarker | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] ?? '').trim();
    if (l === '') continue;
    const m = MARKER_RE.exec(l);
    if (m) marker = { version: Number(m[1]), line: i + 1 };
    break;
  }

  // First pass: drop fenced code and comments, keeping line numbers.
  const clean: string[] = [];
  let inComment = false;
  let fence: { char: number; len: number } | null = null;
  for (const raw of lines) {
    if (fence) {
      const t = raw.trim();
      let n = 0;
      while (t.charCodeAt(n) === fence.char) n++;
      if (n >= fence.len && n === t.length) fence = null;
      clean.push('');
      continue;
    }
    if (!inComment) {
      const f = FENCE_OPEN_RE.exec(raw);
      if (f) {
        const run = f[1] ?? '';
        const rest = raw.slice(raw.indexOf(run) + run.length);
        // A backtick fence's info string cannot contain a backtick; otherwise it is inline code.
        if (!(run.startsWith('`') && rest.includes('`'))) {
          fence = { char: run.charCodeAt(0), len: run.length };
          clean.push('');
          continue;
        }
      }
    }
    const r = blankComments(raw, inComment);
    inComment = r.inComment;
    clean.push(r.text);
  }

  let para: { lines: string[]; line: number; column: number } | null = null;
  const flush = (): void => {
    if (para) {
      blocks.push({
        type: 'paragraph',
        text: para.lines.join(' '),
        line: para.line,
        column: para.column,
      });
      para = null;
    }
  };

  for (let i = 0; i < clean.length; i++) {
    const line = clean[i] ?? '';
    const lineNo = i + 1;
    if (line.trim() === '') {
      flush();
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      flush();
      blocks.push({
        type: 'heading',
        level: (h[1] ?? '#').length,
        text: headingText(h[2]),
        line: lineNo,
        column: leadingSpaces(line) + 1,
      });
      continue;
    }

    const f = FIELD_RE.exec(line.trimEnd());
    if (f) {
      flush();
      blocks.push({
        type: 'field',
        key: (f[1] ?? '').trim().replace(/\s+/g, ' '),
        value: (f[2] ?? '').trim(),
        line: lineNo,
        column: 1,
      });
      continue;
    }

    if (isTableStart(line) && i + 1 < clean.length && DELIMITER_RE.test(clean[i + 1] ?? '')) {
      flush();
      const head = splitRow(line).map((c) => c.text);
      const rows: string[][] = [];
      const rowLines: number[] = [];
      let j = i + 2;
      while (j < clean.length && isTableStart(clean[j] ?? '')) {
        const rowLine = clean[j] ?? '';
        const cells = splitRow(rowLine);
        const extra = cells[head.length];
        if (extra) {
          notes.push({
            code: 'OPM-I702',
            message: `Table row has ${cells.length} cells but the header has ${head.length}`,
            line: j + 1,
            column: extra.column,
          });
        }
        const row = cells.slice(0, head.length).map((c) => c.text);
        while (row.length < head.length) row.push('');
        rows.push(row);
        rowLines.push(j + 1);
        j++;
      }
      blocks.push({
        type: 'table',
        head,
        rows,
        rowLines,
        line: lineNo,
        column: leadingSpaces(line) + 1,
      });
      i = j - 1;
      continue;
    }

    const text = line.trim().replace(/[ \t]+/g, ' ');
    if (para) para.lines.push(text);
    else para = { lines: [text], line: lineNo, column: leadingSpaces(line) + 1 };
  }
  flush();

  return { blocks, marker, notes };
}
