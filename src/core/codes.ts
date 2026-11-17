// Diagnostic catalogue (spec 02 §9). Codes are stable: a retired code is never reused.
// A test keeps this table identical to the one in the spec.
import type { Diagnostic } from './types.js';

export interface CodeInfo {
  code: Diagnostic['code'];
  severity: Diagnostic['severity'];
  /** When the diagnostic is raised. */
  condition: string;
  /** How to fix it, imperative. */
  hint: string;
}

export const CATALOGUE: readonly CodeInfo[] = [
  {
    code: 'OPM-E001',
    severity: 'error',
    condition: 'Roadmap file not found or unreadable',
    hint: 'Set `docs.roadmap` in opmap.config.json or run `opmap init`',
  },
  {
    code: 'OPM-E002',
    severity: 'error',
    condition: 'Format marker version higher than supported',
    hint: 'Upgrade openprojectmap',
  },
  {
    code: 'OPM-E003',
    severity: 'error',
    condition: 'Config invalid (each problem listed)',
    hint: 'The message names the key and expected type',
  },
  {
    code: 'OPM-I001',
    severity: 'info',
    condition: 'No format marker',
    hint: 'Add `<!-- opmap: 1 -->` as the first line',
  },
  {
    code: 'OPM-I003',
    severity: 'info',
    condition: 'No H1 title',
    hint: 'Add `# <Project name>`',
  },
  {
    code: 'OPM-W101',
    severity: 'warning',
    condition: 'No Now block',
    hint: 'Add a `## Now` section (see template)',
  },
  {
    code: 'OPM-W102',
    severity: 'warning',
    condition: 'Now block without `Next step`',
    hint: 'Add `**Next step:** \u2026`',
  },
  {
    code: 'OPM-W103',
    severity: 'warning',
    condition: '`Current version` does not match any version',
    hint: 'Use an id such as `v0.2.0`',
  },
  {
    code: 'OPM-W104',
    severity: 'warning',
    condition: 'Now block stale (spec 03 \u00a73.6)',
    hint: 'Update the Now block and `**Updated:**`',
  },
  {
    code: 'OPM-W105',
    severity: 'warning',
    condition: '`Updated` is not an ISO date',
    hint: 'Use `YYYY-MM-DD`',
  },
  {
    code: 'OPM-W201',
    severity: 'warning',
    condition: 'Version without `Window`',
    hint: 'Add `**Window:** 2026-12-01 \u2192 2026-12-14`',
  },
  {
    code: 'OPM-W202',
    severity: 'warning',
    condition: 'Window not parseable',
    hint: 'Use ISO dates (spec 02 \u00a76)',
  },
  {
    code: 'OPM-W203',
    severity: 'warning',
    condition: 'Window start after end',
    hint: 'Swap the dates',
  },
  {
    code: 'OPM-W204',
    severity: 'warning',
    condition: 'Shipped version has unfinished deliverables',
    hint: 'Mark them `done` or `parked`',
  },
  {
    code: 'OPM-W205',
    severity: 'warning',
    condition: 'Status lines not in ascending date order',
    hint: 'Move the newest line to the end',
  },
  {
    code: 'OPM-W206',
    severity: 'warning',
    condition: 'Version without a deliverables table',
    hint: 'Add a table `ID | Deliverable | Status`',
  },
  {
    code: 'OPM-W207',
    severity: 'warning',
    condition: 'Version without `Exit`',
    hint: 'Add measurable exit criteria',
  },
  {
    code: 'OPM-I205',
    severity: 'info',
    condition: 'Version without `Goal`',
    hint: 'Add a one-sentence goal',
  },
  {
    code: 'OPM-W208',
    severity: 'warning',
    condition: 'Duplicate version id',
    hint: 'Merge or renumber the blocks',
  },
  {
    code: 'OPM-W301',
    severity: 'warning',
    condition: 'Unknown status word',
    hint: 'Use todo, doing, review, blocked, done or parked',
  },
  {
    code: 'OPM-W302',
    severity: 'warning',
    condition: 'Duplicate deliverable ID',
    hint: 'IDs are never reused: pick the next free number',
  },
  {
    code: 'OPM-W303',
    severity: 'warning',
    condition: 'Deliverable ID version differs from its block',
    hint: 'Move the row or fix the ID',
  },
  {
    code: 'OPM-W304',
    severity: 'warning',
    condition: "ID doesn't match `idPattern`",
    hint: 'e.g. `0.2.0-D7`',
  },
  {
    code: 'OPM-W305',
    severity: 'warning',
    condition: '`done` without a date or reference (only with `requireDoneRef: true`)',
    hint: 'Add `(#PR)` or a commit SHA',
  },
  {
    code: 'OPM-W401',
    severity: 'warning',
    condition: 'Version references an unknown milestone',
    hint: 'Add it to `## Milestones`',
  },
  {
    code: 'OPM-I402',
    severity: 'info',
    condition: 'Milestone that no version completes',
    hint: 'Add `**Milestone:** Mx` to a version',
  },
  {
    code: 'OPM-W501',
    severity: 'warning',
    condition: 'Open decision past its Needed-by date',
    hint: 'Decide, or set Status `defaulted`',
  },
  {
    code: 'OPM-W502',
    severity: 'warning',
    condition: 'Decision without a default',
    hint: 'Every open question needs a default',
  },
  {
    code: 'OPM-W503',
    severity: 'warning',
    condition: 'Duplicate decision or risk ID',
    hint: 'Renumber',
  },
  {
    code: 'OPM-W504',
    severity: 'warning',
    condition: 'Risk level not L/M/H',
    hint: 'Use L, M or H',
  },
  {
    code: 'OPM-W505',
    severity: 'warning',
    condition: 'Decision status not open, decided or defaulted',
    hint: 'Use open, decided or defaulted',
  },
  {
    code: 'OPM-I601',
    severity: 'info',
    condition: '`State: shipped` with no changelog release',
    hint: 'Add `## [x.y.z] - date` to CHANGELOG.md',
  },
  {
    code: 'OPM-I602',
    severity: 'info',
    condition: 'Changelog release with no version block',
    hint: 'Add the version to the roadmap',
  },
  {
    code: 'OPM-W701',
    severity: 'warning',
    condition: 'Table missing a required column',
    hint: 'The message names the column',
  },
  {
    code: 'OPM-I702',
    severity: 'info',
    condition: 'Table row has more cells than the header',
    hint: 'Check for an unescaped `|`',
  },
  {
    code: 'OPM-I801',
    severity: 'info',
    condition: 'Not a git repository, or git missing',
    hint: 'Git facts are skipped',
  },
  {
    code: 'OPM-I802',
    severity: 'info',
    condition: 'Shallow clone, so activity is incomplete',
    hint: 'Use `fetch-depth: 0` in CI',
  },
  {
    code: 'OPM-W803',
    severity: 'warning',
    condition: 'Configured branch not found',
    hint: 'Fix `git.branches` or run with `--fetch`',
  },
];

const BY_CODE = new Map<string, CodeInfo>(CATALOGUE.map((c) => [c.code, c]));

export function codeInfo(code: string): CodeInfo | undefined {
  return BY_CODE.get(code);
}

/** Fill in the hint from the catalogue for diagnostics that do not carry one. */
export function withHints(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.map((d) => {
    const hint = d.hint ?? BY_CODE.get(d.code)?.hint;
    return hint === undefined ? d : { ...d, hint };
  });
}
