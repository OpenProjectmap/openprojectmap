// CLI entry (spec 04): argv -> command -> exit code. Pure of process globals: everything it
// reads or writes goes through `Io`, so tests can drive it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { OpmapError } from '../core/errors.js';
import type { ProjectData } from '../core/types.js';
import { buildData, renderMap, resolveNow, VERSION } from '../node/build.js';
import { doctorExit, runDoctor } from '../node/doctor.js';
import { INIT_EXAMPLE, INIT_TEMPLATES } from '../render/assets.generated.js';
import {
  conflicts,
  defaultAnswers,
  ensureGitignore,
  installAgents,
  normalizeAnswers,
  parseAgents,
  planExample,
  planInit,
  todayOf,
  validDocsDir,
  writeInit,
} from '../node/init.js';
import type { Agent, InitAnswers, InitFile } from '../node/init.js';
import type { BuildOptions } from '../node/build.js';
import { formatDiagnostics, painter, summarize } from './output.js';
import type { Format } from './output.js';
import { openFile } from './open.js';
import type { Opener } from './open.js';

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  env: Record<string, string | undefined>;
  cwd: string;
  isTTY: boolean;
  open: Opener;
  /** Ask a question and return the answer (empty means the default). Only used by `init`. */
  ask: (question: string) => Promise<string>;
}

export function processIo(): Io {
  return {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    env: process.env,
    cwd: process.cwd(),
    isTTY: process.stdout.isTTY === true,
    open: openFile,
    ask: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
  };
}

export const HELP = `openprojectmap ${VERSION}: turn ROADMAP, DECISIONS and CHANGELOG markdown into one project map

Usage: opmap <command> [options]

Commands:
  init    Set up the three project docs and the config in this folder
  doctor  Check the setup and say how to fix each problem
  build   Write the map (index.html) to the output folder
  check   List every problem in the docs, with a fix hint

Options:
  -C, --cwd <dir>        Run as if started in <dir>
  -c, --config <file>    Config path (default: found by walking up from the folder)
      --now <date>       Override today (ISO date or timestamp); also OPMAP_NOW
      --tz <utc|local>   How today is computed (default utc)
      --format <f>       text, json or github (default text)
      --strict           Warnings fail the run
      --max-warnings <n> Fail when there are more than n warnings
      --no-git           Skip git facts
      --fetch            Run git fetch first (build, check)
      --out <dir>        build: output folder (default from config)
      --json             build: also write data.json
      --open             build: open the map when done
      --yes              init: accept the defaults, ask nothing
      --name <s>         init: project name
      --goal <s>         init: one sentence about the project
      --target <s>       init: launch target (free text)
      --version-title <s> init: title of the first version
      --window <w>       init: first version window, e.g. 2026-12-01 → 2026-12-14
      --dir <docs dir>   init: docs folder (default docs/project)
      --force            init: overwrite existing files (never the changelog)
      --example          init: write the fictional Tidepool project to explore, ask nothing
      --agents <list>    init: install agent files: claude, cursor, codex, all or none
  -q, --quiet            Errors only
      --no-color         No colours (also NO_COLOR, and when not a terminal)
  -h, --help             Show this help
  -v, --version          Show the version

Exit codes: 0 ok, 1 errors in the docs (or warnings with --strict), 2 usage or config error, 3 internal error.
`;

const OPTIONS = {
  cwd: { type: 'string', short: 'C' },
  config: { type: 'string', short: 'c' },
  now: { type: 'string' },
  tz: { type: 'string' },
  format: { type: 'string' },
  strict: { type: 'boolean' },
  'max-warnings': { type: 'string' },
  'no-git': { type: 'boolean' },
  fetch: { type: 'boolean' },
  out: { type: 'string' },
  json: { type: 'boolean' },
  open: { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  name: { type: 'string' },
  goal: { type: 'string' },
  target: { type: 'string' },
  'version-title': { type: 'string' },
  window: { type: 'string' },
  dir: { type: 'string' },
  force: { type: 'boolean' },
  example: { type: 'boolean' },
  agents: { type: 'string' },
  quiet: { type: 'boolean', short: 'q' },
  'no-color': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

class UsageError extends Error {}

function pick<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
  dflt: T,
): T {
  if (value === undefined) return dflt;
  if (!(allowed as readonly string[]).includes(value))
    throw new UsageError(`${flag} must be one of ${allowed.join(', ')}`);
  return value as T;
}

const slash = (p: string): string => p.split(sep).join('/');

function mapSummary(data: ProjectData, outFile: string, warnings: number): string {
  const total = data.versions.reduce((n, v) => n + v.deliverables.length, 0);
  const open = data.decisions.filter((d) => d.status === 'open').length;
  const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `map built: ${plural(data.versions.length, 'version')}, ${plural(total, 'deliverable')} (${data.derived.overall.pct}% done), ${plural(open, 'decision')} open, ${plural(warnings, 'warning')} → ${outFile}`;
}

function handleError(e: unknown, io: Io): number {
  if (
    e instanceof UsageError ||
    e instanceof RangeError ||
    (e instanceof TypeError && 'code' in e && String(e.code).startsWith('ERR_PARSE_ARGS'))
  ) {
    io.stderr(`error: ${e.message}\nRun "opmap --help" for usage.\n`);
    return 2;
  }
  if (e instanceof OpmapError) {
    io.stderr(`error ${e.code}: ${e.message}\n${e.hint ? `hint: ${e.hint}\n` : ''}`);
    return 2;
  }
  io.stderr(
    `internal error: ${io.env['OPMAP_DEBUG'] === '1' && e instanceof Error ? (e.stack ?? e.message) : e instanceof Error ? e.message : String(e)}\n`,
  );
  return 3;
}

/** `build`, `check` and the help and version flags. `init` needs prompts, so it is `mainAsync`. */
export function main(argv: readonly string[], io: Io = processIo()): number {
  try {
    return run(argv, io);
  } catch (e) {
    return handleError(e, io);
  }
}

/** Every command, including the ones that ask questions. */
export async function mainAsync(argv: readonly string[], io: Io = processIo()): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    if (positionals[0] === 'init' && !values.help && !values.version)
      return await runInit(values, positionals.slice(1), io);
    return run(argv, io);
  } catch (e) {
    return handleError(e, io);
  }
}

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values'];

async function runInit(values: Values, rest: string[], io: Io): Promise<number> {
  if (rest.length > 0) throw new UsageError(`unexpected argument "${rest[0]}"`);
  const cwd = values.cwd === undefined ? io.cwd : resolve(io.cwd, values.cwd);
  const paint = painter(
    io.isTTY && values['no-color'] !== true && (io.env['NO_COLOR'] ?? '') === '',
  );
  const { now } = resolveNow(values.now ?? io.env['OPMAP_NOW'], 'utc');
  const today = todayOf(now);
  const yes = values.yes === true;
  const interactive = io.isTTY && !yes && (io.env['CI'] ?? '') === '';
  const example = values.example === true;
  if (!interactive && !yes && !example) {
    throw new UsageError(
      'init cannot ask questions here (no terminal, or CI is set); pass --yes, and flags such as --name and --goal',
    );
  }

  let agents: Agent[];
  try {
    agents = parseAgents(values.agents ?? '');
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  let files: InitFile[];
  let docs: string;
  if (example) {
    docs = (values.dir ?? 'docs/project').trim().replace(/\\/g, '/').replace(/\/+$/, '');
    if (!validDocsDir(docs))
      throw new UsageError(`the docs folder "${docs}" must be a plain folder inside the project`);
    files = planExample(docs, INIT_EXAMPLE, INIT_TEMPLATES);
  } else {
    const defaults = defaultAnswers(today, basename(cwd));
    const ask = async (
      question: string,
      dflt: string,
      flag: string | undefined,
    ): Promise<string> => {
      if (flag !== undefined) return flag;
      if (!interactive) return dflt;
      const answer = (await io.ask(`${question} [${dflt}] `)).trim();
      return answer === '' ? dflt : answer;
    };
    const answers: InitAnswers = {
      name: await ask('Project name?', defaults.name, values.name),
      goal: await ask('One sentence: what is it, and who is it for?', defaults.goal, values.goal),
      target: await ask('Launch target (a date or month)?', defaults.target, values.target),
      versionTitle: await ask(
        'Title of the first version?',
        defaults.versionTitle,
        values['version-title'],
      ),
      window: await ask('When will it start and end?', defaults.window, values.window),
      docsDir: await ask('Docs folder?', defaults.docsDir, values.dir),
    };
    const checked = normalizeAnswers(answers, today);
    if (checked.problems.length > 0)
      throw new UsageError(`cannot set up the project: ${checked.problems.join('; ')}`);

    files = planInit(checked.answers, INIT_TEMPLATES, today);
    docs = checked.answers.docsDir;
    if (values.agents === undefined && interactive) {
      const reply = await io.ask(
        'Which AI agents should get instructions? (claude, cursor, codex, all, none) [none] ',
      );
      try {
        agents = parseAgents(reply);
      } catch (e) {
        throw new UsageError((e as Error).message);
      }
    }
  }
  const existing = conflicts(cwd, files);
  if (existing.length > 0) {
    if (values.force !== true) {
      throw new UsageError(
        `these files already exist: ${existing.join(', ')}. Nothing was changed. Use --force to overwrite them (the changelog is never overwritten)`,
      );
    }
    if (interactive) {
      const sure = (await io.ask(`Overwrite ${existing.join(', ')}? [y/N] `)).trim().toLowerCase();
      if (sure !== 'y' && sure !== 'yes') {
        io.stdout('Nothing was changed.\n');
        return 1;
      }
    }
  }
  const result = writeInit(cwd, files);
  const ignored = ensureGitignore(cwd);
  const installed = installAgents(cwd, agents, docs, INIT_TEMPLATES, values.force === true);
  for (const f of installed.written) io.stdout(`${paint('green', 'wrote')} ${f}\n`);
  for (const f of installed.kept) io.stdout(`kept  ${f} (already there)\n`);
  for (const f of result.written) io.stdout(`${paint('green', 'wrote')} ${f}\n`);
  for (const f of result.kept) io.stdout(`kept  ${f} (already there)\n`);
  if (ignored) io.stdout(`${paint('green', 'added')} .opmap/ to .gitignore\n`);

  // Run the checker once, so the first thing the user sees is what to fill in.
  const { data } = buildData({ cwd, env: io.env, now, git: false });
  const counts = summarize(data.diagnostics);
  if (data.diagnostics.length > 0) {
    io.stdout(`\n${formatDiagnostics('text', data.diagnostics, paint, false, false)}\n`);
  }
  io.stdout(
    `\nNext:\n  1. Open ${docs}/ROADMAP.md and replace each <!-- comment --> with your own words${counts.warnings > 0 ? ' (the warnings above show what is missing)' : ''}\n  2. npx openprojectmap check\n  3. npx openprojectmap build --open\n`,
  );
  return 0;
}

function run(argv: readonly string[], io: Io): number {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  if (values.version) {
    io.stdout(`${VERSION}\n`);
    return 0;
  }
  const [command, ...rest] = positionals;
  if (values.help || command === undefined || command === 'help') {
    io.stdout(HELP);
    return 0;
  }
  if (command === 'doctor') return doctor(values, io);
  if (command === 'init') throw new UsageError('init asks questions, so it runs through mainAsync');
  if (command !== 'build' && command !== 'check')
    throw new UsageError(`unknown command "${command}"`);
  if (rest.length > 0) throw new UsageError(`unexpected argument "${rest[0]}"`);

  const format: Format = pick(values.format, ['text', 'json', 'github'], '--format', 'text');
  const tz = pick(values.tz, ['utc', 'local'], '--tz', 'utc');
  const maxWarnings =
    values['max-warnings'] === undefined ? undefined : Number(values['max-warnings']);
  if (maxWarnings !== undefined && (!Number.isInteger(maxWarnings) || maxWarnings < 0))
    throw new UsageError('--max-warnings must be a whole number');
  const cwd = values.cwd === undefined ? io.cwd : resolve(io.cwd, values.cwd);
  const color = io.isTTY && values['no-color'] !== true && (io.env['NO_COLOR'] ?? '') === '';
  const paint = painter(color);
  const quiet = values.quiet === true;

  const options: BuildOptions = {
    cwd,
    configPath: values.config === undefined ? undefined : resolve(cwd, values.config),
    env: io.env,
    now: values.now ?? io.env['OPMAP_NOW'],
    tz,
    git: values['no-git'] ? false : undefined,
    fetch: values.fetch,
  };
  const { data, config } = buildData(options);
  const diagnostics = data.diagnostics;
  const counts = summarize(diagnostics);
  const failed =
    counts.errors > 0 ||
    (values.strict === true && counts.warnings > 0) ||
    (maxWarnings !== undefined && counts.warnings > maxWarnings);
  const report = (): void => {
    const text = formatDiagnostics(format, diagnostics, paint, failed, quiet);
    if (text !== '') io.stdout(`${text}\n`);
  };

  if (command === 'check') {
    report();
    return failed ? 1 : 0;
  }

  // build
  report();
  if (counts.errors > 0) return 1;
  const outDir = values.out === undefined ? config.output.dir : resolve(cwd, values.out);
  const outFile = join(outDir, 'index.html');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, renderMap(data, config.theme).html);
  if (values.json || config.output.json)
    writeFileSync(join(outDir, 'data.json'), `${JSON.stringify(data, null, 2)}\n`);
  if (!quiet && format === 'text') {
    const shown = slash(relative(cwd, outFile));
    io.stdout(
      `${paint('green', mapSummary(data, shown.startsWith('..') ? slash(outFile) : shown, counts.warnings))}\n`,
    );
  }
  if (values.open) io.open(outFile);
  return failed ? 1 : 0;
}

const MARK = { ok: '✔', warn: '⚠', fail: '✖' } as const;
const COLOR = { ok: 'green', warn: 'yellow', fail: 'red' } as const;

function doctor(values: Values, io: Io): number {
  const cwd = values.cwd === undefined ? io.cwd : resolve(io.cwd, values.cwd);
  const format: Format = pick(values.format, ['text', 'json', 'github'], '--format', 'text');
  const checks = runDoctor({
    cwd,
    configPath: values.config === undefined ? undefined : resolve(cwd, values.config),
    env: io.env,
    now: values.now ?? io.env['OPMAP_NOW'],
  });
  const code = doctorExit(checks);
  if (format === 'json') {
    io.stdout(`${JSON.stringify({ checks, ok: code === 0 }, null, 2)}\n`);
    return code;
  }
  const paint = painter(
    io.isTTY && values['no-color'] !== true && (io.env['NO_COLOR'] ?? '') === '',
  );
  for (const c of checks) {
    io.stdout(`${paint(COLOR[c.level], MARK[c.level])} ${c.name}: ${c.detail}\n`);
    if (c.fix) io.stdout(`    fix: ${c.fix}\n`);
  }
  const fails = checks.filter((c) => c.level === 'fail').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  io.stdout(
    `${fails > 0 ? paint('red', `${fails} problem${fails === 1 ? '' : 's'} to fix`) : paint('green', 'All good')}${warns > 0 ? `, ${warns} suggestion${warns === 1 ? '' : 's'}` : ''}\n`,
  );
  return code;
}
