// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '../../src/render/client/main.js';
import {
  LAYOUT,
  layoutTimeline,
  makeTicks,
} from '../../src/render/client/views/timeline-layout.js';
import type { Bar } from '../../src/render/client/views/timeline-layout.js';
import { tidepool } from './helpers.js';

const bars = (rows: ReturnType<typeof layoutTimeline>['rows']): Bar[] =>
  rows.filter((r): r is Bar => r.kind === 'bar');

describe('makeTicks', () => {
  const x = (d: string): number => Number(d.slice(5, 7)) + Number(d.slice(0, 4)) * 12;
  it('has one tick per month, labelled, with the year on January', () => {
    const t = makeTicks('2026-11-01', '2027-02-28', 'month', x);
    expect(t.map((k) => k.label)).toEqual(['Nov', 'Dec', 'Jan 2027', 'Feb']);
    expect(t.map((k) => k.major)).toEqual([false, false, true, false]);
  });
  it('has one tick per quarter at the quarter zoom', () => {
    const t = makeTicks('2026-11-17', '2027-08-31', 'quarter', x);
    expect(t.map((k) => k.label)).toEqual(['Q4 2026', 'Q1 2027', 'Q2 2027', 'Q3 2027']);
  });
  it('starts at the range start when it is mid-month', () => {
    expect(makeTicks('2026-11-17', '2026-12-31', 'month', x)[0]?.label).toBe('Nov');
  });
});

describe('layoutTimeline', () => {
  it('places bars in date order inside the chart area, with a progress fill', () => {
    const d = tidepool();
    const l = layoutTimeline(d);
    const b = bars(l.rows);
    expect(b.length).toBe(d.versions.filter((v) => v.window).length);
    for (const bar of b) {
      expect(bar.x).toBeGreaterThanOrEqual(LAYOUT.labelWidth);
      expect(bar.x + bar.width).toBeLessThanOrEqual(l.width - LAYOUT.rightPad + 0.01);
      expect(bar.fill).toBeCloseTo((bar.width * bar.version.progress.pct) / 100);
    }
    const xs = b.map((r) => r.x);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
    expect(l.height).toBeGreaterThan(LAYOUT.headerHeight);
  });
  it('groups by phase and puts a diamond on the version that completes a milestone', () => {
    const d = tidepool();
    const l = layoutTimeline(d);
    expect(
      l.rows.filter((r) => r.kind === 'group').map((g) => (g.kind === 'group' ? g.label : '')),
    ).toEqual(d.phases.map((p) => p.title));
    const ms = bars(l.rows).filter((r) => r.milestone);
    expect(ms.map((r) => r.milestone?.id)).toEqual(
      d.versions.filter((v) => v.window && v.milestoneId).map((v) => v.milestoneId),
    );
    for (const r of ms) expect(r.milestone?.x).toBeCloseTo(r.x + r.width);
  });
  it('shows today only inside the range', () => {
    const d = tidepool();
    expect(layoutTimeline(d).today?.date).toBe(d.today);
    d.today = '2020-01-01';
    expect(layoutTimeline(d).today).toBeNull();
  });
  it('lists versions without a window as unscheduled and handles a reversed window', () => {
    const d = tidepool();
    const first = d.versions[0];
    const second = d.versions[1];
    if (first) first.window = null;
    if (second?.window)
      second.window = { ...second.window, start: second.window.end, end: second.window.start };
    const l = layoutTimeline(d);
    expect(l.unscheduled.map((v) => v.version.id)).toContain(first?.id);
    expect(bars(l.rows).find((r) => r.version.id === second?.id)?.width).toBeGreaterThan(0);
  });
  it('is empty without any window', () => {
    const d = tidepool();
    for (const v of d.versions) v.window = null;
    d.derived.timeline = { start: null, end: null };
    const l = layoutTimeline(d);
    expect(l.rows).toEqual([]);
    expect(l.unscheduled).toHaveLength(d.versions.length);
    expect(l.ticks).toEqual([]);
  });
  it('gives a tiny window a minimum width', () => {
    const d = tidepool();
    const v = d.versions.find((x) => x.window);
    if (v?.window) v.window = { ...v.window, start: v.window.end };
    expect(bars(layoutTimeline(d).rows).every((b) => b.width >= 4)).toBe(true);
  });
  it('puts versions that have no phase in no group', () => {
    const d = tidepool();
    d.phases = [];
    for (const v of d.versions) v.phaseId = null;
    expect(layoutTimeline(d).rows.some((r) => r.kind === 'group')).toBe(false);
  });
});

function mount(data: ReturnType<typeof tidepool>): void {
  document.body.replaceChildren();
  const app = document.createElement('div');
  app.id = 'app';
  const json = document.createElement('script');
  json.type = 'application/json';
  json.id = 'opmap-data';
  json.textContent = JSON.stringify(data);
  document.body.append(app, json);
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function go(hash: string): Promise<void> {
  window.location.hash = hash;
  await tick();
}
const main = (): HTMLElement => document.getElementById('main') as HTMLElement;

describe('timeline view', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  it('draws an accessible SVG with a bar per scheduled version, a today line and a legend', async () => {
    const d = tidepool();
    mount(d);
    boot(document);
    await go('#/timeline');
    const svg = main().querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('group');
    expect(svg?.getAttribute('aria-label')).toMatch(
      /^Timeline from \d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d: \d+ scheduled versions$/,
    );
    const rows = [...main().querySelectorAll<SVGElement>('g.bar-row')];
    expect(rows.length).toBe(d.versions.filter((v) => v.window).length);
    for (const r of rows) {
      expect(r.getAttribute('role')).toBe('link');
      expect(r.getAttribute('tabindex')).toBe('0');
      expect(r.getAttribute('aria-label')).toContain('Press Enter to open.');
    }
    expect(main().querySelector('line.today')).not.toBeNull();
    expect(main().querySelector('.legend')?.textContent).toContain('milestone');
    expect(main().querySelectorAll('path.diamond').length).toBeGreaterThan(0);
  });
  it('opens a version with Enter or a click, and ignores other keys', async () => {
    mount(tidepool());
    boot(document);
    await go('#/timeline');
    const row = main().querySelector<SVGElement>('g.bar-row');
    const id = row?.dataset['version'];
    row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(window.location.hash).toBe('#/timeline');
    row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(window.location.hash).toBe(`#/versions/${id}`);
    await go('#/timeline');
    main().querySelector<SVGElement>('g.bar-row')?.dispatchEvent(new Event('click'));
    await tick();
    expect(window.location.hash).toBe(`#/versions/${id}`);
  });
  it('switches between months and quarters through the URL', async () => {
    mount(tidepool());
    boot(document);
    await go('#/timeline');
    const labels = (): string[] =>
      [...main().querySelectorAll('text.axis')].map((t) => t.textContent ?? '');
    expect(labels().some((l) => /^Q\d/.test(l))).toBe(false);
    const quarters = [...main().querySelectorAll<HTMLElement>('button.filter')].find(
      (b) => b.textContent === 'Quarters',
    );
    quarters?.click();
    await tick();
    expect(window.location.hash).toContain('zoom=quarter');
    expect(labels().some((l) => /^Q\d/.test(l))).toBe(true);
    expect(main().querySelector('button[aria-pressed=true]')?.textContent).toBe('Quarters');
  });
  it('marks tentative windows and lists unscheduled versions', async () => {
    const d = tidepool();
    const withWindow = d.versions.filter((v) => v.window);
    if (withWindow[0]?.window) withWindow[0].window.tentative = true;
    const loose = d.versions.find((v) => !v.window) ?? withWindow[withWindow.length - 1];
    if (loose) loose.window = null;
    mount(d);
    boot(document);
    await go('#/timeline');
    expect(main().querySelector('g.bar-row.tentative')).not.toBeNull();
    expect(main().textContent).toContain('Unscheduled');
  });
  it('explains an empty timeline', async () => {
    const d = tidepool();
    for (const v of d.versions) v.window = null;
    d.versions = [];
    d.derived.timeline = { start: null, end: null };
    mount(d);
    boot(document);
    await go('#/timeline');
    expect(main().textContent).toContain('No version has a window yet.');
  });
  it('omits the today line when today is outside the range, and truncates long labels', async () => {
    const d = tidepool();
    d.today = '2019-01-01';
    const v = d.versions.find((x) => x.window);
    if (v) v.title = 'A very long version title that does not fit in the label column at all';
    mount(d);
    boot(document);
    await go('#/timeline');
    expect(main().querySelector('line.today')).toBeNull();
    expect(
      [...main().querySelectorAll('g.bar-row')].some((g) => {
        const t = g.querySelector('text.lbl')?.textContent ?? '';
        return (
          t.length <= 26 &&
          (g.getAttribute('aria-label') ?? '').startsWith(t) &&
          !t.includes('…') &&
          (g.getAttribute('aria-label') ?? '').length > t.length + 20
        );
      }),
    ).toBe(true);
  });
});
