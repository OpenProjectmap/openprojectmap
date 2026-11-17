// Cross-file checks (spec 02 §5, §9) that need the parsed, derived project.
import { diag } from './diagnostics.js';
import type { Diagnostic, ProjectData } from './types.js';

export interface ValidateOptions {
  /** Raise OPM-W305 for `done` deliverables with no date or reference. */
  requireDoneRef?: boolean;
}

const UNFINISHED = new Set(['todo', 'doing', 'review', 'blocked']);

export function validate(data: ProjectData, options: ValidateOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = [];

  if (data.now && data.derived.stale.isStale) {
    const reason = data.derived.stale.reason ?? 'it is out of date';
    out.push(
      diag(
        'OPM-W104',
        `The Now block is stale: ${reason}`,
        data.now.source.file,
        data.now.source.line,
      ),
    );
  }

  const datedReleases = data.releases.filter((r) => !r.unreleased && r.date !== null);
  for (const v of data.versions) {
    if (v.state === 'shipped') {
      const open = v.deliverables.filter((d) => UNFINISHED.has(d.status));
      if (open.length > 0) {
        const ids = open.map((d) => d.id).join(', ');
        out.push(
          diag(
            'OPM-W204',
            `Shipped version ${v.id} has unfinished deliverables: ${ids}`,
            v.source.file,
            v.source.line,
          ),
        );
      }
    }
    if (
      v.stateExplicit &&
      v.state === 'shipped' &&
      !datedReleases.some((r) => r.version === v.semver)
    ) {
      out.push(
        diag(
          'OPM-I601',
          `${v.id} is marked shipped but CHANGELOG.md has no release ${v.semver}`,
          v.source.file,
          v.source.line,
        ),
      );
    }
    if (options.requireDoneRef) {
      for (const d of v.deliverables) {
        if (d.status === 'done' && d.statusDate === null && d.ref === null) {
          out.push(
            diag(
              'OPM-W305',
              `Deliverable ${d.id} is done but has no date or reference`,
              d.source.file,
              d.source.line,
            ),
          );
        }
      }
    }
  }

  const known = new Set(data.versions.map((v) => v.semver));
  for (const r of datedReleases) {
    if (r.version !== null && !known.has(r.version)) {
      out.push(
        diag(
          'OPM-I602',
          `CHANGELOG.md has release ${r.version} but the roadmap has no such version`,
          r.source.file,
          r.source.line,
        ),
      );
    }
  }

  return out;
}
