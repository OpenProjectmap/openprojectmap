import { readFileSync } from 'node:fs';
import { parseProject } from '../../src/core/index.js';
import type { ProjectData } from '../../src/core/types.js';

const read = (root: string, f: string) => ({ path: f, text: readFileSync(`${root}/${f}`, 'utf8') });

/** The fictional Tidepool example, parsed with a fixed clock. */
export function tidepool(): ProjectData {
  const root = 'examples/tidepool';
  return parseProject(
    {
      roadmap: read(root, 'docs/project/ROADMAP.md'),
      decisions: read(root, 'docs/project/DECISIONS.md'),
      changelog: read(root, 'CHANGELOG.md'),
    },
    { now: '2026-11-25T00:00:00Z', toolVersion: '0.1.0-test' },
  );
}
