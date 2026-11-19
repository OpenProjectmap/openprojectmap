import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VIEWS = [
  'overview',
  'timeline',
  'versions',
  'decisions',
  'history',
  'parked',
] as const;

/** Build the Tidepool example with a fixed clock into a temp folder. */
export function buildTidepool(now = '2026-11-25'): { url: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'opmap-e2e-'));
  execFileSync(
    'node',
    [
      'dist/cli.js',
      'build',
      '-C',
      'examples/tidepool',
      '--no-git',
      '--now',
      now,
      '--out',
      dir,
      '-q',
    ],
    { stdio: 'inherit' },
  );
  return {
    url: pathToFileURL(join(dir, 'index.html')).href,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Build a hub of Tidepool (twice, so the slugs differ) and one broken entry; returns the index URL. */
export function buildHubSite(now = '2026-11-25'): { url: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'opmap-e2e-hub-'));
  const hubFile = join(dir, 'opmap.hub.json');
  const tidepool = join(process.cwd(), 'examples/tidepool');
  writeFileSync(
    hubFile,
    JSON.stringify({
      title: 'Side projects',
      projects: [
        { name: 'Tidepool', path: tidepool },
        { name: 'Tidepool', path: tidepool },
        { name: 'Not here', path: join(dir, 'nope') },
      ],
    }),
  );
  // Exit code 1 is expected: one project cannot be built.
  try {
    execFileSync(
      'node',
      ['dist/cli.js', 'hub', hubFile, '--out', join(dir, 'site'), '--now', now, '-q'],
      {
        stdio: 'inherit',
      },
    );
  } catch {
    /* the broken entry makes the exit code 1 */
  }
  return {
    url: pathToFileURL(join(dir, 'site', 'index.html')).href,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
