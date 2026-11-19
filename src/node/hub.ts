// `opmap hub` (spec 06 §3): build many projects into one folder with an index page.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { OpmapError } from '../core/errors.js';
import { cardFor, failedCard, parseHubConfig, uniqueSlugs } from '../core/hub.js';
import type { HubCard, HubProject } from '../core/hub.js';
import { isSafeBranch } from '../core/hub.js';
import { renderHubHtml } from '../render/hub.js';
import { VERSION, buildData, renderMap, resolveNow } from './build.js';
import { gitAsync } from './git.js';

/** Marks a folder this tool made, so it never resets a person's own working copy. */
export const MANAGED_MARKER = '.opmap-managed';
const CLONE_TIMEOUT_MS = 180_000;

export interface HubOptions {
  /** The hub file. */
  hubFile: string;
  /** Where the index and one folder per project are written. */
  out: string;
  cwd: string;
  env?: Record<string, string | undefined>;
  now?: string | undefined;
  tz?: 'utc' | 'local';
  /** Clone and refresh `repo` entries (default true). False uses the clones already there. */
  fetch?: boolean;
  /** Where `repo` entries are cloned. */
  cacheDir?: string | undefined;
  log?: (line: string) => void;
}

export interface HubResult {
  cards: HubCard[];
  out: string;
  failed: number;
}

/** Only these transports may run, so a `repo` URL can never start a helper program. */
const PROTOCOLS = [
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.https.allow=always',
  '-c',
  'protocol.ssh.allow=always',
  '-c',
  'protocol.file.allow=always',
] as const;

export function defaultCacheDir(env: Record<string, string | undefined>): string {
  const fromEnv = env['OPMAP_REPOS_DIR'];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const xdg = env['XDG_CACHE_HOME'];
  return join(
    xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.cache'),
    'openprojectmap',
    'repos',
  );
}

function fail(message: string, hint: string): never {
  throw new OpmapError('OPM-E003', message, hint);
}

/** Clone `repo` into `dir` on first use, then fast-forward it with fetch and reset. */
async function ensureClone(
  repo: string,
  wantBranch: string | undefined,
  dir: string,
  cacheDir: string,
  fetch: boolean,
): Promise<void> {
  const marker = join(dir, MANAGED_MARKER);
  if (!existsSync(dir)) {
    if (!fetch)
      fail(
        `${repo} has not been cloned yet and fetching is off`,
        'Run opmap hub without --no-fetch once',
      );
    mkdirSync(cacheDir, { recursive: true });
    const args = [
      ...PROTOCOLS,
      'clone',
      '--filter=blob:none',
      '--quiet',
      ...(wantBranch === undefined ? [] : ['--branch', wantBranch]),
      '--',
      repo,
      dir,
    ];
    if ((await gitAsync(args, cacheDir, CLONE_TIMEOUT_MS)) === null)
      fail(`git could not clone ${repo}`, 'Check the URL, your network and your ssh keys');
    writeFileSync(marker, 'This folder is managed by openprojectmap. It is reset to the remote.\n');
    return;
  }
  if (!existsSync(marker))
    fail(
      `${dir} exists but was not made by openprojectmap, so it is left alone`,
      'Remove it, or choose another --cache-dir',
    );
  const remote = (await gitAsync(['remote', 'get-url', 'origin'], dir))?.trim();
  if (remote !== repo)
    fail(
      `${dir} was cloned from a different remote`,
      'Remove that folder or choose another --cache-dir',
    );
  if (!fetch) return;
  let branch = wantBranch;
  if (branch === undefined) {
    const head =
      (await gitAsync(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], dir))?.trim() ?? '';
    branch = head.replace(/^origin\//, '');
  }
  if (!isSafeBranch(branch))
    fail(`could not tell which branch of ${repo} to follow`, 'Set "branch" in the hub file');
  if (
    (await gitAsync(
      [...PROTOCOLS, 'fetch', '--quiet', '--no-tags', 'origin', branch],
      dir,
      CLONE_TIMEOUT_MS,
    )) === null
  )
    fail(`git could not fetch ${branch} from ${repo}`, 'Check the URL and your network');
  if ((await gitAsync(['reset', '--hard', '--quiet', `origin/${branch}`], dir)) === null)
    fail(`git could not move to origin/${branch}`, 'Check that the branch exists');
}

async function projectDir(
  p: HubProject,
  slug: string,
  hubDir: string,
  cacheDir: string,
  fetch: boolean,
): Promise<string> {
  if (p.path !== undefined) {
    const abs = isAbsolute(p.path) ? p.path : resolve(hubDir, p.path);
    let real: string;
    try {
      real = realpathSync(abs);
    } catch {
      return fail(`The folder ${p.path} does not exist`, 'Check "path" in the hub file');
    }
    if (!statSync(real).isDirectory())
      fail(`${p.path} is not a folder`, 'Check "path" in the hub file');
    return real;
  }
  const dir = join(cacheDir, slug);
  await ensureClone(p.repo ?? '', p.branch, dir, cacheDir, fetch);
  return dir;
}

/** Build every project, then the index. A project that fails gets a card that says so. */
export async function buildHub(options: HubOptions): Promise<HubResult> {
  const log = options.log ?? (() => undefined);
  const env = options.env ?? process.env;
  const hubFile = resolve(options.cwd, options.hubFile);
  let text: string;
  try {
    text = readFileSync(hubFile, 'utf8');
  } catch (e) {
    throw new OpmapError(
      'OPM-E003',
      `The hub file could not be read: ${(e as Error).message}`,
      'Check the path, or create an opmap.hub.json',
    );
  }
  const hub = parseHubConfig(text);
  const slugs = uniqueSlugs(hub.projects.map((p) => p.name));
  const { now, today } = resolveNow(options.now, options.tz ?? 'utc');
  const out = resolve(options.cwd, options.out);
  const cacheDir = resolve(options.cwd, options.cacheDir ?? defaultCacheDir(env));
  // One project's OPMAP_CONFIG must not point every other project at the same config.
  const projectEnv = { ...env, OPMAP_CONFIG: undefined };
  mkdirSync(out, { recursive: true });

  const cards: HubCard[] = [];
  for (const [i, p] of hub.projects.entries()) {
    const slug = slugs[i] ?? `project-${i + 1}`;
    try {
      const dir = await projectDir(p, slug, dirname(hubFile), cacheDir, options.fetch !== false);
      const { data, config } = buildData({
        cwd: dir,
        env: projectEnv,
        now,
        ...(options.tz === undefined ? {} : { tz: options.tz }),
      });
      mkdirSync(join(out, slug), { recursive: true });
      writeFileSync(
        join(out, slug, 'index.html'),
        renderMap(data, config.theme, { hubChild: true }).html,
      );
      cards.push(cardFor(p.name, slug, data));
      log(`built ${p.name} → ${slug}/index.html`);
    } catch (e) {
      const message =
        e instanceof Error ? (e.message.split('\n')[0] ?? 'unknown error') : String(e);
      cards.push(failedCard(p.name, slug, message));
      log(`could not build ${p.name}: ${message}`);
    }
  }

  const page = renderHubHtml(hub.title, cards, {
    version: VERSION,
    generated: today ?? now.slice(0, 10),
  });
  writeFileSync(join(out, 'index.html'), page.html);
  return { cards, out, failed: cards.filter((c) => c.error !== null).length };
}
