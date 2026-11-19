import { expect, test } from '@playwright/test';
import { VIEWS, buildTidepool } from './helpers.js';

// Screenshots of the Tidepool example in light, dark and mobile (spec 08 §2). Baselines live in
// test/e2e/visual.spec.ts-snapshots/ and are per platform. Fonts decide the pixels, so make them on
// GitHub's ubuntu-latest image: run the "Update screenshots" workflow, download its artifact, copy the
// images over the old ones and review them in the diff.
let site: ReturnType<typeof buildTidepool>;
test.beforeAll(() => {
  site = buildTidepool();
});
test.afterAll(() => site.cleanup());

const SHOTS = [
  { name: 'light', scheme: 'light', width: 1100 },
  { name: 'dark', scheme: 'dark', width: 1100 },
  { name: 'mobile', scheme: 'light', width: 360 },
] as const;

for (const shot of SHOTS) {
  for (const view of VIEWS) {
    test(`${view} view, ${shot.name}`, async ({ page }) => {
      await page.setViewportSize({ width: shot.width, height: 900 });
      await page.emulateMedia({ colorScheme: shot.scheme, reducedMotion: 'reduce' });
      await page.goto(`${site.url}#/${view}`);
      await page.waitForSelector('#panel h2, #panel h3');
      await expect(page).toHaveScreenshot(`${view}-${shot.name}.png`, {
        fullPage: true,
        // The footer holds the tool version, which changes with every release.
        mask: [page.locator('footer')],
        maxDiffPixelRatio: 0.02,
      });
    });
  }
}
