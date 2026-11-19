// The hub (spec 06 §3): the file that lists projects, their URL-safe names, and the one card each
// project shows on the index page. Pure: no file or git access here.
import { OpmapError } from './errors.js';
import type { ProjectData } from './types.js';

export interface HubProject {
  name: string;
  /** A folder with the project's docs (relative paths are taken from the hub file). */
  path?: string;
  /** A git remote to clone into the tool's own cache folder. */
  repo?: string;
  branch?: string;
}

export interface HubConfig {
  title: string;
  projects: HubProject[];
}

export interface HubCard {
  name: string;
  slug: string;
  /** Set when the project could not be built; the other fields are then empty. */
  error: string | null;
  projectTitle: string | null;
  version: string | null;
  state: string | null;
  pct: number | null;
  nextStep: string | null;
  needsCall: number;
  stale: boolean;
  lastCommit: string | null;
}

/** What `repo` may be: https, ssh or file URLs and scp-style `git@host:path`; never a transport helper. */
const REPO_RE =
  /^(?:(?:https|ssh|file):\/\/[A-Za-z0-9._~@:/%+-]+|git@[A-Za-z0-9.-]+:[A-Za-z0-9._~/+-]+)$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

export function isSafeRepoUrl(repo: string): boolean {
  return REPO_RE.test(repo) && repo.length <= 300 && !repo.includes('..');
}

export function isSafeBranch(branch: string): boolean {
  return (
    BRANCH_RE.test(branch) &&
    !branch.includes('..') &&
    !branch.endsWith('/') &&
    !branch.endsWith('.lock')
  );
}

function fail(message: string): never {
  throw new OpmapError('OPM-E003', message, 'Fix opmap.hub.json (the message names the key)');
}

function str(value: unknown, where: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${where} must be a non-empty string`);
  if (value.length > max) fail(`${where} is longer than ${max} characters`);
  return value;
}

/** Validate the text of an `opmap.hub.json`. Unknown keys are errors, like in opmap.config.json. */
export function parseHubConfig(text: string): HubConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new OpmapError(
      'OPM-E003',
      `The hub file is not valid JSON: ${(e as Error).message}`,
      'Fix the JSON syntax',
    );
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    fail('The hub file must be an object');
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj))
    if (!['$schema', 'title', 'projects'].includes(key)) fail(`Unknown key "${key}"`);
  const title = obj['title'] === undefined ? 'Projects' : str(obj['title'], 'title', 100);
  const list = obj['projects'];
  if (!Array.isArray(list) || list.length === 0)
    fail('projects must be a list with at least one project');
  if (list.length > 200) fail('projects can hold at most 200 projects');
  const projects: HubProject[] = list.map((item: unknown, i) => {
    const where = `projects[${i}]`;
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      fail(`${where} must be an object`);
    const p = item as Record<string, unknown>;
    for (const key of Object.keys(p))
      if (!['name', 'path', 'repo', 'branch'].includes(key)) fail(`Unknown key "${where}.${key}"`);
    const name = str(p['name'], `${where}.name`, 100);
    const hasPath = p['path'] !== undefined;
    const hasRepo = p['repo'] !== undefined;
    if (hasPath === hasRepo) fail(`${where} needs exactly one of "path" and "repo"`);
    const out: HubProject = { name };
    if (hasPath) {
      out.path = str(p['path'], `${where}.path`, 500);
      if (p['branch'] !== undefined) fail(`${where}.branch only goes with "repo"`);
    } else {
      const repo = str(p['repo'], `${where}.repo`, 300);
      if (!isSafeRepoUrl(repo))
        fail(
          `${where}.repo must be an https://, ssh:// or file:// URL, or git@host:path (got "${repo.slice(0, 60)}")`,
        );
      out.repo = repo;
      if (p['branch'] !== undefined) {
        const branch = str(p['branch'], `${where}.branch`, 100);
        if (!isSafeBranch(branch)) fail(`${where}.branch is not a plain branch name`);
        out.branch = branch;
      }
    }
    return out;
  });
  return { title, projects };
}

/** The name lowercased, runs of anything but a-z and 0-9 turned into one `-`. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'project' : slug;
}

/** One slug per name, in order; a repeat gets `-2`, `-3`, and so on. */
export function uniqueSlugs(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

/** Inline markdown reduced to plain words: the index page has no renderer for it. */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/(\*\*|__|\*|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMPTY = {
  projectTitle: null,
  version: null,
  state: null,
  pct: null,
  nextStep: null,
  needsCall: 0,
  stale: false,
  lastCommit: null,
} as const;

export function failedCard(name: string, slug: string, error: string): HubCard {
  return { name, slug, error, ...EMPTY };
}

/** The card for a project that built: current version and its progress, next step, and flags. */
export function cardFor(name: string, slug: string, data: ProjectData): HubCard {
  const current = data.versions.find((v) => v.id === data.derived.currentVersionId) ?? null;
  return {
    name,
    slug,
    error: null,
    projectTitle: data.project.title,
    version: current?.id ?? null,
    state: current?.state ?? null,
    pct: current?.progress.pct ?? null,
    nextStep: data.now?.nextStep == null ? null : plainText(data.now.nextStep),
    needsCall: data.derived.needsYourCall.length,
    stale: data.derived.stale.isStale,
    lastCommit: data.git?.head?.date.slice(0, 10) ?? null,
  };
}
