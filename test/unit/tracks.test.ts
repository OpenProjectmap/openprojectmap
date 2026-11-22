// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject } from '../../src/core/index.js';
import type { ProjectData } from '../../src/core/types.js';
import { buildData } from '../../src/node/build.js';
import { validateConfig } from '../../src/node/config.js';
import { boot } from '../../src/render/client/main.js';
import { formatHash, parseHash, tabsOf } from '../../src/render/client/router.js';
import { layoutTimeline } from '../../src/render/client/views/timeline-layout.js';

const NOW = '2026-11-25';
const BLOCK = /^(?<id>BM\d+) +[—–-] +(?<title>.+)$/u;
const IDS = /^(?<version>BM\d+)-S\d+$/u;

function example(): ProjectData {
  return buildData({ cwd: 'examples/two-tracks', now: NOW, git: false }).data;
}

const ROADMAP = `<!-- opmap: 1 -->
# P

## Now

**Updated:** 2026-11-20
**Next step:** Go.

## Versions

### v0.1.0 — One

**Window:** 2026-11-01 → 2026-11-30

| ID | Deliverable | Status |
| --- | --- | --- |
| 0.1.0-D1 | **A** | todo |
`;

function withTrack(text: string, extra: object = {}): ProjectData {
  return parseProject(
    {
      roadmap: { path: 'ROADMAP.md', text: ROADMAP },
      tracks: [
        {
          id: 'biz',
          title: 'Biz',
          source: { path: 'BIZ.md', text },
          blockPattern: BLOCK,
          idPattern: IDS,
          ...extra,
        },
      ],
    },
    { now: NOW },
  );
}

const TRACK = `<!-- opmap: 1 -->
# Biz

### BM0 — Check

**Window:** 2026-12-01 → 2027-02-28

| ID | Deliverable | Status |
| --- | --- | --- |
| BM0-S1 | **Survey** | done 2026-12-02 (#1) |
`;

describe('tracks in the core', () => {
  it('parses the example: two tracks of work, no warnings', () => {
    const d = example();
    expect(d.diagnostics).toEqual([]);
    expect(d.tracks).toHaveLength(1);
    const t = d.tracks[0];
    expect(t).toMatchObject({ id: 'business', title: 'Business' });
    expect(t?.versions.map((v) => v.id)).toEqual(['BM0', 'BM1']);
    expect(t?.versions.map((v) => v.state)).toEqual(['shipped', 'active']);
    expect(t?.versions[1]?.deliverables.map((x) => x.id)).toEqual(['BM1-S1', 'BM1-S2', 'BM1-S3']);
    expect(t?.progress.total).toBe(5);
    expect(t?.file).toBe('examples/two-tracks/docs/project/BUSINESS.md');
  });

  it('has no Now block of its own and does not count in the roadmap totals', () => {
    const d = withTrack(TRACK);
    expect(d.diagnostics.filter((x) => /Now/.test(x.message))).toEqual([]);
    expect(d.derived.overall.total).toBe(1);
    expect(d.tracks[0]?.progress.total).toBe(1);
  });

  it('stretches the combined timeline over the tracks', () => {
    const d = withTrack(TRACK);
    expect(d.derived.timeline).toEqual({ start: '2026-11-01', end: '2027-02-28' });
  });

  it('reports a deliverable ID used in two files', () => {
    const dup = TRACK.replace('BM0-S1', '0.1.0-D1');
    const codes = withTrack(dup, { idPattern: /^(?<version>.+)-.+$/u }).diagnostics.map(
      (x) => x.code,
    );
    expect(codes).toContain('OPM-W302');
  });

  it('applies the track id pattern', () => {
    const d = withTrack(TRACK.replace('BM0-S1', 'BM9-S1'));
    expect(d.diagnostics.map((x) => x.code)).toContain('OPM-W303');
    const e = withTrack(TRACK.replace('BM0-S1', 'nonsense'));
    expect(e.diagnostics.map((x) => x.code)).toContain('OPM-W304');
  });

  it('ignores a heading whose id is not a short word', () => {
    const d = withTrack(TRACK.replace('### BM0 — Check', '### BM0/../x — Check'), {
      blockPattern: /^(?<id>\S+) +[—–-] +(?<title>.+)$/u,
    });
    expect(d.tracks[0]?.versions).toEqual([]);
  });

  it('uses the version grammar when the track has no block pattern', () => {
    const d = withTrack(
      '# T\n\n### v1.0.0 — First\n\n| ID | Deliverable | Status |\n| --- | --- | --- |\n| 1.0.0-D1 | x | todo |\n',
      { blockPattern: undefined, idPattern: undefined },
    );
    expect(d.tracks[0]?.versions.map((v) => v.id)).toEqual(['v1.0.0']);
  });

  it('is empty without tracks', () => {
    expect(parseProject({ roadmap: { path: 'R.md', text: ROADMAP } }, { now: NOW }).tracks).toEqual(
      [],
    );
  });
});

describe('tracks in the config', () => {
  const base = { format: 1, tracks: [{ id: 'biz', title: 'Biz', file: 'BIZ.md' }] };
  it('accepts a track', () => {
    expect(validateConfig(base).problems).toEqual([]);
  });
  it('wants the id and title groups in blockPattern', () => {
    const bad = {
      ...base,
      tracks: [{ id: 'biz', title: 'Biz', file: 'BIZ.md', blockPattern: '^BM\\d+$' }],
    };
    expect(validateConfig(bad).problems.join('\n')).toContain('named groups');
  });
  it('fails clearly when a track file is missing', () => {
    expect(() =>
      buildData({
        cwd: '.',
        configPath: 'test/fixtures/tracks-missing.json',
        now: NOW,
        git: false,
      }),
    ).toThrow(/track "gone"/);
  });
});

describe('tracks in the timeline layout', () => {
  it('draws a lane for each track and links bars to the track', () => {
    const l = layoutTimeline(example());
    const bars = l.rows.filter((r) => r.kind === 'bar');
    expect(bars.map((b) => `${b.trackId}:${b.version.id}`)).toEqual([
      'null:v0.1.0',
      'null:v0.2.0',
      'business:BM0',
      'business:BM1',
    ]);
    expect(l.rows.filter((r) => r.kind === 'group').map((g) => g.label)).toEqual(['Business']);
    expect(l.start).toBe('2026-10-01');
    expect(l.end).toBe('2027-01-31');
  });
});

describe('track routes', () => {
  it('round-trips a track hash', () => {
    const s = parseHash('#/track/business/BM1?status=todo');
    expect(s).toMatchObject({ view: 'track', trackId: 'business', versionId: 'BM1' });
    expect(formatHash(s)).toBe('#/track/business/BM1?status=todo');
  });
  it('falls back to the overview for a bad track id', () => {
    expect(parseHash('#/track/Bad%20Id').view).toBe('overview');
    expect(parseHash('#/track').view).toBe('overview');
  });
  it('puts the track tabs after Versions', () => {
    expect(tabsOf([{ id: 'biz', title: 'Biz' }]).map((t) => t.label)).toEqual([
      'Overview',
      'Timeline',
      'Versions',
      'Biz',
      'Decisions',
      'History',
      'Parked',
    ]);
  });
});

describe('track tabs in the page', () => {
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  function mount(data: ProjectData): void {
    document.body.replaceChildren();
    const app = document.createElement('div');
    app.id = 'app';
    const json = document.createElement('script');
    json.type = 'application/json';
    json.id = 'opmap-data';
    json.textContent = JSON.stringify(data);
    document.body.append(app, json);
  }
  beforeEach(() => {
    window.location.hash = '';
  });

  it('shows a tab for the track and its blocks', async () => {
    mount(example());
    boot(document);
    const tabs = [...document.querySelectorAll('[role=tab]')].map((t) => t.textContent);
    expect(tabs).toEqual([
      'Overview',
      'Timeline',
      'Versions',
      'Business',
      'Decisions',
      'History',
      'Parked',
    ]);
    window.location.hash = '#/track/business';
    await tick();
    const panel = document.getElementById('panel') as HTMLElement;
    expect(panel.textContent).toContain('BM0 · Idea check');
    expect(panel.textContent).toContain('BM1-S2');
    expect(panel.textContent).not.toContain('0.2.0-D2');
    expect(document.getElementById('tab-track-business')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.getElementById('tab-versions')?.getAttribute('aria-selected')).toBe('false');
  });

  it('shows one block of a track', async () => {
    mount(example());
    boot(document);
    window.location.hash = '#/track/business/BM1';
    await tick();
    const panel = document.getElementById('panel') as HTMLElement;
    expect(panel.textContent).toContain('BM1 · Launch');
    expect(panel.textContent).not.toContain('BM0 · Idea check');
    expect(panel.textContent).toContain('← All of Business');
  });

  it('shows the overview for a track that does not exist', async () => {
    mount(example());
    boot(document);
    window.location.hash = '#/track/nope';
    await tick();
    expect(document.getElementById('tab-overview')?.getAttribute('aria-selected')).toBe('true');
  });

  it('opens a track block from the timeline', async () => {
    mount(example());
    boot(document);
    window.location.hash = '#/timeline';
    await tick();
    const bar = document.querySelector('[data-version="BM1"]') as SVGElement;
    expect(bar).not.toBeNull();
    bar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(window.location.hash).toBe('#/track/business/BM1');
  });

  it('moves between tabs with the arrow keys, tracks included', async () => {
    mount(example());
    boot(document);
    window.location.hash = '#/versions';
    await tick();
    const tablist = document.querySelector('[role=tablist]') as HTMLElement;
    tablist.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(window.location.hash).toBe('#/track/business');
  });
});
