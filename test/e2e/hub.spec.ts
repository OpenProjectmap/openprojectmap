import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { buildHubSite } from './helpers.js';

let site: ReturnType<typeof buildHubSite>;
test.beforeAll(() => {
  site = buildHubSite();
});
test.afterAll(() => site.cleanup());

for (const theme of ['light', 'dark'] as const) {
  test(`axe: the hub index, ${theme} theme, has no serious or critical violations`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(site.url);
    await page.waitForSelector('h1');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
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

test('the hub index has no horizontal scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(site.url);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a card opens its map, and the map links back to the index', async ({ page }) => {
  await page.goto(site.url);
  await expect(page.getByText('Could not build this map.')).toBeVisible();
  await page.getByRole('link', { name: 'Tidepool' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tidepool' })).toBeVisible();
  await page.getByRole('link', { name: '← All projects' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Side projects' })).toBeVisible();
});
