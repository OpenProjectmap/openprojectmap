// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectData } from '../../src/core/types.js';
import { boot, readData } from '../../src/render/client/main.js';
import { matches } from '../../src/render/client/views/versions.js';
import { tidepool } from './helpers.js';

function mount(data: ProjectData): void {
  document.body.replaceChildren();
  const app = document.createElement('div');
  app.id = 'app';
  const json = document.createElement('script');
  json.type = 'application/json';
  json.id = 'opmap-data';
  json.textContent = JSON.stringify(data);
  document.body.append(app, json);
  document.documentElement.dataset['theme'] = 'auto';
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function go(hash: string): Promise<void> {
  window.location.hash = hash;
  await tick();
}
const main = (): HTMLElement => document.getElementById('main') as HTMLElement;

describe('boot and the overview', () => {
  beforeEach(() => {
    window.location.hash = '';
    window.localStorage.clear();
  });

  it('reads the embedded data', () => {
    mount(tidepool());
    expect(readData(document).project.title).toBe('Tidepool');
    document.body.replaceChildren();
    expect(() => readData(document)).toThrow('no embedded data');
    expect(() => boot(document)).toThrow('no embedded data');
  });
  it('does nothing without an app element', () => {
    mount(tidepool());
    document.getElementById('app')?.remove();
    expect(() => boot(document)).not.toThrow();
  });
  it('renders the header, tabs, overview cards and footer', async () => {
    mount(tidepool());
    boot(document);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('Tidepool');
    expect([...document.querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual([
      'Overview',
      'Timeline',
      'Versions',
      'Decisions',
      'History',
      'Parked',
    ]);
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Overview');
    const cards = [...main().querySelectorAll('h2')].map((h) => h.textContent);
    expect(cards).toEqual(
      expect.arrayContaining([
        'Now',
        'Progress',
        'Milestones',
        'Needs your call',
        'Top risks',
        'Latest release',
      ]),
    );
    expect(document.querySelector('footer')?.textContent).toContain('openprojectmap 0.1.0-test');
    expect(document.querySelector('header .meta')?.textContent).toContain('v0.2.0');
    expect(main().querySelector('.bar')?.getAttribute('aria-label')).toMatch(/done, \d+%$/);
  });
  it('shows what needs a call, with the overdue note', () => {
    mount(tidepool());
    boot(document);
    const text = main().textContent ?? '';
    expect(text).toContain('Proceeding with the default since 2026-11-20');
    expect(text).toContain('Default:');
  });
  it('shows a stale badge, the git card and an empty Now block', () => {
    const d = tidepool();
    d.derived.stale = {
      isStale: true,
      days: 40,
      commitsSince: null,
      reason: '40 days since 2026-10-01',
    };
    d.git = {
      root: 'r',
      head: { sha: 'abc1234', date: '2026-11-16T09:00:00Z', subject: 'hello' },
      branches: {
        live: { sha: 'abc1234', date: '2026-11-16T09:00:00Z', subject: 'hello' },
        staging: null,
      },
      activity: { weekStarts: [], commits: [], areas: {} },
      shallow: false,
    };
    mount(d);
    boot(document);
    expect(document.querySelector('header')?.textContent).toContain(
      'stale: 40 days since 2026-10-01',
    );
    expect(main().textContent).toContain('abc1234');
    const empty = tidepool();
    empty.now = null;
    empty.milestones = [];
    empty.derived = { ...empty.derived, currentVersionId: null, needsYourCall: [], topRisks: [] };
    empty.releases = [];
    mount(empty);
    boot(document);
    expect(main().textContent).toContain('The roadmap has no Now block.');
    expect(main().textContent).toContain('No current version.');
    expect(main().textContent).toContain('Nothing is waiting for a decision.');
    expect(main().textContent).toContain('No open risk scores 6 or more.');
  });
  it('shows the unreleased entry when there is no dated release', () => {
    const d = tidepool();
    d.releases = d.releases.filter((r) => r.unreleased);
    mount(d);
    boot(document);
    expect(main().textContent).toContain('Unreleased');
  });
});

describe('navigation', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('switches views by hash and by clicking a tab', async () => {
    mount(tidepool());
    boot(document);
    await go('#/decisions');
    expect(main().querySelector('h2')?.textContent).toBe('Decisions');
    expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Decisions');
    (document.getElementById('tab-versions') as HTMLElement).click();
    await tick();
    expect(window.location.hash).toBe('#/versions');
    expect(main().querySelectorAll('article.version').length).toBeGreaterThan(1);
  });
  it('moves between tabs with the arrow keys, Home and End', async () => {
    mount(tidepool());
    boot(document);
    const tabs = document.querySelector('[role=tablist]') as HTMLElement;
    document.getElementById('tab-overview')?.focus();
    const press = async (key: string): Promise<void> => {
      tabs.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await tick();
      await tick();
    };
    await press('ArrowRight');
    expect(window.location.hash).toBe('#/timeline');
    for (let i = 0; i < 5; i++) await press('ArrowRight');
    expect(window.location.hash).toBe('#/overview'); // wraps after Parked
    await press('ArrowLeft');
    expect(window.location.hash).toBe('#/parked');
    await press('Home');
    expect(window.location.hash).toBe('#/overview');
    await press('End');
    expect(window.location.hash).toBe('#/parked');
    await press('x');
    expect(window.location.hash).toBe('#/parked');
    expect(document.activeElement?.id).toBe('tab-parked');
  });
  it('cycles the theme and remembers it', () => {
    mount(tidepool());
    boot(document);
    const button = document.querySelector('button.theme') as HTMLElement;
    expect(document.documentElement.dataset['theme']).toBe('auto');
    button.click();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(button.textContent).toBe('Theme: light');
    button.click();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(window.localStorage.getItem('opmap-theme')).toBe('dark');
  });
});

describe('versions view', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  const articles = (): HTMLElement[] => [
    ...main().querySelectorAll<HTMLElement>('article.version'),
  ];
  const rows = (): number => main().querySelectorAll('tbody tr').length;

  it('lists every version with its deliverables and the latest status line', async () => {
    const data = tidepool();
    mount(data);
    boot(document);
    await go('#/versions');
    expect(articles()).toHaveLength(data.versions.length);
    expect(rows()).toBe(data.versions.reduce((n, v) => n + v.deliverables.length, 0));
    expect(main().querySelector('.count')?.textContent).toBe(`${rows()} deliverables shown`);
    expect(main().querySelector('.status-line')?.textContent).toContain(':');
  });
  it('filters by status chips and by search text, and updates the URL without a reload', async () => {
    mount(tidepool());
    boot(document);
    await go('#/versions');
    const total = rows();
    const doing = document.querySelector('[data-filter-status=doing]') as HTMLElement;
    doing.click();
    expect(doing.getAttribute('aria-pressed')).toBe('true');
    expect(window.location.hash).toContain('status=doing');
    expect(rows()).toBeLessThan(total);
    doing.click();
    expect(rows()).toBe(total);
    const search = document.querySelector('input[type=search]') as HTMLInputElement;
    search.value = 'zzzz-nothing';
    search.dispatchEvent(new Event('input'));
    expect(rows()).toBe(0);
    expect(main().textContent).toContain('No deliverable matches the filters.');
    expect(window.location.hash).toContain('q=zzzz-nothing');
    expect(main().querySelector('.count')?.textContent).toBe('0 deliverables shown');
  });
  it('restores filters from the hash and shows one version with a back link', async () => {
    const data = tidepool();
    mount(data);
    boot(document);
    const id = data.versions[1]?.id ?? '';
    await go(`#/versions/${id}?status=todo`);
    expect(articles()).toHaveLength(1);
    expect(articles()[0]?.id).toBe(id);
    expect(document.querySelector('[data-filter-status=todo]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(main().textContent).toContain('← All versions');
    await go('#/versions/v9.9.9');
    expect(main().textContent).toContain('No such version.');
  });
  it('shows a history for several status lines, and no deliverables note', async () => {
    const d = tidepool();
    const v = d.versions[0];
    if (!v) throw new Error('no version');
    v.statusLines = [
      { date: '2026-11-01', text: 'first', source: v.source },
      { date: null, text: 'second', source: v.source },
    ];
    const bare = d.versions[1];
    if (bare) {
      bare.deliverables = [];
      bare.window = null;
      bare.milestoneId = 'M1';
    }
    mount(d);
    boot(document);
    await go('#/versions');
    expect(main().querySelector('details summary')?.textContent).toBe('History (2)');
    expect(main().textContent).toContain('undated: second');
    expect(main().textContent).toContain('No deliverables.');
    expect(main().textContent).toContain('no window');
  });
  it('shows extra columns', async () => {
    const d = tidepool();
    const first = d.versions[0]?.deliverables[0];
    if (first) first.extra = { Risk: 'low' };
    mount(d);
    boot(document);
    await go('#/versions');
    expect([...main().querySelectorAll('th')].map((t) => t.textContent)).toContain('Risk');
  });
  it('matches on status and on text in ID, title, notes, owner and extra', () => {
    const d = tidepool().versions[0]?.deliverables[0];
    if (!d) throw new Error('no deliverable');
    const x = {
      ...d,
      id: '0.1.0-D1',
      title: 'T',
      detail: '**Alpha** thing',
      notes: 'see [docs](https://a.dev)',
      owner: 'Ana',
      extra: { Risk: 'High' },
      status: 'doing' as const,
    };
    expect(matches(x, [], '')).toBe(true);
    expect(matches(x, ['doing'], '')).toBe(true);
    expect(matches(x, ['done'], '')).toBe(false);
    for (const q of ['0.1.0-d1', 'alpha', 'docs', 'ana', 'high', '  ALPHA '])
      expect(matches(x, [], q)).toBe(true);
    expect(matches(x, [], 'https')).toBe(false);
    expect(matches({ ...x, notes: null, owner: null }, [], 'missing')).toBe(false);
  });
});

describe('decisions view', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  it('shows decisions and risks, highest score first', async () => {
    const d = tidepool();
    mount(d);
    boot(document);
    await go('#/decisions');
    const tables = main().querySelectorAll('table');
    expect(tables).toHaveLength(2);
    expect(tables[0]?.querySelectorAll('tbody tr')).toHaveLength(d.decisions.length);
    const scores = [...(tables[1]?.querySelectorAll('tbody tr') ?? [])].map((r) =>
      Number(r.children[4]?.textContent?.match(/\d+/)?.[0]),
    );
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(main().textContent).toContain('overdue');
  });
  it('says so when there are none', async () => {
    const d = tidepool();
    d.decisions = [];
    d.risks = [];
    mount(d);
    boot(document);
    await go('#/decisions');
    expect(main().textContent).toContain('No decisions are recorded.');
    expect(main().textContent).toContain('No risks are recorded.');
  });
  it('shows closed risks and unknown levels', async () => {
    const d = tidepool();
    const r = d.risks[0];
    if (r) {
      r.open = false;
      r.likelihood = null;
    }
    mount(d);
    boot(document);
    await go('#/decisions');
    expect(main().textContent).toContain('(closed)');
    expect(main().textContent).toContain('?');
  });
});

describe('history and parked views', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  it('lists releases with sections, linked to their version', async () => {
    const d = tidepool();
    mount(d);
    boot(document);
    await go('#/history');
    const text = main().textContent ?? '';
    expect(text).toContain('Unreleased');
    expect(text).toContain('v0.1.0');
    expect(main().querySelectorAll('article.release').length).toBe(d.releases.length);
    expect(main().querySelector('article.release a[href^="#/versions/"]')).not.toBeNull();
    expect(main().textContent).not.toContain('Branches');
  });
  it('shows branches, a shallow note and the area bars when git facts exist', async () => {
    const d = tidepool();
    const c = { sha: 'abc1234', date: '2026-11-16T09:00:00Z', subject: 'hello' };
    d.git = {
      root: 'r',
      head: c,
      branches: { live: c, staging: null },
      activity: { weekStarts: [], commits: [], areas: { src: 6, docs: 3, tests: 0 } },
      shallow: true,
    };
    mount(d);
    boot(document);
    await go('#/history');
    const text = main().textContent ?? '';
    expect(text).toContain('abc1234');
    expect(text).toContain('not found');
    expect(text).toContain('Shallow clone');
    const bars = [...main().querySelectorAll<HTMLElement>('.area-bar')];
    expect(bars.map((b) => b.style.getPropertyValue('--w'))).toEqual(['100', '50', '0']);
    d.git.activity.areas = {};
    d.git.shallow = false;
    mount(d);
    boot(document);
    await go('#/history');
    expect(main().textContent).toContain('No changes in the configured areas.');
  });
  it('says so when there are no releases, or no entries or untitled sections', async () => {
    const d = tidepool();
    d.releases = [];
    mount(d);
    boot(document);
    await go('#/history');
    expect(main().textContent).toContain('The changelog has no releases yet.');
    const e = tidepool();
    const r = e.releases[0];
    if (r) {
      r.sections = [];
      r.title = 'Named';
    }
    const second = e.releases[1];
    if (second) second.sections = [{ heading: '', items: ['untitled item'] }];
    mount(e);
    boot(document);
    await go('#/history');
    expect(main().textContent).toContain('No entries.');
    expect(main().textContent).toContain('Named');
    expect(main().textContent).toContain('untitled item');
  });
  it('shows the parked table, or says nothing is parked', async () => {
    const d = tidepool();
    mount(d);
    boot(document);
    await go('#/parked');
    expect(main().textContent).toContain("Parked items are ideas you've decided not to do yet.");
    expect(main().querySelectorAll('tbody tr')).toHaveLength(d.parked.length);
    d.parked = [];
    mount(d);
    boot(document);
    await go('#/parked');
    expect(main().textContent).toContain('Nothing is parked.');
  });
});

describe('tables for narrow screens', () => {
  it('labels every cell with its column so a row can become a card', async () => {
    window.location.hash = '#/decisions';
    mount(tidepool());
    boot(document);
    await tick();
    const heads = [...(main().querySelectorAll('table')[0]?.querySelectorAll('th') ?? [])].map(
      (t) => t.textContent,
    );
    const cells = [...(main().querySelector('tbody tr')?.children ?? [])].map((c) =>
      c.getAttribute('data-label'),
    );
    expect(cells).toEqual(heads);
  });
});

describe('printing', () => {
  it('adds every view while printing and removes it afterwards', async () => {
    window.location.hash = '#/overview';
    mount(tidepool());
    boot(document);
    await tick();
    expect(document.getElementById('print-all')).toBeNull();
    window.dispatchEvent(new Event('beforeprint'));
    const all = document.getElementById('print-all');
    expect([...(all?.querySelectorAll('.print-title') ?? [])].map((t) => t.textContent)).toEqual([
      'Overview',
      'Timeline',
      'Versions',
      'Decisions',
      'History',
      'Parked',
    ]);
    window.dispatchEvent(new Event('beforeprint')); // a second event does not add a second copy
    expect(document.querySelectorAll('#print-all')).toHaveLength(1);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.getElementById('print-all')).toBeNull();
  });
  it('stops listening when boot is undone', async () => {
    mount(tidepool());
    const stop = boot(document);
    stop();
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.getElementById('print-all')).toBeNull();
  });
});
