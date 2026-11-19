// `opmap diff`: ProjectData for two git refs (or a ref and the working tree), compared (spec 06 §2.3).
import { diffProjects, parseProject } from '../core/index.js';
import type { ProjectSources, Source } from '../core/index.js';
import { OpmapError } from '../core/errors.js';
import type { ProjectDiff } from '../core/diff.js';
import type { ProjectData } from '../core/types.js';
import { buildData, parseOptionsFor } from './build.js';
import type { BuildOptions } from './build.js';
import { loadConfig } from './config.js';
import type { ResolvedConfig } from './config.js';
import { git, isSafeRef } from './git.js';
import { displayPath } from './sources.js';

export interface DiffOptions extends BuildOptions {
  /** The older ref, for example `origin/main`. */
  base: string;
  /** The newer ref. Default: the files in the working tree. */
  head?: string | undefined;
}

export interface DiffResult {
  diff: ProjectDiff;
  labels: { base: string; head: string };
}

function checkRef(ref: string): void {
  if (!isSafeRef(ref))
    throw new OpmapError(
      'OPM-E001',
      `"${ref}" is not a ref this tool will pass to git`,
      'Use a branch, tag or commit name such as origin/main, v0.4.0 or a SHA',
    );
}

/** One doc as it was at `ref` (read with `git show ref:./path`, never through a shell). */
function showAt(config: ResolvedConfig, ref: string, abs: string): Source | undefined {
  const path = displayPath(config.root, abs);
  const text = git(['show', `${ref}:./${path}`], config.root);
  return text === null ? undefined : { path, text };
}

function dataAt(config: ResolvedConfig, options: BuildOptions, ref: string): ProjectData {
  checkRef(ref);
  const roadmap = showAt(config, ref, config.docs.roadmap);
  if (roadmap === undefined)
    throw new OpmapError(
      'OPM-E001',
      `The roadmap file could not be read at ${ref}`,
      `Check that "${ref}" exists (in CI use fetch-depth: 0) and has ${displayPath(config.root, config.docs.roadmap)}`,
    );
  const sources: ProjectSources = {
    roadmap,
    decisions: config.docs.decisions ? showAt(config, ref, config.docs.decisions) : undefined,
    changelog: config.docs.changelog ? showAt(config, ref, config.docs.changelog) : undefined,
  };
  return parseProject(sources, parseOptionsFor(config, options));
}

export function diffRefs(options: DiffOptions): DiffResult {
  const config = loadConfig({
    cwd: options.cwd,
    configPath: options.configPath,
    ...(options.env ? { env: options.env } : {}),
  });
  // One "today" for both sides, so a date passing does not look like a change.
  const shared: BuildOptions = { ...options, now: parseOptionsFor(config, options).now };
  const base = dataAt(config, shared, options.base);
  const head =
    options.head === undefined
      ? buildData({ ...shared, git: false }).data
      : dataAt(config, shared, options.head);
  return {
    diff: diffProjects(base, head),
    labels: { base: options.base, head: options.head ?? 'working tree' },
  };
}
