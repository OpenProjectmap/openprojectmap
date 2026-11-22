import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Builds the two-track example in a language of your choice and returns the page URL. */
function build(locale: string | null): { url: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'opmap-e2e-tracks-'));
  const project = join(dir, 'project');
  cpSync('examples/two-tracks', project, { recursive: true });
  if (locale !== null) {
    const file = join(project, 'opmap.config.json');
    const config = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...config, locale }));
  }
  const out = join(dir, 'out');
  execFileSync(
    'node',
    ['dist/cli.js', 'build', '-C', project, '--no-git', '--now', '2026-11-25', '--out', out, '-q'],
    { stdio: 'inherit' },
  );
  return {
    url: pathToFileURL(join(out, 'index.html')).href,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const sites = new Map<string, ReturnType<typeof build>>();
const LOCALES = [null, 'ar-XB', 'en-XA'] as const;
test.beforeAll(() => {
  for (const l of LOCALES) sites.set(String(l), build(l));
});
test.afterAll(() => {
  for (const s of sites.values()) s.cleanup();
});
const url = (locale: string | null): string => sites.get(String(locale))?.url ?? '';

test('a track has its own tab, and its blocks and rows are on it', async ({ page }) => {
  await page.goto(url(null));
  await page.getByRole('tab', { name: 'Business' }).click();
  await expect(page).toHaveURL(/#\/track\/business$/);
  await expect(page.getByRole('heading', { name: /BM1 · Launch/ })).toBeVisible();
  await expect(page.getByText('Store listing and screenshots')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Business' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('the timeline shows the track as its own lane and opens its block', async ({ page }) => {
  await page.goto(`${url(null)}#/timeline`);
  await expect(page.locator('.timeline-svg text.group', { hasText: 'Business' })).toBeVisible();
  await page.locator('[data-version="BM1"]').click();
  await expect(page).toHaveURL(/#\/track\/business\/BM1$/);
  await expect(page.getByRole('link', { name: /All of Business/ })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  for (const locale of LOCALES) {
    for (const view of ['overview', 'timeline', 'track/business']) {
      test(`axe: ${view}, ${theme}, locale ${locale ?? 'en'}: no serious or critical violations`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(`${url(locale)}#/${view}`);
        await page.waitForSelector('#panel h2, #panel h3');
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const bad = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );
        expect(
          bad.map(
            (v) =>
              `${v.id}: ${v.nodes
                .map((n) => n.target.join(' '))
                .slice(0, 3)
                .join(' | ')}`,
          ),
        ).toEqual([]);
      });
    }
  }
}

for (const locale of ['ar-XB', 'en-XA'] as const) {
  for (const view of ['overview', 'versions', 'timeline', 'track/business', 'decisions']) {
    test(`no horizontal page scroll at 360 px: ${view}, locale ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`${url(locale)}#/${view}`);
      await page.waitForSelector('#panel h2, #panel h3');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

test('a right-to-left page mirrors: the tabs start on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(url('ar-XB'));
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar-XB');
  const first = await page.locator('[role=tab]').first().boundingBox();
  const last = await page.locator('[role=tab]').last().boundingBox();
  expect(first && last && first.x > last.x).toBe(true);
  // the timeline stays left to right: its first month comes before its last
  await page.goto(`${url('ar-XB')}#/timeline`);
  const ticks = await page
    .locator('.timeline-svg text.axis')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
  expect(ticks.length).toBeGreaterThan(2);
  expect(ticks[0]).toBeLessThan(ticks[ticks.length - 1] ?? 0);
});
