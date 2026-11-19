// Ties config, sources, git and the core together; the CLI and the programmatic API both use it.
import { parseProject, sortDiagnostics } from '../core/index.js';
import type { ParseProjectOptions } from '../core/index.js';
import { withHints } from '../core/codes.js';
import type { ProjectData } from '../core/types.js';
import { CLIENT_JS, STYLES_CSS, TEMPLATE_HTML } from '../render/assets.generated.js';
import { renderHtml } from '../render/render.js';
import { loadConfig } from './config.js';
import type { ResolvedConfig } from './config.js';
import { gatherGit } from './git.js';
import { readSources } from './sources.js';

declare const __OPMAP_VERSION__: string | undefined;
export const VERSION: string =
  typeof __OPMAP_VERSION__ === 'string' ? __OPMAP_VERSION__ : '0.0.0-dev';

export interface BuildOptions {
  cwd: string;
  configPath?: string | undefined;
  env?: Record<string, string | undefined>;
  /** An ISO timestamp. Default: the real time. */
  now?: string | undefined;
  /** `local`: today is the local calendar date. Default `utc`. */
  tz?: 'utc' | 'local';
  /** Collect git facts (`--no-git` sets this false). Default: config `git.enabled`. */
  git?: boolean | undefined;
  /** Run `git fetch` first. */
  fetch?: boolean | undefined;
}

export interface BuildResult {
  data: ProjectData;
  config: ResolvedConfig;
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The ISO timestamp, and for `--tz local` the local calendar date to use as "today". An explicit
 * `--now` (a date or a timestamp) is taken as given.
 */
export function resolveNow(
  now: string | undefined,
  tz: 'utc' | 'local',
): { now: string; today?: string } {
  if (now === undefined) {
    const d = new Date();
    return tz === 'local'
      ? { now: d.toISOString(), today: localDate(d) }
      : { now: d.toISOString() };
  }
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(now) ? `${now}T00:00:00Z` : now);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Not a date or timestamp: ${now}`);
  return { now: d.toISOString() };
}

/** The options every parse of this project shares (the same for any ref of it). */
export function parseOptionsFor(
  config: ResolvedConfig,
  options: BuildOptions,
): ParseProjectOptions {
  const { now, today } = resolveNow(options.now, options.tz ?? 'utc');
  return {
    now,
    ...(today === undefined ? {} : { today }),
    name: config.name,
    toolVersion: VERSION,
    idPattern: config.idPattern,
    staleAfterDays: config.staleAfterDays,
    requireDoneRef: config.requireDoneRef,
  };
}

/** Parse the project into ProjectData (git facts attached, diagnostics sorted). */
export function buildData(options: BuildOptions): BuildResult {
  const config = loadConfig({
    cwd: options.cwd,
    configPath: options.configPath,
    ...(options.env ? { env: options.env } : {}),
  });
  const sources = readSources(config);
  const base = parseOptionsFor(config, options);

  let data = parseProject(sources, base);
  const wantGit = options.git ?? config.git.enabled;
  if (!wantGit) return { data, config };

  const facts = gatherGit({
    cwd: config.root,
    enabled: true,
    branches: config.git.branches,
    areas: config.git.areas,
    activityWeeks: config.git.activityWeeks,
    updated: data.now?.updated ?? null,
    roadmapPath: config.docs.roadmap,
    today: data.today,
    fetch: options.fetch === true,
  });
  // Commits since Updated can make the Now block stale, so parse again with the count.
  if (facts.commitsSince !== null)
    data = parseProject(sources, { ...base, commitsSince: facts.commitsSince });
  data.git = facts.info;
  data.diagnostics = sortDiagnostics(withHints([...data.diagnostics, ...facts.diagnostics]));
  return { data, config };
}

/** The map for `opmap serve`: the page may reload itself, and the CSP is returned for the HTTP header. */
export function renderMapLive(
  data: ProjectData,
  theme?: ResolvedConfig['theme'],
): { html: string; csp: string } {
  const r = renderHtml(
    data,
    { clientJs: CLIENT_JS, stylesCss: STYLES_CSS, templateHtml: TEMPLATE_HTML },
    theme,
    { live: true },
  );
  return { html: r.html, csp: r.csp };
}

export function renderMap(
  data: ProjectData,
  theme?: ResolvedConfig['theme'],
  options: { hubChild?: boolean } = {},
): { html: string } {
  return {
    html: renderHtml(
      data,
      { clientJs: CLIENT_JS, stylesCss: STYLES_CSS, templateHtml: TEMPLATE_HTML },
      theme,
      options,
    ).html,
  };
}

/** Parse and render. The caller decides where to write the result. */
export function buildProject(options: BuildOptions): {
  data: ProjectData;
  html: string;
  config: ResolvedConfig;
} {
  const { data, config } = buildData(options);
  return { data, config, html: renderMap(data, config.theme).html };
}
