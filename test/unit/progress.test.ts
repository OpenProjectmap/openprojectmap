import { describe, expect, it } from 'vitest';
import { emptyProgress, progressOf, sumProgress } from '../../src/core/progress.js';

describe('progress', () => {
  it('is empty for no deliverables', () => {
    expect(progressOf([])).toEqual(emptyProgress());
    expect(emptyProgress().pct).toBe(0);
  });
  it('leaves parked items out of the total and counts review as not done', () => {
    const p = progressOf([
      { status: 'done' },
      { status: 'review' },
      { status: 'parked' },
      { status: 'todo' },
    ]);
    expect(p).toMatchObject({ done: 1, total: 3, parked: 1, pct: 33 });
    expect(p.byStatus).toEqual({ todo: 1, doing: 0, review: 1, blocked: 0, done: 1, parked: 1 });
  });
  it('is 0% when everything is parked', () => {
    expect(progressOf([{ status: 'parked' }])).toMatchObject({ total: 0, parked: 1, pct: 0 });
  });
  it('sums several progress values', () => {
    const a = progressOf([{ status: 'done' }, { status: 'done' }]);
    const b = progressOf([{ status: 'todo' }, { status: 'parked' }]);
    expect(sumProgress([a, b])).toMatchObject({ done: 2, total: 3, parked: 1, pct: 67 });
    expect(sumProgress([])).toEqual(emptyProgress());
  });
});
