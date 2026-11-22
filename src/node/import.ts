// `opmap import` (spec 04 §2): reads another tool's issues and writes a draft roadmap next to the
// real one. It never edits the roadmap, and it refuses to overwrite an earlier draft without --force.
import { lstatSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildDraft, fromCsv, fromGithub, parseCsv, CSV_MAX_BYTES } from '../core/import.js';
import type { DraftResult } from '../core/import.js';
import { OpmapError } from '../core/errors.js';
import { git } from './git.js';
import { ghList, repoFromRemote } from './gh.js';
import type { GhRunner } from './gh.js';
import { loadConfig } from './config.js';
import { displayPath } from './sources.js';
import { todayOf } from './init.js';
import { resolveNow } from './build.js';

export const DRAFT_NAME = 'ROADMAP.import.md';

export interface ImportOptions {
  cwd: string;
  configPath?: string | undefined;
  env?: Record<string, string | undefined>;
  now?: string | undefined;
  force?: boolean;
  /** Return the draft without writing it. */
  dryRun?: boolean;
}

export interface ImportResult extends DraftResult {
  /** Repo-relative path of the draft. */
  path: string;
  written: boolean;
}

function target(options: ImportOptions): { abs: string; path: string; root: string } {
  const config = loadConfig({
    cwd: options.cwd,
    configPath: options.configPath,
    ...(options.env ? { env: options.env } : {}),
  });
  const abs = join(dirname(config.docs.roadmap), DRAFT_NAME);
  return { abs, path: displayPath(config.root, abs), root: config.root };
}

function finish(draft: DraftResult, options: ImportOptions): ImportResult {
  const { abs, path } = target(options);
  if (options.dryRun === true) return { ...draft, path, written: false };
  if (lstatSync(abs, { throwIfNoEntry: false }) !== undefined && options.force !== true) {
    throw new OpmapError(
      'OPM-E001',
      `${path} already exists`,
      'Review or delete it, or run the import again with --force to replace it',
    );
  }
  // Replace the file itself, never what a link at that name points to.
  if (lstatSync(abs, { throwIfNoEntry: false }) !== undefined) rmSync(abs, { force: true });
  writeFileSync(abs, draft.text, { flag: 'wx' });
  return { ...draft, path, written: true };
}

const todayFor = (options: ImportOptions): string => todayOf(resolveNow(options.now, 'utc').now);

export function importGithub(
  options: ImportOptions & { repo?: string | undefined; milestonesOnly?: boolean; gh?: GhRunner },
): ImportResult {
  const { root } = target(options);
  const repo =
    options.repo ?? repoFromRemote(git(['remote', 'get-url', 'origin'], root) ?? '') ?? undefined;
  if (repo === undefined) {
    throw new OpmapError(
      'OPM-E001',
      'Could not tell which GitHub repository to read',
      'Pass --repo owner/repo',
    );
  }
  const milestones = ghList('milestones', repo, options.gh);
  const issues =
    options.milestonesOnly === true
      ? { items: [], truncated: false }
      : ghList('issues', repo, options.gh);
  const input = fromGithub(repo, milestones.items, issues.items, {
    today: todayFor(options),
    milestonesOnly: options.milestonesOnly === true,
  });
  if (milestones.truncated || issues.truncated)
    input.notes = [
      ...(input.notes ?? []),
      'The list was cut at the page limit, so some items are missing.',
    ];
  return finish(buildDraft(input), options);
}

export function importCsv(options: ImportOptions & { file: string }): ImportResult {
  const abs = options.file;
  let size: number;
  try {
    size = statSync(abs).size;
  } catch {
    throw new OpmapError('OPM-E001', `The file ${options.file} could not be read`);
  }
  if (size > CSV_MAX_BYTES)
    throw new OpmapError('OPM-E001', `The file is bigger than ${CSV_MAX_BYTES} bytes`);
  let rows: string[][];
  try {
    rows = parseCsv(readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new OpmapError('OPM-E001', `The CSV file could not be read: ${(e as Error).message}`);
  }
  let input;
  try {
    input = fromCsv(abs.split(/[\\/]/).pop() ?? abs, rows, { today: todayFor(options) });
  } catch (e) {
    throw new OpmapError('OPM-E001', (e as Error).message);
  }
  return finish(buildDraft(input), options);
}
