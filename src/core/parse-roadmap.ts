// Roadmap parser (spec 02 §3). Walks the blocks from `scan` with a small section state machine.
// Pure: no node:* imports, no clock.
import { parseIsoDay, parseWindow } from './dates.js';
import { diag } from './diagnostics.js';
import { progressOf } from './progress.js';
import { scan } from './scan.js';
import type { Block, TableBlock } from './scan.js';
import { parseStatus } from './status.js';
import type {
  Deliverable,
  Diagnostic,
  Milestone,
  NowBlock,
  ParkedItem,
  Phase,
  SourceRef,
  StatusLine,
  Version,
  VersionState,
} from './types.js';

export interface Source {
  /** Display path: repo-relative, `/` separated. */
  path: string;
  text: string;
}

export interface ParseRoadmapOptions {
  /** Deliverable id pattern. Default: `^(?<version>\d+\.\d+\.\d+)-D\d+$`. */
  idPattern?: RegExp;
}

export interface RoadmapParse {
  /** The first H1, or null. */
  title: string | null;
  now: NowBlock | null;
  phases: Phase[];
  versions: Version[];
  milestones: Milestone[];
  parked: ParkedItem[];
  diagnostics: Diagnostic[];
}

export const SUPPORTED_FORMAT = 1;
export const DEFAULT_ID_PATTERN = /^(?<version>\d+\.\d+\.\d+)-D\d+$/;

const NOW_NAMES = new Set(['now', 'status', 'current state']);
const MILESTONE_NAMES = new Set(['milestones']);
const PARKED_NAMES = new Set(['parked', 'not doing', 'parking lot', 'later']);
const OTHER_KNOWN_NAMES = new Set(['decisions', 'open decisions', 'needs your call', 'risks']);
const PHASE_RE = /^Phase +([\w.]+) +[—–-] +(.+)$/;
const VERSION_RE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) +[—–-] +(.+)$/;
const TITLE_MAX = 96;

/** Remove markdown emphasis and code ticks for matching names. */
export function plainText(s: string): string {
  return s.replace(/[*_`]/g, '').trim();
}

function norm(s: string): string {
  return plainText(s).toLowerCase().replace(/\s+/g, ' ');
}

/** Map header names to column indexes. A name may have several aliases. */
export function findColumns<K extends string>(
  head: readonly string[],
  wanted: Record<K, readonly string[]>,
): Partial<Record<K, number>> {
  const found: Partial<Record<K, number>> = {};
  const names = head.map(norm);
  for (const key of Object.keys(wanted) as K[]) {
    const aliases = wanted[key].map((a) => a.toLowerCase());
    const i = names.findIndex((n) => aliases.includes(n));
    if (i !== -1) found[key] = i;
  }
  return found;
}

function titleOf(cell: string): string {
  const bold = /\*\*(.+?)\*\*/.exec(cell);
  const t = (bold?.[1] ?? cell).trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
}

function versionKey(v: string): string {
  return v.trim().replace(/^v/i, '').toLowerCase();
}

interface VersionDraft {
  version: Version;
  /** `table` once a deliverables table was seen; `window-bad` when Window was unparseable. */
  flags: Set<'table' | 'window-bad'>;
}

interface Section {
  kind: 'now' | 'milestones' | 'parked' | 'phase' | 'known' | 'other';
  heading: Extract<Block, { type: 'heading' }>;
  phaseId: string | null;
}

export function parseRoadmap(source: Source, options: ParseRoadmapOptions = {}): RoadmapParse {
  const idPattern = options.idPattern ?? DEFAULT_ID_PATTERN;
  const file = source.path;
  const { blocks, marker, notes } = scan(source.text);
  const diagnostics: Diagnostic[] = [];
  const ref = (line: number): SourceRef => ({ file, line });

  for (const n of notes) diagnostics.push(diag(n.code, n.message, file, n.line, n.column));

  if (marker === null) {
    diagnostics.push(
      diag('OPM-I001', 'No format marker `<!-- opmap: 1 -->` found; assuming version 1', file, 1),
    );
  } else if (marker.version > SUPPORTED_FORMAT) {
    diagnostics.push(
      diag(
        'OPM-E002',
        `Format marker is version ${marker.version} but this tool reads version ${SUPPORTED_FORMAT}`,
        file,
        marker.line,
      ),
    );
  }

  let title: string | null = null;
  let now: NowBlock | null = null;
  const phases: Phase[] = [];
  const versions: Version[] = [];
  const milestones: Milestone[] = [];
  const parked: ParkedItem[] = [];

  let section: Section | null = null;
  let current: VersionDraft | null = null;
  let phase: Phase | null = null;
  const versionIds = new Map<string, number>();
  const deliverableIds = new Map<string, number>();

  const closeVersion = (): void => {
    if (!current) return;
    const v = current.version;
    v.progress = progressOf(v.deliverables);
    checkVersion(current);
    current = null;
  };

  const checkVersion = (draft: VersionDraft): void => {
    const v = draft.version;
    const line = v.source.line;
    if (v.window === null && !draft.flags.has('window-bad')) {
      diagnostics.push(diag('OPM-W201', `Version ${v.id} has no Window`, file, line));
    }
    if (v.goal === null)
      diagnostics.push(diag('OPM-I205', `Version ${v.id} has no Goal`, file, line));
    if (v.exit === null)
      diagnostics.push(diag('OPM-W207', `Version ${v.id} has no Exit`, file, line));
    // Status lines must be in ascending date order: dated lines compared with the previous dated one.
    let prev: string | null = null;
    for (const s of v.statusLines) {
      if (s.date === null) continue;
      if (prev !== null && s.date < prev) {
        diagnostics.push(
          diag(
            'OPM-W205',
            `Status line ${s.date} comes after ${prev} in ${v.id}`,
            file,
            s.source.line,
          ),
        );
      }
      prev = s.date;
    }
    if (!draft.flags.has('table')) {
      diagnostics.push(diag('OPM-W206', `Version ${v.id} has no deliverables table`, file, line));
    }
  };

  const fieldTarget = (): 'now' | 'version' | null => {
    if (current) return 'version';
    if (section?.kind === 'now') return 'now';
    return null;
  };

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (block.level === 1) {
        if (title === null) title = plainText(block.text);
        continue;
      }
      if (block.level === 2) {
        closeVersion();
        const name = norm(block.text);
        const p = PHASE_RE.exec(block.text.trim());
        if (p) {
          phase = {
            id: p[1] ?? '',
            title: (p[2] ?? '').trim(),
            versionIds: [],
            source: ref(block.line),
          };
          phases.push(phase);
          section = { kind: 'phase', heading: block, phaseId: phase.id };
        } else {
          phase = null;
          const kind = NOW_NAMES.has(name)
            ? 'now'
            : MILESTONE_NAMES.has(name)
              ? 'milestones'
              : PARKED_NAMES.has(name)
                ? 'parked'
                : OTHER_KNOWN_NAMES.has(name)
                  ? 'known'
                  : 'other';
          section = { kind, heading: block, phaseId: null };
          if (kind === 'now' && now === null) {
            now = {
              updated: null,
              currentVersion: null,
              nextStep: null,
              why: null,
              target: null,
              facts: [],
              source: ref(block.line),
            };
          }
        }
        continue;
      }
      if (block.level === 3) {
        closeVersion();
        const m =
          section &&
          section.kind !== 'now' &&
          section.kind !== 'milestones' &&
          section.kind !== 'parked' &&
          section.kind !== 'known'
            ? VERSION_RE.exec(block.text.trim())
            : null;
        if (m && section) {
          const semver = m[1] ?? '';
          const id = `v${semver}`;
          if (versionIds.has(id)) {
            diagnostics.push(
              diag(
                'OPM-W208',
                `Duplicate version ${id} (first on line ${versionIds.get(id)})`,
                file,
                block.line,
              ),
            );
          } else {
            versionIds.set(id, block.line);
          }
          const version: Version = {
            id,
            semver,
            title: plainText(m[2] ?? ''),
            phaseId: section.phaseId,
            window: null,
            milestoneId: null,
            goal: null,
            exit: null,
            state: 'planned',
            stateExplicit: false,
            statusLines: [],
            deliverables: [],
            progress: progressOf([]),
            source: ref(block.line),
          };
          versions.push(version);
          phase?.versionIds.push(id);
          current = { version, flags: new Set() };
        }
        continue;
      }
      continue; // H4+ stay inside the current block
    }

    if (block.type === 'field') {
      const target = fieldTarget();
      if (target === 'now' && now) {
        applyNowField(now, block.key, block.value, block.line);
      } else if (target === 'version' && current) {
        applyVersionField(current, block.key, block.value, block.line);
      }
      continue;
    }

    if (block.type === 'table') {
      if (current) {
        readDeliverables(current, block);
      } else if (section?.kind === 'milestones') {
        readMilestones(block);
      } else if (section?.kind === 'parked') {
        readParked(block);
      }
    }
  }
  closeVersion();

  // Cross-checks that need the whole file.
  if (now === null) {
    diagnostics.push(diag('OPM-W101', 'No Now block found', file, 1));
  } else {
    if (now.nextStep === null)
      diagnostics.push(diag('OPM-W102', 'The Now block has no Next step', file, now.source.line));
    if (now.currentVersion !== null) {
      const want = versionKey(now.currentVersion);
      if (!versions.some((v) => versionKey(v.id) === want)) {
        diagnostics.push(
          diag(
            'OPM-W103',
            `Current version "${now.currentVersion}" does not match any version`,
            file,
            now.source.line,
          ),
        );
      }
    }
  }
  const milestoneIds = new Set(milestones.map((m) => m.id));
  for (const v of versions) {
    if (v.milestoneId !== null) {
      if (!milestoneIds.has(v.milestoneId)) {
        diagnostics.push(
          diag(
            'OPM-W401',
            `Version ${v.id} names unknown milestone ${v.milestoneId}`,
            file,
            v.source.line,
          ),
        );
      } else {
        milestones.find((m) => m.id === v.milestoneId)?.versionIds.push(v.id);
      }
    }
  }
  for (const m of milestones) {
    if (m.versionIds.length === 0) {
      diagnostics.push(
        diag('OPM-I402', `No version completes milestone ${m.id}`, file, m.source.line),
      );
    }
  }

  return { title, now, phases, versions, milestones, parked, diagnostics };

  // --- helpers that close over the parse state ---

  function applyNowField(n: NowBlock, rawKey: string, value: string, line: number): void {
    const key = rawKey.toLowerCase();
    switch (key) {
      case 'updated':
      case 'last updated': {
        const d = parseIsoDay(value);
        if (d === null) {
          diagnostics.push(
            diag('OPM-W105', `Updated "${value}" is not an ISO date (YYYY-MM-DD)`, file, line),
          );
        }
        n.updated = d;
        return;
      }
      case 'current version':
      case 'version':
        n.currentVersion = value;
        return;
      case 'next step':
      case 'next':
        n.nextStep = value;
        return;
      case 'why':
        n.why = value;
        return;
      case 'target':
      case 'launch target':
        n.target = value;
        return;
      default:
        n.facts.push({ key: rawKey, value });
    }
  }

  function applyVersionField(
    draft: VersionDraft,
    rawKey: string,
    value: string,
    line: number,
  ): void {
    const v = draft.version;
    const key = rawKey.toLowerCase();
    if (key === 'window') {
      const r = parseWindow(value);
      if (r.window === null) {
        draft.flags.add('window-bad');
        diagnostics.push(diag('OPM-W202', `Window "${value}" is not a date range`, file, line));
      } else {
        v.window = r.window;
        if (r.problem === 'start-after-end') {
          diagnostics.push(
            diag(
              'OPM-W203',
              `Window starts (${r.window.start}) after it ends (${r.window.end})`,
              file,
              line,
            ),
          );
        }
      }
    } else if (key === 'milestone') {
      v.milestoneId = value.trim() === '' ? null : value.trim();
    } else if (key === 'state') {
      const s = value.trim().toLowerCase();
      if (s === 'planned' || s === 'active' || s === 'shipped') {
        v.state = s as VersionState;
        v.stateExplicit = true;
      }
    } else if (key === 'goal') {
      v.goal = value;
    } else if (key === 'exit') {
      v.exit = value;
    } else {
      const m = /^status(?: +(\S+))?$/.exec(key);
      if (m) {
        const date = m[1] === undefined ? null : parseIsoDay(m[1]);
        const sl: StatusLine = { date, text: value, source: ref(line) };
        v.statusLines.push(sl);
      }
    }
  }

  function readDeliverables(draft: VersionDraft, table: TableBlock): void {
    const cols = findColumns(table.head, {
      id: ['id'],
      title: ['deliverable', 'title', 'what'],
      status: ['status'],
      owner: ['owner'],
      ref: ['ref', 'pr'],
      notes: ['notes'],
    });
    const required = ['id', 'title', 'status'] as const;
    const present = required.filter((k) => cols[k] !== undefined);
    if (present.length < 2) return; // not a deliverables table
    const v = draft.version;
    draft.flags.add('table');
    const missing = required.filter((k) => cols[k] === undefined);
    if (missing.length > 0) {
      const names = { id: 'ID', title: 'Deliverable', status: 'Status' } as const;
      for (const k of missing) {
        diagnostics.push(
          diag('OPM-W701', `Table is missing the ${names[k]} column`, file, table.line),
        );
      }
      return;
    }
    const known = new Set(Object.values(cols));
    const idCol = cols.id ?? 0;
    const titleCol = cols.title ?? 0;
    const statusCol = cols.status ?? 0;
    table.rows.forEach((row, r) => {
      const line = table.rowLines[r] ?? table.line;
      const id = plainText(row[idCol] ?? '');
      if (id === '') return;
      const detail = (row[titleCol] ?? '').trim();
      const ps = parseStatus(row[statusCol] ?? '');
      if (ps.unknown) {
        const hint = ps.suggestion ? `; did you mean "${ps.suggestion}"?` : '';
        diagnostics.push(
          diag('OPM-W301', `Unknown status "${ps.raw}" for ${id}${hint}`, file, line),
        );
      }
      const pattern = idPattern.exec(id);
      if (pattern === null) {
        diagnostics.push(
          diag('OPM-W304', `Deliverable ID "${id}" does not match the id pattern`, file, line),
        );
      } else {
        const idVersion = pattern.groups?.version;
        if (idVersion !== undefined && idVersion !== v.semver) {
          diagnostics.push(
            diag(
              'OPM-W303',
              `Deliverable ${id} is listed under ${v.id}, but its ID says ${idVersion}`,
              file,
              line,
            ),
          );
        }
      }
      const seen = deliverableIds.get(id);
      if (seen !== undefined) {
        diagnostics.push(
          diag('OPM-W302', `Duplicate deliverable ID ${id} (first on line ${seen})`, file, line),
        );
      } else {
        deliverableIds.set(id, line);
      }
      const cell = (i: number | undefined): string =>
        i === undefined ? '' : (row[i] ?? '').trim();
      const refCell = cell(cols.ref);
      const extra: Record<string, string> = {};
      table.head.forEach((h, i) => {
        const value = (row[i] ?? '').trim();
        if (!known.has(i) && value !== '' && plainText(h) !== '') extra[plainText(h)] = value;
      });
      const deliverable: Deliverable = {
        id,
        title: titleOf(detail),
        detail,
        status: ps.status,
        statusRaw: ps.raw,
        statusDate: ps.date,
        owner: cell(cols.owner) || null,
        ref: refCell || ps.ref,
        notes: cell(cols.notes) || null,
        extra,
        versionId: v.id,
        source: ref(line),
      };
      v.deliverables.push(deliverable);
    });
  }

  function readMilestones(table: TableBlock): void {
    const cols = findColumns(table.head, {
      id: ['id'],
      name: ['milestone', 'name'],
      when: ['reached when', 'definition'],
      on: ['reached on'],
      depends: ['depends on'],
    });
    const names = { id: 'ID', name: 'Milestone', when: 'Reached when' } as const;
    let ok = true;
    for (const k of ['id', 'name', 'when'] as const) {
      if (cols[k] === undefined) {
        ok = false;
        diagnostics.push(
          diag('OPM-W701', `Milestones table is missing the ${names[k]} column`, file, table.line),
        );
      }
    }
    if (!ok) return;
    const cell = (row: string[], i: number | undefined): string =>
      i === undefined ? '' : (row[i] ?? '').trim();
    table.rows.forEach((row, r) => {
      const id = plainText(cell(row, cols.id));
      if (id === '') return;
      milestones.push({
        id,
        name: plainText(cell(row, cols.name)),
        reachedWhen: cell(row, cols.when),
        reachedOn: parseIsoDay(cell(row, cols.on)),
        dependsOn: cell(row, cols.depends) || null,
        versionIds: [],
        source: ref(table.rowLines[r] ?? table.line),
      });
    });
  }

  function readParked(table: TableBlock): void {
    const cols = findColumns(table.head, {
      item: ['item'],
      why: ['why'],
      revisit: ['revisit when'],
    });
    let ok = true;
    for (const [k, name] of [
      ['item', 'Item'],
      ['why', 'Why'],
    ] as const) {
      if (cols[k] === undefined) {
        ok = false;
        diagnostics.push(
          diag('OPM-W701', `Parked table is missing the ${name} column`, file, table.line),
        );
      }
    }
    if (!ok) return;
    table.rows.forEach((row, r) => {
      const item = (row[cols.item ?? 0] ?? '').trim();
      if (item === '') return;
      parked.push({
        item,
        why: (row[cols.why ?? 0] ?? '').trim(),
        revisitWhen: cols.revisit === undefined ? null : (row[cols.revisit] ?? '').trim() || null,
        source: ref(table.rowLines[r] ?? table.line),
      });
    });
  }
}
