// Builds diagnostics. The severity comes from the letter in the code (E, W or I). Hints come from
// the catalogue in `codes.ts` (0.1.0-D7), which fills them in when it validates a project.
import type { Diagnostic, Severity } from './types.js';

export type DiagnosticCode = Diagnostic['code'];

const SEVERITY: Record<string, Severity> = { E: 'error', W: 'warning', I: 'info' };

export function severityOf(code: DiagnosticCode): Severity {
  return SEVERITY[code.charAt(4)] ?? 'warning';
}

export function diag(
  code: DiagnosticCode,
  message: string,
  file: string | undefined,
  line?: number,
  column?: number,
): Diagnostic {
  const d: Diagnostic = { code, severity: severityOf(code), message };
  if (file !== undefined) d.file = file;
  if (line !== undefined) d.line = line;
  if (column !== undefined) d.column = column;
  return d;
}
