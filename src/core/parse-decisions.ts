// Decisions and risks parser (spec 02 §7). Looks for the sections in any source file, so the same
// function reads DECISIONS.md and a roadmap that carries the tables inline.
import { parseIsoDay } from './dates.js';
import type { ISODate } from './dates.js';
import { diag } from './diagnostics.js';
import { findColumns, plainText } from './parse-roadmap.js';
import type { Source } from './parse-roadmap.js';
import { scan } from './scan.js';
import type { TableBlock } from './scan.js';
import type { Decision, Diagnostic, Level, Risk, SourceRef } from './types.js';

export interface ParseDecisionsOptions {
  /** Today as a UTC date. Without it, no decision is marked overdue and OPM-W501 is not raised. */
  today?: ISODate;
}

export interface DecisionsParse {
  decisions: Decision[];
  risks: Risk[];
  diagnostics: Diagnostic[];
}

const DECISION_SECTIONS = new Set(['decisions', 'open decisions', 'needs your call']);
const RISK_SECTIONS = new Set(['risks']);

const DECISION_STATUS: Record<string, Decision['status']> = {
  open: 'open',
  decided: 'decided',
  closed: 'decided',
  done: 'decided',
  defaulted: 'defaulted',
  proceeding: 'defaulted',
};

const LEVEL: Record<string, Level> = {
  l: 'L',
  low: 'L',
  m: 'M',
  medium: 'M',
  med: 'M',
  h: 'H',
  high: 'H',
};
const WEIGHT: Record<Level, number> = { L: 1, M: 2, H: 3 };
const CLOSED_RISK = new Set(['closed', 'done', 'resolved', 'mitigated']);

/** Split an Options cell on `·`, `/` or `;`. */
export function splitOptions(cell: string): string[] {
  return cell
    .split(/[·/;]/)
    .map((o) => o.trim())
    .filter((o) => o !== '');
}

function firstWord(cell: string): string {
  return plainText(cell).toLowerCase().split(/\s+/, 1)[0] ?? '';
}

export function parseDecisions(
  source: Source,
  options: ParseDecisionsOptions = {},
): DecisionsParse {
  const file = source.path;
  const { blocks } = scan(source.text);
  const diagnostics: Diagnostic[] = [];
  const decisions: Decision[] = [];
  const risks: Risk[] = [];
  const decisionIds = new Map<string, number>();
  const riskIds = new Map<string, number>();
  const ref = (line: number): SourceRef => ({ file, line });
  const cellAt = (row: string[], i: number | undefined): string =>
    i === undefined ? '' : (row[i] ?? '').trim();

  let kind: 'decisions' | 'risks' | null = null;
  for (const block of blocks) {
    if (block.type === 'heading') {
      if (block.level <= 2) {
        const name = plainText(block.text).toLowerCase().replace(/\s+/g, ' ');
        kind =
          block.level === 2
            ? DECISION_SECTIONS.has(name)
              ? 'decisions'
              : RISK_SECTIONS.has(name)
                ? 'risks'
                : null
            : null;
      }
      continue;
    }
    if (block.type !== 'table' || kind === null) continue;
    if (kind === 'decisions') readDecisions(block);
    else readRisks(block);
  }
  return { decisions, risks, diagnostics };

  function readDecisions(table: TableBlock): void {
    const cols = findColumns(table.head, {
      id: ['id'],
      question: ['decision', 'question'],
      options: ['options'],
      default: ['default', 'proposed default'],
      neededBy: ['needed by'],
      status: ['status'],
      outcome: ['outcome'],
    });
    let ok = true;
    for (const [k, name] of [
      ['id', 'ID'],
      ['question', 'Decision'],
      ['default', 'Default'],
      ['status', 'Status'],
    ] as const) {
      if (cols[k] === undefined) {
        ok = false;
        diagnostics.push(
          diag('OPM-W701', `Decisions table is missing the ${name} column`, file, table.line),
        );
      }
    }
    if (!ok) return;
    table.rows.forEach((row, r) => {
      const line = table.rowLines[r] ?? table.line;
      const id = plainText(cellAt(row, cols.id));
      if (id === '') return;
      const first = decisionIds.get(id);
      if (first !== undefined) {
        diagnostics.push(
          diag('OPM-W503', `Duplicate decision ID ${id} (first on line ${first})`, file, line),
        );
      } else {
        decisionIds.set(id, line);
      }
      const statusCell = cellAt(row, cols.status);
      const status = DECISION_STATUS[firstWord(statusCell)];
      if (status === undefined && statusCell !== '') {
        diagnostics.push(
          diag('OPM-W505', `Unknown status "${statusCell}" for decision ${id}`, file, line),
        );
      }
      const def = cellAt(row, cols.default);
      if (def === '')
        diagnostics.push(diag('OPM-W502', `Decision ${id} has no default`, file, line));
      const neededBy = parseIsoDay(cellAt(row, cols.neededBy));
      const resolved = status ?? 'open';
      const overdue =
        resolved === 'open' &&
        neededBy !== null &&
        options.today !== undefined &&
        neededBy < options.today;
      if (overdue) {
        diagnostics.push(
          diag(
            'OPM-W501',
            `Decision ${id} was needed by ${neededBy} and is still open`,
            file,
            line,
          ),
        );
      }
      decisions.push({
        id,
        question: cellAt(row, cols.question),
        options: splitOptions(cellAt(row, cols.options)),
        default: def,
        neededBy,
        status: resolved,
        outcome: cellAt(row, cols.outcome) || null,
        overdue,
        source: ref(line),
      });
    });
  }

  function readRisks(table: TableBlock): void {
    const cols = findColumns(table.head, {
      id: ['id'],
      risk: ['risk'],
      likelihood: ['likelihood'],
      impact: ['impact'],
      mitigation: ['mitigation'],
      owner: ['owner'],
      status: ['status'],
    });
    let ok = true;
    for (const [k, name] of [
      ['id', 'ID'],
      ['risk', 'Risk'],
      ['likelihood', 'Likelihood'],
      ['impact', 'Impact'],
    ] as const) {
      if (cols[k] === undefined) {
        ok = false;
        diagnostics.push(
          diag('OPM-W701', `Risks table is missing the ${name} column`, file, table.line),
        );
      }
    }
    if (!ok) return;
    table.rows.forEach((row, r) => {
      const line = table.rowLines[r] ?? table.line;
      const id = plainText(cellAt(row, cols.id));
      if (id === '') return;
      const first = riskIds.get(id);
      if (first !== undefined) {
        diagnostics.push(
          diag('OPM-W503', `Duplicate risk ID ${id} (first on line ${first})`, file, line),
        );
      } else {
        riskIds.set(id, line);
      }
      const level = (name: string, cell: string): Level | null => {
        const l = LEVEL[plainText(cell).toLowerCase()];
        if (l === undefined) {
          diagnostics.push(
            diag(
              'OPM-W504',
              `Risk ${id} has ${name} "${cell}", which is not L, M or H`,
              file,
              line,
            ),
          );
          return null;
        }
        return l;
      };
      const likelihood = level('likelihood', cellAt(row, cols.likelihood));
      const impact = level('impact', cellAt(row, cols.impact));
      risks.push({
        id,
        risk: cellAt(row, cols.risk),
        likelihood,
        impact,
        score: likelihood && impact ? WEIGHT[likelihood] * WEIGHT[impact] : 0,
        mitigation: cellAt(row, cols.mitigation) || null,
        owner: cellAt(row, cols.owner) || null,
        open: !CLOSED_RISK.has(firstWord(cellAt(row, cols.status))),
        source: ref(line),
      });
    });
  }
}
