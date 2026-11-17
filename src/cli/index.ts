// CLI entry (spec 04): argv -> command -> exit code. Pure of process globals: everything it
// reads or writes goes through `Io`, so tests can drive it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { OpmapError } from '../core/errors.js';
import type { ProjectData } from '../core/types.js';
import { buildData, renderMap, VERSION } from '../node/build.js';
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
}

export function processIo(): Io {
  return {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    env: process.env,
    cwd: process.cwd(),
    isTTY: process.stdout.isTTY === true,
    open: openFile,
  };
}

export const HELP = `openprojectmap ${VERSION}: turn ROADMAP, DECISIONS and CHANGELOG markdown into one project map

Usage: opmap <command> [options]

Commands:
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

export function main(argv: readonly string[], io: Io = processIo()): number {
  try {
    return run(argv, io);
  } catch (e) {
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
