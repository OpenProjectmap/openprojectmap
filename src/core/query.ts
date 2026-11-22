// Read-only questions about a parsed project (spec 06 §6): what the MCP tools and other
// integrations answer. Pure functions over ProjectData; every result is plain data.
import { inlineText, parseInline } from './inline.js';
import type {
  Decision,
  Deliverable,
  Diagnostic,
  ProjectData,
  Risk,
  SourceRef,
  Status,
  Version,
} from './types.js';

const plain = (s: string | null): string | null => (s === null ? null : inlineText(parseInline(s)));

export interface VersionSummary {
  id: string;
  title: string;
  state: Version['state'];
  window: string | null;
  goal: string | null;
  exit: string | null;
  pct: number;
  progress: Record<Status, number> & { total: number };
  track: string | null;
  source: SourceRef;
}

function summaryOf(v: Version, track: string | null): VersionSummary {
  return {
    id: v.id,
    title: v.title,
    state: v.state,
    window: v.window?.raw ?? null,
    goal: plain(v.goal),
    exit: plain(v.exit),
    pct: v.progress.pct,
    progress: { ...v.progress.byStatus, total: v.progress.total },
    track,
    source: v.source,
  };
}

export interface NowSummary {
  project: string;
  today: string;
  updated: string | null;
  currentVersion: VersionSummary | null;
  nextStep: string | null;
  why: string | null;
  target: string | null;
  facts: { key: string; value: string }[];
  /** Open decisions that wait for the founder, overdue ones first. */
  needsYourCall: {
    id: string;
    question: string;
    default: string;
    neededBy: string | null;
    overdue: boolean;
  }[];
  stale: { isStale: boolean; reason: string | null };
  overallPct: number;
  diagnostics: { errors: number; warnings: number };
}

export function queryNow(data: ProjectData): NowSummary {
  const cur = data.versions.find((v) => v.id === data.derived.currentVersionId) ?? null;
  const calls = data.derived.needsYourCall
    .map((id) => data.decisions.find((d) => d.id === id))
    .filter((d): d is Decision => d !== undefined);
  return {
    project: data.project.title,
    today: data.today,
    updated: data.now?.updated ?? null,
    currentVersion: cur ? summaryOf(cur, null) : null,
    nextStep: plain(data.now?.nextStep ?? null),
    why: plain(data.now?.why ?? null),
    target: plain(data.now?.target ?? null),
    facts: (data.now?.facts ?? []).map((f) => ({ key: f.key, value: plain(f.value) ?? '' })),
    needsYourCall: calls.map((d) => ({
      id: d.id,
      question: plain(d.question) ?? '',
      default: plain(d.default) ?? '',
      neededBy: d.neededBy,
      overdue: d.overdue,
    })),
    stale: { isStale: data.derived.stale.isStale, reason: data.derived.stale.reason },
    overallPct: data.derived.overall.pct,
    diagnostics: {
      errors: data.diagnostics.filter((d) => d.severity === 'error').length,
      warnings: data.diagnostics.filter((d) => d.severity === 'warning').length,
    },
  };
}

export interface ListInput {
  /** A roadmap version (`v0.6.0`) or a track block id (`BM1`). */
  version?: string | undefined;
  status?: readonly Status[] | undefined;
  /** Case-insensitive text in the id, title, detail or notes. */
  q?: string | undefined;
  /** At most 200; default 50. */
  limit?: number | undefined;
}

export interface DeliverableSummary {
  id: string;
  title: string;
  status: Status;
  statusDate: string | null;
  version: string;
  track: string | null;
  owner: string | null;
  notes: string | null;
}

export const LIST_MAX = 200;
export const LIST_DEFAULT = 50;

function deliverableSummary(d: Deliverable, track: string | null): DeliverableSummary {
  return {
    id: d.id,
    title: plain(d.title) ?? '',
    status: d.status,
    statusDate: d.statusDate,
    version: d.versionId,
    track,
    owner: d.owner,
    notes: plain(d.notes),
  };
}

export function queryList(
  data: ProjectData,
  input: ListInput = {},
): { total: number; shown: number; deliverables: DeliverableSummary[] } {
  const want = input.version?.replace(/^v/i, '').toLowerCase();
  const needle = input.q?.trim().toLowerCase() ?? '';
  const all: DeliverableSummary[] = [];
  const blocks: [Version, string | null][] = [
    ...data.versions.map((v): [Version, string | null] => [v, null]),
    ...data.tracks.flatMap((t) => t.versions.map((v): [Version, string | null] => [v, t.id])),
  ];
  for (const [v, track] of blocks) {
    if (want !== undefined && v.semver.toLowerCase() !== want) continue;
    for (const d of v.deliverables) {
      if (input.status && input.status.length > 0 && !input.status.includes(d.status)) continue;
      if (needle !== '') {
        const hay = [d.id, d.title, d.detail, d.notes ?? ''].join(' ');
        if (!(plain(hay) ?? '').toLowerCase().includes(needle)) continue;
      }
      all.push(deliverableSummary(d, track));
    }
  }
  const limit = Math.min(LIST_MAX, Math.max(1, Math.floor(input.limit ?? LIST_DEFAULT)));
  return {
    total: all.length,
    shown: Math.min(all.length, limit),
    deliverables: all.slice(0, limit),
  };
}

export type Item =
  | {
      kind: 'deliverable';
      deliverable: DeliverableSummary & { detail: string; source: SourceRef; version: string };
    }
  | {
      kind: 'version';
      version: VersionSummary;
      statusLines: { date: string | null; text: string }[];
      deliverables: DeliverableSummary[];
    }
  | { kind: 'decision'; decision: Decision }
  | { kind: 'risk'; risk: Risk };

/** A deliverable, version or track block, decision or risk by id; null when there is none. */
export function queryGet(data: ProjectData, rawId: string): Item | null {
  const id = rawId.trim();
  for (const [v, track] of [
    ...data.versions.map((v): [Version, string | null] => [v, null]),
    ...data.tracks.flatMap((t) => t.versions.map((v): [Version, string | null] => [v, t.id])),
  ]) {
    const d = v.deliverables.find((x) => x.id === id);
    if (d) {
      return {
        kind: 'deliverable',
        deliverable: {
          ...deliverableSummary(d, track),
          detail: plain(d.detail) ?? '',
          source: d.source,
        },
      };
    }
  }
  const want = id.replace(/^v/i, '').toLowerCase();
  for (const [v, track] of [
    ...data.versions.map((v): [Version, string | null] => [v, null]),
    ...data.tracks.flatMap((t) => t.versions.map((v): [Version, string | null] => [v, t.id])),
  ]) {
    if (v.semver.toLowerCase() === want) {
      return {
        kind: 'version',
        version: summaryOf(v, track),
        statusLines: v.statusLines.map((s) => ({ date: s.date, text: plain(s.text) ?? '' })),
        deliverables: v.deliverables.map((d) => deliverableSummary(d, track)),
      };
    }
  }
  const decision = data.decisions.find((d) => d.id === id);
  if (decision) return { kind: 'decision', decision };
  const risk = data.risks.find((r) => r.id === id);
  if (risk) return { kind: 'risk', risk };
  return null;
}

/** The diagnostics, most severe first (errors, warnings, then info), as `opmap check` orders them. */
export function queryCheck(data: ProjectData): {
  errors: number;
  warnings: number;
  infos: number;
  diagnostics: Diagnostic[];
} {
  const count = (s: Diagnostic['severity']): number =>
    data.diagnostics.filter((d) => d.severity === s).length;
  return {
    errors: count('error'),
    warnings: count('warning'),
    infos: count('info'),
    diagnostics: data.diagnostics,
  };
}
