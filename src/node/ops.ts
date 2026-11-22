// The editing operations shared by the CLI and the MCP server (spec 04 §5, spec 06 §6). Each one
// finds the file that holds the thing to change (the roadmap or a track), asks the
// source-preserving editor for the change, and lets applyEdit refuse an edit that would add a problem.
import { resolveNow } from './build.js';
import { loadConfig } from './config.js';
import type { ResolvedConfig } from './config.js';
import { applyEdit } from './edit-file.js';
import type { DocFile, EditResult } from './edit-file.js';
import {
  EditError,
  appendStatusLine,
  findRowById,
  findVersions,
  setDecision,
  setDeliverableStatus,
  setNowField,
} from './editor.js';
import { todayOf } from './init.js';
import { readSources } from './sources.js';
import type { ProjectData, Status } from '../core/types.js';

export interface OpContext {
  cwd: string;
  configPath?: string | undefined;
  env?: Record<string, string | undefined>;
  /** A date or timestamp; default the real time. */
  now?: string | undefined;
  dryRun?: boolean | undefined;
}

const loadFor = (ctx: OpContext): ResolvedConfig =>
  loadConfig({
    cwd: ctx.cwd,
    configPath: ctx.configPath,
    ...(ctx.env ? { env: ctx.env } : {}),
  });

const base = (ctx: OpContext) => ({
  cwd: ctx.cwd,
  configPath: ctx.configPath,
  ...(ctx.env ? { env: ctx.env } : {}),
  now: ctx.now,
  dryRun: ctx.dryRun === true,
});

export const todayFor = (ctx: OpContext): string => todayOf(resolveNow(ctx.now, 'utc').now);

/** Every deliverable of the roadmap and of all tracks. */
export function allDeliverables(
  data: ProjectData,
): ProjectData['versions'][number]['deliverables'] {
  return [
    ...data.versions.flatMap((v) => v.deliverables),
    ...data.tracks.flatMap((t) => t.versions.flatMap((v) => v.deliverables)),
  ];
}

/** The file whose table holds the row `id` (the roadmap when none does, so the editor explains). */
export function fileOfDeliverable(ctx: OpContext, id: string): DocFile {
  const config = loadFor(ctx);
  const sources = readSources(config);
  if (sources.roadmap && findRowById(sources.roadmap.text, id)) return 'roadmap';
  for (const t of sources.tracks ?? []) {
    if (findRowById(t.source.text, id)) return `track:${t.id}`;
  }
  return 'roadmap';
}

/** The file with the version (roadmap) or block (track) `id`. */
export function fileOfBlock(ctx: OpContext, id: string): DocFile {
  const config = loadFor(ctx);
  const sources = readSources(config);
  const want = id.replace(/^v/i, '').toLowerCase();
  if (
    sources.roadmap &&
    findVersions(sources.roadmap.text).some((v) => v.semver.toLowerCase() === want)
  )
    return 'roadmap';
  for (const t of sources.tracks ?? []) {
    if (
      findVersions(t.source.text, t.blockPattern ?? null).some(
        (v) => v.semver.toLowerCase() === id.toLowerCase(),
      )
    )
      return `track:${t.id}`;
  }
  return 'roadmap';
}

export interface SetStatusInput {
  id: string;
  status: Status;
  date?: string | undefined;
  ref?: string | undefined;
  note?: string | undefined;
}

export function opSetStatus(ctx: OpContext, input: SetStatusInput): EditResult {
  const { id, status } = input;
  return applyEdit({
    ...base(ctx),
    file: fileOfDeliverable(ctx, id),
    transform: (t) =>
      setDeliverableStatus(t, id, { status, date: input.date, ref: input.ref }, input.note),
    expect: (d) =>
      allDeliverables(d).find((x) => x.id === id)?.status === status
        ? null
        : `${id} is not ${status}`,
  });
}

export interface LogInput {
  /** A roadmap version (`v0.6.0` or `0.6.0`) or the id of a track block (`BM1`). */
  version: string;
  text: string;
  /** Default: today. */
  date?: string | undefined;
}

export function opLog(ctx: OpContext, input: LogInput): EditResult {
  const date = input.date ?? todayFor(ctx);
  const text = input.text;
  return applyEdit({
    ...base(ctx),
    file: fileOfBlock(ctx, input.version),
    transform: (t, _data, file) =>
      appendStatusLine(t, input.version, date, text, file.blockPattern),
    expect: (d) => {
      const want = input.version.replace(/^v/, '').toLowerCase();
      const blocks = [...d.versions, ...d.tracks.flatMap((t) => t.versions)];
      const v = blocks.find((x) => x.semver.toLowerCase() === want);
      return v?.statusLines.some((s) => s.date === date && s.text === text.trim())
        ? null
        : 'the status line is missing';
    },
  });
}

export interface DecideInput {
  id: string;
  outcome: string;
  defaulted?: boolean | undefined;
}

export function opDecide(ctx: OpContext, input: DecideInput): EditResult {
  const status = input.defaulted === true ? 'defaulted' : 'decided';
  return applyEdit({
    ...base(ctx),
    file: 'decisions',
    transform: (t) => setDecision(t, input.id, status, input.outcome),
    expect: (d) =>
      d.decisions.find((x) => x.id === input.id)?.status === status
        ? null
        : `${input.id} is not ${status}`,
  });
}

export interface UpdateNowInput {
  current?: string | undefined;
  next?: string | undefined;
  why?: string | undefined;
  /** Other `**Key:** value` facts of the Now block. */
  facts?: readonly (readonly [string, string])[] | undefined;
}

/** Sets the given Now fields and `Updated` to today. */
export function opUpdateNow(
  ctx: OpContext,
  input: UpdateNowInput,
): { result: EditResult; fields: string[] } {
  const today = todayFor(ctx);
  const sets: [string, string][] = [
    ...(input.current === undefined
      ? []
      : ([['Current version', input.current]] as [string, string][])),
    ...(input.next === undefined ? [] : ([['Next step', input.next]] as [string, string][])),
    ...(input.why === undefined ? [] : ([['Why', input.why]] as [string, string][])),
    ...(input.facts ?? []).map(([k, v]) => [k, v] as [string, string]),
    ['Updated', today],
  ];
  const result = applyEdit({
    ...base(ctx),
    file: 'roadmap',
    transform: (t) => sets.reduce((text, [k, v]) => setNowField(text, k, v), t),
    expect: (d) => (d.now?.updated === today ? null : 'Updated was not set'),
  });
  return { result, fields: sets.map(([k]) => k) };
}

export { EditError };
