import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const text = readFileSync(join(import.meta.dirname, '../../action/action.yml'), 'utf8');

/** The `run: |` blocks of the action, as one string per block. */
function runBlocks(src: string): string[] {
  const lines = src.split('\n');
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)run: \|\s*$/.exec(lines[i] ?? '');
    if (!m) continue;
    const indent = (m[1] ?? '').length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j] ?? '';
      if (l.trim() !== '' && l.length - l.trimStart().length <= indent) break;
      body.push(l);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

describe('action/action.yml (spec 06 §2, spec 07 §5)', () => {
  it('has the inputs and the output the docs describe', () => {
    for (const key of ['version:', 'config:', 'strict:', 'out:'])
      expect(text).toContain(`  ${key}`);
    expect(text).toContain('using: composite');
    expect(text).toContain('value: ${{ steps.build.outputs.out }}');
  });
  it('never puts an expression inside a script', () => {
    const blocks = runBlocks(text);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(b).not.toContain('${{');
  });
  it('reads every input through env and checks the version first', () => {
    for (const name of ['version', 'config', 'strict', 'out']) {
      expect(text).toMatch(new RegExp(`OPMAP_\\w+: \\$\\{\\{ inputs\\.${name} \\}\\}`));
    }
    expect(text).toContain('^[0-9]+(\\.[0-9]+){0,2}$');
  });
  it('pins third-party actions by full commit SHA', () => {
    const uses = [...text.matchAll(/uses: (\S+)/g)].map((m) => m[1] ?? '');
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
  });
  it('tells people that Pages sites are public', () => {
    expect(text).toContain('GitHub Pages sites are public on free plans');
  });
});

describe('workflows pin every third-party action by commit SHA', () => {
  it('has a 40-character SHA after every @ in a uses line', () => {
    const dir = join(import.meta.dirname, '../../.github/workflows');
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const m of text.matchAll(/^\s*-?\s*uses: (\S+)/gm)) {
        const ref = m[1] ?? '';
        if (ref.startsWith('./')) continue;
        expect(`${file}: ${ref}`).toMatch(/: \S+@[0-9a-f]{40}$/);
      }
    }
  });
});
