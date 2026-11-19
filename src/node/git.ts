// Git facts (spec 06 §1). This is the only place git is called: `execFile`, never a shell, with
// validated refs. Every failure soft-fails to null so a missing git never breaks a build.
import { execFile, execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { fromDayNumber, parseIsoDay, toDayNumber } from '../core/dates.js';
import type { ISODate } from '../core/dates.js';
import { diag } from '../core/diagnostics.js';
import type { Commit, Diagnostic, GitInfo } from '../core/types.js';

const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const FORMAT = '%h%x1f%cI%x1f%s';
const GIT_TIMEOUT_MS = 10_000;
const FETCH_TIMEOUT_MS = 60_000;
const AREA_WEEKS = 4;

/** A ref that is safe to hand to git: no leading dash, no `..`, no odd characters. */
export function isSafeRef(ref: string): boolean {
  return REF_RE.test(ref) && !ref.includes('..') && !ref.endsWith('/') && !ref.endsWith('.lock');
}

/** The environment for git: the caller's, minus every GIT_* variable that could redirect it. */
function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('GIT_')) env[k] = v;
  }
  env['GIT_TERMINAL_PROMPT'] = '0';
  env['LC_ALL'] = 'C';
  return env;
}

/** Run git with fixed arguments. Returns stdout, or null on any failure. */
export function git(args: readonly string[], cwd: string, timeout = GIT_TIMEOUT_MS): string | null {
  try {
    return execFileSync('git', [...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout,
      maxBuffer: 32 * 1024 * 1024,
      env: gitEnv(),
    });
  } catch {
    return null;
  }
}

/** Like `git()`, for work that may take a while (clone, fetch): the event loop keeps running. */
export function gitAsync(
  args: readonly string[],
  cwd: string,
  timeout = GIT_TIMEOUT_MS,
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      [...args],
      {
        cwd,
        encoding: 'utf8',
        timeout,
        maxBuffer: 32 * 1024 * 1024,
        env: gitEnv(),
        windowsHide: true,
      },
      (error, stdout) => resolve(error === null ? stdout : null),
    );
    child.stdin?.end();
  });
}

function parseCommit(out: string | null): Commit | null {
  if (out === null) return null;
  const [sha, date, ...subject] = out.trim().split('\x1f');
  if (!sha || !date) return null;
  return { sha, date, subject: subject.join('\x1f') };
}

function lastCommit(cwd: string, ref: string): Commit | null {
  if (ref !== 'HEAD' && !isSafeRef(ref)) return null;
  return parseCommit(git(['log', '-1', `--format=${FORMAT}`, '--end-of-options', ref], cwd));
}

/** Monday (UTC) of the week that holds `date`, as a day number. */
function mondayOf(date: ISODate): number {
  const dn = toDayNumber(date);
  return dn - ((((dn + 3) % 7) + 7) % 7); // 1970-01-01 was a Thursday
}

/** `*` is every top-level folder, `apps/*` every folder under apps, anything else a fixed prefix. */
function areaOf(file: string, areas: readonly string[]): string[] {
  const hits: string[] = [];
  const parts = file.split('/');
  for (const a of areas) {
    if (a === '*') {
      if (parts.length > 1) hits.push(parts[0] ?? '');
    } else if (a.endsWith('/*')) {
      const prefix = a.slice(0, -2);
      if (file.startsWith(`${prefix}/`) && parts.length > prefix.split('/').length + 1) {
        hits.push(parts.slice(0, prefix.split('/').length + 1).join('/'));
      }
    } else if (file === a || file.startsWith(`${a}/`)) {
      hits.push(a);
    }
  }
  return hits;
}

export interface GitOptions {
  /** The repo root; every git call runs here. */
  cwd: string;
  enabled: boolean;
  branches: Record<string, string>;
  areas: readonly string[];
  activityWeeks: number;
  /** The Now block's Updated date, for the commits-since count. */
  updated: ISODate | null;
  /** The roadmap file. Commits up to its last edit do not count towards staleness. */
  roadmapPath?: string;
  today: ISODate;
  /** Run `git fetch` first (`--fetch`). */
  fetch?: boolean;
}

export interface GitResult {
  info: GitInfo | null;
  commitsSince: number | null;
  diagnostics: Diagnostic[];
}

const NONE: GitResult = { info: null, commitsSince: null, diagnostics: [] };

export function gatherGit(options: GitOptions): GitResult {
  if (!options.enabled) return NONE;
  const { cwd } = options;
  const top = git(['rev-parse', '--show-toplevel'], cwd)?.trim();
  if (!top) {
    return {
      ...NONE,
      diagnostics: [diag('OPM-I801', 'Not a git repository, or git is not installed', undefined)],
    };
  }
  if (options.fetch) git(['fetch', '--quiet', '--no-tags', 'origin'], cwd, FETCH_TIMEOUT_MS);

  const diagnostics: Diagnostic[] = [];
  const shallow = git(['rev-parse', '--is-shallow-repository'], cwd)?.trim() === 'true';
  if (shallow) {
    diagnostics.push(
      diag('OPM-I802', 'This is a shallow clone, so git activity is incomplete', undefined),
    );
  }

  const branches: Record<string, Commit | null> = {};
  const resolved: Record<string, string> = {};
  for (const [role, ref] of Object.entries(options.branches)) {
    let found: Commit | null = null;
    for (const candidate of [`origin/${ref}`, ref]) {
      found = lastCommit(cwd, candidate);
      if (found) {
        resolved[role] = candidate;
        break;
      }
    }
    branches[role] = found;
    if (!found)
      diagnostics.push(diag('OPM-W803', `Branch "${ref}" (${role}) was not found`, undefined));
  }

  const head = lastCommit(cwd, 'HEAD');
  const liveRef = resolved['live'] ?? (head ? 'HEAD' : null);
  const info: GitInfo = {
    root: basename(top),
    head,
    branches,
    activity: liveRef ? activity(cwd, liveRef, options) : emptyActivity(options),
    shallow,
  };

  let commitsSince: number | null = null;
  if (options.updated !== null && parseIsoDay(options.updated) !== null) {
    // Count commits after the roadmap was last edited, so a busy day cannot make a Now block stale
    // that was refreshed in the same day.
    let range = 'HEAD';
    if (options.roadmapPath !== undefined) {
      const last = git(['log', '-1', '--format=%H', '--', options.roadmapPath], cwd)?.trim();
      if (last !== undefined && /^[0-9a-f]{40}$/.test(last)) range = `${last}..HEAD`;
    }
    const n = Number(
      git(['rev-list', '--count', `--since=${options.updated}T00:00:00Z`, range], cwd)?.trim(),
    );
    commitsSince = Number.isInteger(n) ? n : null;
  }
  return { info, commitsSince, diagnostics };
}

function weekStarts(options: GitOptions): ISODate[] {
  const monday = mondayOf(options.today);
  const out: ISODate[] = [];
  for (let i = options.activityWeeks - 1; i >= 0; i--) out.push(fromDayNumber(monday - 7 * i));
  return out;
}

function emptyActivity(options: GitOptions): GitInfo['activity'] {
  const starts = weekStarts(options);
  const areas: Record<string, number> = {};
  for (const a of options.areas) {
    if (a !== '*' && !a.endsWith('/*')) areas[a] = 0; // fixed prefixes are always listed
  }
  return { weekStarts: starts, commits: starts.map(() => 0), areas };
}

/** Commits per week and changed files per area, from the live branch. */
function activity(cwd: string, ref: string, options: GitOptions): GitInfo['activity'] {
  const result = emptyActivity(options);
  const first = toDayNumber(result.weekStarts[0] ?? options.today);
  const areaSince = mondayOf(options.today) - 7 * (AREA_WEEKS - 1);
  const out = git(
    [
      'log',
      '--since',
      `${fromDayNumber(first)}T00:00:00Z`,
      '--no-merges',
      '--format=%x1e%cI',
      '--name-only',
      '--end-of-options',
      ref,
    ],
    cwd,
  );
  if (out === null) return result;
  for (const chunk of out.split('\x1e')) {
    const [dateLine, ...files] = chunk.split('\n');
    const when = new Date((dateLine ?? '').trim());
    if (Number.isNaN(when.getTime())) continue;
    const day = toDayNumber(when.toISOString().slice(0, 10));
    const week = Math.floor((day - first) / 7);
    if (week < 0 || week >= result.commits.length) continue;
    result.commits[week] = (result.commits[week] ?? 0) + 1;
    if (day < areaSince) continue;
    for (const f of files) {
      const file = f.trim();
      if (file === '') continue;
      for (const area of areaOf(file, options.areas))
        result.areas[area] = (result.areas[area] ?? 0) + 1;
    }
  }
  return result;
}

/** The installed git version (`2.47.3`), or null when git is missing. */
export function gitVersion(cwd: string): string | null {
  const out = git(['--version'], cwd);
  return out === null ? null : (/(\d+\.\d+(?:\.\d+)?)/.exec(out)?.[1] ?? out.trim());
}
