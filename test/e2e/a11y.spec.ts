import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const outDir = mkdtempSync(join(tmpdir(), 'opmap-e2e-'));
const page_ = join(outDir, 'index.html');

test.beforeAll(() => {
  execFileSync(
    'node',
    [
      'dist/cli.js',
      'build',
      '-C',
      'examples/tidepool',
      '--no-git',
      '--now',
      '2026-11-25',
      '--out',
      outDir,
      '-q',
    ],
    { stdio: 'inherit' },
  );
});
test.afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const VIEWS = ['overview', 'timeline', 'versions', 'decisions', 'history', 'parked'] as const;
const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  for (const view of VIEWS) {
    test(`axe: ${view} view, ${theme} theme has no serious or critical violations`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`${pathToFileURL(page_).href}#/${view}`);
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
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(' | ')}`,
        ),
      ).toEqual([]);
    });
  }
}
