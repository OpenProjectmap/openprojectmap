// Derivations (spec 03 §3): everything the views need, computed once, as pure functions.
import { daysInMonth, diffDays, formatDate } from './dates.js';
import type { ISODate } from './dates.js';
import { sumProgress } from './progress.js';
import type {
  Decision,
  Derived,
  Milestone,
  NowBlock,
  Progress,
  Release,
  Risk,
  Version,
  VersionState,
} from './types.js';

export interface DeriveInput {
  versions: readonly Version[];
  milestones: readonly Milestone[];
  decisions: readonly Decision[];
  risks: readonly Risk[];
  releases: readonly Release[];
  now: NowBlock | null;
}

export interface DeriveOptions {
  today: ISODate;
  /** Days after `Updated` when the Now block counts as stale. Default 14. */
  staleAfterDays?: number;
  /** Git commits on HEAD after `Updated`, or null when git is not available. */
  commitsSince?: number | null;
}

export interface DeriveResult {
  /** Copies of the input versions with `state` resolved. */
  versions: Version[];
  /** Copies of the input releases with `versionId` linked. */
  releases: Release[];
  derived: Derived;
}

export const DEFAULT_STALE_AFTER_DAYS = 14;
export const STALE_COMMITS = 10;

/** `v0.2.0`, `V0.2.0` and `0.2.0` all name the same version. */
function versionKey(v: string): string {
  return v.trim().replace(/^v/i, '').toLowerCase();
}

/** Resolve the Now block's current version to a version id, or null. */
export function resolveCurrentVersion(
  now: NowBlock | null,
  versions: readonly Version[],
): string | null {
  if (!now?.currentVersion) return null;
  const want = versionKey(now.currentVersion);
  return versions.find((v) => versionKey(v.id) === want)?.id ?? null;
}

const STARTED = new Set(['doing', 'review', 'blocked', 'done']);

/** Version state (spec 02 §5). An explicit `State` wins. */
export function versionState(
  version: Version,
  releases: readonly Release[],
  currentVersionId: string | null,
): VersionState {
  if (version.stateExplicit) return version.state;
  if (releases.some((r) => !r.unreleased && r.date !== null && r.version === version.semver))
    return 'shipped';
  if (currentVersionId === version.id || version.deliverables.some((d) => STARTED.has(d.status)))
    return 'active';
  return 'planned';
}

/** Open decisions: overdue first, then by Needed by, then undated, then document order. */
export function needsYourCall(decisions: readonly Decision[]): string[] {
  return decisions
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.status === 'open')
    .sort((a, b) => {
      if (a.d.overdue !== b.d.overdue) return a.d.overdue ? -1 : 1;
      const an = a.d.neededBy;
      const bn = b.d.neededBy;
      if (an !== null && bn !== null && an !== bn) return an < bn ? -1 : 1;
      if ((an === null) !== (bn === null)) return an === null ? 1 : -1;
      return a.i - b.i;
    })
    .map(({ d }) => d.id);
}

/** Open risks scoring 6 or more, highest first. */
export function topRisks(risks: readonly Risk[]): string[] {
  return risks
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.open && r.score >= 6)
    .sort((a, b) => b.r.score - a.r.score || a.i - b.i)
    .map(({ r }) => r.id);
}

export function staleness(
  now: NowBlock | null,
  today: ISODate,
  staleAfterDays: number,
  commitsSince: number | null,
): Derived['stale'] {
  const updated = now?.updated ?? null;
  if (updated === null)
    return { isStale: true, days: null, commitsSince, reason: 'no Updated date' };
  const days = diffDays(updated, today);
  const byDays = days > staleAfterDays;
  const byCommits = commitsSince !== null && commitsSince >= STALE_COMMITS;
  let reason: string | null = null;
  if (byDays) reason = `${days} days since ${updated}`;
  else if (byCommits) reason = `${commitsSince} commits since ${updated}`;
  return { isStale: byDays || byCommits, days, commitsSince, reason };
}

/** Earliest window start to latest window end, padded to whole months. */
export function timelineBounds(versions: readonly Version[]): Derived['timeline'] {
  let start: ISODate | null = null;
  let end: ISODate | null = null;
  for (const v of versions) {
    if (!v.window) continue;
    const lo = v.window.start < v.window.end ? v.window.start : v.window.end;
    const hi = v.window.start < v.window.end ? v.window.end : v.window.start;
    if (start === null || lo < start) start = lo;
    if (end === null || hi > end) end = hi;
  }
  if (start === null || end === null) return { start: null, end: null };
  const y = Number(end.slice(0, 4));
  const m = Number(end.slice(5, 7));
  return { start: `${start.slice(0, 7)}-01`, end: formatDate(y, m, daysInMonth(y, m)) };
}

export function milestoneProgress(
  milestones: readonly Milestone[],
  versions: readonly Version[],
): Derived['milestoneProgress'] {
  return milestones.map((m) => {
    if (m.reachedOn !== null) return { id: m.id, reached: true, pct: 100 };
    let last = -1;
    versions.forEach((v, i) => {
      if (v.milestoneId === m.id) last = i;
    });
    if (last === -1) return { id: m.id, reached: false, pct: 0 };
    return {
      id: m.id,
      reached: false,
      pct: sumProgress(versions.slice(0, last + 1).map((v) => v.progress)).pct,
    };
  });
}

function pickCurrent(now: NowBlock | null, versions: readonly Version[]): string | null {
  const named = resolveCurrentVersion(now, versions);
  if (named !== null) return named;
  const order = (list: readonly Version[]): Version | undefined =>
    list
      .map((v, i) => ({ v, i }))
      .sort((a, b) => {
        const as = a.v.window?.start;
        const bs = b.v.window?.start;
        if (as !== undefined && bs !== undefined && as !== bs) return as < bs ? -1 : 1;
        if ((as === undefined) !== (bs === undefined)) return as === undefined ? 1 : -1;
        return a.i - b.i;
      })[0]?.v;
  return (
    order(versions.filter((v) => v.state === 'active'))?.id ??
    versions.find((v) => v.state === 'planned')?.id ??
    null
  );
}

export function derive(input: DeriveInput, options: DeriveOptions): DeriveResult {
  const staleAfter = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  const named = resolveCurrentVersion(input.now, input.versions);

  const versions = input.versions.map((v) => ({
    ...v,
    state: versionState(v, input.releases, named),
  }));
  const releases = input.releases.map((r) => ({
    ...r,
    versionId:
      r.version === null ? null : (versions.find((v) => v.semver === r.version)?.id ?? null),
  }));

  const currentVersionId = pickCurrent(input.now, versions);
  const currentIndex = versions.findIndex((v) => v.id === currentVersionId);
  const next =
    currentIndex === -1
      ? undefined
      : versions.slice(currentIndex + 1).find((v) => v.state !== 'shipped');

  const overall: Progress = sumProgress(versions.map((v) => v.progress));
  return {
    versions,
    releases,
    derived: {
      currentVersionId,
      nextVersionId: next?.id ?? null,
      overall,
      needsYourCall: needsYourCall(input.decisions),
      topRisks: topRisks(input.risks),
      stale: staleness(input.now, options.today, staleAfter, options.commitsSince ?? null),
      timeline: timelineBounds(versions),
      milestoneProgress: milestoneProgress(input.milestones, versions),
    },
  };
}
