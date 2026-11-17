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
import { HELP, main, processIo } from '../../src/cli/index.js';
import type { Io } from '../../src/cli/index.js';
import {
  escapeData,
  escapeProperty,
  formatDiagnostics,
  formatGithub,
  painter,
  summarize,
  summaryLine,
} from '../../src/cli/output.js';
import { openerCommand } from '../../src/cli/open.js';
import type { Diagnostic } from '../../src/core/types.js';

const base = realpathSync(mkdtempSync(join(tmpdir(), 'opmap-cli-')));
afterAll(() => rmSync(base, { recursive: true, force: true }));

interface Run {
  code: number;
  out: string;
  err: string;
  opened: string[];
}
function run(args: string[], over: Partial<Io> = {}): Run {
  let out = '';
  let err = '';
  const opened: string[] = [];
  const code = main(args, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    env: {},
    cwd: process.cwd(),
    isTTY: false,
    open: (f) => opened.push(f),
    ...over,
  });
  return { code, out, err, opened };
}

let n = 0;
const TIDEPOOL = ['-C', 'examples/tidepool', '--no-git', '--now', '2026-11-25'];
/** A tiny repo-less project with a given roadmap. */
function project(roadmap: string, extra: Record<string, string> = {}): string {
  const dir = join(base, `p${n++}`);
  mkdirSync(join(dir, 'docs/project'), { recursive: true });
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, 'docs/project/ROADMAP.md'), roadmap);
  for (const [f, t] of Object.entries(extra)) writeFileSync(join(dir, f), t);
  return dir;
}
const GOOD = `<!-- opmap: 1 -->
# Demo

## Now

**Updated:** 2026-11-17
**Next step:** Go.

## V

### v0.1.0 — One

**Window:** 2026-11-17 → 2026-12-01
**Goal:** g
**Exit:** e

| ID | Deliverable | Status |
| --- | --- | --- |
| 0.1.0-D1 | One | doing |
`;
const WARN = GOOD.replace('| doing |', '| dne |');
const ERROR = GOOD.replace('opmap: 1', 'opmap: 9');

describe('help and version', () => {
  it('prints help for --help, -h, help and no command', () => {
    for (const args of [['--help'], ['-h'], ['help'], []]) {
      const r = run(args);
      expect(r).toMatchObject({ code: 0, out: HELP, err: '' });
    }
    expect(HELP).toContain('Exit codes:');
  });
  it('prints the version', () => {
    expect(run(['--version']).out).toMatch(/^\d+\.\d+\.\d+/);
    expect(run(['-v']).code).toBe(0);
  });
});

describe('usage errors (exit 2)', () => {
  it.each([
    [['frobnicate'], 'unknown command "frobnicate"'],
    [['check', 'extra'], 'unexpected argument "extra"'],
    [['check', '--nope'], 'Unknown option'],
    [['check', '--format', 'xml'], '--format must be one of'],
    [['check', '--tz', 'mars'], '--tz must be one of'],
    [['check', '--max-warnings', 'x'], '--max-warnings must be a whole number'],
    [['check', '--max-warnings', '-1'], '--max-warnings'],
    [['check', '--now', 'tomorrow-ish'], 'Not a date or timestamp'],
  ])('%j', (args, message) => {
    const r = run([
      ...args,
      ...(args[0] === 'check' ? TIDEPOOL.filter((a) => a !== '--now' && a !== '2026-11-25') : []),
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toContain(message);
    expect(r.out).toBe('');
  });
  it('OPM-E001 and OPM-E003 are exit 2 with a hint', () => {
    const empty = join(base, `e${n++}`);
    mkdirSync(join(empty, '.git'), { recursive: true });
    const r = run(['check', '-C', empty]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('error OPM-E001');
    expect(r.err).toContain('hint: Run opmap init');
    const bad = project(GOOD, { 'opmap.config.json': '{ "format": 5 }' });
    const c = run(['check', '-C', bad]);
    expect(c.code).toBe(2);
    expect(c.err).toContain('error OPM-E003');
    expect(run(['check', '-C', bad, '-c', 'missing.json']).err).toContain('Config file not found');
  });
  it('an unexpected failure is exit 3, with the stack only under OPMAP_DEBUG', () => {
    const boom: Partial<Io> = {
      stdout: () => {
        throw new Error('disk on fire');
      },
    };
    const plain = run(['check', ...TIDEPOOL], boom);
    expect(plain.code).toBe(3);
    expect(plain.err).toBe('internal error: disk on fire\n');
    const debug = run(['check', ...TIDEPOOL], { ...boom, env: { OPMAP_DEBUG: '1' } });
    expect(debug.err).toContain('at ');
    const odd = run(['check', ...TIDEPOOL], {
      stdout: () => {
        throw 'plain string';
      },
    });
    expect(odd.err).toBe('internal error: plain string\n');
  });
});

describe('check', () => {
  it('passes on the Tidepool example and on a clean project', () => {
    const r = run(['check', ...TIDEPOOL]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('✔ 0 errors, 1 warning, 1 info');
    expect(r.out).toContain('docs/project/DECISIONS.md:9  warning  OPM-W501');
    expect(r.out).toContain('    hint: Decide, or set Status `defaulted`');
    expect(run(['check', '-C', project(GOOD), '--no-git', '--now', '2026-11-17']).out).toBe(
      '✔ 0 errors, 0 warnings\n',
    );
  });
  it('--strict and --max-warnings turn warnings into failures', () => {
    const dir = project(WARN);
    const args = ['check', '-C', dir, '--no-git', '--now', '2026-11-17'];
    expect(run(args).code).toBe(0);
    const strict = run([...args, '--strict']);
    expect(strict.code).toBe(1);
    expect(strict.out).toContain('✖ 0 errors, 1 warning');
    expect(run([...args, '--max-warnings', '0']).code).toBe(1);
    expect(run([...args, '--max-warnings', '1']).code).toBe(0);
  });
  it('errors fail without --strict, and --quiet shows only errors', () => {
    const dir = project(ERROR);
    const r = run(['check', '-C', dir, '--no-git', '--now', '2026-11-17']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('OPM-E002');
    const q = run(['check', '-C', dir, '--no-git', '--now', '2026-11-17', '-q']);
    expect(q.out).toContain('OPM-E002');
    expect(run(['check', '-C', project(WARN), '--no-git', '--now', '2026-11-17', '-q']).out).toBe(
      '',
    );
  });
  it('prints json and github formats', () => {
    const dir = project(WARN);
    const json = JSON.parse(
      run(['check', '-C', dir, '--no-git', '--now', '2026-11-17', '--format', 'json']).out,
    );
    expect(json.summary).toEqual({ errors: 0, warnings: 1, info: 0 });
    expect(json.diagnostics[0]).toMatchObject({
      code: 'OPM-W301',
      severity: 'warning',
      file: 'docs/project/ROADMAP.md',
    });
    const gh = run([
      'check',
      '-C',
      dir,
      '--no-git',
      '--now',
      '2026-11-17',
      '--format',
      'github',
    ]).out;
    expect(gh).toMatch(
      /^::warning file=docs\/project\/ROADMAP.md,line=\d+,title=OPM-W301::Unknown status/,
    );
  });
  it('uses OPMAP_NOW, --config and OPMAP_CONFIG', () => {
    const dir = project(GOOD, { 'alt.json': '{ "name": "Alt", "git": { "enabled": false } }' });
    const stale = run(['check', '-C', dir, '--no-git', '--now', '2026-12-25']);
    expect(stale.out).toContain('OPM-W104');
    expect(
      run(['check', '-C', dir, '--no-git'], { env: { OPMAP_NOW: '2026-12-25' } }).out,
    ).toContain('OPM-W104');
    expect(run(['check', '-C', dir, '-c', 'alt.json', '--now', '2026-11-17']).code).toBe(0);
    expect(
      run(['check', '-C', dir, '--now', '2026-11-17'], { env: { OPMAP_CONFIG: 'alt.json' } }).code,
    ).toBe(0);
  });
  it('--tz local runs, and -C is relative to the working folder', () => {
    expect(
      run(['check', '-C', 'tidepool', '--no-git', '--tz', 'local'], {
        cwd: join(process.cwd(), 'examples'),
      }).code,
    ).toBe(0);
  });
  it('colours output only on a terminal without NO_COLOR', () => {
    const args = ['check', ...TIDEPOOL];
    expect(run(args, { isTTY: true }).out).toContain('\u001b[');
    expect(run(args, { isTTY: true, env: { NO_COLOR: '1' } }).out).not.toContain('\u001b[');
    expect(run([...args, '--no-color'], { isTTY: true }).out).not.toContain('\u001b[');
    expect(run(args).out).not.toContain('\u001b[');
  });
  it('reads git facts when the folder is a repo', () => {
    const r = run(['check', '-C', process.cwd(), '--now', '2026-11-17']);
    expect([0, 1]).toContain(r.code);
    expect(
      run(['check', '-C', process.cwd(), '--format', 'json', '--now', '2026-11-17']).out,
    ).toContain('"summary"');
  });
});

describe('build', () => {
  it('writes the map and prints one summary line', () => {
    const dir = project(GOOD, { 'opmap.config.json': '{ "git": { "enabled": false } }' });
    const r = run(['build', '-C', dir, '--now', '2026-11-17']);
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      '✔ 0 errors, 0 warnings\nmap built: 1 version, 1 deliverable (0% done), 0 decisions open, 0 warnings → .opmap/index.html\n',
    );
    const html = readFileSync(join(dir, '.opmap/index.html'), 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Demo · Project map</title>');
    expect(existsSync(join(dir, '.opmap/data.json'))).toBe(false);
  });
  it('writes data.json with --json or output.json, and honours --out', () => {
    const dir = project(GOOD, { 'opmap.config.json': '{ "git": { "enabled": false } }' });
    run(['build', '-C', dir, '--now', '2026-11-17', '--json', '--out', 'site/map']);
    const data = JSON.parse(readFileSync(join(dir, 'site/map/data.json'), 'utf8'));
    expect(data).toMatchObject({
      schema: 'openprojectmap/project-data@1',
      project: { title: 'Demo' },
    });
    const cfg = project(GOOD, {
      'opmap.config.json':
        '{ "git": { "enabled": false }, "output": { "dir": "out", "json": true } }',
    });
    run(['build', '-C', cfg, '--now', '2026-11-17']);
    expect(existsSync(join(cfg, 'out/data.json'))).toBe(true);
  });
  it('--out outside the folder prints the full path', () => {
    const dir = project(GOOD);
    const out = join(base, `outside${n++}`);
    const r = run(['build', '-C', dir, '--no-git', '--now', '2026-11-17', '--out', out]);
    expect(r.out).toContain(`→ ${out.split('\\').join('/')}/index.html`);
  });
  it('is deterministic for a fixed --now', () => {
    const dir = project(GOOD);
    const file = join(dir, '.opmap/index.html');
    run(['build', '-C', dir, '--no-git', '--now', '2026-11-17T09:00:00Z']);
    const a = readFileSync(file, 'utf8');
    run(['build', '-C', dir, '--no-git', '--now', '2026-11-17T09:00:00Z']);
    expect(readFileSync(file, 'utf8')).toBe(a);
  });
  it('still writes the map on warnings, but fails with --strict', () => {
    const dir = project(WARN);
    const r = run(['build', '-C', dir, '--no-git', '--now', '2026-11-17', '--strict']);
    expect(r.code).toBe(1);
    expect(existsSync(join(dir, '.opmap/index.html'))).toBe(true);
    expect(r.out).toContain('1 warning');
  });
  it('does not write the map when the docs have errors', () => {
    const dir = project(ERROR);
    const r = run(['build', '-C', dir, '--no-git', '--now', '2026-11-17']);
    expect(r.code).toBe(1);
    expect(existsSync(join(dir, '.opmap'))).toBe(false);
  });
  it('--quiet and non-text formats do not print the summary line, and --open opens the file', () => {
    const dir = project(GOOD);
    const q = run(['build', '-C', dir, '--no-git', '--now', '2026-11-17', '-q', '--open']);
    expect(q.out).toBe('');
    expect(q.opened).toEqual([join(dir, '.opmap/index.html')]);
    const j = run(['build', '-C', dir, '--no-git', '--now', '2026-11-17', '--format', 'json']);
    expect(() => JSON.parse(j.out)).not.toThrow();
  });
  it('builds Tidepool', () => {
    const r = run(['build', ...TIDEPOOL]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      'map built: 5 versions, 18 deliverables (29% done), 2 decisions open, 1 warning → .opmap/index.html',
    );
  });
});

describe('output helpers', () => {
  const d = (over: Partial<Diagnostic>): Diagnostic => ({
    code: 'OPM-W301',
    severity: 'warning',
    message: 'm',
    ...over,
  });
  it('summarises and builds the summary line', () => {
    const s = summarize([
      d({}),
      d({ severity: 'error' }),
      d({ severity: 'info' }),
      d({ severity: 'info' }),
    ]);
    expect(s).toEqual({ errors: 1, warnings: 1, info: 2 });
    const plain = painter(false);
    expect(summaryLine(s, plain, true)).toBe('✖ 1 error, 1 warning, 2 info');
    expect(summaryLine({ errors: 0, warnings: 2, info: 0 }, plain, false)).toBe(
      '✔ 0 errors, 2 warnings',
    );
    expect(painter(true)('red', 'x')).toBe('\u001b[31mx\u001b[0m');
  });
  it('escapes workflow commands', () => {
    expect(escapeData('50%\r\nnext')).toBe('50%25%0D%0Anext');
    expect(escapeProperty('a:b,c%')).toBe('a%3Ab%2Cc%25');
    const out = formatGithub([
      d({ code: 'OPM-I801', severity: 'info', message: 'Not a repo', hint: 'no git' }),
      d({ severity: 'error', message: 'bad\nline', file: 'a,b.md', line: 3, column: 7 }),
    ]);
    expect(out.split('\n')).toEqual([
      '::notice title=OPM-I801::Not a repo. Hint: no git',
      '::error file=a%2Cb.md,line=3,col=7,title=OPM-W301::bad%0Aline',
    ]);
  });
  it('prints diagnostics without a file, and the quiet forms', () => {
    const plain = painter(false);
    const text = formatDiagnostics(
      'text',
      [d({ severity: 'info', code: 'OPM-I801', message: 'No repo' })],
      plain,
      false,
      false,
    );
    expect(text).toBe('info  OPM-I801  No repo\n✔ 0 errors, 0 warnings, 1 info');
    expect(formatDiagnostics('text', [d({ file: 'f.md' })], plain, false, true)).toBe('');
    expect(
      formatDiagnostics(
        'text',
        [d({ severity: 'error', file: 'f.md', line: 2 })],
        plain,
        true,
        true,
      ),
    ).toBe('f.md:2  error  OPM-W301  m\n✖ 1 error, 0 warnings');
    expect(formatDiagnostics('github', [d({}), d({ severity: 'error' })], plain, true, true)).toBe(
      '::error title=OPM-W301::m',
    );
  });
});

describe('opener and io', () => {
  it('chooses the opener per platform', () => {
    expect(openerCommand('darwin', '/x.html')).toEqual({ cmd: 'open', args: ['/x.html'] });
    expect(openerCommand('win32', 'C:\\x.html')).toEqual({
      cmd: 'cmd',
      args: ['/c', 'start', '""', 'C:\\x.html'],
    });
    expect(openerCommand('linux', '/x.html')).toEqual({ cmd: 'xdg-open', args: ['/x.html'] });
  });
  it('processIo reads the real process', () => {
    const io = processIo();
    expect(io.cwd).toBe(process.cwd());
    expect(typeof io.isTTY).toBe('boolean');
    expect(io.env).toBe(process.env);
  });
});
