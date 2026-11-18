import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { VIEWS, buildTidepool } from './helpers.js';

let site: ReturnType<typeof buildTidepool>;
test.beforeAll(() => {
  site = buildTidepool();
});
test.afterAll(() => site.cleanup());

const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  for (const view of VIEWS) {
    test(`axe: ${view} view, ${theme} theme has no serious or critical violations`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`${site.url}#/${view}`);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForSelector('#main h2, #main h3');
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
              .map(
                (n) =>
                  `${n.target.join(' ')} (${n.failureSummary?.replace(/\s+/g, ' ').slice(0, 160) ?? ''})`,
              )
              .slice(0, 3)
              .join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
}
