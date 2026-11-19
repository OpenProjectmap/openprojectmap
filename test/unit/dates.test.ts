import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInMonth,
  diffDays,
  formatDate,
  fromDayNumber,
  isLeapYear,
  parseIsoDay,
  parsePoint,
  parseWindow,
  toDayNumber,
} from '../../src/core/dates.js';

describe('calendar helpers', () => {
  it('knows leap years', () => {
    expect([1900, 2000, 2024, 2026, 2100].map(isLeapYear)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });
  it('knows month lengths', () => {
    expect([1, 2, 4, 12].map((m) => daysInMonth(2027, m))).toEqual([31, 28, 30, 31]);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2028, 13)).toBe(0);
  });
  it('formats with padding', () => {
    expect(formatDate(7, 3, 9)).toBe('0007-03-09');
  });
  it('validates ISO days', () => {
    expect(parseIsoDay(' 2028-02-29 ')).toBe('2028-02-29');
    for (const bad of [
      '2027-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '2026-4-1',
      '0000-01-01',
      'x',
    ]) {
      expect(parseIsoDay(bad)).toBeNull();
    }
  });
  it('converts to and from day numbers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('2000-03-01')).toBe(11017);
    expect(fromDayNumber(0)).toBe('1970-01-01');
    expect(fromDayNumber(11016)).toBe('2000-02-29');
    expect(fromDayNumber(-1)).toBe('1969-12-31');
  });
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(diffDays('2026-11-17', '2026-11-24')).toBe(7);
    expect(diffDays('2026-11-24', '2026-11-17')).toBe(-7);
  });
});

describe('property tests', () => {
  const day = fc
    .record({
      y: fc.integer({ min: 1, max: 9999 }),
      m: fc.integer({ min: 1, max: 12 }),
      d: fc.integer({ min: 1, max: 31 }),
    })
    .filter(({ y, m, d }) => d <= daysInMonth(y, m))
    .map(({ y, m, d }) => formatDate(y, m, d));

  it('day numbers round-trip', () => {
    fc.assert(fc.property(day, (d) => fromDayNumber(toDayNumber(d)) === d));
  });
  it('the next day is exactly one day number later and sorts after', () => {
    fc.assert(
      // 9999-12-31 is left out: the next day is 10000-01-01, which no longer fits the four-digit
      // year of the format, so it cannot sort after it as text. fast-check favours range ends, so
      // some seeds hit it and others never do.
      fc.property(
        day.filter((d) => d !== '9999-12-31'),
        (d) => {
          const next = addDays(d, 1);
          return diffDays(d, next) === 1 && next > d;
        },
      ),
    );
  });
  it('every valid day parses to itself as a day point', () => {
    fc.assert(
      fc.property(day, (d) => {
        const p = parsePoint(d);
        return p?.kind === 'day' && p.start === d && p.end === d;
      }),
    );
  });
  it('a month point ends on the last day of that month', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), fc.integer({ min: 1, max: 12 }), (y, m) => {
        const p = parsePoint(formatDate(y, m, 1).slice(0, 7));
        return p?.kind === 'month' && p.end === formatDate(y, m, daysInMonth(y, m));
      }),
    );
  });
  it('a window of two days is ordered or reported as start-after-end', () => {
    fc.assert(
      fc.property(day, day, (a, b) => {
        const r = parseWindow(`${a} → ${b}`);
        return r.window !== null && (a <= b ? r.problem === null : r.problem === 'start-after-end');
      }),
    );
  });
  it('never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        parseWindow(s);
        parsePoint(s);
        parseIsoDay(s);
        return true;
      }),
    );
  });
});

describe('parsePoint', () => {
  it('reads days, months, quarters and years as whole spans', () => {
    expect(parsePoint('2026-11-17')).toEqual({
      kind: 'day',
      start: '2026-11-17',
      end: '2026-11-17',
    });
    expect(parsePoint('2027-02')).toEqual({
      kind: 'month',
      start: '2027-02-01',
      end: '2027-02-28',
    });
    expect(parsePoint('2028-02')).toEqual({
      kind: 'month',
      start: '2028-02-01',
      end: '2028-02-29',
    });
    expect(parsePoint('2027-Q2')).toEqual({
      kind: 'quarter',
      start: '2027-04-01',
      end: '2027-06-30',
    });
    expect(parsePoint('2027-Q1')?.end).toBe('2027-03-31');
    expect(parsePoint('2027-Q3')?.end).toBe('2027-09-30');
    expect(parsePoint('2027-Q4')).toEqual({
      kind: 'quarter',
      start: '2027-10-01',
      end: '2027-12-31',
    });
    expect(parsePoint('2027')).toEqual({ kind: 'year', start: '2027-01-01', end: '2027-12-31' });
  });
  it('rejects bad points', () => {
    for (const bad of [
      '',
      '27',
      '2027-Q5',
      '2027-Q0',
      '2027-13',
      '2027-00',
      '2027-02-30',
      '0000',
      '2027-111',
      '2027-01-011',
      '2027-1',
      '2027 x',
      'abc',
    ]) {
      expect(parsePoint(bad)).toBeNull();
    }
  });
});

describe('parseWindow', () => {
  it('accepts every arrow', () => {
    for (const arrow of ['→', '->', '..', '–', 'to']) {
      const r = parseWindow(`2026-11-24 ${arrow} 2026-12-13`);
      expect(r).toMatchObject({
        problem: null,
        window: { start: '2026-11-24', end: '2026-12-13' },
      });
    }
  });
  it('accepts arrows without spaces, except "to"', () => {
    expect(parseWindow('2026-11-24→2026-12-13').problem).toBeNull();
    expect(parseWindow('2026-11-24..2026-12-13').problem).toBeNull();
    expect(parseWindow('2026-11-24–2026-12-13').problem).toBeNull();
    expect(parseWindow('2026-11-24to 2026-12-13').problem).toBe('unparseable');
  });
  it('mixes point kinds', () => {
    expect(parseWindow('2027-Q1 → 2027-Q2').window).toMatchObject({
      start: '2027-01-01',
      end: '2027-06-30',
    });
    expect(parseWindow('2027-01 -> 2027-03-15').window).toMatchObject({
      start: '2027-01-01',
      end: '2027-03-15',
    });
  });
  it('a single point covers its whole span', () => {
    expect(parseWindow('2027-02').window).toMatchObject({
      start: '2027-02-01',
      end: '2027-02-28',
      raw: '2027-02',
    });
    expect(parseWindow('2027').window).toMatchObject({ start: '2027-01-01', end: '2027-12-31' });
  });
  it('keeps a trailing note, with or without parentheses', () => {
    expect(parseWindow('2026-11-24 → 2026-12-13 (buffer week)').window).toMatchObject({
      note: 'buffer week',
      tentative: false,
    });
    expect(parseWindow('2026-11-24 → 2026-12-13 slips if D3 does').window).toMatchObject({
      note: 'slips if D3 does',
    });
    expect(parseWindow('2027-Q2 (tentative)').window).toMatchObject({
      note: 'tentative',
      tentative: true,
    });
    expect(parseWindow('2027-Q2 ?').window).toMatchObject({ note: '?', tentative: true });
    expect(parseWindow('2027-Q2(maybe?)').window).toMatchObject({
      note: 'maybe?',
      tentative: true,
    });
    expect(parseWindow('2027-Q2 ()').window?.note).toBeUndefined();
    expect(parseWindow('2027-Q2 →2027-Q3 TENTATIVE').window?.tentative).toBe(true);
  });
  it('keeps the raw text trimmed', () => {
    expect(parseWindow('  2027-02  ').window?.raw).toBe('2027-02');
  });
  it('reports start after end but still returns the window', () => {
    const r = parseWindow('2026-12-13 → 2026-11-24');
    expect(r.problem).toBe('start-after-end');
    expect(r.window).toMatchObject({ start: '2026-12-13', end: '2026-11-24' });
  });
  it('treats a month as ending after a day inside it', () => {
    expect(parseWindow('2027-02-10 → 2027-02').problem).toBeNull();
    expect(parseWindow('2027-03 → 2027-02-10').problem).toBe('start-after-end');
  });
  it('reports unparseable text', () => {
    for (const bad of [
      '',
      'soon',
      '2026-11-24 →',
      '2026-11-24 → soon',
      '2026-02-30 → 2026-03-01',
      '2027-02x',
      '2026-11-24 - 2026-12-13',
    ]) {
      expect(parseWindow(bad)).toEqual({ window: null, problem: 'unparseable' });
    }
  });
});
