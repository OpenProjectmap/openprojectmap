// Importers (spec 04 §2): turn issues from other tools into a DRAFT roadmap file for a person to
// review. Pure functions: the node layer fetches or reads the data, this layer shapes it. The input
// comes from outside the repo, so every string is cleaned to one inert line before it is written
// into a markdown table (it must never open a new row, heading or block).
import { parseIsoDay } from './dates.js';
import { parseStatus } from './status.js';
import type { Status } from './types.js';

export interface ImportItem {
  title: string;
  status: Status;
  /** The day it was finished, for `done`. */
  statusDate: string | null;
  /** `#12`, `PROJ-34`, or a URL. */
  ref: string | null;
  notes: string | null;
  owner: string | null;
  /** Key of the version (milestone, sprint, release) it belongs to, or null. */
  version: string | null;
}

export interface ImportVersion {
  key: string;
  title: string;
  goal: string | null;
  /** `YYYY-MM-DD → YYYY-MM-DD`, or null. */
  window: string | null;
}

export interface DraftInput {
  /** Where the data came from, for the heading, e.g. `GitHub acme/app` or `tasks.csv`. */
  source: string;
  today: string;
  versions: ImportVersion[];
  items: ImportItem[];
  /** Lines for the notes at the top of the draft (what was skipped, caps hit). */
  notes?: string[];
}

export interface DraftResult {
  text: string;
  versions: number;
  deliverables: number;
  parked: number;
}

export const MAX_TITLE = 200;
export const MAX_NOTES = 300;

/** One line of plain text that is safe inside a markdown table cell and an emphasis span. */
export function cleanText(value: unknown, max = MAX_TITLE): string {
  if (typeof value !== 'string') return '';
  const flat = value
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[*`\\]/g, '')
    .replace(/\|/g, '/')
    .replace(/^[#>\-+=~]+(?=\s|$)/, '')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

const SEMVER = /^v?(\d+\.\d+\.\d+)(?![\d.])/;

/** A status word from another tool mapped onto ours, with the original kept when it is a guess. */
export function mapStatus(word: string, closed = false): { status: Status; guessed: boolean } {
  const w = word.trim().toLowerCase();
  if (w === '') return { status: closed ? 'done' : 'todo', guessed: false };
  const known = parseStatus(w);
  if (!known.unknown) return { status: known.status, guessed: false };
  if (/^(closed|resolved|complete|completed|finished|shipped|released|merged|fixed)$/.test(w))
    return { status: 'done', guessed: false };
  if (/(progress|started|active|wip|working|development)/.test(w))
    return { status: 'doing', guessed: false };
  if (/(review|testing|qa|verify|verification)/.test(w))
    return { status: 'review', guessed: false };
  if (/(block|stuck|waiting|on hold|impeded)/.test(w)) return { status: 'blocked', guessed: false };
  if (/(backlog|icebox|later|wont|won't|will not|someday|deferred|cancel)/.test(w))
    return { status: 'parked', guessed: false };
  if (/^(open|new|to ?do|todo|planned|ready|unstarted|triage|selected)/.test(w))
    return { status: 'todo', guessed: false };
  return { status: closed ? 'done' : 'todo', guessed: true };
}

function statusCell(i: ImportItem): string {
  const day = i.statusDate !== null && parseIsoDay(i.statusDate) !== null ? i.statusDate : null;
  const ref = i.ref === null ? '' : cleanText(i.ref, 120);
  return [i.status, i.status === 'done' ? day : null, ref === '' ? null : `(${ref})`]
    .filter((x): x is string => x !== null && x !== '')
    .join(' ');
}

/** The draft roadmap (format v1) as markdown. */
export function buildDraft(input: DraftInput): DraftResult {
  // Give every imported version a semver: its own when the title starts with one, else 0.N.0.
  const used = new Set<string>();
  const semverOf = new Map<string, string>();
  for (const v of input.versions) {
    const m = SEMVER.exec(cleanText(v.title));
    if (m?.[1] !== undefined && !used.has(m[1])) {
      used.add(m[1]);
      semverOf.set(v.key, m[1]);
    }
  }
  let n = 1;
  for (const v of input.versions) {
    if (semverOf.has(v.key)) continue;
    while (used.has(`0.${n}.0`)) n++;
    used.add(`0.${n}.0`);
    semverOf.set(v.key, `0.${n}.0`);
  }

  const out: string[] = [
    '<!-- opmap: 1 -->',
    `# Draft: imported from ${cleanText(input.source, 120)}`,
    '',
    `> A draft written by \`opmap import\` on ${input.today}. It is not your roadmap yet: review it,`,
    "> fill in each version's Window and Exit, copy what you want into ROADMAP.md, then delete this file.",
    '> Text from the other tool was cleaned to plain single lines.',
  ];
  for (const note of input.notes ?? []) out.push(`> ${cleanText(note, 300)}`);
  out.push('');

  const byVersion = new Map<string, ImportItem[]>();
  const parked: ImportItem[] = [];
  for (const item of input.items) {
    if (item.version !== null && semverOf.has(item.version)) {
      const list = byVersion.get(item.version) ?? [];
      list.push(item);
      byVersion.set(item.version, list);
    } else parked.push(item);
  }

  let deliverables = 0;
  if (input.versions.length > 0) {
    out.push('## Versions', '');
    for (const v of input.versions) {
      const semver = semverOf.get(v.key) ?? '0.0.0';
      const title = cleanText(v.title.replace(SEMVER, '').replace(/^[\s—–:-]+/, '')) || 'Imported';
      out.push(`### v${semver} — ${title}`, '');
      if (v.window !== null) out.push(`**Window:** ${v.window}`);
      if (v.goal) out.push(`**Goal:** ${cleanText(v.goal, 300)}`);
      out.push('**Exit:** TODO: say what must be true for this version to be done.', '');
      const items = byVersion.get(v.key) ?? [];
      out.push('| ID | Deliverable | Status | Notes |', '| --- | --- | --- | --- |');
      items.forEach((it, i) => {
        deliverables++;
        const note = [it.notes, it.owner ? `owner ${it.owner}` : null]
          .filter((x): x is string => !!x)
          .map((x) => cleanText(x, MAX_NOTES))
          .filter((x) => x !== '')
          .join('; ');
        out.push(
          `| ${semver}-D${i + 1} | **${cleanText(it.title) || 'Untitled'}** | ${statusCell(it)} | ${note} |`,
        );
      });
      out.push('');
    }
  }

  if (parked.length > 0) {
    out.push(
      '## Parked',
      '',
      'Imported items that belong to no version.',
      '',
      '| Item | Why | Revisit when |',
      '| --- | --- | --- |',
    );
    for (const it of parked) {
      const why = [it.status === 'done' ? 'done' : null, it.notes, it.ref ? `from ${it.ref}` : null]
        .filter((x): x is string => !!x)
        .map((x) => cleanText(x, MAX_NOTES))
        .join('; ');
      out.push(`| ${cleanText(it.title) || 'Untitled'} | ${why || 'Imported, no version'} | |`);
    }
    out.push('');
  }

  return {
    text: `${out.join('\n').trimEnd()}\n`,
    versions: input.versions.length,
    deliverables,
    parked: parked.length,
  };
}

// ---------- GitHub ----------

export const GITHUB_MAX_ISSUES = 1000;

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const day = (v: unknown): string | null =>
  typeof v === 'string' && parseIsoDay(v.slice(0, 10)) !== null ? v.slice(0, 10) : null;

/** GitHub's milestones and issues (as returned by the REST API) shaped for the draft. */
export function fromGithub(
  repo: string,
  milestones: unknown,
  issues: unknown,
  options: { today: string; milestonesOnly?: boolean },
): DraftInput {
  const versions: ImportVersion[] = [];
  const notes: string[] = [];
  for (const raw of Array.isArray(milestones) ? milestones : []) {
    const m = obj(raw);
    if (!m || typeof m['number'] !== 'number') continue;
    const created = day(m['created_at']);
    const due = day(m['due_on']);
    versions.push({
      key: String(m['number']),
      title: cleanText(m['title']) || `Milestone ${String(m['number'])}`,
      goal: cleanText(m['description'], 300) || null,
      window: due === null ? null : `${created ?? due} → ${due}`,
    });
  }
  // Soonest due first; milestones without a date keep their order after the dated ones.
  versions.sort(
    (a, b) =>
      (a.window === null ? 1 : 0) - (b.window === null ? 1 : 0) ||
      (a.window ?? '').localeCompare(b.window ?? ''),
  );

  const items: ImportItem[] = [];
  let prs = 0;
  if (options.milestonesOnly !== true) {
    for (const raw of Array.isArray(issues) ? issues : []) {
      const i = obj(raw);
      if (!i || typeof i['number'] !== 'number') continue;
      if (i['pull_request'] !== undefined) {
        prs++;
        continue;
      }
      if (items.length >= GITHUB_MAX_ISSUES) {
        notes.push(`Only the first ${GITHUB_MAX_ISSUES} issues were imported.`);
        break;
      }
      const labels = (Array.isArray(i['labels']) ? i['labels'] : [])
        .map((l) => cleanText(obj(l)?.['name'] ?? l, 40))
        .filter((l) => l !== '');
      const closed = i['state'] === 'closed';
      const notPlanned = i['state_reason'] === 'not_planned';
      const labelStatus = labels
        .map((l) => mapStatus(l))
        .find((s) => !s.guessed && s.status !== 'todo');
      const status: Status = closed
        ? notPlanned
          ? 'parked'
          : 'done'
        : (labelStatus?.status ?? 'todo');
      const ms = obj(i['milestone']);
      const assignee = obj(i['assignee']);
      items.push({
        title: cleanText(i['title']),
        status,
        statusDate: closed ? day(i['closed_at']) : null,
        ref: `#${String(i['number'])}`,
        notes: labels.length > 0 ? `labels: ${labels.join(', ')}` : null,
        owner: assignee ? cleanText(assignee['login'], 40) || null : null,
        version: ms && typeof ms['number'] === 'number' ? String(ms['number']) : null,
      });
    }
  }
  if (prs > 0) notes.push(`${prs} pull request${prs === 1 ? ' was' : 's were'} left out.`);
  return { source: `GitHub ${repo}`, today: options.today, versions, items, notes };
}

// ---------- CSV ----------

export const CSV_MAX_ROWS = 5000;
export const CSV_MAX_BYTES = 5_000_000;

/** RFC 4180 CSV with a guessed delimiter (comma, semicolon or tab). Throws RangeError past the caps. */
export function parseCsv(input: string): string[][] {
  if (input.length > CSV_MAX_BYTES)
    throw new RangeError(`the file is bigger than ${CSV_MAX_BYTES} bytes`);
  const text = input.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string): number => first.split(c).length - 1;
  const delimiter = [',', ';', '\t'].reduce((best, c) => (count(c) > count(best) ? c : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = (): void => {
    row.push(cell);
    cell = '';
  };
  const endRow = (): void => {
    endCell();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
    if (rows.length > CSV_MAX_ROWS + 1) throw new RangeError(`more than ${CSV_MAX_ROWS} rows`);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      if (text.charAt(i + 1) === '\n') i++;
      endRow();
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

const COLUMN_NAMES = {
  title: ['title', 'summary', 'name', 'deliverable', 'task', 'issue', 'card name'],
  status: ['status', 'state', 'list', 'column', 'stage'],
  version: [
    'version',
    'milestone',
    'release',
    'sprint',
    'fix version',
    'fix versions',
    'epic',
    'iteration',
    'cycle',
  ],
  notes: ['notes', 'description', 'comment', 'comments'],
  owner: ['owner', 'assignee', 'assigned to', 'member'],
  ref: ['id', 'key', 'issue key', 'issue id', 'ref', 'identifier', 'number'],
  date: [
    'done',
    'done date',
    'closed',
    'closed at',
    'resolved',
    'completed',
    'completed at',
    'date',
  ],
} as const;

/** CSV rows (first row = header) shaped for the draft. */
export function fromCsv(file: string, rows: string[][], options: { today: string }): DraftInput {
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (names: readonly string[]): number => head.findIndex((h) => names.includes(h));
  const idx = {
    title: col(COLUMN_NAMES.title),
    status: col(COLUMN_NAMES.status),
    version: col(COLUMN_NAMES.version),
    notes: col(COLUMN_NAMES.notes),
    owner: col(COLUMN_NAMES.owner),
    ref: col(COLUMN_NAMES.ref),
    date: col(COLUMN_NAMES.date),
  };
  if (idx.title === -1) {
    throw new RangeError(
      `the first row needs a title column (one of: ${COLUMN_NAMES.title.join(', ')}); found: ${head.map((h) => cleanText(h, 30)).join(', ')}`,
    );
  }
  const cellOf = (r: string[], i: number): string => (i === -1 ? '' : (r[i] ?? '').trim());
  const versions = new Map<string, ImportVersion>();
  const items: ImportItem[] = [];
  const notes: string[] = [];
  let guessed = 0;
  for (const r of rows.slice(1)) {
    const title = cleanText(cellOf(r, idx.title));
    if (title === '') continue;
    const statusWord = cellOf(r, idx.status);
    const s = mapStatus(statusWord);
    if (s.guessed) guessed++;
    const versionName = cleanText(cellOf(r, idx.version), 80);
    if (versionName !== '' && !versions.has(versionName.toLowerCase())) {
      versions.set(versionName.toLowerCase(), {
        key: versionName.toLowerCase(),
        title: versionName,
        goal: null,
        window: null,
      });
    }
    const extra = s.guessed && statusWord !== '' ? `status was "${cleanText(statusWord, 40)}"` : '';
    items.push({
      title,
      status: s.status,
      statusDate: s.status === 'done' ? day(cellOf(r, idx.date)) : null,
      ref: cleanText(cellOf(r, idx.ref), 60) || null,
      notes:
        [cleanText(cellOf(r, idx.notes), MAX_NOTES), extra].filter((x) => x !== '').join('; ') ||
        null,
      owner: cleanText(cellOf(r, idx.owner), 40) || null,
      version: versionName === '' ? null : versionName.toLowerCase(),
    });
  }
  if (guessed > 0)
    notes.push(
      `${guessed} status word${guessed === 1 ? '' : 's'} were not recognised and became todo; the original is in the notes.`,
    );
  if (idx.version === -1)
    notes.push(
      'The file has no version column (milestone, sprint, release), so every row is in the Parked table.',
    );
  return {
    source: cleanText(file, 120),
    today: options.today,
    versions: [...versions.values()],
    items,
    notes,
  };
}
