// Applies an editor transform to a doc file: re-parses before and after, refuses an edit that adds a
// diagnostic or misses its intended value, prints a diff for --dry-run, and writes atomically.
import { chmodSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseProject } from '../core/index.js';
import type { ParseProjectOptions, ProjectSources, Source } from '../core/index.js';
import type { Diagnostic, ProjectData } from '../core/types.js';
import { resolveNow } from './build.js';
import { loadConfig } from './config.js';
import type { ResolvedConfig } from './config.js';
import { EditError, unifiedDiff } from './editor.js';
import { readSources } from './sources.js';

export type DocFile = 'roadmap' | 'decisions';

export interface EditRequest {
  cwd: string;
  configPath?: string | undefined;
  env?: Record<string, string | undefined>;
  now?: string | undefined;
  file: DocFile;
  /** Returns the new text. Throws EditError for a request that cannot be applied. */
  transform: (text: string, data: ProjectData) => string;
  /** Returns a message when the edited project does not hold the intended value. */
  expect?: (after: ProjectData) => string | null;
  dryRun?: boolean;
}

export interface EditResult {
  changed: boolean;
  /** Repo-relative path of the edited file. */
  path: string;
  diff: string;
  after: ProjectData;
}

/** A diagnostic's identity, ignoring line numbers (an insert shifts them). */
const key = (d: Diagnostic): string => `${d.code}|${d.message.replace(/line \d+/g, 'line N')}`;

function newDiagnostics(before: readonly Diagnostic[], after: readonly Diagnostic[]): Diagnostic[] {
  const counts = new Map<string, number>();
  for (const d of before) counts.set(key(d), (counts.get(key(d)) ?? 0) + 1);
  const added: Diagnostic[] = [];
  for (const d of after) {
    const left = counts.get(key(d)) ?? 0;
    if (left > 0) counts.set(key(d), left - 1);
    else added.push(d);
  }
  return added;
}

function parse(
  config: ResolvedConfig,
  sources: ProjectSources,
  now: string,
  today?: string,
): ProjectData {
  const opts: ParseProjectOptions = {
    now,
    ...(today === undefined ? {} : { today }),
    name: config.name,
    idPattern: config.idPattern,
    staleAfterDays: config.staleAfterDays,
    requireDoneRef: config.requireDoneRef,
  };
  return parseProject(sources, opts);
}

export function applyEdit(req: EditRequest): EditResult {
  const config = loadConfig({
    cwd: req.cwd,
    configPath: req.configPath,
    ...(req.env ? { env: req.env } : {}),
  });
  const sources = readSources(config);
  const source = sources[req.file];
  const abs = req.file === 'roadmap' ? config.docs.roadmap : config.docs.decisions;
  if (!source || !abs) throw new EditError(`The ${req.file} file is not set up for this project`);
  const { now, today } = resolveNow(req.now, 'utc');

  const before = parse(config, sources, now, today);
  const text = req.transform(source.text, before);
  if (text === source.text) return { changed: false, path: source.path, diff: '', after: before };

  const edited: Source = { path: source.path, text };
  const after = parse(config, { ...sources, [req.file]: edited }, now, today);
  const added = newDiagnostics(before.diagnostics, after.diagnostics);
  if (added.length > 0) {
    throw new EditError(
      `The edit would add a problem to the docs, so nothing was changed:\n${added.map((d) => `- ${d.code} ${d.message}`).join('\n')}`,
    );
  }
  const miss = req.expect?.(after);
  if (miss)
    throw new EditError(
      `The edit did not produce the intended result (${miss}), so nothing was changed`,
    );

  const diff = unifiedDiff(source.path, source.text, text);
  if (req.dryRun !== true) writeAtomic(abs, text);
  return { changed: true, path: source.path, diff, after };
}

/** Write to a temporary file next to the target, then rename over it. */
export function writeAtomic(path: string, text: string): void {
  const tmp = join(dirname(path), `.${basename(path)}.opmap-${process.pid}.tmp`);
  try {
    writeFileSync(tmp, text);
    chmodSync(tmp, statSync(path).mode & 0o777);
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
