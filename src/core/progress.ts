// Progress counting (spec 03 §3.1): parked items are left out of the total.
import type { Deliverable, Progress, Status } from './types.js';

const ZERO: Record<Status, number> = {
  todo: 0,
  doing: 0,
  review: 0,
  blocked: 0,
  done: 0,
  parked: 0,
};

export function emptyProgress(): Progress {
  return { done: 0, total: 0, parked: 0, byStatus: { ...ZERO }, pct: 0 };
}

export function progressOf(deliverables: readonly Pick<Deliverable, 'status'>[]): Progress {
  const byStatus = { ...ZERO };
  for (const d of deliverables) byStatus[d.status]++;
  return finish(byStatus);
}

/** Add progress values together (used for "overall" and milestones). */
export function sumProgress(parts: readonly Progress[]): Progress {
  const byStatus = { ...ZERO };
  for (const p of parts) {
    for (const s of Object.keys(byStatus) as Status[]) byStatus[s] += p.byStatus[s];
  }
  return finish(byStatus);
}

function finish(byStatus: Record<Status, number>): Progress {
  const parked = byStatus.parked;
  const total = byStatus.todo + byStatus.doing + byStatus.review + byStatus.blocked + byStatus.done;
  const done = byStatus.done;
  return { done, total, parked, byStatus, pct: total === 0 ? 0 : Math.round((100 * done) / total) };
}
