// @vitest-environment jsdom
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProject } from '../../src/core/index.js';
import type { ProjectSources } from '../../src/core/index.js';
import { CLIENT_JS, STYLES_CSS, TEMPLATE_HTML } from '../../src/render/assets.generated.js';
import { renderHtml } from '../../src/render/render.js';
import { stressRoadmap } from './helpers.js';

const NOW = '2026-11-17T00:00:00Z';
const PROJECTS: {
  name: string;
  dir: string;
  roadmap: string;
  decisions?: string;
  changelog?: string;
}[] = [
  { name: 'minimal', dir: 'test/fixtures/projects/minimal', roadmap: 'ROADMAP.md' },
  {
    name: 'full',
    dir: 'test/fixtures/projects/full',
    roadmap: 'ROADMAP.md',
    decisions: 'DECISIONS.md',
    changelog: 'CHANGELOG.md',
  },
  {
    name: 'tidepool',
    dir: 'examples/tidepool',
    roadmap: 'docs/project/ROADMAP.md',
    decisions: 'docs/project/DECISIONS.md',
    changelog: 'CHANGELOG.md',
  },
];

function sources(p: (typeof PROJECTS)[number]): ProjectSources {
  const rd = (f: string) => ({ path: f, text: readFileSync(join(p.dir, f), 'utf8') });
  return {
    roadmap: rd(p.roadmap),
    decisions: p.decisions ? rd(p.decisions) : undefined,
    changelog: p.changelog ? rd(p.changelog) : undefined,
  };
}

describe('ProjectData snapshots', () => {
  for (const p of PROJECTS) {
    it(`${p.name}: the parsed project matches expected.json`, () => {
      const data = parseProject(sources(p), { now: NOW, toolVersion: '0.0.0-snapshot' });
      const file = join('test/fixtures/snapshots', `${p.name}.json`);
      const text = `${JSON.stringify(data, null, 2)}\n`;
      if (process.env['UPDATE_FIXTURES'] === '1' || !existsSync(file)) writeFileSync(file, text);
      // A parser change must update the snapshot on purpose (UPDATE_FIXTURES=1) and the diff is reviewed.
      expect(JSON.parse(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))).toEqual(
        JSON.parse(text),
      );
    });
  }

  it('the full fixture has the shape the views rely on', () => {
    const data = parseProject(sources(PROJECTS[1] as (typeof PROJECTS)[number]), { now: NOW });
    expect(data.diagnostics.map((d) => d.code)).toEqual(['OPM-W501']); // D2 is overdue on purpose
    expect(data.derived).toMatchObject({
      currentVersionId: 'v0.2.0',
      nextVersionId: 'v0.3.0',
      needsYourCall: ['D2', 'D3'],
      topRisks: ['R2', 'R1'],
    });
    expect(data.versions.map((v) => [v.id, v.state, v.phaseId])).toEqual([
      ['v0.1.0', 'shipped', '1'],
      ['v0.2.0', 'active', '2'],
      ['v0.3.0', 'planned', '2'],
    ]);
    expect(data.versions[1]?.window).toMatchObject({
      start: '2026-11-01',
      end: '2027-01-31',
      tentative: true,
    });
    expect(data.now?.facts).toEqual([
      { key: 'Live', value: 'v0.1.0 on npm' },
      { key: 'Users', value: '12' },
    ]);
  });
});

describe('the 1,000-deliverable stress fixture', () => {
  const text = stressRoadmap();
  it('has 1,000 deliverables', () => {
    expect(text.match(/^\| 1\.\d+\.0-D\d+ \|/gm)).toHaveLength(1000);
  });
  // The product target is under 1 s for a build (spec 08 §4). This test only catches a blow-up, so it
  // allows 4x for coverage instrumentation on a busy runner.
  it('parses and renders quickly', () => {
    parseProject({ roadmap: { path: 'R.md', text } }, { now: NOW }); // warm up
    const t0 = performance.now();
    const data = parseProject({ roadmap: { path: 'R.md', text } }, { now: NOW });
    const html = renderHtml(data, {
      clientJs: CLIENT_JS,
      stylesCss: STYLES_CSS,
      templateHtml: TEMPLATE_HTML,
    }).html;
    const ms = performance.now() - t0;
    expect(data.versions).toHaveLength(50);
    expect(data.versions.reduce((n, v) => n + v.deliverables.length, 0)).toBe(1000);
    expect(data.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(html.length).toBeGreaterThan(100_000);
    expect(ms).toBeLessThan(4000);
  });
});
