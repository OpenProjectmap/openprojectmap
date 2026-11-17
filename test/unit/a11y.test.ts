// @vitest-environment jsdom
// Accessibility checks that run everywhere (jsdom): axe-core's structural rules on every view, plus a
// contrast check on the CSS tokens. Colour contrast on rendered pages and the screenshots run in a
// real browser (test/e2e, spec 05 §7), because jsdom has no layout or colour.
import { readFileSync } from 'node:fs';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '../../src/render/client/main.js';
import { tidepool } from './helpers.js';

const VIEWS = [
  'overview',
  'timeline',
  'timeline?zoom=quarter',
  'versions',
  'versions/v0.2.0',
  'decisions',
  'history',
  'parked',
];

function mount(data: ReturnType<typeof tidepool>): void {
  document.documentElement.lang = 'en';
  document.title = 'Tidepool · Project map';
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

describe('axe-core on every view', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  for (const view of VIEWS) {
    it(`#/${view} has no violations`, async () => {
      mount(tidepool());
      const stop = boot(document);
      window.location.hash = `#/${view}`;
      await tick();
      const results = await axe.run(document.body, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
        },
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
      });
      stop();
      expect(
        results.violations.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
});

describe('structure', () => {
  it('has one h1, landmarks, tab roles with names, and a labelled search box', async () => {
    window.location.hash = '#/versions';
    mount(tidepool());
    const stop = boot(document);
    await tick();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('header')).not.toBeNull();
    expect(document.querySelector('nav[aria-label]')).not.toBeNull();
    expect(document.querySelector('main')).not.toBeNull();
    expect(document.querySelector('footer')).not.toBeNull();
    for (const tab of document.querySelectorAll('[role=tab]')) {
      expect(tab.getAttribute('aria-controls')).toBe('panel');
      expect(tab.getAttribute('aria-selected')).toMatch(/^(true|false)$/);
    }
    expect(document.querySelectorAll('[role=tab][tabindex="0"]')).toHaveLength(1);
    expect(document.querySelector('input[type=search]')?.getAttribute('aria-label')).toBe(
      'Search deliverables',
    );
    expect(document.getElementById('panel')?.getAttribute('aria-labelledby')).toBe('tab-versions');
    expect(document.getElementById('main')?.contains(document.getElementById('panel'))).toBe(true);
    stop();
  });
  it('keeps heading levels in order (no skipped levels) on every view', async () => {
    for (const view of VIEWS) {
      window.location.hash = `#/${view}`;
      mount(tidepool());
      const stop = boot(document);
      await tick();
      let last = 0;
      for (const h of document.querySelectorAll('h1, h2, h3, h4')) {
        const level = Number(h.tagName.slice(1));
        expect(level, `${view}: ${h.textContent}`).toBeLessThanOrEqual(last + 1);
        last = level;
      }
      stop();
    }
  });
});

// WCAG contrast of the tokens in styles.css, in both themes.
function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}
/** `color-mix(in srgb, var(--accent) P%, #hex)` evaluated for a given accent. */
function mixLink(declaration: string, accent: string): string {
  const m = /color-mix\(in srgb, var\(--accent\) (\d+)%, (#[0-9a-fA-F]{6})\)/.exec(declaration);
  if (!m) return declaration;
  const p = Number(m[1]) / 100;
  const ch = (hex: string, i: number): number => parseInt(hex.slice(i, i + 2), 16);
  const out = [1, 3, 5].map((i) =>
    Math.round(p * ch(accent, i) + (1 - p) * ch(m[2] ?? '#000000', i)),
  );
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function tokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const found = Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
  const link = /--link:\s*(color-mix\([^;]*\));/.exec(block);
  return link ? { ...found, link: link[1] ?? '' } : found;
}

describe('colour contrast of the theme tokens', () => {
  const css = readFileSync('src/render/styles.css', 'utf8');
  const light = tokens(css, ':root {');
  const dark = { ...light, ...tokens(css, ":root[data-theme='dark']") };
  for (const [name, t] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`${name}: text and muted text on the page and surfaces are at least 4.5:1`, () => {
      for (const fg of ['text', 'muted']) {
        for (const bg of ['bg', 'surface', 'surface-2']) {
          expect(ratio(t[fg] ?? '', t[bg] ?? ''), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`${name}: links and status colours used as text are at least 4.5:1 on the page and surfaces`, () => {
      const link = mixLink(t['link'] ?? '', t['accent'] ?? '');
      for (const bg of ['bg', 'surface', 'surface-2']) {
        expect(ratio(link, t[bg] ?? ''), `link on ${bg}`).toBeGreaterThanOrEqual(4.5);
        for (const fg of ['ok', 'danger', 'warn', 'info']) {
          expect(ratio(t[fg] ?? '', t[bg] ?? ''), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`${name}: borders and status dots are at least 3:1 where they carry meaning`, () => {
      for (const fg of ['s-todo', 's-doing', 's-review', 's-blocked', 's-done', 's-parked']) {
        const v = t[fg] ?? (fg === 's-doing' ? t['accent'] : undefined);
        if (v) expect(ratio(v, t['surface'] ?? ''), fg).toBeGreaterThanOrEqual(3);
      }
    });
  }
  it('the active tab and filter text on the accent is at least 4.5:1 for the default accent', () => {
    expect(ratio(light['accent'] ?? '', light['on-accent'] ?? '')).toBeGreaterThanOrEqual(4.5);
  });
});
