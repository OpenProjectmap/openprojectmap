import { describe, expect, it } from 'vitest';
import { STATUSES, editDistance, parseStatus } from '../../src/core/status.js';

describe('parseStatus: vocabulary', () => {
  it('has the six statuses', () => {
    expect(STATUSES).toEqual(['todo', 'doing', 'review', 'blocked', 'done', 'parked']);
  });

  const cases: [string, string][] = [
    ['todo', 'todo'],
    ['to do', 'todo'],
    ['planned', 'todo'],
    ['not started', 'todo'],
    ['open', 'todo'],
    ['next', 'todo'],
    ['doing', 'doing'],
    ['in progress', 'doing'],
    ['WIP', 'doing'],
    ['started', 'doing'],
    ['active', 'doing'],
    ['building', 'doing'],
    ['review', 'review'],
    ['in review', 'review'],
    ['testing', 'review'],
    ['QA', 'review'],
    ['built', 'review'],
    ['staging', 'review'],
    ['blocked', 'blocked'],
    ['waiting', 'blocked'],
    ['on hold', 'blocked'],
    ['stuck', 'blocked'],
    ['done', 'done'],
    ['shipped', 'done'],
    ['merged', 'done'],
    ['complete', 'done'],
    ['completed', 'done'],
    ['✅', 'done'],
    ['[x]', 'done'],
    ['parked', 'parked'],
    ['deferred', 'parked'],
    ['cut', 'parked'],
    ['dropped', 'parked'],
    ["won't do", 'parked'],
    ['moved', 'parked'],
  ];
  it.each(cases)('maps %s to %s', (cell, status) => {
    expect(parseStatus(cell)).toMatchObject({ status, unknown: false, suggestion: null });
  });

  it('is case-insensitive and ignores emphasis and code ticks', () => {
    expect(parseStatus('**Done**').status).toBe('done');
    expect(parseStatus('_In Progress_').status).toBe('doing');
    expect(parseStatus('`review`').status).toBe('review');
  });
  it('prefers the longest phrase', () => {
    expect(parseStatus('completed').status).toBe('done');
    expect(parseStatus('in review').status).toBe('review');
  });
  it('needs a word boundary after a word alias but not after a symbol', () => {
    expect(parseStatus('donezo')).toMatchObject({ status: 'todo', unknown: true });
    expect(parseStatus('✅2026-12-01')).toMatchObject({ status: 'done', date: '2026-12-01' });
    expect(parseStatus('done.').status).toBe('done');
    expect(parseStatus('done, finally').status).toBe('done');
  });
  it('treats an empty cell as todo without a warning', () => {
    expect(parseStatus('  ')).toMatchObject({ status: 'todo', unknown: false, raw: '' });
  });
});

describe('parseStatus: date and ref', () => {
  it('reads a date and a PR ref', () => {
    expect(parseStatus('done 2026-12-01 (#14)')).toMatchObject({
      status: 'done',
      date: '2026-12-01',
      ref: '#14',
    });
  });
  it('skips impossible dates and reads a later valid one', () => {
    expect(parseStatus('done 2026-02-30 then 2026-03-02').date).toBe('2026-03-02');
    expect(parseStatus('done 2026-13-40').date).toBeNull();
  });
  it('reads a URL and a SHA', () => {
    expect(parseStatus('done (https://github.com/o/r/pull/9)').ref).toBe(
      'https://github.com/o/r/pull/9',
    );
    expect(parseStatus('done c9fe7d9').ref).toBe('c9fe7d9');
    expect(parseStatus('done 81f6300 (#5)').ref).toBe('81f6300');
  });
  it('does not take a plain word made of hex letters for a SHA', () => {
    expect(parseStatus('done decade').ref).toBeNull();
  });
  it('has no date or ref when there are none', () => {
    expect(parseStatus('doing')).toMatchObject({ date: null, ref: null });
  });
});

describe('parseStatus: unknown words', () => {
  it('maps to todo and suggests the closest status', () => {
    expect(parseStatus('dne')).toEqual({
      status: 'todo',
      raw: 'dne',
      date: null,
      ref: null,
      unknown: true,
      suggestion: 'done',
    });
    expect(parseStatus('inprogres').suggestion).toBe('doing');
    expect(parseStatus('blockd').suggestion).toBe('blocked');
  });
  it('has no suggestion when nothing is close', () => {
    expect(parseStatus('frobnicate')).toMatchObject({ unknown: true, suggestion: null });
  });
  it('handles a cell that starts with punctuation', () => {
    expect(parseStatus('????? maybe')).toMatchObject({ unknown: true, suggestion: null });
  });
  it('normalises a curly apostrophe for the suggestion', () => {
    expect(parseStatus('won’t dow').suggestion).toBe('parked');
  });
});

describe('editDistance', () => {
  it('measures edits and stops early', () => {
    expect(editDistance('done', 'done')).toBe(0);
    expect(editDistance('dne', 'done')).toBe(1);
    expect(editDistance('kitten', 'sitting', 5)).toBe(3);
    expect(editDistance('abc', 'abcdefg')).toBe(3);
    expect(editDistance('aaaa', 'bbbb')).toBe(3);
  });
});
