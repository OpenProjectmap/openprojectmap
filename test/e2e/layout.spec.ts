import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { VIEWS, buildTidepool } from './helpers.js';

let site: ReturnType<typeof buildTidepool>;
test.beforeAll(() => {
  site = buildTidepool();
});
test.afterAll(() => site.cleanup());

for (const view of VIEWS) {
  test(`no horizontal page scroll at 360 px on the ${view} view`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${site.url}#/${view}`);
    await page.waitForSelector('#panel h2, #panel h3');
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  });
}

test('tables turn into labelled cards on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`${site.url}#/decisions`);
  await page.waitForSelector('#panel table');
  const display = await page.$eval('#panel tbody tr', (el) => getComputedStyle(el).display);
  expect(display).toBe('block');
  const label = await page.$eval(
    '#panel tbody td',
    (el) => getComputedStyle(el, '::before').content,
  );
  expect(label).not.toBe('none');
});

test('the tabs work from the keyboard', async ({ page }) => {
  await page.goto(`${site.url}#/overview`);
  await page.waitForSelector('#panel h2');
  await page.focus('#tab-overview');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#\/timeline$/);
  await expect(page.locator('#tab-timeline')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page).toHaveURL(/#\/parked$/);
  await page.keyboard.press('Home');
  await expect(page).toHaveURL(/#\/overview$/);
});

test('a timeline bar opens its version with Enter', async ({ page }) => {
  await page.goto(`${site.url}#/timeline`);
  await page.waitForSelector('g.bar-row');
  await page.locator('g.bar-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/versions\/v\d/);
});

test('the focused control shows a visible focus ring', async ({ page }) => {
  await page.goto(`${site.url}#/overview`);
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle };
  });
  expect(outline.style).not.toBe('none');
  expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
});

test('reduced motion removes transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${site.url}#/overview`);
  const t = await page.$eval('button.theme', (el) => getComputedStyle(el).transitionDuration);
  expect(t === '0s' || t === 'none' || t === '').toBe(true);
});

test('printing shows every view', async ({ page }) => {
  await page.goto(`${site.url}#/overview`);
  await page.waitForSelector('#panel h2');
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const titles = await page.$$eval('#print-all .print-title', (els) =>
    els.map((e) => e.textContent),
  );
  expect(titles).toEqual(['Overview', 'Timeline', 'Versions', 'Decisions', 'History', 'Parked']);
  expect(await page.$eval('#panel', (el) => getComputedStyle(el).display)).toBe('none');
  expect(await page.$eval('.tabs', (el) => getComputedStyle(el).display)).toBe('none');
});

test('Open docs… shows the files a person chooses, entirely in the browser', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${site.url}#/overview`);
  await page.waitForSelector('#panel h2');
  const roadmap = readFileSync('examples/tidepool/docs/project/ROADMAP.md', 'utf8').replace(
    '# Tidepool',
    '# Opened from disk',
  );
  await page.setInputFiles('#open-docs-input', [
    { name: 'ROADMAP.md', mimeType: 'text/markdown', buffer: Buffer.from(roadmap) },
  ]);
  await expect(page.locator('h1')).toHaveText('Opened from disk');
  await expect(page.locator('#open-note')).toContainText('Showing ROADMAP.md');
  await page.waitForSelector('#panel h2');
  expect(requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'))).toEqual([]);
});
