import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findColumns, parseRoadmap, plainText } from '../../src/core/parse-roadmap.js';

const parse = (text: string, idPattern?: RegExp) =>
  parseRoadmap({ path: 'docs/project/ROADMAP.md', text }, idPattern ? { idPattern } : {});
const codes = (text: string, idPattern?: RegExp): string[] =>
  parse(text, idPattern).diagnostics.map((d) => d.code);

const GOOD = `<!-- opmap: 1 -->
# Demo: Roadmap

## Now

**Updated:** 2026-11-16
**Current version:** v0.2.0
**Next step:** Finish the timeline.
**Why:** It blocks the alpha.
**Target:** Alpha (M2) by 2027-01-17
**Live:** v0.1.0 on npm
**Users:** 12

## Phase 1 — Foundations

### v0.1.0 — Core parser

**Window:** 2026-11-24 → 2026-12-13
**Milestone:** M1
**State:** shipped
**Goal:** Parse the docs.
**Exit:** Tests pass.
**Status 2026-11-30:** scanner done.
**Status 2026-12-10:** all done.

| ID | Deliverable | Status | Owner | PR | Notes | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| 0.1.0-D1 | **Scanner**: line based | done 2026-11-30 (#4) | ana | #4 | spec 02 | low |
| 0.1.0-D2 | Dates | parked | | | | |

## Phase 2 — Public alpha

### v0.2.0 — Views

**Window:** 2026-12-14 → 2027-01-03
**Milestone:** M2

| ID | Title | Status |
| --- | --- | --- |
| 0.2.0-D1 | DOM helper | doing |
| 0.2.0-D2 | Rich text, a very long title that goes on and on and on and on and on and on and on and on and on and on and on | in review |

## Milestones

| ID | Milestone | Reached when | Reached on | Depends on |
| --- | --- | --- | --- | --- |
| M1 | Works on one repo | v0.1.0 on npm | 2026-12-13 | |
| M2 | Public alpha | v0.2.0 | | M1 |

## Parked

| Item | Why | Revisit when |
| --- | --- | --- |
| SaaS | Needs accounts | After 1.0 |
| Themes | Not now | |
`;

describe('parseRoadmap: a complete roadmap', () => {
  const r = parse(GOOD);
  it('only reports the missing goal and exit of v0.2.0', () => {
    expect(r.diagnostics.map((d) => d.code)).toEqual(['OPM-I205', 'OPM-W207']);
  });
  it('reads the title and the Now block', () => {
    expect(r.title).toBe('Demo: Roadmap');
    expect(r.now).toEqual({
      updated: '2026-11-16',
      currentVersion: 'v0.2.0',
      nextStep: 'Finish the timeline.',
      why: 'It blocks the alpha.',
      target: 'Alpha (M2) by 2027-01-17',
      facts: [
        { key: 'Live', value: 'v0.1.0 on npm' },
        { key: 'Users', value: '12' },
      ],
      source: { file: 'docs/project/ROADMAP.md', line: 4 },
    });
  });
  it('reads phases and versions', () => {
    expect(r.phases.map((p) => [p.id, p.title, p.versionIds])).toEqual([
      ['1', 'Foundations', ['v0.1.0']],
      ['2', 'Public alpha', ['v0.2.0']],
    ]);
    const v = r.versions[0];
    expect(v).toMatchObject({
      id: 'v0.1.0',
      semver: '0.1.0',
      title: 'Core parser',
      phaseId: '1',
      milestoneId: 'M1',
      state: 'shipped',
      stateExplicit: true,
      goal: 'Parse the docs.',
      exit: 'Tests pass.',
      window: { start: '2026-11-24', end: '2026-12-13', tentative: false },
    });
    expect(v?.statusLines.map((s) => s.date)).toEqual(['2026-11-30', '2026-12-10']);
    expect(r.versions[1]).toMatchObject({
      state: 'planned',
      stateExplicit: false,
      goal: null,
      exit: null,
    });
  });
  it('reads deliverables with known and extra columns', () => {
    const d = r.versions[0]?.deliverables ?? [];
    expect(d[0]).toMatchObject({
      id: '0.1.0-D1',
      title: 'Scanner',
      detail: '**Scanner**: line based',
      status: 'done',
      statusDate: '2026-11-30',
      owner: 'ana',
      ref: '#4',
      notes: 'spec 02',
      extra: { Risk: 'low' },
      versionId: 'v0.1.0',
    });
    expect(d[0]?.source.line).toBe(28);
    expect(d[1]).toMatchObject({
      status: 'parked',
      owner: null,
      ref: null,
      notes: null,
      extra: {},
    });
    expect(r.versions[0]?.progress).toMatchObject({ done: 1, total: 1, parked: 1, pct: 100 });
  });
  it('accepts column aliases and truncates long titles', () => {
    const d = r.versions[1]?.deliverables ?? [];
    expect(d[0]?.title).toBe('DOM helper');
    expect(d[1]?.title).toHaveLength(96);
    expect(d[1]?.title.endsWith('…')).toBe(true);
    expect(d[1]?.detail.length).toBeGreaterThan(96);
    expect(d[1]?.status).toBe('review');
  });
  it('reads milestones and links versions to them', () => {
    expect(r.milestones).toMatchObject([
      {
        id: 'M1',
        name: 'Works on one repo',
        reachedOn: '2026-12-13',
        versionIds: ['v0.1.0'],
        dependsOn: null,
      },
      { id: 'M2', reachedOn: null, versionIds: ['v0.2.0'], dependsOn: 'M1' },
    ]);
  });
  it('reads the parked table', () => {
    expect(r.parked).toMatchObject([
      { item: 'SaaS', why: 'Needs accounts', revisitWhen: 'After 1.0' },
      { item: 'Themes', revisitWhen: null },
    ]);
  });
});

describe('parseRoadmap: format and structure', () => {
  const body = '\n# T\n\n## Now\n\n**Next step:** x\n';
  it('OPM-I001 without a marker, none with one', () => {
    expect(codes(body)).toContain('OPM-I001');
    expect(codes('<!-- opmap: 1 -->' + body)).not.toContain('OPM-I001');
  });
  it('OPM-E002 for a higher format version', () => {
    const d = parse('<!-- opmap: 2 -->' + body).diagnostics.find((x) => x.code === 'OPM-E002');
    expect(d).toMatchObject({ severity: 'error', line: 1 });
  });
  it('uses no title when there is no H1, and the first H1 otherwise', () => {
    expect(parse('<!-- opmap: 1 -->\n## Now\n**Next step:** x').title).toBeNull();
    expect(parse('# A\n# B').title).toBe('A');
  });
  it('OPM-W101 when there is no Now block; accepts Status and Current state', () => {
    expect(codes('<!-- opmap: 1 -->\n# T')).toContain('OPM-W101');
    expect(parse('<!-- opmap: 1 -->\n## Status\n**Next:** go').now?.nextStep).toBe('go');
    expect(parse('<!-- opmap: 1 -->\n## Current state\n**Next step:** go').now).not.toBeNull();
  });
  it('OPM-W102 without a next step', () => {
    expect(codes('<!-- opmap: 1 -->\n## Now\n**Why:** y')).toContain('OPM-W102');
  });
  it('OPM-W103 for an unknown current version, tolerating a missing v', () => {
    const doc = (cur: string): string =>
      `<!-- opmap: 1 -->\n## Now\n**Next step:** x\n**Current version:** ${cur}
## V
### v0.1.0 — A
`;
    expect(codes(doc('v0.9.0'))).toContain('OPM-W103');
    expect(codes(doc('0.1.0'))).not.toContain('OPM-W103');
    expect(codes(doc('V0.1.0'))).not.toContain('OPM-W103');
  });
  it('OPM-W105 and a null date for a bad Updated', () => {
    const r = parse('<!-- opmap: 1 -->\n## Now\n**Updated:** yesterday\n**Next step:** x');
    expect(r.now?.updated).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toContain('OPM-W105');
    expect(
      parse('<!-- opmap: 1 -->\n## Now\n**Last updated:** 2026-01-02\n**Next step:** x').now
        ?.updated,
    ).toBe('2026-01-02');
  });
  it('keeps the first Now block when there are two', () => {
    const r = parse('<!-- opmap: 1 -->\n## Now\n**Next step:** one\n## Status\n**Next step:** two');
    expect(r.now?.nextStep).toBe('two');
  });
  it('puts versions under a plain H2 in no phase, and ignores other H3s and unknown sections', () => {
    const r = parse(
      '<!-- opmap: 1 -->\n## Versions\n### v0.1.0 — A\n### Notes\n**Window:** 2027\n## Misc\n### v0.2.0 — B\n## Decisions\n### v0.3.0 — C\n## Now\n### v0.4.0 — D',
    );
    expect(r.versions.map((v) => [v.id, v.phaseId])).toEqual([
      ['v0.1.0', null],
      ['v0.2.0', null],
    ]);
  });
  it('accepts a prerelease semver and any dash in the version heading', () => {
    const r = parse('<!-- opmap: 1 -->\n## V\n### v1.0.0-rc.1 - RC\n### 2.0.0 – Two\n');
    expect(r.versions.map((v) => [v.id, v.title])).toEqual([
      ['v1.0.0-rc.1', 'RC'],
      ['v2.0.0', 'Two'],
    ]);
  });
  it('ignores fields outside the Now block and versions', () => {
    const r = parse('<!-- opmap: 1 -->\n## Other\n**Next step:** x\n## Phase 1 — P\n**Goal:** y');
    expect(r.now).toBeNull();
    expect(r.versions).toEqual([]);
  });
});

describe('parseRoadmap: version diagnostics', () => {
  const v = (
    fields: string,
    table = '| ID | Deliverable | Status |\n| --- | --- | --- |\n| 0.1.0-D1 | A | todo |',
  ): string =>
    `<!-- opmap: 1 -->\n## Now\n**Next step:** x\n## V\n### v0.1.0 — A\n${fields}\n\n${table}\n`;
  const full = '**Window:** 2027-01\n**Goal:** g\n**Exit:** e';

  it('is clean with all the fields', () => {
    expect(codes(v(full))).toEqual([]);
  });
  it('OPM-W201 without a window, but not when the window is unparseable', () => {
    expect(codes(v('**Goal:** g\n**Exit:** e'))).toEqual(['OPM-W201']);
    expect(codes(v('**Window:** soon\n**Goal:** g\n**Exit:** e'))).toEqual(['OPM-W202']);
  });
  it('OPM-W203 for a window that starts after it ends, keeping the window', () => {
    const r = parse(v('**Window:** 2027-02 → 2027-01\n**Goal:** g\n**Exit:** e'));
    expect(r.diagnostics.map((d) => d.code)).toEqual(['OPM-W203']);
    expect(r.versions[0]?.window).toMatchObject({ start: '2027-02-01', end: '2027-01-31' });
  });
  it('OPM-I205 and OPM-W207 for a missing goal and exit', () => {
    expect(codes(v('**Window:** 2027-01'))).toEqual(['OPM-I205', 'OPM-W207']);
  });
  it('OPM-W205 for status lines out of order, ignoring undated ones', () => {
    const lines = `${full}\n**Status 2026-12-10:** b\n**Status:** undated\n**Status 2026-12-01:** a`;
    expect(codes(v(lines))).toEqual(['OPM-W205']);
    const r = parse(v(lines));
    expect(r.versions[0]?.statusLines.map((s) => s.date)).toEqual([
      '2026-12-10',
      null,
      '2026-12-01',
    ]);
  });
  it('keeps a status line with an impossible date as undated', () => {
    const r = parse(v(`${full}\n**Status 2026-13-45:** odd\n**Status of the build:** ignored`));
    expect(r.versions[0]?.statusLines).toHaveLength(1);
    expect(r.versions[0]?.statusLines[0]?.date).toBeNull();
  });
  it('OPM-W206 when the version has no deliverables table', () => {
    expect(codes(v(full, 'Just prose.'))).toEqual(['OPM-W206']);
    expect(codes(v(full, '| A | B |\n| --- | --- |\n| 1 | 2 |'))).toEqual(['OPM-W206']);
  });
  it('OPM-W701 for a table missing a required column, without a second W206', () => {
    const r = parse(v(full, '| ID | Deliverable |\n| --- | --- |\n| 0.1.0-D1 | A |'));
    expect(r.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ['OPM-W701', 'Table is missing the Status column'],
    ]);
    expect(codes(v(full, '| Deliverable | Status |\n| --- | --- |\n| A | todo |'))).toEqual([
      'OPM-W701',
    ]);
  });
  it('OPM-W208 for a duplicate version id', () => {
    const doc =
      '<!-- opmap: 1 -->\n## Now\n**Next step:** x\n## V\n### v0.1.0 — A\n### v0.1.0 — B\n';
    expect(parse(doc).diagnostics.filter((d) => d.code === 'OPM-W208')).toHaveLength(1);
  });
  it('ignores an invalid State and accepts any case', () => {
    expect(parse(v(`${full}\n**State:** done`)).versions[0]?.stateExplicit).toBe(false);
    expect(parse(v(`${full}\n**State:** Active`)).versions[0]).toMatchObject({
      state: 'active',
      stateExplicit: true,
    });
  });
  it('concatenates several deliverable tables and reads H4 groups', () => {
    const t2 = '| ID | Deliverable | Status |\n| --- | --- | --- |\n| 0.1.0-D2 | B | done |';
    const r = parse(
      v(
        full,
        `#### More\n\n${t2}\n\n| ID | Deliverable | Status |\n| --- | --- | --- |\n| 0.1.0-D3 | C | blocked |`,
      ),
    );
    expect(r.versions[0]?.deliverables.map((d) => d.id)).toEqual(['0.1.0-D2', '0.1.0-D3']);
  });
});

describe('parseRoadmap: deliverable diagnostics', () => {
  const rows = (...r: string[]): string =>
    `<!-- opmap: 1 -->\n## Now\n**Next step:** x\n## V\n### v0.1.0 — A\n**Window:** 2027\n**Goal:** g\n**Exit:** e\n\n| ID | Deliverable | Status |\n| --- | --- | --- |\n${r.join('\n')}\n`;

  it('OPM-W301 with a suggestion, and the status becomes todo', () => {
    const r = parse(rows('| 0.1.0-D1 | A | dne |', '| 0.1.0-D2 | B | zzzzzzzz |'));
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      'Unknown status "dne" for 0.1.0-D1; did you mean "done"?',
      'Unknown status "zzzzzzzz" for 0.1.0-D2',
    ]);
    expect(r.versions[0]?.deliverables[0]?.status).toBe('todo');
  });
  it('OPM-W302 for a duplicate ID, across versions too', () => {
    expect(codes(rows('| 0.1.0-D1 | A | todo |', '| 0.1.0-D1 | B | todo |'))).toEqual(['OPM-W302']);
    const two = `${rows('| 0.1.0-D1 | A | todo |')}### v0.2.0 — B\n\n| ID | Deliverable | Status |\n| --- | --- | --- |\n| 0.1.0-D1 | C | todo |\n`;
    expect(codes(two)).toContain('OPM-W302');
  });
  it('OPM-W303 when the ID version differs from its block', () => {
    expect(codes(rows('| 0.2.0-D1 | A | todo |'))).toEqual(['OPM-W303']);
  });
  it('OPM-W304 when the ID does not match the pattern', () => {
    expect(codes(rows('| D1 | A | todo |'))).toEqual(['OPM-W304']);
    expect(codes(rows('| T-1 | A | todo |'), /^T-\d+$/)).toEqual([]);
  });
  it('skips blank rows', () => {
    expect(
      parse(rows('| | | |', '| 0.1.0-D1 | A | todo |')).versions[0]?.deliverables,
    ).toHaveLength(1);
  });
  it('takes a ref from the status cell when there is no Ref column', () => {
    const r = parse(rows('| 0.1.0-D1 | A | done 2026-12-01 (#14) |'));
    expect(r.versions[0]?.deliverables[0]).toMatchObject({
      ref: '#14',
      statusDate: '2026-12-01',
      statusRaw: 'done 2026-12-01 (#14)',
    });
  });
  it('OPM-I702 comes through from the scanner with a position', () => {
    const d = parse(rows('| 0.1.0-D1 | A | todo | extra |')).diagnostics[0];
    expect(d).toMatchObject({
      code: 'OPM-I702',
      severity: 'info',
      file: 'docs/project/ROADMAP.md',
      line: 12,
    });
  });
});

describe('parseRoadmap: milestones and parked', () => {
  const base =
    '<!-- opmap: 1 -->\n## Now\n**Next step:** x\n## V\n### v0.1.0 — A\n**Window:** 2027\n**Goal:** g\n**Exit:** e\n';
  const table = '\n| ID | Deliverable | Status |\n| --- | --- | --- |\n| 0.1.0-D1 | A | todo |\n';
  it('OPM-W401 for a version naming an unknown milestone', () => {
    expect(codes(`${base}**Milestone:** M9${table}`)).toEqual(['OPM-W401']);
  });
  it('OPM-I402 for a milestone no version completes', () => {
    const ms =
      '\n## Milestones\n\n| ID | Name | Definition |\n| --- | --- | --- |\n| M1 | One | done |\n';
    expect(codes(`${base}${table}${ms}`)).toEqual(['OPM-I402']);
    expect(codes(`${base}**Milestone:**${table}${ms}`)).toEqual(['OPM-I402']);
  });
  it('OPM-W701 for milestone and parked tables missing columns', () => {
    expect(
      codes(`${base}${table}\n## Milestones\n\n| ID | Name |\n| --- | --- |\n| M1 | One |\n`),
    ).toEqual(['OPM-W701']);
    expect(codes(`${base}${table}\n## Parked\n\n| Item |\n| --- |\n| x |\n`)).toEqual(['OPM-W701']);
    expect(codes(`${base}${table}\n## Parked\n\n| Why |\n| --- |\n| x |\n`)).toEqual(['OPM-W701']);
  });
  it('accepts the Parked section aliases and skips blank rows', () => {
    for (const name of ['Not doing', 'Parking lot', 'Later']) {
      const r = parse(
        `${base}${table}\n## ${name}\n\n| Item | Why |\n| --- | --- |\n| | |\n| a | b |\n`,
      );
      expect(r.parked).toMatchObject([{ item: 'a', why: 'b', revisitWhen: null }]);
    }
  });
  it('skips blank milestone rows and ignores other tables', () => {
    const r = parse(
      `${base}${table}\n## Milestones\n\n| ID | Milestone | Reached when |\n| --- | --- | --- |\n| | | |\n| M1 | One | x |\n`,
    );
    expect(r.milestones.map((m) => m.id)).toEqual(['M1']);
    expect(parse('<!-- opmap: 1 -->\n## Elsewhere\n\n| A |\n| --- |\n| 1 |\n').milestones).toEqual(
      [],
    );
  });
});

describe('helpers', () => {
  it('plainText strips emphasis and ticks', () => {
    expect(plainText(' **Bold** `x` _y_ ')).toBe('Bold x y');
  });
  it('findColumns matches names case-insensitively and by alias', () => {
    expect(
      findColumns(['ID', ' **Title** ', 'status'], {
        id: ['id'],
        t: ['deliverable', 'title'],
        s: ['Status'],
        z: ['zzz'],
      }),
    ).toEqual({
      id: 0,
      t: 1,
      s: 2,
    });
  });
});

describe('dogfood', () => {
  it('parses this repo roadmap with no diagnostics', () => {
    const text = readFileSync('docs/project/ROADMAP.md', 'utf8');
    const r = parse(text);
    expect(r.diagnostics).toEqual([]);
    expect(r.versions.length).toBeGreaterThanOrEqual(10);
    expect(r.milestones.length).toBeGreaterThanOrEqual(5);
    expect(r.now?.nextStep).toBeTruthy();
  });
  it('parses the tidepool example', () => {
    const r = parse(readFileSync('examples/tidepool/docs/project/ROADMAP.md', 'utf8'));
    expect(r.title).toBe('Tidepool');
    expect(r.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });
});
