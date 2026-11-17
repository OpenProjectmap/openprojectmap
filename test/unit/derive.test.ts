import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  derive,
  milestoneProgress,
  needsYourCall,
  resolveCurrentVersion,
  staleness,
  timelineBounds,
  topRisks,
  versionState,
} from '../../src/core/derive.js';
import { parseChangelog } from '../../src/core/parse-changelog.js';
import { parseDecisions } from '../../src/core/parse-decisions.js';
import { parseRoadmap } from '../../src/core/parse-roadmap.js';
import { progressOf } from '../../src/core/progress.js';
import type {
  Decision,
  Deliverable,
  NowBlock,
  Release,
  Risk,
  Status,
  Version,
} from '../../src/core/types.js';

const src = { file: 'f', line: 1 };

function version(id: string, over: Partial<Version> = {}, statuses: Status[] = []): Version {
  const deliverables = statuses.map(
    (status, i) => ({ id: `${id}-D${i}`, status }) as unknown as Deliverable,
  );
  return {
    id,
    semver: id.slice(1),
    title: 't',
    phaseId: null,
    window: null,
    milestoneId: null,
    goal: null,
    exit: null,
    state: 'planned',
    stateExplicit: false,
    statusLines: [],
    deliverables,
    progress: progressOf(deliverables),
    source: src,
    ...over,
  };
}
const win = (start: string, end: string) => ({
  start,
  end,
  raw: `${start} → ${end}`,
  tentative: false,
});
const release = (version: string | null, date: string | null, unreleased = false): Release => ({
  version,
  date,
  title: null,
  unreleased,
  sections: [],
  versionId: null,
  source: src,
});
const now = (over: Partial<NowBlock> = {}): NowBlock => ({
  updated: '2026-11-10',
  currentVersion: null,
  nextStep: 'x',
  why: null,
  target: null,
  facts: [],
  source: src,
  ...over,
});
const decision = (id: string, over: Partial<Decision> = {}): Decision => ({
  id,
  question: 'q',
  options: [],
  default: 'd',
  neededBy: null,
  status: 'open',
  outcome: null,
  overdue: false,
  source: src,
  ...over,
});
const risk = (id: string, score: number, open = true): Risk => ({
  id,
  risk: 'r',
  likelihood: 'M',
  impact: 'M',
  score,
  mitigation: null,
  owner: null,
  open,
  source: src,
});

describe('resolveCurrentVersion', () => {
  const vs = [version('v0.1.0'), version('v0.2.0')];
  it('tolerates a missing v and case', () => {
    expect(resolveCurrentVersion(now({ currentVersion: '0.2.0' }), vs)).toBe('v0.2.0');
    expect(resolveCurrentVersion(now({ currentVersion: ' V0.1.0 ' }), vs)).toBe('v0.1.0');
  });
  it('is null when it names nothing, or there is no Now block', () => {
    expect(resolveCurrentVersion(now({ currentVersion: 'v9.9.9' }), vs)).toBeNull();
    expect(resolveCurrentVersion(now(), vs)).toBeNull();
    expect(resolveCurrentVersion(null, vs)).toBeNull();
  });
});

describe('versionState', () => {
  it('shipped when the changelog has a dated release with the same semver', () => {
    expect(versionState(version('v0.1.0'), [release('0.1.0', '2026-12-01')], null)).toBe('shipped');
  });
  it('is not shipped for an undated or unreleased entry or another semver', () => {
    expect(versionState(version('v0.1.0'), [release('0.1.0', null)], null)).toBe('planned');
    expect(versionState(version('v0.1.0'), [release(null, null, true)], null)).toBe('planned');
    expect(versionState(version('v0.1.0'), [release('0.2.0', '2026-12-01')], null)).toBe('planned');
  });
  it('active when current, or when any deliverable has started', () => {
    expect(versionState(version('v0.1.0'), [], 'v0.1.0')).toBe('active');
    for (const s of ['doing', 'review', 'blocked', 'done'] as const) {
      expect(versionState(version('v0.1.0', {}, ['todo', s]), [], null)).toBe('active');
    }
    expect(versionState(version('v0.1.0', {}, ['todo', 'parked']), [], null)).toBe('planned');
  });
  it('an explicit State wins', () => {
    const v = version('v0.1.0', { state: 'planned', stateExplicit: true }, ['done']);
    expect(versionState(v, [release('0.1.0', '2026-12-01')], 'v0.1.0')).toBe('planned');
  });
});

describe('needsYourCall', () => {
  it('orders overdue first, then by date, then undated, then document order', () => {
    const ds = [
      decision('D1'),
      decision('D2', { neededBy: '2026-12-10' }),
      decision('D3', { neededBy: '2026-11-01', overdue: true }),
      decision('D4', { neededBy: '2026-12-01' }),
      decision('D5', { status: 'decided' }),
      decision('D6'),
      decision('D7', { neededBy: '2026-12-10' }),
      decision('D8', { neededBy: '2026-10-01', overdue: true }),
    ];
    expect(needsYourCall(ds)).toEqual(['D8', 'D3', 'D4', 'D2', 'D7', 'D1', 'D6']);
  });
});

describe('topRisks', () => {
  it('keeps open risks scoring 6 or more, highest first and stable', () => {
    expect(
      topRisks([risk('R1', 6), risk('R2', 9), risk('R3', 5), risk('R4', 9, false), risk('R5', 6)]),
    ).toEqual(['R2', 'R1', 'R5']);
  });
});

describe('staleness', () => {
  it('is stale with no Updated date', () => {
    expect(staleness(now({ updated: null }), '2026-11-17', 14, null)).toEqual({
      isStale: true,
      days: null,
      commitsSince: null,
      reason: 'no Updated date',
    });
    expect(staleness(null, '2026-11-17', 14, 3).reason).toBe('no Updated date');
  });
  it('is stale after more than N days, but not at exactly N', () => {
    expect(staleness(now({ updated: '2026-11-03' }), '2026-11-17', 14, null)).toMatchObject({
      isStale: false,
      days: 14,
      reason: null,
    });
    expect(staleness(now({ updated: '2026-11-02' }), '2026-11-17', 14, null)).toMatchObject({
      isStale: true,
      days: 15,
      reason: '15 days since 2026-11-02',
    });
  });
  it('is stale after 10 commits', () => {
    expect(staleness(now(), '2026-11-17', 14, 9).isStale).toBe(false);
    expect(staleness(now(), '2026-11-17', 14, 10)).toMatchObject({
      isStale: true,
      reason: '10 commits since 2026-11-10',
    });
  });
});

describe('timelineBounds', () => {
  it('pads to whole months', () => {
    expect(
      timelineBounds([
        version('v1.0.0', { window: win('2026-11-17', '2026-12-13') }),
        version('v2.0.0', { window: win('2027-01-05', '2027-02-10') }),
      ]),
    ).toEqual({
      start: '2026-11-01',
      end: '2027-02-28',
    });
  });
  it('copes with a reversed window and ignores unscheduled versions', () => {
    expect(
      timelineBounds([
        version('v1.0.0', { window: win('2028-02-20', '2028-01-05') }),
        version('v2.0.0'),
      ]),
    ).toEqual({
      start: '2028-01-01',
      end: '2028-02-29',
    });
  });
  it('is null without any window', () => {
    expect(timelineBounds([version('v1.0.0')])).toEqual({ start: null, end: null });
    expect(timelineBounds([])).toEqual({ start: null, end: null });
  });
});

describe('milestoneProgress', () => {
  const vs = [
    version('v0.1.0', { milestoneId: 'M1' }, ['done', 'done']),
    version('v0.2.0', {}, ['done', 'todo']),
    version('v0.3.0', { milestoneId: 'M2' }, ['todo', 'todo']),
  ];
  const m = (id: string, reachedOn: string | null) => ({
    id,
    name: id,
    reachedWhen: '',
    reachedOn,
    dependsOn: null,
    versionIds: [],
    source: src,
  });
  it('is reached with a date, else the combined progress up to the naming version', () => {
    expect(milestoneProgress([m('M1', '2026-12-13'), m('M2', null), m('M3', null)], vs)).toEqual([
      { id: 'M1', reached: true, pct: 100 },
      { id: 'M2', reached: false, pct: 50 },
      { id: 'M3', reached: false, pct: 0 },
    ]);
  });
  it('uses the last version that names the milestone', () => {
    const two = [
      version('v1.0.0', { milestoneId: 'M' }, ['done']),
      version('v2.0.0', { milestoneId: 'M' }, ['todo']),
    ];
    expect(milestoneProgress([m('M', null)], two)[0]?.pct).toBe(50);
  });
});

describe('derive', () => {
  const versions = [
    version('v0.1.0', { window: win('2026-11-24', '2026-12-13') }, ['done']),
    version('v0.2.0', { window: win('2026-12-14', '2027-01-03') }, ['doing', 'todo']),
    version('v0.3.0', { window: win('2027-01-04', '2027-01-31') }, ['todo']),
  ];
  const base = {
    milestones: [],
    decisions: [],
    risks: [],
    releases: [release('0.1.0', '2026-12-13')],
    now: now({ currentVersion: 'v0.2.0' }),
  };

  it('resolves states, links releases and picks the current and next versions', () => {
    const r = derive({ ...base, versions }, { today: '2026-11-17' });
    expect(r.versions.map((v) => v.state)).toEqual(['shipped', 'active', 'planned']);
    expect(r.releases[0]?.versionId).toBe('v0.1.0');
    expect(r.derived).toMatchObject({
      currentVersionId: 'v0.2.0',
      nextVersionId: 'v0.3.0',
      overall: { done: 1, total: 4, pct: 25 },
      timeline: { start: '2026-11-01', end: '2027-01-31' },
      stale: { isStale: false, days: 7 },
    });
  });
  it('does not change its input', () => {
    derive({ ...base, versions }, { today: '2026-11-17' });
    expect(versions.map((v) => v.state)).toEqual(['planned', 'planned', 'planned']);
  });
  it('falls back to the first active version by window start, then the first planned', () => {
    const noNow = { ...base, now: null, releases: [] };
    const active = [
      version('v0.1.0', { window: win('2027-02-01', '2027-02-10') }, ['doing']),
      version('v0.2.0', { window: win('2027-01-01', '2027-01-10') }, ['done']),
      version('v0.3.0', {}, ['doing']),
    ];
    expect(
      derive({ ...noNow, versions: active }, { today: '2027-01-01' }).derived.currentVersionId,
    ).toBe('v0.2.0');
    const undated = [
      version('v0.1.0', {}, ['doing']),
      version('v0.2.0', { window: win('2027-01-01', '2027-01-10') }, ['doing']),
    ];
    expect(
      derive({ ...noNow, versions: undated }, { today: '2027-01-01' }).derived.currentVersionId,
    ).toBe('v0.2.0');
    const bothUndated = [version('v0.1.0', {}, ['doing']), version('v0.2.0', {}, ['doing'])];
    expect(
      derive({ ...noNow, versions: bothUndated }, { today: '2027-01-01' }).derived.currentVersionId,
    ).toBe('v0.1.0');
    const sameStart = [
      version('v0.1.0', { window: win('2027-01-01', '2027-01-10') }, ['doing']),
      version('v0.2.0', { window: win('2027-01-01', '2027-01-10') }, ['doing']),
    ];
    expect(
      derive({ ...noNow, versions: sameStart }, { today: '2027-01-01' }).derived.currentVersionId,
    ).toBe('v0.1.0');
    const planned = [version('v0.1.0'), version('v0.2.0')];
    expect(
      derive({ ...noNow, versions: planned }, { today: '2027-01-01' }).derived.currentVersionId,
    ).toBe('v0.1.0');
  });
  it('has no current or next version for an empty project', () => {
    const r = derive({ ...base, versions: [], now: null, releases: [] }, { today: '2026-11-17' });
    expect(r.derived).toMatchObject({
      currentVersionId: null,
      nextVersionId: null,
      overall: { total: 0 },
    });
  });
  it('has no next version when everything after is shipped or the current is last', () => {
    const r = derive(
      { ...base, versions: versions.slice(0, 2), releases: [release('0.1.0', '2026-12-13')] },
      { today: '2026-11-17' },
    );
    expect(r.derived.nextVersionId).toBeNull();
    const shipped = derive(
      { ...base, versions, releases: [release('0.3.0', '2027-02-01')] },
      { today: '2026-11-17' },
    );
    expect(shipped.derived.nextVersionId).toBeNull();
  });
  it('uses the stale options', () => {
    const r = derive(
      { ...base, versions },
      { today: '2026-11-17', staleAfterDays: 3, commitsSince: 2 },
    );
    expect(r.derived.stale).toMatchObject({ isStale: true, commitsSince: 2 });
  });
});

describe('dogfood', () => {
  it('derives this repo with its parsed docs', () => {
    const read = (f: string): string => readFileSync(f, 'utf8');
    const roadmap = parseRoadmap({
      path: 'docs/project/ROADMAP.md',
      text: read('docs/project/ROADMAP.md'),
    });
    const decisions = parseDecisions(
      { path: 'docs/project/DECISIONS.md', text: read('docs/project/DECISIONS.md') },
      { today: '2026-11-17' },
    );
    const changelog = parseChangelog({ path: 'CHANGELOG.md', text: read('CHANGELOG.md') });
    const r = derive(
      {
        versions: roadmap.versions,
        milestones: roadmap.milestones,
        decisions: decisions.decisions,
        risks: decisions.risks,
        releases: changelog.releases,
        now: roadmap.now,
      },
      { today: '2026-11-17' },
    );
    expect(r.derived.currentVersionId).toBe('v0.0.1');
    expect(r.derived.nextVersionId).toBe('v0.1.0');
    expect(r.derived.needsYourCall).toHaveLength(
      decisions.decisions.filter((d) => d.status === 'open').length,
    );
    expect(r.derived.timeline.start).toBe('2026-11-01');
    expect(r.derived.overall.total).toBeGreaterThan(50);
  });
});
