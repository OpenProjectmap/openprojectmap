// Status vocabulary (spec 02 §4, decision D8): six fixed statuses with aliases.
import { parseIsoDay } from './dates.js';
import type { ISODate } from './dates.js';
import type { Status } from './types.js';

export const STATUSES: readonly Status[] = ['todo', 'doing', 'review', 'blocked', 'done', 'parked'];

const ALIASES: Record<Status, readonly string[]> = {
  todo: ['todo', 'to do', 'planned', 'not started', 'open', 'next'],
  doing: ['doing', 'in progress', 'wip', 'started', 'active', 'building'],
  review: ['review', 'in review', 'testing', 'qa', 'built', 'staging'],
  blocked: ['blocked', 'waiting', 'on hold', 'stuck'],
  done: ['done', 'shipped', 'merged', 'complete', 'completed', '✅', '[x]'],
  parked: ['parked', 'deferred', 'cut', 'dropped', "won't do", 'wont do', 'moved'],
};

/** Every phrase, longest first, so `in progress` wins over a shorter prefix. */
const PHRASES: { phrase: string; status: Status }[] = STATUSES.flatMap((status) =>
  ALIASES[status].map((phrase) => ({ phrase, status })),
).sort((a, b) => b.phrase.length - a.phrase.length);

export interface ParsedStatus {
  status: Status;
  /** The cell as written, trimmed. */
  raw: string;
  /** An ISO date found anywhere in the cell. */
  date: ISODate | null;
  /** `#123`, a URL or a commit SHA found in the cell. */
  ref: string | null;
  /** True when the leading word is not in the vocabulary (`OPM-W301`). The status is `todo`. */
  unknown: boolean;
  /** For an unknown word: the closest known status within edit distance 2. */
  suggestion: Status | null;
}

const DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const REF_RE = /#\d+|https?:\/\/[^\s)>\]]+|\b[0-9a-f]{7,40}\b/gi;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

/** Remove markdown emphasis and code ticks around the status word. */
function plain(cell: string): string {
  return cell.replace(/[*_`]/g, '').trim().toLowerCase();
}

function boundaryAfter(text: string, end: number): boolean {
  const next = text.slice(end, end + 1);
  return next === '' || !WORD_CHAR_RE.test(next);
}

function findDate(cell: string): ISODate | null {
  for (const m of cell.matchAll(DATE_RE)) {
    const d = parseIsoDay(m[0]);
    if (d) return d;
  }
  return null;
}

function findRef(cell: string): string | null {
  for (const m of cell.matchAll(REF_RE)) {
    const v = m[0];
    // A bare hex word must contain a digit, or `decade` would look like a SHA.
    if (/^[0-9a-f]+$/i.test(v) && !/\d/.test(v)) continue;
    return v;
  }
  return null;
}

/** Levenshtein distance, early exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

/** Closest known status for the leading word, or the leading two words (`in progres`). */
function suggest(candidates: string[]): Status | null {
  let best: { status: Status; distance: number } | null = null;
  for (const candidate of candidates) {
    for (const { phrase, status } of PHRASES) {
      const d = editDistance(candidate, phrase);
      if (d <= 2 && (best === null || d < best.distance)) best = { status, distance: d };
    }
  }
  return best?.status ?? null;
}

/** Parse a status cell: `<word> [<date>] [<anything>]`. */
export function parseStatus(cell: string): ParsedStatus {
  const raw = cell.trim();
  const text = plain(raw);
  const date = findDate(raw);
  const ref = findRef(raw);
  if (text === '') return { status: 'todo', raw, date, ref, unknown: false, suggestion: null };
  for (const { phrase, status } of PHRASES) {
    if (
      text.startsWith(phrase) &&
      (!WORD_CHAR_RE.test(phrase.slice(-1)) || boundaryAfter(text, phrase.length))
    ) {
      return { status, raw, date, ref, unknown: false, suggestion: null };
    }
  }
  const words = text.replace(/’/g, "'").split(/\s+/);
  const first = words[0] ?? text;
  const candidates = words.length > 1 ? [first, `${first} ${words[1] ?? ''}`] : [first];
  return {
    status: 'todo',
    raw,
    date,
    ref,
    unknown: true,
    suggestion: suggest(candidates),
  };
}
