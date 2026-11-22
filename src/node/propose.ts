// Feature intake on disk (spec 06 §6): the placement report for an idea, the check of a drafted
// row, and saving a draft under `proposals/` next to the roadmap. None of it edits the roadmap.
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { checkRow, parseRow, propose } from '../core/index.js';
import type { Proposal, RowCheck } from '../core/index.js';
import { cleanText } from '../core/import.js';
import { OpmapError } from '../core/errors.js';
import { DEFAULT_ID_PATTERN } from '../core/parse-roadmap.js';
import { buildData, resolveNow } from './build.js';
import { loadConfig } from './config.js';
import { todayOf } from './init.js';
import { displayPath } from './sources.js';

export interface ProposeContext {
  cwd: string;
  configPath?: string | undefined;
  env?: Record<string, string | undefined>;
  now?: string | undefined;
}

const dataOf = (ctx: ProposeContext) =>
  buildData({
    cwd: ctx.cwd,
    configPath: ctx.configPath,
    ...(ctx.env ? { env: ctx.env } : {}),
    now: ctx.now,
    git: false,
  });

export const MAX_IDEA = 2000;

/** Where an idea could go, and what it touches. */
export function proposalFor(ctx: ProposeContext, idea: string): Proposal {
  const text = idea.trim();
  if (text === '') throw new OpmapError('OPM-E001', 'Describe the idea in a sentence');
  if (text.length > MAX_IDEA)
    throw new OpmapError('OPM-E001', `The idea is longer than ${MAX_IDEA} characters`);
  return propose(dataOf(ctx).data, text);
}

export interface CheckedRows {
  /** Repo-relative path when the input was a file, else null. */
  file: string | null;
  checks: RowCheck[];
  ok: boolean;
}

/** `input` is one table row, or the path of a draft file whose rows are all checked. */
export function checkProposal(ctx: ProposeContext, input: string): CheckedRows {
  const { data, config } = dataOf(ctx);
  const options = {
    idPatterns: [
      { pattern: config.idPattern, track: null },
      ...config.tracks.map((t) => ({ pattern: t.idPattern ?? DEFAULT_ID_PATTERN, track: t.id })),
    ],
  };
  let rows: string[] = [input];
  let file: string | null = null;
  if (!input.trimStart().startsWith('|')) {
    // A path, inside the repo.
    const abs = resolve(ctx.cwd, input);
    let real: string;
    try {
      real = realpathSync(abs);
      if (!statSync(real).isFile()) throw new Error('not a file');
    } catch {
      throw new OpmapError(
        'OPM-E001',
        `"${input.slice(0, 80)}" is neither a table row nor a file`,
        'Pass a row such as `| 0.6.0-D6 | **Title** | todo | |`, or the path of a draft',
      );
    }
    const rel = relative(config.root, real);
    if (rel.startsWith('..') || isAbsolute(rel))
      throw new OpmapError('OPM-E001', 'The draft must be inside the repository');
    file = displayPath(config.root, real);
    rows = readFileSync(real, 'utf8')
      .split(/\r?\n/)
      .filter((l) => {
        const r = parseRow(l);
        return r !== null && r.id.toLowerCase() !== 'id' && !/^-+$/.test(r.id);
      });
    if (rows.length === 0) throw new OpmapError('OPM-E001', `${file} has no table rows to check`);
  }
  const checks = rows.map((r) => checkRow(data, r, options));
  return { file, checks, ok: checks.every((c) => c.ok) };
}

export interface SaveInput {
  /** The file name without `.md`: lower-case words and dashes. */
  slug: string;
  title: string;
  idea: string;
  /** Table rows, written the way they would go in the roadmap. */
  rows?: readonly string[];
  /** The version the rows would go in, for the reader. */
  version?: string | undefined;
  notes?: string | undefined;
}

/** One line, with `|` escaped so a cell cannot end early. */
const escapeCell = (s: string): string =>
  s
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** Writes `proposals/<slug>.md` next to the roadmap. Refuses to replace a file. Never edits the roadmap. */
export function saveProposal(
  ctx: ProposeContext,
  input: SaveInput,
): { path: string; text: string } {
  if (!SLUG_RE.test(input.slug))
    throw new OpmapError(
      'OPM-E001',
      'The slug must be lower-case words and dashes, like "dark-mode"',
    );
  const config = loadConfig({
    cwd: ctx.cwd,
    configPath: ctx.configPath,
    ...(ctx.env ? { env: ctx.env } : {}),
  });
  const dir = join(dirname(config.docs.roadmap), 'proposals');
  const abs = join(dir, `${input.slug}.md`);
  const today = todayOf(resolveNow(ctx.now, 'utc').now);
  const rows = (input.rows ?? []).map((r) => {
    const row = parseRow(r);
    if (row === null) throw new OpmapError('OPM-E001', `Not a table row: "${cleanText(r, 60)}"`);
    return `| ${cleanText(row.id, 60)} | ${escapeCell(row.title)} | ${cleanText(row.status, 20)} | ${escapeCell(row.notes)} |`;
  });
  const para = (s: string): string => s.replace(/\r\n?/g, '\n').trim();
  const text =
    [
      `# Proposal: ${cleanText(input.title, 120) || input.slug}`,
      '',
      `> A draft written on ${today}. It is not part of the roadmap: review it, then copy the rows into`,
      '> the roadmap yourself (check them first with `opmap propose --check <this file>`).',
      '',
      '## Idea',
      '',
      para(input.idea),
      ...(input.version ? ['', `## Where it fits`, '', cleanText(input.version, 80)] : []),
      ...(rows.length > 0
        ? [
            '',
            '## Proposed rows',
            '',
            '| ID | Deliverable | Status | Notes |',
            '| --- | --- | --- | --- |',
            ...rows,
          ]
        : []),
      ...(input.notes ? ['', '## Notes', '', para(input.notes)] : []),
    ].join('\n') + '\n';
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(abs, text, { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST')
      throw new OpmapError(
        'OPM-E001',
        `${displayPath(config.root, abs)} already exists`,
        'Choose another slug',
      );
    throw e;
  }
  return { path: displayPath(config.root, abs), text };
}
