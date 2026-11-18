// `opmap init`: plan the files from the templates, then write them without clobbering anything.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { addDays, parseIsoDay, parseWindow } from '../core/dates.js';

export interface InitAnswers {
  name: string;
  /** One sentence: what the project is for and who it is for. */
  goal: string;
  /** The launch target as free text, e.g. `Launch by 2027-03`. */
  target: string;
  versionTitle: string;
  /** `YYYY-MM-DD → YYYY-MM-DD` (any window form the format accepts). */
  window: string;
  /** Docs folder, repo-relative with `/`. */
  docsDir: string;
}

export interface InitFile {
  /** Repo-relative, `/` separated. */
  path: string;
  text: string;
  /** Only write when the file is absent, even with `--force` (the changelog). */
  keepExisting: boolean;
}

export type Templates = Readonly<Record<string, string>>;

const FIRST_VERSION = '0.1.0';
const MAX = { name: 80, goal: 300, target: 120, title: 80 };

/** Collapse to one line, so an answer can never add structure to the markdown. */
export function oneLine(s: string, max: number): string {
  return s
    .replace(/<!--|-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => values[key] ?? m);
}

/** A docs folder must be a plain relative path that stays inside the repo. */
export function validDocsDir(dir: string): boolean {
  if (dir === '' || isAbsolute(dir) || /^[A-Za-z]:/.test(dir)) return false;
  const parts = normalize(dir).split(/[\\/]+/);
  return !parts.includes('..') && !parts.includes('.git') && /^[\w .\-/]+$/.test(dir);
}

export function defaultAnswers(today: string, dirName: string): InitAnswers {
  const end = addDays(today, 14);
  const month = addDays(today, 90).slice(0, 7);
  return {
    name: oneLine(dirName, MAX.name) || 'My project',
    goal: 'Describe in one sentence what this project does and who it is for.',
    target: `Launch by ${month}`,
    versionTitle: 'First release',
    window: `${today} → ${end}`,
    docsDir: 'docs/project',
  };
}

/** Clean up and check the answers. Returns the problems found (empty when fine). */
export function normalizeAnswers(
  a: InitAnswers,
  today: string,
): { answers: InitAnswers; problems: string[] } {
  const problems: string[] = [];
  const answers: InitAnswers = {
    name: oneLine(a.name, MAX.name),
    goal: oneLine(a.goal, MAX.goal),
    target: oneLine(a.target, MAX.target),
    versionTitle: oneLine(a.versionTitle, MAX.title),
    window: oneLine(a.window, 60),
    docsDir: a.docsDir.trim().replace(/\\/g, '/').replace(/\/+$/, ''),
  };
  if (answers.name === '') problems.push('the project name cannot be empty');
  if (answers.goal === '') problems.push('the goal cannot be empty');
  if (answers.versionTitle === '') problems.push('the first version needs a title');
  if (answers.target === '') answers.target = `Launch by ${addDays(today, 90).slice(0, 7)}`;
  const w = parseWindow(answers.window);
  if (w.window === null || w.problem !== null)
    problems.push(
      `the window "${answers.window}" is not a date range such as ${today} → ${addDays(today, 14)}`,
    );
  if (!validDocsDir(answers.docsDir))
    problems.push(`the docs folder "${answers.docsDir}" must be a plain folder inside the project`);
  return { answers, problems };
}

export function planInit(answers: InitAnswers, templates: Templates, today: string): InitFile[] {
  const values = {
    name: answers.name,
    goal: answers.goal,
    today,
    target: answers.target,
    firstVersion: `v${FIRST_VERSION}`,
    firstSemver: FIRST_VERSION,
    firstVersionTitle: answers.versionTitle,
    firstWindow: answers.window,
    phaseTitle: 'Launch',
    milestone1: 'First users',
    docsDir: answers.docsDir,
  };
  const need = (name: string): string => {
    const t = templates[name];
    if (t === undefined) throw new Error(`The template ${name} is missing`);
    return t;
  };
  // The config is built as data, so no answer can break the JSON.
  const config = JSON.parse(need('opmap.config.json')) as Record<string, unknown>;
  config['name'] = answers.name;
  config['docs'] = {
    roadmap: `${answers.docsDir}/ROADMAP.md`,
    decisions: `${answers.docsDir}/DECISIONS.md`,
    changelog: 'CHANGELOG.md',
  };
  return [
    {
      path: 'opmap.config.json',
      text: `${JSON.stringify(config, null, 2)}\n`,
      keepExisting: false,
    },
    {
      path: `${answers.docsDir}/ROADMAP.md`,
      text: fillTemplate(need('ROADMAP.md'), values),
      keepExisting: false,
    },
    {
      path: `${answers.docsDir}/DECISIONS.md`,
      text: fillTemplate(need('DECISIONS.md'), values),
      keepExisting: false,
    },
    { path: 'CHANGELOG.md', text: need('CHANGELOG.md'), keepExisting: true },
  ];
}

export interface WriteResult {
  written: string[];
  kept: string[];
}

/** Files `planInit` would overwrite (present, and not a keep-existing file). */
export function conflicts(cwd: string, files: readonly InitFile[]): string[] {
  return files.filter((f) => !f.keepExisting && existsSync(join(cwd, f.path))).map((f) => f.path);
}

export function writeInit(cwd: string, files: readonly InitFile[]): WriteResult {
  const result: WriteResult = { written: [], kept: [] };
  for (const f of files) {
    const abs = join(cwd, f.path);
    if (f.keepExisting && existsSync(abs)) {
      result.kept.push(f.path);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.text);
    result.written.push(f.path);
  }
  return result;
}

/** Add `.opmap/` to .gitignore (creating it), once. Returns true when it changed the file. */
export function ensureGitignore(cwd: string, entry = '.opmap/'): boolean {
  const file = join(cwd, '.gitignore');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = current.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(entry) || lines.includes(entry.replace(/\/$/, ''))) return false;
  const sep = current === '' || current.endsWith('\n') ? '' : '\n';
  writeFileSync(file, `${current}${sep}${entry}\n`);
  return true;
}

/** Parse `--now`-style input into a date for the templates. */
export function todayOf(now: string): string {
  return parseIsoDay(now.slice(0, 10)) ?? now.slice(0, 10);
}

/** The Tidepool example as init files, written into `docsDir`. The config keeps the template's `$schema`. */
export function planExample(docsDir: string, example: Templates, templates: Templates): InitFile[] {
  const need = (t: Templates, name: string): string => {
    const v = t[name];
    if (v === undefined) throw new Error(`The example file ${name} is missing`);
    return v;
  };
  const config = JSON.parse(need(example, 'opmap.config.json')) as Record<string, unknown>;
  const schema = (JSON.parse(need(templates, 'opmap.config.json')) as Record<string, unknown>)[
    '$schema'
  ];
  if (typeof schema === 'string') config['$schema'] = schema;
  config['docs'] = {
    roadmap: `${docsDir}/ROADMAP.md`,
    decisions: `${docsDir}/DECISIONS.md`,
    changelog: 'CHANGELOG.md',
  };
  return [
    {
      path: 'opmap.config.json',
      text: `${JSON.stringify(config, null, 2)}\n`,
      keepExisting: false,
    },
    { path: `${docsDir}/ROADMAP.md`, text: need(example, 'ROADMAP.md'), keepExisting: false },
    { path: `${docsDir}/DECISIONS.md`, text: need(example, 'DECISIONS.md'), keepExisting: false },
    { path: 'CHANGELOG.md', text: need(example, 'CHANGELOG.md'), keepExisting: true },
  ];
}

export const AGENTS = ['claude', 'cursor', 'codex'] as const;
export type Agent = (typeof AGENTS)[number];

/** `claude,cursor`, `all` or `none`. Throws a message that names the valid choices. */
export function parseAgents(list: string): Agent[] {
  const items = list
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a !== '');
  if (items.length === 0 || items.includes('none')) return [];
  if (items.includes('all')) return [...AGENTS];
  const bad = items.filter((a) => !(AGENTS as readonly string[]).includes(a));
  if (bad.length > 0)
    throw new Error(`unknown agent "${bad[0]}": choose from ${AGENTS.join(', ')}, all or none`);
  return [...new Set(items)] as Agent[];
}

const SNIPPET_HEADING = '## Project map (OpenProjectMap)';

export interface AgentResult {
  written: string[];
  kept: string[];
}

/**
 * Install the agent files: the Claude Code skill, a Cursor rule, and a section in AGENTS.md (read
 * by Codex and others). An existing skill or rule is kept unless `force`; the AGENTS.md section is
 * added once and never duplicated.
 */
export function installAgents(
  cwd: string,
  agents: readonly Agent[],
  docsDir: string,
  templates: Templates,
  force = false,
): AgentResult {
  const result: AgentResult = { written: [], kept: [] };
  const need = (name: string): string => {
    const t = templates[name];
    if (t === undefined) throw new Error(`The template ${name} is missing`);
    return t;
  };
  const snippet = fillTemplate(need('AGENTS.snippet.md'), { docsDir }).trimEnd();
  const put = (path: string, text: string): void => {
    const abs = join(cwd, path);
    if (existsSync(abs) && !force) {
      result.kept.push(path);
      return;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
    result.written.push(path);
  };
  for (const agent of agents) {
    if (agent === 'claude') {
      put('.claude/skills/openprojectmap/SKILL.md', need('SKILL.md'));
    } else if (agent === 'cursor') {
      const body = snippet.replace(`${SNIPPET_HEADING}\n\n`, '');
      put(
        '.cursor/rules/openprojectmap.mdc',
        `---\ndescription: Keep the OpenProjectMap roadmap, decisions and changelog up to date\nalwaysApply: true\n---\n\n${body}\n`,
      );
    } else {
      const abs = join(cwd, 'AGENTS.md');
      const current = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
      if (current.includes(SNIPPET_HEADING)) {
        result.kept.push('AGENTS.md');
      } else {
        const sep = current === '' ? '' : current.endsWith('\n') ? '\n' : '\n\n';
        writeFileSync(abs, `${current}${sep}${snippet}\n`);
        result.written.push('AGENTS.md');
      }
    }
  }
  return result;
}
