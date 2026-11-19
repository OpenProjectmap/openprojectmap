// "Open docs…" (spec 05 §4.7): parse markdown files the person picks or drops, in the browser, with the
// same core the CLI uses. Nothing is uploaded: the files never leave the page.
import { OpmapError, parseProject } from '../../core/index.js';
import type { ProjectData } from '../../core/types.js';

export interface Picked {
  name: string;
  text: string;
}

export type Role = 'roadmap' | 'decisions' | 'changelog';

const MAX_FILES = 8;
const MAX_BYTES = 2_000_000;

/** Guess the role from the file name: ROADMAP, DECISIONS, CHANGELOG (any case, any prefix). */
export function classify(name: string): Role | null {
  const n = name.toLowerCase();
  if (!/\.(md|markdown|txt)$/.test(n)) return null;
  if (n.includes('roadmap')) return 'roadmap';
  if (n.includes('decision')) return 'decisions';
  if (n.includes('changelog') || n.includes('release-notes') || n.includes('history'))
    return 'changelog';
  return null;
}

export type OpenResult =
  { ok: true; data: ProjectData; used: string[]; ignored: string[] } | { ok: false; error: string };

/** Parse the picked files into ProjectData. Git facts are not available in the browser. */
export function parsePicked(files: readonly Picked[], now: string): OpenResult {
  const by: Partial<Record<Role, Picked>> = {};
  const ignored: string[] = [];
  for (const f of files.slice(0, MAX_FILES)) {
    const role = classify(f.name);
    if (role && !by[role]) by[role] = f;
    else ignored.push(f.name);
  }
  ignored.push(...files.slice(MAX_FILES).map((f) => f.name));
  if (!by.roadmap)
    return {
      ok: false,
      error: 'Add a file named ROADMAP.md (and, if you have them, DECISIONS.md and CHANGELOG.md).',
    };
  try {
    const data = parseProject(
      {
        roadmap: { path: by.roadmap.name, text: by.roadmap.text },
        decisions: by.decisions ? { path: by.decisions.name, text: by.decisions.text } : undefined,
        changelog: by.changelog ? { path: by.changelog.name, text: by.changelog.text } : undefined,
      },
      { now },
    );
    return { ok: true, data, used: Object.values(by).map((f) => f.name), ignored };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof OpmapError || e instanceof Error ? e.message : 'Could not read those files.',
    };
  }
}

/** Read File objects as text, skipping anything too big. Returns the names it skipped too. */
export async function readFiles(
  files: ArrayLike<File>,
): Promise<{ picked: Picked[]; tooBig: string[] }> {
  const picked: Picked[] = [];
  const tooBig: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f) continue;
    if (f.size > MAX_BYTES) tooBig.push(f.name);
    else picked.push({ name: f.name, text: await f.text() });
  }
  return { picked, tooBig };
}
