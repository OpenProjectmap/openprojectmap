// Diagnostic output (spec 04 §4): text, json and GitHub workflow annotations.
import type { Diagnostic } from '../core/types.js';

export type Format = 'text' | 'json' | 'github';

export interface Summary {
  errors: number;
  warnings: number;
  info: number;
}

export function summarize(diagnostics: readonly Diagnostic[]): Summary {
  const s: Summary = { errors: 0, warnings: 0, info: 0 };
  for (const d of diagnostics) {
    if (d.severity === 'error') s.errors++;
    else if (d.severity === 'warning') s.warnings++;
    else s.info++;
  }
  return s;
}

const COLORS = { red: '31', yellow: '33', cyan: '36', dim: '2', green: '32', bold: '1' } as const;
export type Paint = (color: keyof typeof COLORS, text: string) => string;

export function painter(enabled: boolean): Paint {
  return (color, text) => (enabled ? `\u001b[${COLORS[color]}m${text}\u001b[0m` : text);
}

/** Escape a workflow-command message: `%`, CR and LF. */
export function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escape a workflow-command property: the same plus `:` and `,`. */
export function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

const GITHUB_LEVEL = { error: 'error', warning: 'warning', info: 'notice' } as const;

export function formatGithub(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map((d) => {
      const props = [
        d.file !== undefined ? `file=${escapeProperty(d.file)}` : '',
        d.line !== undefined ? `line=${d.line}` : '',
        d.column !== undefined ? `col=${d.column}` : '',
        `title=${escapeProperty(d.code)}`,
      ].filter((p) => p !== '');
      const message = d.hint ? `${d.message}. Hint: ${d.hint}` : d.message;
      return `::${GITHUB_LEVEL[d.severity]} ${props.join(',')}::${escapeData(message)}`;
    })
    .join('\n');
}

export function formatJson(diagnostics: readonly Diagnostic[]): string {
  return JSON.stringify({ diagnostics, summary: summarize(diagnostics) }, null, 2);
}

export function summaryLine(s: Summary, paint: Paint, failed: boolean): string {
  const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
  const text = `${plural(s.errors, 'error')}, ${plural(s.warnings, 'warning')}${s.info > 0 ? `, ${s.info} info` : ''}`;
  return failed ? paint('red', `✖ ${text}`) : paint('green', `✔ ${text}`);
}

export function formatText(
  diagnostics: readonly Diagnostic[],
  paint: Paint,
  failed: boolean,
  quiet: boolean,
): string {
  const shown = quiet ? diagnostics.filter((d) => d.severity === 'error') : diagnostics;
  const lines: string[] = [];
  for (const d of shown) {
    const where =
      d.file === undefined
        ? ''
        : `${d.file}${d.line === undefined ? '' : `:${d.line}${d.column === undefined ? '' : `:${d.column}`}`}`;
    const color = d.severity === 'error' ? 'red' : d.severity === 'warning' ? 'yellow' : 'cyan';
    lines.push(
      `${where === '' ? '' : `${where}  `}${paint(color, d.severity)}  ${d.code}  ${d.message}`,
    );
    if (d.hint) lines.push(paint('dim', `    hint: ${d.hint}`));
  }
  if (!quiet || diagnostics.some((d) => d.severity === 'error'))
    lines.push(summaryLine(summarize(diagnostics), paint, failed));
  return lines.join('\n');
}

export function formatDiagnostics(
  format: Format,
  diagnostics: readonly Diagnostic[],
  paint: Paint,
  failed: boolean,
  quiet: boolean,
): string {
  if (format === 'json') return formatJson(diagnostics);
  if (format === 'github')
    return formatGithub(quiet ? diagnostics.filter((d) => d.severity === 'error') : diagnostics);
  return formatText(diagnostics, paint, failed, quiet);
}
