// `opmap doctor`: check the setup and say how to fix each problem (spec 04 §2).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpmapError } from '../core/errors.js';
import { scan } from '../core/scan.js';
import { buildData } from './build.js';
import type { ResolvedConfig } from './config.js';
import { loadConfig } from './config.js';
import { git, gitVersion } from './git.js';
import { displayPath } from './sources.js';

export type Level = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  level: Level;
  detail: string;
  /** What to do about it, for `warn` and `fail`. */
  fix?: string;
}

export interface DoctorOptions {
  cwd: string;
  configPath?: string | undefined;
  env?: Record<string, string | undefined>;
  /** Injected for tests; defaults to the running Node. */
  nodeVersion?: string;
  now?: string | undefined;
}

export const MIN_NODE = [20, 11] as const;

export function nodeOk(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

/** Run every check. Never throws: a problem becomes a `fail` entry. */
export function runDoctor(options: DoctorOptions): Check[] {
  const checks: Check[] = [];
  const add = (c: Check): void => {
    checks.push(c);
  };

  const node = options.nodeVersion ?? process.versions.node;
  add(
    nodeOk(node)
      ? { name: 'Node.js', level: 'ok', detail: `v${node}` }
      : {
          name: 'Node.js',
          level: 'fail',
          detail: `v${node} is too old (needs ${MIN_NODE[0]}.${MIN_NODE[1]} or newer)`,
          fix: `Install Node.js ${MIN_NODE[0]}.${MIN_NODE[1]} or newer from https://nodejs.org, then run this again.`,
        },
  );

  const gv = gitVersion(options.cwd);
  add(
    gv === null
      ? {
          name: 'git',
          level: 'warn',
          detail: 'git is not installed or not on the PATH',
          fix: 'Install git to get branch, activity and staleness facts. The map works without it (use --no-git).',
        }
      : { name: 'git', level: 'ok', detail: `version ${gv}` },
  );
  const inRepo = gv !== null && git(['rev-parse', '--show-toplevel'], options.cwd) !== null;
  if (gv !== null) {
    add(
      inRepo
        ? { name: 'git repository', level: 'ok', detail: 'this folder is inside a repository' }
        : {
            name: 'git repository',
            level: 'warn',
            detail: 'this folder is not inside a git repository',
            fix: 'Run `git init` if you want git facts, or set "git": { "enabled": false } in opmap.config.json.',
          },
    );
  }

  let config: ResolvedConfig;
  try {
    config = loadConfig({
      cwd: options.cwd,
      configPath: options.configPath,
      ...(options.env ? { env: options.env } : {}),
    });
  } catch (e) {
    if (e instanceof OpmapError) {
      add({
        name: 'config and roadmap',
        level: 'fail',
        detail: `${e.code}: ${e.message.split('\n')[0]}`,
        fix:
          e.code === 'OPM-E001'
            ? 'Run `npx openprojectmap init` to create the docs, or set docs.roadmap in opmap.config.json.'
            : `Fix opmap.config.json. ${e.hint ?? 'The message names each key.'}`,
      });
      return checks;
    }
    throw e;
  }
  add({
    name: 'config',
    level: 'ok',
    detail:
      config.configPath === null
        ? 'no opmap.config.json; using the defaults'
        : `${displayPath(config.root, config.configPath)} is valid`,
  });
  add({
    name: 'roadmap',
    level: 'ok',
    detail: displayPath(config.root, config.docs.roadmap),
  });
  for (const [label, path] of [
    ['decisions', config.docs.decisions],
    ['changelog', config.docs.changelog],
  ] as const) {
    add(
      path === null
        ? {
            name: label,
            level: 'warn',
            detail: `no ${label} file found`,
            fix: `Add one (see the templates in \`npx openprojectmap init --example\`), or ignore this: it is optional. Set docs.${label} to a path or null to silence it.`,
          }
        : {
            name: label,
            level: 'ok',
            detail: displayPath(config.root, path),
          },
    );
  }

  const marker = scan(readFileSync(config.docs.roadmap, 'utf8')).marker;
  if (marker === null) {
    add({
      name: 'format marker',
      level: 'warn',
      detail: 'the roadmap has no <!-- opmap: 1 --> line',
      fix: 'Add `<!-- opmap: 1 -->` as the first line of the roadmap.',
    });
  } else if (marker.version > 1) {
    add({
      name: 'format marker',
      level: 'fail',
      detail: `the roadmap says format ${marker.version}, but this version reads format 1`,
      fix: 'Upgrade openprojectmap: `npx openprojectmap@latest doctor`.',
    });
  } else {
    add({ name: 'format marker', level: 'ok', detail: 'format 1' });
  }

  try {
    const { data } = buildData({
      cwd: options.cwd,
      configPath: options.configPath,
      ...(options.env ? { env: options.env } : {}),
      now: options.now,
      git: false,
    });
    const errors = data.diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = data.diagnostics.filter((d) => d.severity === 'warning').length;
    add(
      errors > 0
        ? {
            name: 'docs',
            level: 'fail',
            detail: `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`,
            fix: 'Run `npx openprojectmap check` for each problem and how to fix it.',
          }
        : warnings > 0
          ? {
              name: 'docs',
              level: 'warn',
              detail: `${warnings} warning${warnings === 1 ? '' : 's'}`,
              fix: 'Run `npx openprojectmap check` for each warning and how to fix it.',
            }
          : { name: 'docs', level: 'ok', detail: 'no problems found' },
    );
  } catch (e) {
    add({
      name: 'docs',
      level: 'fail',
      detail: e instanceof Error ? e.message : String(e),
      fix: 'Run `npx openprojectmap check`.',
    });
  }

  if (inRepo) {
    const ignore = join(config.root, '.gitignore');
    const out = displayPath(config.root, config.output.dir);
    const lines = existsSync(ignore)
      ? readFileSync(ignore, 'utf8')
          .split(/\r?\n/)
          .map((l) => l.trim().replace(/^\//, ''))
      : [];
    const ignored = lines.some((l) => l === out || l === `${out}/` || l === `${out}/*`);
    add(
      ignored
        ? { name: 'output folder', level: 'ok', detail: `${out}/ is in .gitignore` }
        : {
            name: 'output folder',
            level: 'warn',
            detail: `${out}/ is not in .gitignore, so the built map could be committed or published by accident`,
            fix: `Add the line \`${out}/\` to .gitignore.`,
          },
    );
  }
  return checks;
}

export function doctorExit(checks: readonly Check[]): number {
  return checks.some((c) => c.level === 'fail') ? 1 : 0;
}
