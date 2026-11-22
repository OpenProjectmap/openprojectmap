// The GitHub CLI, called without a shell and only with the fixed arguments below (D24: the tool
// never sees or stores a token; it uses whatever `gh auth login` the person already did).
import { execFileSync } from 'node:child_process';
import { OpmapError } from '../core/errors.js';

const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9._-]{1,100}$/;
const TIMEOUT_MS = 60_000;
const MAX_BUFFER = 25 * 1024 * 1024;
export const PAGE_SIZE = 100;
export const MAX_PAGES = 12;

export const isSafeRepo = (repo: string): boolean => REPO_RE.test(repo) && !repo.includes('..');

/** `owner/repo` from a GitHub remote URL (https or ssh), or null. */
export function repoFromRemote(url: string): string | null {
  const m =
    /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(
      url.trim(),
    );
  return m?.[1] !== undefined && isSafeRepo(m[1]) ? m[1] : null;
}

export type GhRunner = (args: readonly string[]) => string;

const realGh: GhRunner = (args) => {
  try {
    return execFileSync('gh', [...args], {
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: Buffer | string };
    if (err.code === 'ENOENT') {
      throw new OpmapError(
        'OPM-E001',
        'The GitHub CLI (gh) is not installed',
        'Install it from https://cli.github.com and run "gh auth login", or use "opmap import csv <file>"',
      );
    }
    const detail =
      String(err.stderr ?? err.message)
        .trim()
        .split('\n')[0] ?? '';
    throw new OpmapError(
      'OPM-E001',
      `gh api failed: ${detail}`,
      'Run "gh auth status" to check you are logged in and can see the repository',
    );
  }
};

/** Every page of a list endpoint of the REST API, as one array. */
export function ghList(
  path: 'milestones' | 'issues',
  repo: string,
  run: GhRunner = realGh,
): { items: unknown[]; truncated: boolean } {
  if (!isSafeRepo(repo))
    throw new OpmapError('OPM-E001', `"${repo}" is not a repository name like owner/repo`);
  const items: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = path === 'issues' ? 'state=all&sort=created&direction=asc&' : 'state=all&';
    const text = run(['api', `repos/${repo}/${path}?${query}per_page=${PAGE_SIZE}&page=${page}`]);
    let chunk: unknown;
    try {
      chunk = JSON.parse(text);
    } catch {
      throw new OpmapError('OPM-E001', 'gh api returned something that is not JSON');
    }
    if (!Array.isArray(chunk)) throw new OpmapError('OPM-E001', 'gh api did not return a list');
    items.push(...chunk);
    if (chunk.length < PAGE_SIZE) return { items, truncated: false };
  }
  return { items, truncated: true };
}
