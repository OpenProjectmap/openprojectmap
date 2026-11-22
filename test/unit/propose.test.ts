import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import { checkRow, parseRow, propose, similarity, tokens } from '../../src/core/index.js';
import { DEFAULT_ID_PATTERN } from '../../src/core/parse-roadmap.js';
import { buildData } from '../../src/node/build.js';
import { checkProposal, proposalFor, saveProposal } from '../../src/node/propose.js';
import { tidepool } from './helpers.js';

const NOW = '2026-11-25';
const lantern = () => buildData({ cwd: 'examples/two-tracks', now: NOW, git: false }).data;
const OPTIONS = {
  idPatterns: [
    { pattern: DEFAULT_ID_PATTERN, track: null },
    { pattern: /^(?<version>BM\d+)-S\d+$/u, track: 'business' },
  ],
};

describe('words', () => {
  it('drops common words, short words and numbers, and stems plurals', () => {
    expect([...tokens('Add the dark modes for 2027 and a UI')].sort()).toEqual(['dark', 'mode']);
    expect(tokens('class classes')).toEqual(new Set(['class', 'classe']));
  });
  it('measures overlap', () => {
    expect(similarity(tokens('home screen widgets'), tokens('Home-screen widgets'))).toBe(1);
    expect(similarity(tokens('apple watch'), tokens('home widgets'))).toBe(0);
    expect(similarity(new Set(), tokens('x y z'))).toBe(0);
  });
});

describe('where an idea fits', () => {
  it('finds the version whose goal and rows share the idea’s words', () => {
    const p = propose(lantern(), 'a dim curve that follows the light');
    expect(p.candidates[0]).toMatchObject({
      version: 'v0.2.0',
      track: null,
      nextFreeId: '0.2.0-D4',
    });
    expect(p.candidates[0]?.matchedDeliverables).toContain('0.2.0-D3');
    expect(p.related.deliverables.map((d) => d.id)).toContain('0.2.0-D3');
  });

  it('finds a track block', () => {
    const p = propose(lantern(), 'write the launch post for the store');
    expect(p.candidates[0]).toMatchObject({
      version: 'BM1',
      track: 'business',
      nextFreeId: 'BM1-S4',
    });
  });

  it('falls back to the roadmap versions and says so when nothing matches', () => {
    const p = propose(lantern(), 'quantum blockchain');
    expect(p.candidates.length).toBeGreaterThan(0);
    expect(p.candidates.every((c) => c.track === null && c.score === 0)).toBe(true);
    expect(p.notes.join(' ')).toContain('No version mentions');
  });

  it('never offers a shipped version', () => {
    const p = propose(tidepool(), 'check in streak counter');
    expect(p.candidates.map((c) => c.version)).not.toContain('v0.1.0');
  });

  it('points at a Parked item that is the same idea', () => {
    const p = propose(tidepool(), 'home screen widgets');
    expect(p.related.parked[0]).toMatchObject({
      item: 'Home-screen widgets',
      likelyDuplicate: true,
    });
    expect(p.notes.join(' ')).toContain('revisit it instead');
  });

  it('warns about an open decision that touches the idea', () => {
    const p = propose(lantern(), 'a price for the paid tier');
    expect(p.related.decisions[0]).toMatchObject({ id: 'D1', status: 'open' });
    expect(p.notes.join(' ')).toContain('D1 is still open');
  });
});

describe('a drafted row', () => {
  it('reads a table row and nothing else', () => {
    expect(parseRow('| 0.2.0-D9 | **Dark mode** | todo | a \\| b |')).toEqual({
      id: '0.2.0-D9',
      title: '**Dark mode**',
      status: 'todo',
      notes: 'a | b',
    });
    expect(parseRow('| --- | --- |')).toBeNull();
    expect(parseRow('0.2.0-D9 Dark mode')).toBeNull();
    expect(parseRow('| a |')).toBeNull();
    expect(parseRow('| a | b |\n| c | d |')).toBeNull();
  });

  const check = (row: string, data = lantern()) => checkRow(data, row, OPTIONS);
  const messages = (row: string, data = lantern()) =>
    check(row, data)
      .findings.map((f) => f.message)
      .join('\n');

  it('accepts a free ID in a version that has not shipped', () => {
    expect(check('| 0.2.0-D4 | **Night preset** | todo | |')).toMatchObject({
      ok: true,
      findings: [],
    });
    expect(check('| BM1-S4 | **Press outreach** | todo | |').ok).toBe(true);
  });

  it('refuses an ID that is taken, and suggests the next one', () => {
    expect(messages('| 0.2.0-D3 | **Something else** | todo | |')).toContain(
      'already used in v0.2.0',
    );
    expect(messages('| 0.2.0-D3 | **Something else** | todo | |')).toContain('Use 0.2.0-D4');
  });

  it('refuses a version that does not exist or an ID that fits no pattern', () => {
    expect(messages('| 9.9.9-D1 | **X thing** | todo | |')).toContain(
      'which is not in the roadmap',
    );
    expect(messages('| BM9-S1 | **X thing** | todo | |')).toContain('not in the track business');
    expect(messages('| nonsense | **X thing** | todo | |')).toContain(
      'does not match the ID pattern',
    );
  });

  it('refuses a version that has shipped', () => {
    const r = check('| 0.1.0-D9 | **Late addition** | todo | |', tidepool());
    expect(r.ok).toBe(false);
    expect(r.findings[0]?.message).toContain('already shipped');
  });

  it('refuses a repeat of a Parked item, warns about a look-alike deliverable', () => {
    expect(messages('| 0.3.0-D9 | **Home screen widgets** | todo | |', tidepool())).toContain(
      'repeats the Parked item',
    );
    expect(messages('| 0.2.0-D4 | **Dim curve settings** | todo | |')).toContain(
      'looks like 0.2.0-D3',
    );
    expect(check('| 0.2.0-D4 | **Dim curve settings** | todo | |').ok).toBe(true);
  });

  it('refuses a bad status, an empty title and text that is not a row', () => {
    expect(messages('| 0.2.0-D4 | **X thing** | donee | |')).toContain('did you mean "done"');
    expect(messages('| 0.2.0-D4 | | todo | |')).toContain('no title');
    expect(check('just words').ok).toBe(false);
  });
});

describe('on disk', () => {
  let dir = '';
  const read = (f: string): string => readFileSync(join(dir, 'docs/project', f), 'utf8');
  const ctx = () => ({ cwd: dir, now: NOW, env: {} });
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opmap-propose-'));
    cpSync('examples/two-tracks', dir, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reports where an idea fits, and refuses an empty or huge one', () => {
    expect(proposalFor(ctx(), 'dim curve').candidates[0]?.version).toBe('v0.2.0');
    expect(() => proposalFor(ctx(), '  ')).toThrow(/Describe the idea/);
    expect(() => proposalFor(ctx(), 'x'.repeat(2001))).toThrow(/longer than/);
  });

  it('saves a draft under proposals/ and never touches the roadmap', () => {
    const before = [read('ROADMAP.md'), read('BUSINESS.md'), read('DECISIONS.md')];
    const saved = saveProposal(ctx(), {
      slug: 'night-preset',
      title: 'Night preset',
      idea: 'A preset that dims to the lowest level.\n\nFor night shifts.',
      version: 'v0.2.0',
      rows: ['| 0.2.0-D4 | **Night preset**: lowest level | todo | a \\| b |'],
      notes: 'Needs D3 first.',
    });
    expect(saved.path).toBe('docs/project/proposals/night-preset.md');
    const file = read('proposals/night-preset.md');
    expect(file).toContain('# Proposal: Night preset');
    expect(file).toContain('| 0.2.0-D4 | **Night preset**: lowest level | todo | a \\| b |');
    expect([read('ROADMAP.md'), read('BUSINESS.md'), read('DECISIONS.md')]).toEqual(before);
    expect(() => saveProposal(ctx(), { slug: 'night-preset', title: 't', idea: 'x y z' })).toThrow(
      /already exists/,
    );
  });

  it('refuses a slug that could leave the folder, and a row that is not a row', () => {
    for (const slug of ['../x', 'a/b', 'A', '', '.hidden', 'x'.repeat(61)])
      expect(() => saveProposal(ctx(), { slug, title: 't', idea: 'x y z' }), slug).toThrow(/slug/);
    expect(() =>
      saveProposal(ctx(), { slug: 'ok', title: 't', idea: 'x y z', rows: ['not a row'] }),
    ).toThrow(/Not a table row/);
    expect(existsSync(join(dir, 'docs/project/proposals/ok.md'))).toBe(false);
  });

  it('checks every row of a saved draft', () => {
    saveProposal(ctx(), {
      slug: 'two-rows',
      title: 'Two rows',
      idea: 'two things to add',
      rows: ['| 0.2.0-D4 | **Night preset** | todo | |', '| 0.2.0-D3 | **Taken id** | todo | |'],
    });
    const r = checkProposal(ctx(), 'docs/project/proposals/two-rows.md');
    expect(r.file).toBe('docs/project/proposals/two-rows.md');
    expect(r.checks.map((c) => c.ok)).toEqual([true, false]);
    expect(r.ok).toBe(false);
  });

  it('refuses a file outside the repository, and input that is neither a row nor a file', () => {
    writeFileSync(join(tmpdir(), 'opmap-outside.md'), '| 0.2.0-D4 | **x** | todo | |\n');
    expect(() => checkProposal(ctx(), join(tmpdir(), 'opmap-outside.md'))).toThrow(
      /inside the repository/,
    );
    expect(() => checkProposal(ctx(), 'no/such/file.md')).toThrow(/neither a table row nor a file/);
    expect(() => checkProposal(ctx(), 'package.json')).toThrow();
  });

  it('only reads markdown drafts, and will not write through a linked proposals folder', () => {
    writeFileSync(join(dir, 'secret.env'), '| 0.2.0-D4 | **key=abc** | todo | |\n');
    expect(() => checkProposal(ctx(), 'secret.env')).toThrow(/markdown file/);
    const outside = mkdtempSync(join(tmpdir(), 'opmap-outside-'));
    try {
      symlinkSync(outside, join(dir, 'docs/project/proposals'));
      expect(() => saveProposal(ctx(), { slug: 'leak', title: 't', idea: 'x y z' })).toThrow(
        /inside the repository/,
      );
      expect(existsSync(join(outside, 'leak.md'))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('the CLI explains placement and checks rows with an exit code', () => {
    let out = '';
    let err = '';
    const io: Io = {
      stdout: (s) => (out += s),
      stderr: (s) => (err += s),
      env: {},
      cwd: dir,
      isTTY: false,
      open: () => undefined,
      ask: async () => '',
    };
    expect(main(['propose', 'a dim curve for the light', '--now', NOW], io)).toBe(0);
    expect(out).toContain('1. v0.2.0 Auto-dim');
    expect(out).toContain('next free ID 0.2.0-D4');
    expect(out).toContain('This only reads the roadmap');
    out = '';
    expect(
      main(['propose', '--check', '| 0.2.0-D4 | **Night preset** | todo | |', '--now', NOW], io),
    ).toBe(0);
    expect(out).toContain('The row fits.');
    out = '';
    expect(
      main(['propose', '--check', '| 0.2.0-D3 | **Taken** | todo | |', '--now', NOW], io),
    ).toBe(1);
    expect(out).toContain('already used');
    out = '';
    expect(main(['propose', 'dim curve', '--format', 'json', '--now', NOW], io)).toBe(0);
    expect(JSON.parse(out).candidates[0].version).toBe('v0.2.0');
    expect(main(['propose'], io)).toBe(2);
    expect(main(['propose', 'two', 'words'], io)).toBe(2);
    expect(err).toContain('put the idea in quotes');
    expect(read('ROADMAP.md')).toContain('0.2.0-D3');
  });
});
