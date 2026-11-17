// Dates (spec 02 §6). Calendar dates only: no time, no timezone, no clock. Pure and isomorphic.

/** `YYYY-MM-DD`. */
export type ISODate = string;

export interface DateWindow {
  start: ISODate;
  end: ISODate;
  /** The text as written. */
  raw: string;
  /** Text after the dates, without surrounding parentheses. */
  note?: string;
  /** True when the note says "tentative" or contains a "?". */
  tentative: boolean;
}

export type PointKind = 'day' | 'month' | 'quarter' | 'year';

export interface DatePoint {
  kind: PointKind;
  start: ISODate;
  end: ISODate;
}

export type WindowProblem = 'unparseable' | 'start-after-end';

export interface WindowResult {
  /** Null when the text is not a window. Set (but wrong way round) for `start-after-end`. */
  window: DateWindow | null;
  problem: WindowProblem | null;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_DAYS[month - 1] ?? 0;
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

export function formatDate(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Return the date when `text` is a valid `YYYY-MM-DD` calendar day, else null. */
export function parseIsoDay(text: string): ISODate | null {
  const m = ISO_DAY_RE.exec(text.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return formatDate(y, mo, d);
}

/** Days since 1970-01-01 for a valid ISO date (negative before). Uses the civil-date algorithm. */
export function toDayNumber(date: ISODate): number {
  const y0 = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link toDayNumber}. */
export function fromDayNumber(days: number): ISODate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return formatDate(y, m, d);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a);
}

const POINT_RE = /^(\d{4})(?:-Q([1-4])|-(\d{2})(?:-(\d{2}))?)?/;

interface PointMatch {
  point: DatePoint;
  /** Index in the input just after the point. */
  next: number;
}

function matchPoint(text: string, from: number): PointMatch | null {
  const m = POINT_RE.exec(text.slice(from));
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 1) return null;
  const next = from + m[0].length;
  // A point must not run straight into more digits or a dash (`2026-111`, `2026-01-011`).
  const after = text.charCodeAt(next);
  if ((after >= 48 && after <= 57) || after === 45) return null;
  let point: DatePoint;
  if (m[2] !== undefined) {
    const q = Number(m[2]);
    const lastMonth = q * 3;
    point = {
      kind: 'quarter',
      start: formatDate(y, lastMonth - 2, 1),
      end: formatDate(y, lastMonth, daysInMonth(y, lastMonth)),
    };
  } else if (m[3] !== undefined) {
    const mo = Number(m[3]);
    if (mo < 1 || mo > 12) return null;
    if (m[4] !== undefined) {
      const d = Number(m[4]);
      if (d < 1 || d > daysInMonth(y, mo)) return null;
      const day = formatDate(y, mo, d);
      point = { kind: 'day', start: day, end: day };
    } else {
      point = {
        kind: 'month',
        start: formatDate(y, mo, 1),
        end: formatDate(y, mo, daysInMonth(y, mo)),
      };
    }
  } else {
    point = { kind: 'year', start: formatDate(y, 1, 1), end: formatDate(y, 12, 31) };
  }
  return { point, next };
}

/** Parse one point: a day, month, quarter or year. Null when the text is anything else. */
export function parsePoint(text: string): DatePoint | null {
  const t = text.trim();
  const m = matchPoint(t, 0);
  return m && m.next === t.length ? m.point : null;
}

function skipSpace(text: string, from: number): number {
  let i = from;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  return i;
}

/** Length of an arrow at `i` (0 when there is none). `to` needs whitespace on both sides. */
function arrowLength(text: string, i: number, hadSpace: boolean): number {
  if (text.startsWith('->', i) || text.startsWith('..', i)) return 2;
  if (text[i] === '→' || text[i] === '–') return 1;
  if (hadSpace && text.startsWith('to', i)) {
    const after = text[i + 2];
    if (after === ' ' || after === '\t') return 2;
  }
  return 0;
}

function cleanNote(rest: string): string | undefined {
  let note = rest.trim();
  if (note.length >= 2 && note.startsWith('(') && note.endsWith(')'))
    note = note.slice(1, -1).trim();
  return note === '' ? undefined : note;
}

/**
 * Parse a version window: a point, or `point arrow point`, then an optional note.
 * `OPM-W202` is `problem: 'unparseable'`; `OPM-W203` is `problem: 'start-after-end'`.
 */
export function parseWindow(raw: string): WindowResult {
  const text = raw.trim();
  const first = matchPoint(text, 0);
  if (!first) return { window: null, problem: 'unparseable' };
  const afterFirst = skipSpace(text, first.next);
  const arrow = arrowLength(text, afterFirst, afterFirst > first.next);
  let end = first.point.end;
  let rest: string;
  if (arrow > 0) {
    const secondAt = skipSpace(text, afterFirst + arrow);
    const second = matchPoint(text, secondAt);
    if (!second) return { window: null, problem: 'unparseable' };
    end = second.point.end;
    rest = text.slice(second.next);
  } else {
    rest = text.slice(first.next);
  }
  // A note must be separated from the dates by whitespace (or be a parenthesis).
  if (rest !== '' && rest[0] !== ' ' && rest[0] !== '\t' && rest[0] !== '(') {
    return { window: null, problem: 'unparseable' };
  }
  const note = cleanNote(rest);
  // A note that starts like a date or a dash is almost surely a mistyped range (`a - b`, `a 2027`).
  if (note !== undefined && /^[-\u2014\u2212\d]/.test(note))
    return { window: null, problem: 'unparseable' };
  const window: DateWindow = {
    start: first.point.start,
    end,
    raw: text,
    tentative: note !== undefined && /tentative|\?/i.test(note),
  };
  if (note !== undefined) window.note = note;
  return { window, problem: first.point.start > end ? 'start-after-end' : null };
}
