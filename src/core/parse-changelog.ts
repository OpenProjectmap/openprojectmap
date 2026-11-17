// CHANGELOG parser (spec 02 §8): Keep a Changelog 1.1 and the common variants.
import { parseIsoDay } from './dates.js';
import { plainText } from './parse-roadmap.js';
import type { Source } from './parse-roadmap.js';
import { scan } from './scan.js';
import type { Release } from './types.js';

export interface ChangelogParse {
  /** In document order (Keep a Changelog puts the newest first). */
  releases: Release[];
}

const SEMVER_RE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/;
const BULLET_RE = /^[-*+]\s+(.*)$/;

interface Heading {
  version: string | null;
  date: string | null;
  title: string | null;
  unreleased: boolean;
}

/**
 * Read a release heading: `[Unreleased]`, `[0.2.0] - 2027-01-03`, `0.2.0 - 2027-01-03`,
 * `v0.2.0 (2027-01-03)`, `[0.2.0] — 2027-01-03 — Title`. Null when it is not a release.
 */
export function parseReleaseHeading(text: string): Heading | null {
  let t = text.trim();
  if (t.startsWith('[')) {
    const close = t.indexOf(']');
    if (close === -1) return null;
    const inner = t.slice(1, close).trim();
    t = inner + t.slice(close + 1);
  }
  if (/^unreleased\b/i.test(t)) {
    const rest = t
      .slice('unreleased'.length)
      .replace(/^[\s–—-]+/, '')
      .trim();
    return { version: null, date: null, title: rest === '' ? null : rest, unreleased: true };
  }
  const m = SEMVER_RE.exec(t);
  if (!m) return null;
  let rest = t.slice(m[0].length);
  if (rest !== '' && !/^[\s(–—-]/.test(rest)) return null;
  rest = rest.replace(/^[\s(–—-]+/, '');
  let date: string | null = null;
  const d = /^(\d{4}-\d{2}-\d{2})\)?/.exec(rest);
  if (d) {
    date = parseIsoDay(d[1] ?? '');
    rest = rest.slice(d[0].length);
  }
  const title = rest.replace(/^[\s–—-]+|[\s–—-]+$/g, '');
  return { version: m[1] ?? null, date, title: title === '' ? null : title, unreleased: false };
}

export function parseChangelog(source: Source): ChangelogParse {
  const { blocks } = scan(source.text);
  const releases: Release[] = [];
  let release: Release | null = null;
  let section: Release['sections'][number] | null = null;

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (block.level === 2) {
        const h = parseReleaseHeading(plainText(block.text));
        release = h && {
          version: h.version,
          date: h.date,
          title: h.title,
          unreleased: h.unreleased,
          sections: [],
          versionId: null,
          source: { file: source.path, line: block.line },
        };
        section = null;
        if (release) releases.push(release);
      } else if (block.level === 3 && release) {
        section = { heading: plainText(block.text), items: [] };
        release.sections.push(section);
      } else if (block.level <= 2) {
        release = null;
        section = null;
      }
      continue;
    }
    if (block.type !== 'paragraph' || !release) continue;
    let item: string | null = null;
    for (const line of block.lines) {
      const b = BULLET_RE.exec(line);
      if (b) {
        if (item !== null) section = push(release, section, item);
        item = b[1] ?? '';
      } else if (item !== null) {
        item = `${item} ${line}`;
      }
    }
    if (item !== null) section = push(release, section, item);
  }
  return { releases };

  /** Append an item, creating an untitled section when bullets come before any H3. */
  function push(
    r: Release,
    s: Release['sections'][number] | null,
    item: string,
  ): Release['sections'][number] {
    const target = s ?? { heading: '', items: [] };
    if (s === null) r.sections.push(target);
    target.items.push(item.trim());
    return target;
  }
}
