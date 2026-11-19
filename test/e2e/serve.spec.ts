import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// `opmap serve` in a real browser: the page connects to /events under its CSP and reloads when the docs change.
let dir = '';
let child: ChildProcess | null = null;
let url = '';

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'opmap-e2e-serve-'));
  cpSync('examples/tidepool', dir, { recursive: true });
  mkdirSync(join(dir, '.git'));
  child = spawn(
    'node',
    [
      join(process.cwd(), 'dist/cli.js'),
      'serve',
      '--port',
      '0',
      '--no-git',
      '--now',
      '2026-11-16',
      '-C',
      dir,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('serve did not start')), 15_000);
    let text = '';
    child?.stdout?.on('data', (d: Buffer) => {
      text += d.toString();
      const m = /at (http:\/\/\S+)/.exec(text);
      if (m?.[1]) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });
});
test.afterAll(() => {
  child?.kill('SIGINT');
  rmSync(dir, { recursive: true, force: true });
});

test('the page reloads by itself when the roadmap changes, and the CSP allows it', async ({
  page,
}) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text()))
      violations.push(m.text());
  });
  await page.goto(url);
  await page.waitForSelector('#panel h2');
  await expect(page.locator('#panel')).not.toContainText('Edited while serving');
  const file = join(dir, 'docs/project/ROADMAP.md');
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      'Finish the streak reminder',
      'Edited while serving the streak reminder',
    ),
  );
  await expect(page.locator('#panel')).toContainText('Edited while serving', { timeout: 10_000 });
  expect(violations).toEqual([]);
});

test('the served page passes the same checks as the file', async ({ page }) => {
  const res = await page.goto(`${url}#/timeline`);
  expect(res?.headers()['content-security-policy']).toContain("connect-src 'self'");
  expect(res?.headers()['x-content-type-options']).toBe('nosniff');
  await page.waitForSelector('g.bar-row');
});
