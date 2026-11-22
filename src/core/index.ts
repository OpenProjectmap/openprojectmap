// Isomorphic core: no node:* imports, no process, no Date.now() (AGENTS.md §4).
import { derive, timelineBounds } from './derive.js';
import { diag } from './diagnostics.js';
import { OpmapError } from './errors.js';
import { parseIsoDay } from './dates.js';
import { withHints } from './codes.js';
import { parseChangelog } from './parse-changelog.js';
import { parseDecisions } from './parse-decisions.js';
import { parseRoadmap } from './parse-roadmap.js';
import { sumProgress } from './progress.js';
import type { Source } from './parse-roadmap.js';
import type { Diagnostic, ProjectData, Track } from './types.js';
import { validate } from './validate.js';

export const CORE_NAME = 'openprojectmap-core';

export { OpmapError } from './errors.js';
export { CATALOGUE, codeInfo, withHints } from './codes.js';
export type { CodeInfo } from './codes.js';
export { diffProjects, formatDiff, DIFF_MARKER } from './diff.js';
export type { DiffFormat, ProjectDiff } from './diff.js';
export {
  cardFor,
  failedCard,
  isSafeBranch,
  isSafeRepoUrl,
  parseHubConfig,
  plainText,
  slugify,
  uniqueSlugs,
} from './hub.js';
export type { HubCard, HubConfig, HubProject } from './hub.js';
export type { Source } from './parse-roadmap.js';
export type * from './types.js';

export interface ProjectSources {
  roadmap?: Source | undefined;
  decisions?: Source | undefined;
  changelog?: Source | undefined;
  /** Extra roadmap files (spec 02 §10), in the order their tabs appear. */
  tracks?: TrackSource[] | undefined;
}

export interface ParseProjectOptions {
  /** The current time as an ISO timestamp, e.g. `2026-11-17T09:00:00Z`. The core never reads a clock. */
  now: string;
  /** Overrides the date taken from `now` (for `--tz local`). */
  today?: string;
  /** Used when the roadmap has no H1 title. */
  name?: string;
  /** Written to `data.tool.version`. */
  toolVersion?: string;
  idPattern?: RegExp;
  staleAfterDays?: number;
  requireDoneRef?: boolean;
  /** Git commits since the Now block's Updated date, or null/undefined without git. */
  commitsSince?: number | null;
}

export interface TrackSource {
  id: string;
  title: string;
  source: Source;
  /** Needs the named groups `id` and `title`. Default: the version grammar. */
  blockPattern?: RegExp | undefined;
  idPattern?: RegExp | undefined;
}

export function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  return [...list].sort(
    (a, b) =>
      (a.file ?? '').localeCompare(b.file ?? '') ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      a.code.localeCompare(b.code),
  );
}

/** Parse the project documents into ProjectData (spec 03). Throws OpmapError when there is no roadmap. */
export function parseProject(sources: ProjectSources, options: ParseProjectOptions): ProjectData {
  if (!sources.roadmap) {
    throw new OpmapError(
      'OPM-E001',
      'The roadmap file was not found or could not be read',
      'Set docs.roadmap in opmap.config.json or run opmap init',
    );
  }
  const today = parseIsoDay((options.today ?? options.now).slice(0, 10));
  if (today === null)
    throw new RangeError('options.now (or options.today) must start with a YYYY-MM-DD date');

  const seenDeliverables = new Map<string, string>();
  const roadmap = parseRoadmap(sources.roadmap, {
    ...(options.idPattern ? { idPattern: options.idPattern } : {}),
    seenDeliverables,
  });
  const tracks: Track[] = [];
  const trackDiagnostics: Diagnostic[] = [];
  for (const t of sources.tracks ?? []) {
    const parsed = parseRoadmap(t.source, {
      track: true,
      seenDeliverables,
      ...(t.idPattern ? { idPattern: t.idPattern } : {}),
      ...(t.blockPattern ? { blockPattern: t.blockPattern } : {}),
    });
    trackDiagnostics.push(...parsed.diagnostics);
    // A track has no changelog: a block is shipped when its State says so or every row is done.
    const versions = parsed.versions.map((v) => ({
      ...v,
      state: v.stateExplicit
        ? v.state
        : v.deliverables.length > 0 && v.deliverables.every((d) => d.status === 'done')
          ? ('shipped' as const)
          : v.deliverables.some((d) => d.status !== 'todo' && d.status !== 'parked')
            ? ('active' as const)
            : ('planned' as const),
    }));
    tracks.push({
      id: t.id,
      title: t.title,
      file: t.source.path,
      phases: parsed.phases,
      versions,
      milestones: parsed.milestones,
      progress: sumProgress(versions.map((v) => v.progress)),
      timeline: timelineBounds(versions),
    });
  }
  // Decisions and risks may live in any file, so the roadmap is read for them too.
  const fromRoadmap = parseDecisions(sources.roadmap, { today });
  const fromDecisions = sources.decisions ? parseDecisions(sources.decisions, { today }) : null;
  const decisions = [...(fromDecisions?.decisions ?? []), ...fromRoadmap.decisions];
  const risks = [...(fromDecisions?.risks ?? []), ...fromRoadmap.risks];
  const changelog = sources.changelog ? parseChangelog(sources.changelog) : { releases: [] };

  const derived = derive(
    {
      versions: roadmap.versions,
      milestones: roadmap.milestones,
      decisions,
      risks,
      releases: changelog.releases,
      now: roadmap.now,
    },
    {
      today,
      ...(options.staleAfterDays === undefined ? {} : { staleAfterDays: options.staleAfterDays }),
      commitsSince: options.commitsSince ?? null,
    },
  );

  // The combined timeline spans the roadmap and every track.
  if (tracks.length > 0)
    derived.derived.timeline = timelineBounds([
      ...derived.versions,
      ...tracks.flatMap((t) => t.versions),
    ]);

  const diagnostics: Diagnostic[] = [
    ...roadmap.diagnostics,
    ...trackDiagnostics,
    ...fromRoadmap.diagnostics,
    ...(fromDecisions?.diagnostics ?? []),
  ];
  const title = roadmap.title ?? options.name ?? 'Project';
  if (roadmap.title === null)
    diagnostics.push(diag('OPM-I003', 'The roadmap has no H1 title', sources.roadmap.path, 1));

  const data: ProjectData = {
    schema: 'openprojectmap/project-data@1',
    tool: { name: 'openprojectmap', version: options.toolVersion ?? '0.0.0' },
    generatedAt: options.now,
    today,
    project: { name: options.name ?? title, title, formatVersion: 1 },
    now: roadmap.now,
    phases: roadmap.phases,
    versions: derived.versions,
    milestones: roadmap.milestones,
    parked: roadmap.parked,
    decisions,
    risks,
    releases: derived.releases,
    tracks,
    git: null,
    derived: derived.derived,
    diagnostics: [],
  };
  diagnostics.push(
    ...validate(
      data,
      options.requireDoneRef === undefined ? {} : { requireDoneRef: options.requireDoneRef },
    ),
  );
  data.diagnostics = sortDiagnostics(withHints(diagnostics));
  return data;
}
