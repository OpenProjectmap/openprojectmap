import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
