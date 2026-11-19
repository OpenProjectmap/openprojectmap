# 03: Data model (ProjectData v1)

`parseProject()` returns one plain JSON-serialisable object. The renderer, `export --json`, the
hub and the MCP server all consume it. Field names are stable from v0.4 (JSON Schema published)
and frozen at 1.0.

## 1. Types (`src/core/types.ts`)

```ts
export type Status = 'todo' | 'doing' | 'review' | 'blocked' | 'done' | 'parked';
export type VersionState = 'planned' | 'active' | 'shipped';
export type Level = 'L' | 'M' | 'H';
/** Inline markdown subset kept raw; rendered only by rich() (spec 05 §3). */
export type RichText = string;
export type ISODate = string; // YYYY-MM-DD

export interface SourceRef { file: string; line: number }

export interface ProjectData {
  schema: 'openprojectmap/project-data@1';
  tool: { name: 'openprojectmap'; version: string };
  generatedAt: string;             // ISO timestamp from options.now
  today: ISODate;
  project: { name: string; title: string; formatVersion: 1 };
  now: NowBlock | null;
  phases: Phase[];
  versions: Version[];             // in document order
  milestones: Milestone[];
  parked: ParkedItem[];
  decisions: Decision[];
  risks: Risk[];
  releases: Release[];             // newest first, Unreleased first if present
  tracks: Track[];                 // v0.6, [] before
  git: GitInfo | null;             // attached by node/git.ts
  derived: Derived;
  diagnostics: Diagnostic[];       // sorted by file, line, code
}

export interface NowBlock {
  updated: ISODate | null;
  currentVersion: string | null;   // as written
  nextStep: RichText | null;
  why: RichText | null;
  target: RichText | null;
  facts: { key: string; value: RichText }[];
  source: SourceRef;
}

export interface Phase { id: string; title: string; versionIds: string[]; source: SourceRef }

export interface DateWindow { start: ISODate; end: ISODate; raw: string; note?: string; tentative: boolean }

export interface StatusLine { date: ISODate | null; text: RichText; source: SourceRef }

export interface Version {
  id: string;                      // "v0.2.0"
  semver: string;                  // "0.2.0"
  title: string;
  phaseId: string | null;
  window: DateWindow | null;
  milestoneId: string | null;
  goal: RichText | null;
  exit: RichText | null;
  state: VersionState;
  stateExplicit: boolean;
  statusLines: StatusLine[];       // document order (ascending by date when valid)
  deliverables: Deliverable[];
  progress: Progress;
  source: SourceRef;
}

export interface Progress { done: number; total: number; parked: number; byStatus: Record<Status, number>; pct: number }

export interface Deliverable {
  id: string;
  title: string;                   // short display title
  detail: RichText;                // full Deliverable cell
  status: Status;
  statusRaw: string;
  statusDate: ISODate | null;
  owner: string | null;
  ref: string | null;              // "#41", a SHA or a URL
  notes: RichText | null;
  extra: Record<string, RichText>; // unknown columns, header → cell
  versionId: string;
  source: SourceRef;
}

export interface Milestone { id: string; name: string; reachedWhen: RichText; reachedOn: ISODate | null; dependsOn: string | null; versionIds: string[]; source: SourceRef }
export interface ParkedItem { item: RichText; why: RichText; revisitWhen: RichText | null; source: SourceRef }

export interface Decision {
  id: string; question: RichText; options: string[]; default: RichText;
  neededBy: ISODate | null;
  status: 'open' | 'decided' | 'defaulted';
  outcome: RichText | null;
  overdue: boolean;                // open && neededBy < today
  source: SourceRef;
}

export interface Risk { id: string; risk: RichText; likelihood: Level | null; impact: Level | null; score: number; mitigation: RichText | null; owner: string | null; open: boolean; source: SourceRef }

export interface Release {
  version: string | null;          // semver; null for Unreleased
  date: ISODate | null;
  title: string | null;
  unreleased: boolean;
  sections: { heading: string; items: RichText[] }[];
  versionId: string | null;        // matching roadmap version, if any
  source: SourceRef;
}

export interface GitInfo {
  root: string;                    // display only (basename)
  head: Commit | null;
  branches: Record<string, Commit | null>;  // config role → head commit ("live", "staging", …)
  activity: { weekStarts: ISODate[]; commits: number[]; areas: Record<string, number> };
  shallow: boolean;
}
export interface Commit { sha: string; date: string; subject: string }

export interface Derived {
  currentVersionId: string | null;
  nextVersionId: string | null;
  overall: Progress;               // across non-shipped + shipped versions
  needsYourCall: string[];         // decision ids, ordered
  topRisks: string[];              // open risks with score ≥ 6, by score desc
  stale: { isStale: boolean; days: number | null; commitsSince: number | null; reason: string | null };
  timeline: { start: ISODate | null; end: ISODate | null };
  milestoneProgress: { id: string; reached: boolean; pct: number }[];
}

export interface Track { id: string; title: string; versions: Version[]; milestones: Milestone[] }
```

## 2. Example (abridged)

```json
{
  "schema": "openprojectmap/project-data@1",
  "today": "2026-11-16",
  "project": { "name": "Tidepool", "title": "Tidepool", "formatVersion": 1 },
  "now": { "updated": "2026-11-16", "currentVersion": "v0.2.0", "nextStep": "Ship streak reminders (0.2.0-D2).", "facts": [] },
  "versions": [{
    "id": "v0.2.0", "semver": "0.2.0", "title": "Reminders", "state": "active",
    "window": { "start": "2026-11-10", "end": "2026-11-30", "raw": "2026-11-10 → 2026-11-30", "tentative": false },
    "progress": { "done": 1, "total": 2, "parked": 0, "pct": 50, "byStatus": { "todo": 0, "doing": 1, "review": 0, "blocked": 0, "done": 1, "parked": 0 } },
    "deliverables": [{ "id": "0.2.0-D1", "title": "Push permission flow", "status": "done", "statusDate": "2026-11-14", "ref": "#12" }]
  }],
  "derived": { "currentVersionId": "v0.2.0", "needsYourCall": ["D3"], "stale": { "isStale": false } }
}
```

## 3. Derivations (`src/core/derive.ts`)

All functions are pure and take `today` from options.

### 3.1 Progress

`total = count(status != parked)`, `done = count(status == done)`, `pct = total ? round(100 * done / total) : 0`.
`review` counts as not done. Overall progress sums all versions.

### 3.2 Version state

As spec 02 §5. Implemented after releases are parsed, so the changelog can mark versions shipped.

### 3.3 Current and next version

1. `Now.currentVersion`, if it resolves (tolerating a missing `v`).
2. Else the first `active` version by window start (document order if there is no window).
3. Else the first `planned` version.

`nextVersionId` is the first non-shipped version after the current one in document order.

### 3.4 Needs your call

Decisions with `status = open`, ordered by: overdue first, then `neededBy` ascending, then those
without a date, then document order. The renderer shows overdue items as "Proceeding with the
default since `neededBy`". The tool never edits the file: the agent skill records `defaulted`.

### 3.5 Milestone progress

A milestone is reached when `reachedOn` is set. Otherwise its `pct` is the combined progress of
every version from the first version up to and including the one that names it with `Milestone:`.

### 3.6 Staleness

- `days = today − now.updated` (null if `updated` is missing → stale, with reason "no Updated date").
- `commitsSince` = git commits on HEAD after `updated` and after the last commit that edited the roadmap file (null without git). Refreshing the Now block therefore resets the count, however busy the day.
- `isStale = days > staleAfterDays (default 14) || commitsSince >= 10`.
- `OPM-W104` is raised when `isStale`.

### 3.7 Timeline bounds

From the earliest window start to the latest window end across versions and tracks, padded to whole
months. Versions without a window go to the "Unscheduled" list.

## 4. JSON Schema

- `schema/project-data.v1.json` and `schema/config.v1.json` (draft 2020-12) are generated from the
  TS types by `scripts/gen-schema.mjs` (dev dependency `ts-json-schema-generator`) and committed.
- CI regenerates them and fails on any diff, so types and schemas cannot drift.
- `export --json` output validates against the schema in the test suite (dev dependency `ajv`).
