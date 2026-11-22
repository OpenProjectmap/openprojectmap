// Feature intake (spec 06 §6): where does a new idea belong in the roadmap, and is a drafted row
// safe to add? Pure functions over ProjectData. There is no language model here and no guessing
// beyond word overlap: the agent (or the person) reads the answer and decides.
import { inlineText, parseInline } from './inline.js';
import { parseStatus } from './status.js';
import type { Deliverable, ProjectData, Version } from './types.js';

const plain = (s: string | null | undefined): string => inlineText(parseInline(s ?? ''));

const STOP = new Set(
  (
    'the and for with that this from into onto over under about after before when where which while will would ' +
    'should could can are was were has have had not but all any our your their its they them then than also ' +
    'just only more most some such via per use using used new add adds adding make makes want need needs'
  ).split(' '),
);

/** Lower-case words of 3 or more letters or digits, without common words, lightly stemmed. */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    const stem =
      raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    out.add(stem);
  }
  return out;
}

const shared = (a: ReadonlySet<string>, b: ReadonlySet<string>): string[] =>
  [...a].filter((x) => b.has(x));

/** Size of the intersection over the size of the union (0 to 1). */
export function similarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const both = shared(a, b).length;
  return both / (a.size + b.size - both);
}

export const DUPLICATE_PARKED = 0.6;
export const SIMILAR_DELIVERABLE = 0.75;

export interface Candidate {
  /** `v0.6.0` or a track block id such as `BM1`. */
  version: string;
  title: string;
  track: string | null;
  state: Version['state'];
  window: string | null;
  goal: string | null;
  deliverables: number;
  score: number;
  /** Words of the idea found in the version's title, goal or exit. */
  matchedWords: string[];
  /** Deliverables of this version that mention the idea's words. */
  matchedDeliverables: string[];
  /** The next unused deliverable ID in this version, or null when it cannot be told. */
  nextFreeId: string | null;
}

export interface Proposal {
  idea: string;
  /** Versions the idea could go in, best first; shipped versions are never candidates. */
  candidates: Candidate[];
  related: {
    deliverables: {
      id: string;
      title: string;
      status: string;
      version: string;
      track: string | null;
    }[];
    decisions: { id: string; question: string; status: string; neededBy: string | null }[];
    parked: { item: string; why: string; revisitWhen: string | null; likelyDuplicate: boolean }[];
  };
  /** Plain sentences about conflicts and what to do first. */
  notes: string[];
}

interface Block {
  version: Version;
  track: string | null;
}

const blocksOf = (data: ProjectData): Block[] => [
  ...data.versions.map((version) => ({ version, track: null })),
  ...data.tracks.flatMap((t) => t.versions.map((version) => ({ version, track: t.id }))),
];

/** The next free ID of a block: one more than the highest number among IDs written like its own. */
export function nextFreeId(data: ProjectData, block: Version): string | null {
  const all = blocksOf(data).flatMap((b) => b.version.deliverables.map((d) => d.id));
  const own = block.deliverables.map((d) => d.id);
  const sample = own.at(-1);
  // `0.6.0-D4` -> prefix `0.6.0-D`; `BM1-S3` -> prefix `BM1-S`
  const m = sample === undefined ? null : /^(.*\D)(\d+)$/.exec(sample);
  const prefix = m?.[1] ?? (/^\d+\.\d+\.\d+/.test(block.semver) ? `${block.semver}-D` : null);
  if (prefix === null) return null;
  let max = 0;
  for (const id of all) {
    if (!id.startsWith(prefix)) continue;
    const n = /^\d+$/.test(id.slice(prefix.length)) ? Number(id.slice(prefix.length)) : 0;
    if (n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

function deliverableTokens(d: Deliverable): Set<string> {
  return tokens(`${plain(d.title)} ${plain(d.notes)}`);
}

export function propose(data: ProjectData, idea: string, limit = 5): Proposal {
  const wanted = tokens(idea);
  const notes: string[] = [];
  const candidates: Candidate[] = [];
  const related: Proposal['related'] = { deliverables: [], decisions: [], parked: [] };

  for (const { version: v, track } of blocksOf(data)) {
    const own = tokens(`${plain(v.title)} ${plain(v.goal)} ${plain(v.exit)}`);
    const matchedWords = shared(wanted, own);
    let score = 3 * matchedWords.length;
    const matchedDeliverables: string[] = [];
    for (const d of v.deliverables) {
      const hit = shared(wanted, deliverableTokens(d)).length;
      if (hit > 0) {
        score += Math.min(2, hit);
        matchedDeliverables.push(d.id);
        related.deliverables.push({
          id: d.id,
          title: plain(d.title),
          status: d.status,
          version: v.id,
          track,
        });
      }
    }
    if (v.state === 'shipped') continue; // a released version does not change (AGENTS.md §3)
    candidates.push({
      version: v.id,
      title: plain(v.title),
      track,
      state: v.state,
      window: v.window?.raw ?? null,
      goal: v.goal === null ? null : plain(v.goal),
      deliverables: v.deliverables.length,
      score,
      matchedWords,
      matchedDeliverables,
      nextFreeId: nextFreeId(data, v),
    });
  }

  const rank = { active: 0, planned: 1, shipped: 2 } as const;
  candidates.sort((a, b) => b.score - a.score || rank[a.state] - rank[b.state]);
  let top = candidates.filter((c) => c.score > 0).slice(0, limit);
  if (top.length === 0) {
    top = candidates.filter((c) => c.track === null).slice(0, 2);
    notes.push(
      'No version mentions the words of this idea, so the candidates are only the current and the next roadmap version. If neither fits, add a new version first (`opmap new-version`) or put the idea on the Parked list.',
    );
  }

  for (const p of data.parked) {
    const sim = similarity(wanted, tokens(`${plain(p.item)} ${plain(p.why)}`));
    const hit = shared(wanted, tokens(plain(p.item))).length > 0;
    if (!hit && sim === 0) continue;
    const dup = similarity(wanted, tokens(plain(p.item))) >= DUPLICATE_PARKED;
    related.parked.push({
      item: plain(p.item),
      why: plain(p.why),
      revisitWhen: p.revisitWhen === null ? null : plain(p.revisitWhen),
      likelyDuplicate: dup,
    });
    if (dup)
      notes.push(
        `The Parked list already holds "${plain(p.item)}", which looks like the same idea: revisit it instead of adding a new row.`,
      );
  }

  for (const d of data.decisions) {
    const text = `${plain(d.question)} ${d.options.join(' ')} ${plain(d.outcome)}`;
    if (shared(wanted, tokens(text)).length === 0) continue;
    related.decisions.push({
      id: d.id,
      question: plain(d.question),
      status: d.status,
      neededBy: d.neededBy,
    });
    if (d.status === 'open')
      notes.push(
        `Decision ${d.id} is still open and touches this idea: settle it (or use its default) first.`,
      );
  }

  related.deliverables = related.deliverables.slice(0, 8);
  related.decisions = related.decisions.slice(0, 5);
  related.parked = related.parked.slice(0, 5);
  const similar = related.deliverables.find((x) => {
    const row = blocksOf(data)
      .flatMap((b) => b.version.deliverables)
      .find((d) => d.id === x.id);
    return row !== undefined && similarity(wanted, deliverableTokens(row)) >= SIMILAR_DELIVERABLE;
  });
  if (similar) notes.push(`${similar.id} ("${similar.title}") already covers most of this idea.`);
  if (data.derived.stale.isStale)
    notes.push('The Now block is stale, so "current version" may be out of date: update it first.');
  return { idea: idea.trim(), candidates: top, related, notes };
}

// ---------- checking a drafted row ----------

export interface RowDraft {
  id: string;
  title: string;
  status: string;
  notes: string;
}

/** A markdown table row (`| ID | Title | status | notes |`) into its cells; null when it is not one. */
export function parseRow(text: string): RowDraft | null {
  const line = text.trim();
  if (!line.startsWith('|') || line.includes('\n')) return null;
  const cells = line
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').trim());
  if (cells.length < 2 || cells[0] === '' || /^[-: ]+$/.test(cells[0] ?? '')) return null;
  return {
    id: plain(cells[0]),
    title: cells[1] ?? '',
    status: cells[2] ?? 'todo',
    notes: cells[3] ?? '',
  };
}

export interface Finding {
  level: 'error' | 'warning';
  message: string;
}

export interface RowCheck {
  row: RowDraft | null;
  findings: Finding[];
  ok: boolean;
}

export interface CheckOptions {
  /** The deliverable ID pattern (`^(?<version>\d+\.\d+\.\d+)-D\d+$` by default), plus each track's own. */
  idPatterns: readonly { pattern: RegExp; track: string | null }[];
}

/** Does a drafted row fit: a good ID that is free, in a version that has not shipped, not a repeat. */
export function checkRow(data: ProjectData, text: string, options: CheckOptions): RowCheck {
  const row = parseRow(text);
  const findings: Finding[] = [];
  const error = (message: string): void => void findings.push({ level: 'error', message });
  const warn = (message: string): void => void findings.push({ level: 'warning', message });
  if (row === null) {
    error(
      'Not a table row. Write it like `| 0.6.0-D6 | **Title**: what it does | todo | notes |`.',
    );
    return { row, findings, ok: false };
  }

  const status = parseStatus(row.status);
  if (status.unknown)
    error(
      `"${row.status}" is not a status${status.suggestion ? `; did you mean "${status.suggestion}"?` : ''}`,
    );
  if (plain(row.title) === '') error('The row has no title.');

  const blocks = blocksOf(data);
  const used = blocks.find((b) => b.version.deliverables.some((d) => d.id === row.id));
  if (used)
    error(
      `The ID ${row.id} is already used in ${used.version.id}. Use ${nextFreeId(data, used.version) ?? 'another ID'}.`,
    );

  // Which version does the ID name? The pattern's `version` group says (spec 02 §3).
  let target: Block | undefined;
  let matched = false;
  for (const { pattern, track } of options.idPatterns) {
    const m = pattern.exec(row.id);
    if (m === null) continue;
    matched = true;
    const named = m.groups?.['version'];
    if (named === undefined) continue;
    target = blocks.find(
      (b) =>
        b.track === track &&
        (track === null
          ? b.version.semver === named
          : b.version.id === named || b.version.semver === named),
    );
    if (target === undefined)
      error(
        `The ID ${row.id} names ${track === null ? `v${named}` : named}, which is not in the ${track === null ? 'roadmap' : `track ${track}`}. Add that version first.`,
      );
    break;
  }
  if (!matched)
    error(
      `The ID ${row.id} does not match the ID pattern of the roadmap${options.idPatterns.length > 1 ? ' or any track' : ''}.`,
    );
  if (target?.version.state === 'shipped')
    error(
      `${target.version.id} is already shipped; a released version does not change. Put the row in a version that has not shipped.`,
    );

  const mine = tokens(plain(row.title));
  for (const p of data.parked) {
    if (similarity(mine, tokens(plain(p.item))) >= DUPLICATE_PARKED)
      error(
        `It repeats the Parked item "${plain(p.item)}". Move that item out of Parked instead of adding a second row.`,
      );
  }
  for (const { version, track } of blocks) {
    for (const d of version.deliverables) {
      if (similarity(mine, deliverableTokens(d)) >= SIMILAR_DELIVERABLE)
        warn(`It looks like ${d.id} ("${plain(d.title)}")${track ? ` in track ${track}` : ''}.`);
    }
  }
  return { row, findings, ok: !findings.some((f) => f.level === 'error') };
}
