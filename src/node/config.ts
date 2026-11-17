// Config discovery, validation and path containment (spec 04 §3, spec 07 §3).
// Hand-written validation: every problem is listed with the key and the expected type.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { OpmapError } from '../core/errors.js';
import { DEFAULT_ID_PATTERN } from '../core/parse-roadmap.js';

export const CONFIG_FILE = 'opmap.config.json';
export const DEFAULT_ROADMAP = 'docs/project/ROADMAP.md';
export const DEFAULT_DECISIONS = 'docs/project/DECISIONS.md';
export const DEFAULT_CHANGELOG = 'CHANGELOG.md';
const MAX_PATTERN_LENGTH = 200;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
const TRACK_ID_RE = /^[a-z0-9-]{1,32}$/;
const AREA_RE = /^(\*|[^*\s][^*]*(\/\*)?)$/;

export interface TrackConfig {
  id: string;
  title: string;
  /** Absolute path, inside the repo root. */
  file: string;
  blockPattern: RegExp | null;
  idPattern: RegExp | null;
}

export interface ResolvedConfig {
  format: 1;
  name: string;
  /** Absolute path of the config file, or null when defaults are used. */
  configPath: string | null;
  /** The repo root (realpath): the directory with `.git`, else the config's directory. */
  root: string;
  docs: { roadmap: string; decisions: string | null; changelog: string | null };
  idPattern: RegExp;
  requireDoneRef: boolean;
  staleAfterDays: number;
  git: {
    enabled: boolean;
    branches: Record<string, string>;
    areas: string[];
    activityWeeks: number;
  };
  output: { dir: string; json: boolean };
  theme: { accent: string; mode: 'auto' | 'light' | 'dark'; density: 'comfortable' | 'compact' };
  tracks: TrackConfig[];
}

export interface LoadConfigOptions {
  cwd: string;
  /** `--config`. Wins over the environment. */
  configPath?: string | undefined;
  env?: Record<string, string | undefined>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The validated but not yet path-resolved config. */
export interface RawConfig {
  name: string | null;
  docs: {
    roadmap: string | null;
    decisions: string | null | undefined;
    changelog: string | null | undefined;
  };
  idPattern: RegExp;
  requireDoneRef: boolean;
  staleAfterDays: number;
  git: {
    enabled: boolean;
    branches: Record<string, string>;
    areas: string[];
    activityWeeks: number;
  };
  output: { dir: string; json: boolean };
  theme: ResolvedConfig['theme'];
  tracks: {
    id: string;
    title: string;
    file: string;
    blockPattern: RegExp | null;
    idPattern: RegExp | null;
  }[];
}

function compilePattern(value: string, key: string, problems: string[]): RegExp | null {
  if (value.length > MAX_PATTERN_LENGTH) {
    problems.push(`${key}: at most ${MAX_PATTERN_LENGTH} characters`);
    return null;
  }
  try {
    return new RegExp(value, 'u');
  } catch {
    problems.push(`${key}: not a valid regular expression (flag u)`);
    return null;
  }
}

/** Validate a parsed config object. Returns every problem, not just the first. */
export function validateConfig(input: unknown): { config: RawConfig | null; problems: string[] } {
  const problems: string[] = [];
  if (!isObj(input)) return { config: null, problems: ['the file must contain a JSON object'] };

  const checkKeys = (o: Obj, allowed: readonly string[], prefix: string): void => {
    for (const k of Object.keys(o)) {
      if (!allowed.includes(k)) problems.push(`${prefix}${k}: unknown key`);
    }
  };
  const section = (key: string): Obj => {
    const v = input[key];
    if (v === undefined) return {};
    if (!isObj(v)) {
      problems.push(`${key}: expected an object`);
      return {};
    }
    return v;
  };
  const str = (o: Obj, key: string, path: string, min = 1, max = 4096): string | undefined => {
    const v = o[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || v.length < min || v.length > max) {
      problems.push(`${path}: expected a string of ${min} to ${max} characters`);
      return undefined;
    }
    return v;
  };
  const bool = (o: Obj, key: string, path: string, dflt: boolean): boolean => {
    const v = o[key];
    if (v === undefined) return dflt;
    if (typeof v !== 'boolean') {
      problems.push(`${path}: expected true or false`);
      return dflt;
    }
    return v;
  };
  const int = (
    o: Obj,
    key: string,
    path: string,
    min: number,
    max: number,
    dflt: number,
  ): number => {
    const v = o[key];
    if (v === undefined) return dflt;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      problems.push(`${path}: expected a whole number from ${min} to ${max}`);
      return dflt;
    }
    return v;
  };
  const oneOf = <T extends string>(
    o: Obj,
    key: string,
    path: string,
    allowed: readonly T[],
    dflt: T,
  ): T => {
    const v = o[key];
    if (v === undefined) return dflt;
    if (typeof v !== 'string' || !allowed.includes(v as T)) {
      problems.push(`${path}: expected one of ${allowed.join(', ')}`);
      return dflt;
    }
    return v as T;
  };

  checkKeys(
    input,
    [
      '$schema',
      'format',
      'name',
      'docs',
      'idPattern',
      'requireDoneRef',
      'staleAfterDays',
      'git',
      'output',
      'theme',
      'tracks',
    ],
    '',
  );
  if (input['format'] !== undefined && input['format'] !== 1) problems.push('format: must be 1');
  const name = str(input, 'name', 'name', 1, 80) ?? null;

  const docsObj = section('docs');
  checkKeys(docsObj, ['roadmap', 'decisions', 'changelog'], 'docs.');
  const optionalPath = (key: string): string | null | undefined => {
    if (docsObj[key] === null) return null;
    return str(docsObj, key, `docs.${key}`);
  };
  const docs = {
    roadmap: str(docsObj, 'roadmap', 'docs.roadmap') ?? null,
    decisions: optionalPath('decisions'),
    changelog: optionalPath('changelog'),
  };

  let idPattern = DEFAULT_ID_PATTERN;
  const idp = str(input, 'idPattern', 'idPattern', 1, 100_000);
  if (idp !== undefined)
    idPattern = compilePattern(idp, 'idPattern', problems) ?? DEFAULT_ID_PATTERN;

  const requireDoneRef = bool(input, 'requireDoneRef', 'requireDoneRef', false);
  const staleAfterDays = int(input, 'staleAfterDays', 'staleAfterDays', 1, 365, 14);

  const gitObj = section('git');
  checkKeys(gitObj, ['enabled', 'branches', 'areas', 'activityWeeks'], 'git.');
  const branches: Record<string, string> = {};
  const rawBranches = gitObj['branches'];
  if (rawBranches === undefined) branches['live'] = 'main';
  else if (!isObj(rawBranches)) problems.push('git.branches: expected an object of role: branch');
  else {
    for (const [role, ref] of Object.entries(rawBranches)) {
      if (typeof ref !== 'string' || !REF_RE.test(ref) || ref.includes('..')) {
        problems.push(`git.branches.${role}: not a valid branch name`);
      } else branches[role] = ref;
    }
  }
  let areas = ['*'];
  const rawAreas = gitObj['areas'];
  if (rawAreas !== undefined) {
    if (!Array.isArray(rawAreas)) problems.push('git.areas: expected a list of folder prefixes');
    else {
      areas = [];
      rawAreas.forEach((a, i) => {
        if (
          typeof a !== 'string' ||
          !AREA_RE.test(a) ||
          a.startsWith('/') ||
          a.split('/').includes('..')
        ) {
          problems.push(`git.areas[${i}]: expected a folder prefix, optionally ending in /*`);
        } else areas.push(a);
      });
    }
  }
  const git = {
    enabled: bool(gitObj, 'enabled', 'git.enabled', true),
    branches,
    areas,
    activityWeeks: int(gitObj, 'activityWeeks', 'git.activityWeeks', 1, 52, 12),
  };

  const outObj = section('output');
  checkKeys(outObj, ['dir', 'json'], 'output.');
  const output = {
    dir: str(outObj, 'dir', 'output.dir') ?? '.opmap',
    json: bool(outObj, 'json', 'output.json', false),
  };

  const themeObj = section('theme');
  checkKeys(themeObj, ['accent', 'mode', 'density'], 'theme.');
  let accent = '#2f6fed';
  const acc = themeObj['accent'];
  if (acc !== undefined) {
    if (typeof acc === 'string' && ACCENT_RE.test(acc)) accent = acc;
    else problems.push('theme.accent: expected a colour like #2f6fed');
  }
  const theme = {
    accent,
    mode: oneOf(themeObj, 'mode', 'theme.mode', ['auto', 'light', 'dark'] as const, 'auto'),
    density: oneOf(
      themeObj,
      'density',
      'theme.density',
      ['comfortable', 'compact'] as const,
      'comfortable',
    ),
  };

  const tracks: RawConfig['tracks'] = [];
  const rawTracks = input['tracks'];
  if (rawTracks !== undefined) {
    if (!Array.isArray(rawTracks)) problems.push('tracks: expected a list');
    else {
      const seen = new Set<string>();
      rawTracks.forEach((t, i) => {
        const at = `tracks[${i}]`;
        if (!isObj(t)) {
          problems.push(`${at}: expected an object`);
          return;
        }
        checkKeys(t, ['id', 'title', 'file', 'blockPattern', 'idPattern'], `${at}.`);
        const id = str(t, 'id', `${at}.id`);
        if (id !== undefined && !TRACK_ID_RE.test(id))
          problems.push(`${at}.id: use 1 to 32 characters from a-z, 0-9 and -`);
        else if (id !== undefined && seen.has(id)) problems.push(`${at}.id: "${id}" is used twice`);
        else if (id !== undefined) seen.add(id);
        const title = str(t, 'title', `${at}.title`, 1, 80);
        const file = str(t, 'file', `${at}.file`);
        const bp = str(t, 'blockPattern', `${at}.blockPattern`, 1, 100_000);
        const ip = str(t, 'idPattern', `${at}.idPattern`, 1, 100_000);
        if (id === undefined || title === undefined || file === undefined) {
          for (const [k, v] of [
            ['id', id],
            ['title', title],
            ['file', file],
          ] as const) {
            if (v === undefined && t[k] === undefined) problems.push(`${at}.${k}: required`);
          }
          return;
        }
        tracks.push({
          id,
          title,
          file,
          blockPattern:
            bp === undefined ? null : compilePattern(bp, `${at}.blockPattern`, problems),
          idPattern: ip === undefined ? null : compilePattern(ip, `${at}.idPattern`, problems),
        });
      });
    }
  }

  if (problems.length > 0) return { config: null, problems };
  return {
    config: { name, docs, idPattern, requireDoneRef, staleAfterDays, git, output, theme, tracks },
    problems,
  };
}

/** Walk up from `start` to the directory that holds `.git`. Null when there is none. */
export function findRepoRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The first `opmap.config.json` walking up from `start`, stopping at the git root. */
export function findConfig(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    if (existsSync(join(dir, '.git'))) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** realpath that also works for a path that does not exist yet: resolve the nearest existing parent. */
export function realpathLoose(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    const parent = dirname(abs);
    if (parent === abs) return abs;
    return join(realpathLoose(parent), basename(abs));
  }
}

export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function loadConfig(options: LoadConfigOptions): ResolvedConfig {
  const env = options.env ?? process.env;
  const explicit = options.configPath ?? env['OPMAP_CONFIG'];
  let configPath: string | null;
  if (explicit !== undefined && explicit !== '') {
    configPath = resolve(options.cwd, explicit);
    if (!fileExists(configPath)) {
      throw new OpmapError(
        'OPM-E003',
        `Config file not found: ${explicit}`,
        'Check --config or OPMAP_CONFIG',
      );
    }
  } else {
    configPath = findConfig(options.cwd);
  }

  let raw: RawConfig;
  let baseDir: string;
  if (configPath !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(configPath, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      throw new OpmapError(
        'OPM-E003',
        `${CONFIG_FILE} is not valid JSON: ${(e as Error).message}`,
        'Fix the JSON syntax',
      );
    }
    const result = validateConfig(parsed);
    if (result.config === null) {
      throw new OpmapError(
        'OPM-E003',
        `${CONFIG_FILE} is invalid:\n- ${result.problems.join('\n- ')}`,
        'The message names each key and the expected type',
      );
    }
    raw = result.config;
    baseDir = dirname(configPath);
  } else {
    baseDir = findRepoRoot(options.cwd) ?? resolve(options.cwd);
    if (!fileExists(join(baseDir, DEFAULT_ROADMAP))) {
      throw new OpmapError(
        'OPM-E001',
        `No ${CONFIG_FILE} and no ${DEFAULT_ROADMAP} found`,
        'Run opmap init, or set docs.roadmap in opmap.config.json',
      );
    }
    raw = validateConfig({}).config as RawConfig;
  }

  const root = realpathLoose(configPath === null ? baseDir : (findRepoRoot(baseDir) ?? baseDir));
  const contained = (value: string, key: string): string => {
    const abs = realpathLoose(resolve(baseDir, value));
    if (!isInside(root, abs)) {
      throw new OpmapError(
        'OPM-E003',
        `${key}: the path escapes the repository (${value})`,
        'Use a path inside the repo',
      );
    }
    return abs;
  };

  const roadmap = contained(raw.docs.roadmap ?? DEFAULT_ROADMAP, 'docs.roadmap');
  if (!fileExists(roadmap)) {
    throw new OpmapError(
      'OPM-E001',
      `The roadmap file was not found: ${raw.docs.roadmap ?? DEFAULT_ROADMAP}`,
      'Set docs.roadmap in opmap.config.json or run opmap init',
    );
  }
  const optionalDoc = (
    value: string | null | undefined,
    dflt: string,
    key: string,
  ): string | null => {
    if (value === null) return null;
    const p = contained(value ?? dflt, key);
    return fileExists(p) ? p : null;
  };

  return {
    format: 1,
    name: raw.name ?? basename(root),
    configPath,
    root,
    docs: {
      roadmap,
      decisions: optionalDoc(raw.docs.decisions, DEFAULT_DECISIONS, 'docs.decisions'),
      changelog: optionalDoc(raw.docs.changelog, DEFAULT_CHANGELOG, 'docs.changelog'),
    },
    idPattern: raw.idPattern,
    requireDoneRef: raw.requireDoneRef,
    staleAfterDays: raw.staleAfterDays,
    git: raw.git,
    output: { dir: contained(raw.output.dir, 'output.dir'), json: raw.output.json },
    theme: raw.theme,
    tracks: raw.tracks.map((t, i) => ({ ...t, file: contained(t.file, `tracks[${i}].file`) })),
  };
}
