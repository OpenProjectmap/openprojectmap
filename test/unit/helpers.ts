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

/** A generated roadmap with `versions` x `perVersion` deliverables (the stress fixture, spec 08 §2). */
export function stressRoadmap(versions = 50, perVersion = 20): string {
  const statuses = ['done', 'doing', 'review', 'blocked', 'todo', 'parked'];
  const lines = [
    '<!-- opmap: 1 -->',
    '# Stress',
    '',
    '## Now',
    '',
    '**Updated:** 2026-11-17',
    '**Next step:** Keep going.',
    '',
    '## Versions',
    '',
  ];
  for (let v = 0; v < versions; v++) {
    lines.push(
      `### v1.${v}.0 — Version ${v}`,
      '',
      `**Window:** 2026-11-17 → 2027-01`,
      '**Goal:** g',
      '**Exit:** e',
      '',
      '| ID | Deliverable | Status | Notes |',
      '| --- | --- | --- | --- |',
    );
    for (let d = 1; d <= perVersion; d++) {
      lines.push(
        `| 1.${v}.0-D${d} | **Item ${v}.${d}**: some \`detail\` with a [link](https://example.com/${v}/${d}) | ${statuses[(v + d) % statuses.length]} | note ${d} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
