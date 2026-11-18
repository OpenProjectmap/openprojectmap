import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mainAsync } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import { INIT_TEMPLATES } from '../../src/render/assets.generated.js';
import {
  conflicts,
  defaultAnswers,
  ensureGitignore,
  fillTemplate,
  normalizeAnswers,
  oneLine,
  planInit,
  todayOf,
  validDocsDir,
  writeInit,
} from '../../src/node/init.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-init-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));
let n = 0;
const fresh = (): string => {
  const dir = join(base, `p${n++}`);
  mkdirSync(join(dir, '.git'), { recursive: true });
  return dir;
};
const TODAY = '2026-11-18';

describe('helpers', () => {
  it('oneLine flattens and strips comment markers', () => {
    expect(oneLine('  a\n\nb\t<!-- x --> c  ', 50)).toBe('a b x c');
    expect(oneLine('abcdef', 3)).toBe('abc');
  });
  it('fillTemplate replaces known keys and leaves unknown ones', () => {
    expect(fillTemplate('{{a}} {{b}} {{a}}', { a: '1' })).toBe('1 {{b}} 1');
  });
  it('validDocsDir accepts plain folders only', () => {
    for (const ok of ['docs/project', 'docs', 'plan/v1', 'my docs'])
      expect(validDocsDir(ok)).toBe(true);
    for (const bad of ['', '/etc', '../x', 'a/../../b', 'C:\\x', '.git/x', 'a;b', '$(x)', 'a|b'])
      expect(validDocsDir(bad)).toBe(false);
  });
  it('todayOf takes the date part of a timestamp', () => {
    expect(todayOf('2026-11-18T09:00:00Z')).toBe('2026-11-18');
  });
  it('defaultAnswers builds a two-week window and a launch month', () => {
    expect(defaultAnswers(TODAY, 'my-app')).toMatchObject({
      name: 'my-app',
      window: '2026-11-18 → 2026-12-02',
      target: 'Launch by 2027-02',
      docsDir: 'docs/project',
      versionTitle: 'First release',
    });
    expect(defaultAnswers(TODAY, '').name).toBe('My project');
  });
});

describe('normalizeAnswers', () => {
  const good = { ...defaultAnswers(TODAY, 'app'), goal: 'Help people plan.' };
  it('accepts good answers and fills an empty target', () => {
    const r = normalizeAnswers({ ...good, target: '  ' }, TODAY);
    expect(r.problems).toEqual([]);
    expect(r.answers.target).toBe('Launch by 2027-02');
  });
  it('lists every problem', () => {
    const r = normalizeAnswers(
      { name: ' ', goal: '', target: 'x', versionTitle: '', window: 'soon', docsDir: '../out' },
      TODAY,
    );
    expect(r.problems).toHaveLength(5);
    expect(r.problems.join(' ')).toContain('"soon"');
  });
  it('rejects a window that ends before it starts', () => {
    expect(
      normalizeAnswers({ ...good, window: '2026-12-10 → 2026-12-01' }, TODAY).problems,
    ).toHaveLength(1);
  });
  it('turns backslashes and a trailing slash in the docs folder into a clean path', () => {
    expect(normalizeAnswers({ ...good, docsDir: 'plan\\docs/' }, TODAY).answers.docsDir).toBe(
      'plan/docs',
    );
  });
});

describe('planInit', () => {
  const answers = {
    ...defaultAnswers(TODAY, 'app'),
    name: 'My "App"',
    goal: 'Help people plan, fast.',
  };
  const files = planInit(answers, INIT_TEMPLATES, TODAY);
  const byPath = (p: string) => files.find((f) => f.path === p);

  it('plans the config, roadmap, decisions and changelog', () => {
    expect(files.map((f) => f.path)).toEqual([
      'opmap.config.json',
      'docs/project/ROADMAP.md',
      'docs/project/DECISIONS.md',
      'CHANGELOG.md',
    ]);
    expect(byPath('CHANGELOG.md')?.keepExisting).toBe(true);
    expect(files.filter((f) => !f.keepExisting)).toHaveLength(3);
  });
  it('writes valid JSON config even when the name has quotes', () => {
    const c = JSON.parse(byPath('opmap.config.json')?.text ?? '');
    expect(c).toMatchObject({
      format: 1,
      name: 'My "App"',
      docs: {
        roadmap: 'docs/project/ROADMAP.md',
        decisions: 'docs/project/DECISIONS.md',
        changelog: 'CHANGELOG.md',
      },
    });
  });
  it('fills every placeholder in the roadmap and decisions', () => {
    for (const p of ['docs/project/ROADMAP.md', 'docs/project/DECISIONS.md'])
      expect(byPath(p)?.text).not.toMatch(/\{\{\w+\}\}/);
    const r = byPath('docs/project/ROADMAP.md')?.text ?? '';
    expect(r).toContain('# My "App"');
    expect(r).toContain('Help people plan, fast.');
    expect(r).toContain('**Window:** 2026-11-18 → 2026-12-02');
    expect(r).toContain('### v0.1.0 — First release');
    expect(r).toContain('**Status 2026-11-18:** planned.');
    expect(r).toContain('0.1.0-D1');
  });
  it('throws when a template is missing', () => {
    expect(() => planInit(answers, {}, TODAY)).toThrow('missing');
  });
});

describe('writeInit', () => {
  const files = planInit(
    { ...defaultAnswers(TODAY, 'app'), docsDir: 'plan/docs' },
    INIT_TEMPLATES,
    TODAY,
  );
  it('writes into new folders and reports what it did', () => {
    const dir = fresh();
    expect(conflicts(dir, files)).toEqual([]);
    const r = writeInit(dir, files);
    expect(r.written).toEqual(files.map((f) => f.path));
    expect(existsSync(join(dir, 'plan/docs/ROADMAP.md'))).toBe(true);
  });
  it('lists conflicts, overwrites others only when asked, and never overwrites the changelog', () => {
    const dir = fresh();
    writeInit(dir, files);
    writeFileSync(join(dir, 'CHANGELOG.md'), 'mine\n');
    writeFileSync(join(dir, 'plan/docs/ROADMAP.md'), 'mine\n');
    expect(conflicts(dir, files).sort()).toEqual([
      'opmap.config.json',
      'plan/docs/DECISIONS.md',
      'plan/docs/ROADMAP.md',
    ]);
    const r = writeInit(dir, files);
    expect(r.kept).toEqual(['CHANGELOG.md']);
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toBe('mine\n');
    expect(readFileSync(join(dir, 'plan/docs/ROADMAP.md'), 'utf8')).toContain('# app');
  });
});

describe('ensureGitignore', () => {
  it('creates, appends once, and respects a missing final newline', () => {
    const dir = fresh();
    expect(ensureGitignore(dir)).toBe(true);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('.opmap/\n');
    expect(ensureGitignore(dir)).toBe(false);
    const d2 = fresh();
    writeFileSync(join(d2, '.gitignore'), 'node_modules/');
    ensureGitignore(d2);
    expect(readFileSync(join(d2, '.gitignore'), 'utf8')).toBe('node_modules/\n.opmap/\n');
    const d3 = fresh();
    writeFileSync(join(d3, '.gitignore'), '.opmap\n');
    expect(ensureGitignore(d3)).toBe(false);
  });
});

interface Out {
  code: number;
  out: string;
  err: string;
  asked: string[];
}
async function init(
  args: string[],
  cwd: string,
  over: Partial<Io> & { answers?: string[] } = {},
): Promise<Out> {
  let out = '';
  let err = '';
  const asked: string[] = [];
  const queue = [...(over.answers ?? [])];
  const code = await mainAsync(['init', '-C', cwd, '--now', TODAY, ...args], {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    env: {},
    cwd,
    isTTY: false,
    open: () => undefined,
    ask: async (q) => {
      asked.push(q);
      return queue.shift() ?? '';
    },
    ...over,
  });
  return { code, out, err, asked };
}

describe('opmap init', () => {
  it('sets up a project from flags with --yes, and the checker runs on it', async () => {
    const dir = fresh();
    const r = await init(['--yes', '--name', 'Nest', '--goal', 'Help people plan.'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain('wrote opmap.config.json');
    expect(r.out).toContain('wrote docs/project/ROADMAP.md');
    expect(r.out).toContain('added .opmap/ to .gitignore');
    expect(r.out).toContain('Next:');
    expect(r.out).toContain('npx openprojectmap build --open');
    expect(r.out).toContain('OPM-W102'); // the Next step is still a comment to fill in
    expect(readFileSync(join(dir, 'docs/project/ROADMAP.md'), 'utf8')).toContain('# Nest');
    expect(r.asked).toEqual([]);
  });
  it('asks each question with its default when run in a terminal', async () => {
    const dir = fresh();
    const r = await init(['--name', 'Flagged'], dir, {
      isTTY: true,
      answers: ['A goal.', '', 'Alpha', '2026-12-01 → 2026-12-20', 'plan'],
    });
    expect(r.code).toBe(0);
    expect(r.asked).toHaveLength(5); // the name came from a flag
    expect(r.asked[0]).toContain('One sentence');
    expect(r.asked[0]).toContain('[Describe in one sentence');
    const roadmap = readFileSync(join(dir, 'plan/ROADMAP.md'), 'utf8');
    expect(roadmap).toContain('### v0.1.0 — Alpha');
    expect(roadmap).toContain('**Window:** 2026-12-01 → 2026-12-20');
    expect(roadmap).toContain('Launch by 2027-02');
  });
  it('refuses to ask when there is no terminal or CI is set, without --yes', async () => {
    const dir = fresh();
    const r = await init([], dir);
    expect(r.code).toBe(2);
    expect(r.err).toContain('pass --yes');
    const ci = await init([], dir, { isTTY: true, env: { CI: 'true' } });
    expect(ci.code).toBe(2);
    expect(existsSync(join(dir, 'opmap.config.json'))).toBe(false);
  });
  it('changes nothing when files exist, and says which, unless --force', async () => {
    const dir = fresh();
    await init(['--yes', '--goal', 'g'], dir);
    writeFileSync(join(dir, 'docs/project/ROADMAP.md'), 'my own roadmap\n');
    const r = await init(['--yes', '--goal', 'g'], dir);
    expect(r.code).toBe(2);
    expect(r.err).toContain(
      'already exist: opmap.config.json, docs/project/ROADMAP.md, docs/project/DECISIONS.md',
    );
    expect(readFileSync(join(dir, 'docs/project/ROADMAP.md'), 'utf8')).toBe('my own roadmap\n');
    const forced = await init(['--yes', '--force', '--goal', 'g'], dir);
    expect(forced.code).toBe(0);
    expect(readFileSync(join(dir, 'docs/project/ROADMAP.md'), 'utf8')).toContain(
      '<!-- opmap: 1 -->',
    );
  });
  it('asks before overwriting in a terminal, and leaves everything on "no"', async () => {
    const dir = fresh();
    await init(['--yes', '--goal', 'g'], dir);
    writeFileSync(join(dir, 'docs/project/ROADMAP.md'), 'mine\n');
    const no = await init(
      [
        '--force',
        '--goal',
        'g',
        '--name',
        'n',
        '--target',
        't',
        '--version-title',
        'v',
        '--window',
        `${TODAY} → 2026-12-02`,
        '--dir',
        'docs/project',
      ],
      dir,
      { isTTY: true, answers: ['n'] },
    );
    expect(no.code).toBe(1);
    expect(no.out).toContain('Nothing was changed.');
    expect(readFileSync(join(dir, 'docs/project/ROADMAP.md'), 'utf8')).toBe('mine\n');
    const yes = await init(
      [
        '--force',
        '--goal',
        'g',
        '--name',
        'n',
        '--target',
        't',
        '--version-title',
        'v',
        '--window',
        `${TODAY} → 2026-12-02`,
        '--dir',
        'docs/project',
      ],
      dir,
      { isTTY: true, answers: ['yes'] },
    );
    expect(yes.code).toBe(0);
    expect(readFileSync(join(dir, 'docs/project/ROADMAP.md'), 'utf8')).toContain('# n');
  });
  it('rejects bad answers before writing anything', async () => {
    const dir = fresh();
    for (const bad of [
      ['--window', 'someday'],
      ['--dir', '../elsewhere'],
      ['--dir', '/etc'],
    ]) {
      const r = await init(['--yes', '--goal', 'g', ...bad], dir);
      expect(r.code).toBe(2);
      expect(r.err).toContain('cannot set up the project');
    }
    expect(existsSync(join(dir, 'opmap.config.json'))).toBe(false);
  });
  it('keeps an existing changelog and gitignore entry, and rejects stray arguments', async () => {
    const dir = fresh();
    writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
    writeFileSync(join(dir, '.gitignore'), '.opmap/\n');
    const r = await init(['--yes', '--goal', 'g'], dir);
    expect(r.out).toContain('kept  CHANGELOG.md');
    expect(r.out).not.toContain('.gitignore');
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toBe(
      '# Changelog\n\n## [Unreleased]\n',
    );
    expect((await init(['--yes', 'extra'], dir)).code).toBe(2);
  });
  it('makes a project whose roadmap parses and whose map builds', async () => {
    const dir = fresh();
    await init(['--yes', '--name', 'Built', '--goal', 'g'], dir);
    let out = '';
    const code = await mainAsync(['build', '-C', dir, '--no-git', '--now', TODAY], {
      stdout: (s) => (out += s),
      stderr: () => undefined,
      env: {},
      cwd: dir,
      isTTY: false,
      open: () => undefined,
      ask: async () => '',
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, '.opmap/index.html'))).toBe(true);
    expect(out).toContain('map built: 1 version, 3 deliverables');
  });
  it('mainAsync still runs the other commands and the help', async () => {
    const r = await init([], process.cwd(), { cwd: process.cwd() });
    expect(r.code).toBe(2);
    let out = '';
    const code = await mainAsync(['--version'], {
      stdout: (s) => (out += s),
      stderr: () => undefined,
      env: {},
      cwd: '.',
      isTTY: false,
      open: () => undefined,
      ask: async () => '',
    });
    expect(code).toBe(0);
    expect(out).toMatch(/^\d+\.\d+\.\d+/);
  });
});
