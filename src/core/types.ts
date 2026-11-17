// ProjectData v1 types (spec 03 §1). Types only: this file has no runtime code.
import type { DateWindow, ISODate } from './dates.js';

export type { DateWindow, ISODate };

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: `OPM-${'E' | 'W' | 'I'}${number}`;
  severity: Severity;
  /** One sentence that names the offending value. */
  message: string;
  /** How to fix it, imperative. */
  hint?: string;
  /** Display path, repo-relative with `/`. */
  file?: string;
  /** 1-based. */
  line?: number;
  /** 1-based. */
  column?: number;
}

export type Status = 'todo' | 'doing' | 'review' | 'blocked' | 'done' | 'parked';
export type VersionState = 'planned' | 'active' | 'shipped';
export type Level = 'L' | 'M' | 'H';
/** Inline markdown subset kept raw; rendered only by rich() (spec 05 §3). */
export type RichText = string;

export interface SourceRef {
  file: string;
  line: number;
}

export interface ProjectData {
  schema: 'openprojectmap/project-data@1';
  tool: { name: 'openprojectmap'; version: string };
  generatedAt: string; // ISO timestamp from options.now
  today: ISODate;
  project: { name: string; title: string; formatVersion: 1 };
  now: NowBlock | null;
  phases: Phase[];
  versions: Version[]; // in document order
  milestones: Milestone[];
  parked: ParkedItem[];
  decisions: Decision[];
  risks: Risk[];
  releases: Release[]; // newest first, Unreleased first if present
  tracks: Track[]; // v0.6, [] before
  git: GitInfo | null; // attached by node/git.ts
  derived: Derived;
  diagnostics: Diagnostic[]; // sorted by file, line, code
}

export interface NowBlock {
  updated: ISODate | null;
  currentVersion: string | null; // as written
  nextStep: RichText | null;
  why: RichText | null;
  target: RichText | null;
  facts: { key: string; value: RichText }[];
  source: SourceRef;
}

export interface Phase {
  id: string;
  title: string;
  versionIds: string[];
  source: SourceRef;
}

export interface StatusLine {
  date: ISODate | null;
  text: RichText;
  source: SourceRef;
}

export interface Version {
  id: string; // "v0.2.0"
  semver: string; // "0.2.0"
  title: string;
  phaseId: string | null;
  window: DateWindow | null;
  milestoneId: string | null;
  goal: RichText | null;
  exit: RichText | null;
  state: VersionState;
  stateExplicit: boolean;
  statusLines: StatusLine[]; // document order (ascending by date when valid)
  deliverables: Deliverable[];
  progress: Progress;
  source: SourceRef;
}

export interface Progress {
  done: number;
  total: number;
  parked: number;
  byStatus: Record<Status, number>;
  pct: number;
}

export interface Deliverable {
  id: string;
  title: string; // short display title
  detail: RichText; // full Deliverable cell
  status: Status;
  statusRaw: string;
  statusDate: ISODate | null;
  owner: string | null;
  ref: string | null; // "#41", a SHA or a URL
  notes: RichText | null;
  extra: Record<string, RichText>; // unknown columns, header → cell
  versionId: string;
  source: SourceRef;
}

export interface Milestone {
  id: string;
  name: string;
  reachedWhen: RichText;
  reachedOn: ISODate | null;
  dependsOn: string | null;
  versionIds: string[];
  source: SourceRef;
}
export interface ParkedItem {
  item: RichText;
  why: RichText;
  revisitWhen: RichText | null;
  source: SourceRef;
}

export interface Decision {
  id: string;
  question: RichText;
  options: string[];
  default: RichText;
  neededBy: ISODate | null;
  status: 'open' | 'decided' | 'defaulted';
  outcome: RichText | null;
  overdue: boolean; // open && neededBy < today
  source: SourceRef;
}

export interface Risk {
  id: string;
  risk: RichText;
  likelihood: Level | null;
  impact: Level | null;
  score: number;
  mitigation: RichText | null;
  owner: string | null;
  open: boolean;
  source: SourceRef;
}

export interface Release {
  version: string | null; // semver; null for Unreleased
  date: ISODate | null;
  title: string | null;
  unreleased: boolean;
  sections: { heading: string; items: RichText[] }[];
  versionId: string | null; // matching roadmap version, if any
  source: SourceRef;
}

export interface GitInfo {
  root: string; // display only (basename)
  head: Commit | null;
  branches: Record<string, Commit | null>; // config role → head commit ("live", "staging", …)
  activity: { weekStarts: ISODate[]; commits: number[]; areas: Record<string, number> };
  shallow: boolean;
}
export interface Commit {
  sha: string;
  date: string;
  subject: string;
}

export interface Derived {
  currentVersionId: string | null;
  nextVersionId: string | null;
  overall: Progress; // across non-shipped + shipped versions
  needsYourCall: string[]; // decision ids, ordered
  topRisks: string[]; // open risks with score ≥ 6, by score desc
  stale: {
    isStale: boolean;
    days: number | null;
    commitsSince: number | null;
    reason: string | null;
  };
  timeline: { start: ISODate | null; end: ISODate | null };
  milestoneProgress: { id: string; reached: boolean; pct: number }[];
}

export interface Track {
  id: string;
  title: string;
  versions: Version[];
  milestones: Milestone[];
}
