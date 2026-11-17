// Inline markdown subset (spec 05 §3): bold, italic, strike, code, links, autolinks, bare URLs and
// deliverable IDs. Everything else, including any HTML tag, stays literal text. Output is data:
// the client turns it into DOM nodes, so there is no string path to innerHTML.

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'code'; s: string }
  | { t: 'bold' | 'italic' | 'strike'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'id'; id: string };

const MAX_DEPTH = 4;
const ID_RE = /^\d+\.\d+\.\d+-D\d+/;
const URL_RE = /^https?:\/\/[^\s<>]+/;
const WORD = /[\p{L}\p{N}]/u;

function isWord(ch: string | undefined): boolean {
  return ch !== undefined && ch !== '' && WORD.test(ch);
}

/** Trim sentence punctuation that is not part of a bare URL. */
function trimUrl(url: string): string {
  let end = url.length;
  while (end > 0 && '.,;:!?\'"'.includes(url.charAt(end - 1))) end--;
  // An unmatched closing parenthesis belongs to the sentence, not the URL.
  while (end > 0 && url.charAt(end - 1) === ')' && !url.slice(0, end).includes('(')) end--;
  return url.slice(0, end);
}

export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = (): void => {
    if (buf !== '') {
      out.push({ t: 'text', s: buf });
      buf = '';
    }
  };
  const emphasis = (marker: string, kind: 'bold' | 'italic' | 'strike', i: number): number => {
    if (depth >= MAX_DEPTH) return -1;
    const start = i + marker.length;
    const end = text.indexOf(marker, start);
    if (end === -1 || end === start) return -1;
    const inner = text.slice(start, end);
    if (/^\s|\s$/.test(inner)) return -1;
    flush();
    out.push({ t: kind, c: parseInline(inner, depth + 1) });
    return end + marker.length;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    let next = -1;

    if (ch === '`') {
      let run = 1;
      while (text.charAt(i + run) === '`') run++;
      const fence = '`'.repeat(run);
      const end = text.indexOf(fence, i + run);
      if (end !== -1 && end > i + run) {
        flush();
        out.push({ t: 'code', s: text.slice(i + run, end).replace(/^ (.*) $/, '$1') });
        next = end + run;
      } else {
        buf += fence;
        next = i + run;
      }
    } else if (text.startsWith('**', i)) {
      next = emphasis('**', 'bold', i);
    } else if (text.startsWith('~~', i)) {
      next = emphasis('~~', 'strike', i);
    } else if (ch === '*') {
      next = emphasis('*', 'italic', i);
    } else if (ch === '_' && !isWord(text.charAt(i - 1)) && i + 1 < text.length) {
      const end = text.indexOf('_', i + 1);
      if (
        end !== -1 &&
        end > i + 1 &&
        !isWord(text.charAt(end + 1)) &&
        depth < MAX_DEPTH &&
        !/^\s|\s$/.test(text.slice(i + 1, end))
      ) {
        flush();
        out.push({ t: 'italic', c: parseInline(text.slice(i + 1, end), depth + 1) });
        next = end + 1;
      }
    } else if (ch === '[') {
      const close = text.indexOf('](', i + 1);
      const end = close === -1 ? -1 : text.indexOf(')', close + 2);
      if (close !== -1 && end !== -1 && close > i + 1) {
        const href = text.slice(close + 2, end).trim();
        if (href !== '' && !/\s/.test(href) && depth < MAX_DEPTH) {
          flush();
          out.push({ t: 'link', href, c: parseInline(text.slice(i + 1, close), depth + 1) });
          next = end + 1;
        }
      }
    } else if (ch === '<') {
      const end = text.indexOf('>', i + 1);
      const inner = end === -1 ? '' : text.slice(i + 1, end);
      if (end !== -1 && URL_RE.test(inner) && !/\s/.test(inner)) {
        flush();
        out.push({ t: 'link', href: inner, c: [{ t: 'text', s: inner }] });
        next = end + 1;
      }
    } else if ((ch === 'h' || ch === 'H') && !isWord(text.charAt(i - 1))) {
      const m = URL_RE.exec(text.slice(i));
      if (m) {
        const url = trimUrl(m[0]);
        if (url.length > 'https://'.length - 1) {
          flush();
          out.push({ t: 'link', href: url, c: [{ t: 'text', s: url }] });
          next = i + url.length;
        }
      }
    } else if (
      ch >= '0' &&
      ch <= '9' &&
      !isWord(text.charAt(i - 1)) &&
      text.charAt(i - 1) !== '.'
    ) {
      const m = ID_RE.exec(text.slice(i));
      if (m && !isWord(text.charAt(i + m[0].length))) {
        flush();
        out.push({ t: 'id', id: m[0] });
        next = i + m[0].length;
      }
    }

    if (next === -1) {
      buf += ch;
      i++;
    } else {
      i = next;
    }
  }
  flush();
  return out;
}

/** The plain text of inline tokens, for search and aria labels. */
export function inlineText(tokens: readonly Inline[]): string {
  return tokens
    .map((t) => {
      if (t.t === 'text' || t.t === 'code') return t.s;
      if (t.t === 'id') return t.id;
      return inlineText(t.c);
    })
    .join('');
}
