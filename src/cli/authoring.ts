// The editing commands (spec 04 §2): set-status, add, new-version, log, now, decide. Each one asks
// the source-preserving editor for a change, which refuses to write if it would add a problem.
import { resolve } from 'node:path';
import { resolveNow } from '../node/build.js';
import { applyEdit } from '../node/edit-file.js';
import type { EditResult } from '../node/edit-file.js';
import {
  EditError,
  addDeliverable,
  addVersion,
  appendStatusLine,
  knownStatus,
  setDecision,
  setDeliverableStatus,
  setNowField,
} from '../node/editor.js';
import { todayOf } from '../node/init.js';
import { UsageError } from './errors.js';
import type { Io } from './index.js';

export const AUTHORING = new Set(['set-status', 'add', 'new-version', 'log', 'now', 'decide']);

/** The flags the editing commands read (a subset of the CLI's parsed options). */
export interface AuthoringValues {
  cwd?: string | undefined;
  config?: string | undefined;
  now?: string | undefined;
  'dry-run'?: boolean | undefined;
  status?: string | undefined;
  date?: string | undefined;
  ref?: string | undefined;
  note?: string | undefined;
  notes?: string | undefined;
  title?: string | undefined;
  window?: string | undefined;
  goal?: string | undefined;
  exit?: string | undefined;
  after?: string | undefined;
  current?: string | undefined;
  next?: string | undefined;
  why?: string | undefined;
  fact?: string[] | undefined;
  defaulted?: boolean | undefined;
}

const STATUS_WORDS = 'todo, doing, review, blocked, done or parked';

function arg(rest: readonly string[], i: number, name: string): string {
  const v = rest[i];
  if (v === undefined || v.trim() === '') throw new UsageError(`missing <${name}>`);
  return v;
}

function noExtra(rest: readonly string[], n: number): void {
  if (rest.length > n) throw new UsageError(`unexpected argument "${rest[n]}"`);
}

function isoDate(value: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new UsageError(`${flag} must be a date like 2026-12-01`);
  return value;
}

export function runAuthoring(
  command: string,
  rest: readonly string[],
  values: AuthoringValues,
  io: Io,
): number {
  const cwd = values.cwd === undefined ? io.cwd : resolve(io.cwd, values.cwd);
  const nowInput = values.now ?? io.env['OPMAP_NOW'];
  const today = todayOf(resolveNow(nowInput, 'utc').now);
  const dryRun = values['dry-run'] === true;
  const base = {
    cwd,
    configPath: values.config === undefined ? undefined : resolve(cwd, values.config),
    env: io.env,
    now: nowInput,
    dryRun,
  };
  let result: EditResult;
  let summary: string;

  try {
    switch (command) {
      case 'set-status': {
        const id = arg(rest, 0, 'ID');
        const word = arg(rest, 1, 'status');
        noExtra(rest, 2);
        const status = knownStatus(word);
        if (status === null) throw new UsageError(`"${word}" is not a status: use ${STATUS_WORDS}`);
        const date = values.date === undefined ? undefined : isoDate(values.date, '--date');
        result = applyEdit({
          ...base,
          file: 'roadmap',
          transform: (t) =>
            setDeliverableStatus(t, id, { status, date, ref: values.ref }, values.note),
          expect: (d) =>
            d.versions.flatMap((v) => v.deliverables).find((x) => x.id === id)?.status === status
              ? null
              : `${id} is not ${status}`,
        });
        summary = `${id} → ${status}`;
        break;
      }
      case 'add': {
        const version = arg(rest, 0, 'version');
        const title = arg(rest, 1, 'deliverable');
        noExtra(rest, 2);
        const status = values.status === undefined ? 'todo' : knownStatus(values.status);
        if (status === null)
          throw new UsageError(`"${values.status}" is not a status: use ${STATUS_WORDS}`);
        let id = '';
        result = applyEdit({
          ...base,
          file: 'roadmap',
          transform: (t) => {
            const r = addDeliverable(t, version, { title, status, notes: values.notes });
            id = r.id;
            return r.text;
          },
          expect: (d) =>
            d.versions
              .flatMap((v) => v.deliverables)
              .some((x) => x.id === id && x.status === status)
              ? null
              : `${id} was not added`,
        });
        summary = `added ${id}`;
        break;
      }
      case 'new-version': {
        const semver = arg(rest, 0, 'semver').replace(/^v/, '');
        noExtra(rest, 1);
        if (values.title === undefined) throw new UsageError('new-version needs --title');
        result = applyEdit({
          ...base,
          file: 'roadmap',
          transform: (t) =>
            addVersion(t, {
              semver,
              title: values.title ?? '',
              window: values.window,
              goal: values.goal,
              exit: values.exit,
              today,
              after: values.after,
            }),
          expect: (d) =>
            d.versions.some((v) => v.semver === semver) ? null : `v${semver} was not added`,
        });
        summary = `added v${semver}`;
        break;
      }
      case 'log': {
        const version = arg(rest, 0, 'version');
        const text = arg(rest, 1, 'status text');
        noExtra(rest, 2);
        const date = values.date === undefined ? today : isoDate(values.date, '--date');
        result = applyEdit({
          ...base,
          file: 'roadmap',
          transform: (t) => appendStatusLine(t, version, date, text),
          expect: (d) => {
            const v = d.versions.find((x) => x.semver === version.replace(/^v/, ''));
            return v?.statusLines.some((s) => s.date === date && s.text === text.trim())
              ? null
              : 'the status line is missing';
          },
        });
        summary = `${version}: logged ${date}`;
        break;
      }
      case 'now': {
        noExtra(rest, 0);
        const facts = (values.fact ?? []).map((f) => {
          const i = f.indexOf('=');
          if (i < 1) throw new UsageError(`--fact must look like key=value, not "${f}"`);
          return [f.slice(0, i).trim(), f.slice(i + 1).trim()] as [string, string];
        });
        const sets: [string, string][] = [
          ...(values.current === undefined
            ? []
            : ([['Current version', values.current]] as [string, string][])),
          ...(values.next === undefined
            ? []
            : ([['Next step', values.next]] as [string, string][])),
          ...(values.why === undefined ? [] : ([['Why', values.why]] as [string, string][])),
          ...facts,
          ['Updated', today],
        ];
        result = applyEdit({
          ...base,
          file: 'roadmap',
          transform: (t) => sets.reduce((text, [k, v]) => setNowField(text, k, v), t),
          expect: (d) => (d.now?.updated === today ? null : 'Updated was not set'),
        });
        summary = `Now block updated (${sets.map(([k]) => k).join(', ')})`;
        break;
      }
      default: {
        const id = arg(rest, 0, 'ID');
        const outcome = arg(rest, 1, 'outcome');
        noExtra(rest, 2);
        const status = values.defaulted === true ? 'defaulted' : 'decided';
        result = applyEdit({
          ...base,
          file: 'decisions',
          transform: (t) => setDecision(t, id, status, outcome),
          expect: (d) =>
            d.decisions.find((x) => x.id === id)?.status === status
              ? null
              : `${id} is not ${status}`,
        });
        summary = `${id} → ${status}`;
      }
    }
  } catch (e) {
    if (e instanceof EditError) {
      io.stderr(`error: ${e.message}\n`);
      return 1;
    }
    throw e;
  }

  if (!result.changed) {
    io.stdout(`nothing to change in ${result.path}\n`);
    return 0;
  }
  if (dryRun) {
    io.stdout(result.diff);
    io.stdout(`(dry run: ${result.path} was not changed)\n`);
  } else {
    io.stdout(`updated ${result.path}: ${summary}\n`);
  }
  return 0;
}
