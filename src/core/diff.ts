// Compares two ProjectData values: what a pull request changes in the roadmap (spec 06 §2.3).
// Pure: it never reads files or git.
import type { ProjectData, Status } from './types.js';

export interface DeliverableRef {
  id: string;
  title: string;
  versionId: string;
  status: Status;
}

export interface ProjectDiff {
  statusChanges: { id: string; title: string; versionId: string; from: Status; to: Status }[];
  addedDeliverables: DeliverableRef[];
  removedDeliverables: DeliverableRef[];
  addedVersions: { id: string; title: string }[];
  removedVersions: { id: string; title: string }[];
  windowChanges: { id: string; title: string; from: string | null; to: string | null }[];
  now: { field: string; from: string | null; to: string | null }[];
  decisionsOpened: { id: string; question: string }[];
  decisionsClosed: { id: string; question: string; status: string; outcome: string | null }[];
  progress: { from: number; to: number };
  empty: boolean;
}

const NOW_FIELDS = ['updated', 'currentVersion', 'nextStep', 'why', 'target'] as const;

function ref(d: ProjectData['versions'][number]['deliverables'][number]): DeliverableRef {
  return { id: d.id, title: d.title, versionId: d.versionId, status: d.status };
}

export function diffProjects(base: ProjectData, head: ProjectData): ProjectDiff {
  const baseDeliverables = new Map(
    base.versions.flatMap((v) => v.deliverables).map((d) => [d.id, d]),
  );
  const headDeliverables = new Map(
    head.versions.flatMap((v) => v.deliverables).map((d) => [d.id, d]),
  );
  const statusChanges: ProjectDiff['statusChanges'] = [];
  const addedDeliverables: DeliverableRef[] = [];
  for (const [id, d] of headDeliverables) {
    const before = baseDeliverables.get(id);
    if (before === undefined) addedDeliverables.push(ref(d));
    else if (before.status !== d.status)
      statusChanges.push({
        id,
        title: d.title,
        versionId: d.versionId,
        from: before.status,
        to: d.status,
      });
  }
  const removedDeliverables = [...baseDeliverables]
    .filter(([id]) => !headDeliverables.has(id))
    .map(([, d]) => ref(d));

  const baseVersions = new Map(base.versions.map((v) => [v.id, v]));
  const headVersions = new Map(head.versions.map((v) => [v.id, v]));
  const addedVersions = head.versions
    .filter((v) => !baseVersions.has(v.id))
    .map((v) => ({ id: v.id, title: v.title }));
  const removedVersions = base.versions
    .filter((v) => !headVersions.has(v.id))
    .map((v) => ({ id: v.id, title: v.title }));
  const windowChanges: ProjectDiff['windowChanges'] = [];
  for (const v of head.versions) {
    const before = baseVersions.get(v.id);
    if (before === undefined) continue;
    const from = before.window?.raw ?? null;
    const to = v.window?.raw ?? null;
    if (from !== to) windowChanges.push({ id: v.id, title: v.title, from, to });
  }

  const now: ProjectDiff['now'] = [];
  for (const field of NOW_FIELDS) {
    const from = base.now?.[field] ?? null;
    const to = head.now?.[field] ?? null;
    if (from !== to) now.push({ field, from, to });
  }

  const baseDecisions = new Map(base.decisions.map((d) => [d.id, d]));
  const decisionsOpened: ProjectDiff['decisionsOpened'] = [];
  const decisionsClosed: ProjectDiff['decisionsClosed'] = [];
  for (const d of head.decisions) {
    const before = baseDecisions.get(d.id);
    if (d.status === 'open') {
      if (before === undefined || before.status !== 'open')
        decisionsOpened.push({ id: d.id, question: d.question });
    } else if (before === undefined || before.status === 'open') {
      decisionsClosed.push({
        id: d.id,
        question: d.question,
        status: d.status,
        outcome: d.outcome,
      });
    }
  }

  const progress = { from: base.derived.overall.pct, to: head.derived.overall.pct };
  const diff: ProjectDiff = {
    statusChanges,
    addedDeliverables,
    removedDeliverables,
    addedVersions,
    removedVersions,
    windowChanges,
    now,
    decisionsOpened,
    decisionsClosed,
    progress,
    empty: false,
  };
  diff.empty =
    statusChanges.length +
      addedDeliverables.length +
      removedDeliverables.length +
      addedVersions.length +
      removedVersions.length +
      windowChanges.length +
      now.length +
      decisionsOpened.length +
      decisionsClosed.length ===
    0;
  return diff;
}

export type DiffFormat = 'text' | 'markdown' | 'json';

/** First line only, trimmed to a readable length. */
function short(text: string | null, max = 80): string {
  if (text === null) return '(none)';
  const line = (text.split('\n')[0] ?? '').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Table cells and list text must not break the markdown. */
function md(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/`/g, "'");
}

interface Section {
  title: string;
  lines: string[];
}

function sections(diff: ProjectDiff): Section[] {
  const out: Section[] = [];
  const add = (title: string, lines: string[]): void => {
    if (lines.length > 0) out.push({ title, lines });
  };
  add(
    'Status changes',
    diff.statusChanges.map((c) => `${c.id} ${c.title}: ${c.from} → ${c.to}`),
  );
  add(
    'New deliverables',
    diff.addedDeliverables.map((d) => `${d.id} ${d.title} (${d.versionId}, ${d.status})`),
  );
  add(
    'Removed deliverables',
    diff.removedDeliverables.map((d) => `${d.id} ${d.title} (${d.versionId}, was ${d.status})`),
  );
  add('Versions', [
    ...diff.addedVersions.map((v) => `added ${v.id} ${v.title}`),
    ...diff.removedVersions.map((v) => `removed ${v.id} ${v.title}`),
  ]);
  add(
    'Windows',
    diff.windowChanges.map((w) => `${w.id}: ${w.from ?? '(none)'} → ${w.to ?? '(none)'}`),
  );
  add(
    'Now block',
    diff.now.map((n) => `${n.field}: ${short(n.from)} → ${short(n.to)}`),
  );
  add(
    'Decisions opened',
    diff.decisionsOpened.map((d) => `${d.id} ${short(d.question)}`),
  );
  add(
    'Decisions closed',
    diff.decisionsClosed.map(
      (d) =>
        `${d.id} ${short(d.question)} (${d.status}${d.outcome ? `: ${short(d.outcome)}` : ''})`,
    ),
  );
  return out;
}

/** The marker a workflow can search for to update one sticky comment. */
export const DIFF_MARKER = '<!-- opmap-diff -->';

export function formatDiff(
  diff: ProjectDiff,
  format: DiffFormat,
  labels: { base: string; head: string },
): string {
  if (format === 'json') return `${JSON.stringify(diff, null, 2)}\n`;
  const progress =
    diff.progress.from === diff.progress.to
      ? `Overall progress stays at ${diff.progress.to}%.`
      : `Overall progress: ${diff.progress.from}% → ${diff.progress.to}%.`;
  if (format === 'markdown') {
    const lines = [DIFF_MARKER, '### Roadmap changes', ''];
    lines.push(`Comparing \`${md(labels.base)}\` with \`${md(labels.head)}\`.`, '');
    if (diff.empty) lines.push('No roadmap changes.', '');
    for (const s of sections(diff)) {
      lines.push(`**${s.title}**`, '');
      for (const l of s.lines) lines.push(`- ${md(l)}`);
      lines.push('');
    }
    lines.push(progress);
    return `${lines.join('\n')}\n`;
  }
  const lines = [`Roadmap changes: ${labels.base} → ${labels.head}`];
  if (diff.empty) lines.push('', 'No roadmap changes.');
  for (const s of sections(diff)) {
    lines.push('', `${s.title}:`);
    for (const l of s.lines) lines.push(`  ${l}`);
  }
  lines.push('', progress);
  return `${lines.join('\n')}\n`;
}
