// Pure layout for the timeline (spec 05 §4.2): dates in, coordinates out. No DOM here.
import { formatDate, toDayNumber } from '../../../core/dates.js';
import type { ISODate } from '../../../core/dates.js';
import type { ProjectData, Version } from '../../../core/types.js';

export type Zoom = 'month' | 'quarter';

export const LAYOUT = {
  width: 1000,
  labelWidth: 190,
  rightPad: 44,
  headerHeight: 34,
  rowHeight: 30,
  groupHeight: 26,
  barHeight: 16,
} as const;

export interface Tick {
  x: number;
  label: string;
  /** True for the start of a year, drawn heavier. */
  major: boolean;
}

export interface Bar {
  kind: 'bar';
  version: Version;
  y: number;
  x: number;
  width: number;
  /** Width of the progress fill inside the bar. */
  fill: number;
  /** Where the milestone diamond sits (end of the bar) when this version completes one. */
  milestone: { id: string; x: number } | null;
}

export interface Group {
  kind: 'group';
  label: string;
  y: number;
}

export type Row = Bar | Group;

export interface TimelineLayout {
  width: number;
  height: number;
  start: ISODate;
  end: ISODate;
  ticks: Tick[];
  rows: Row[];
  today: { x: number; date: ISODate } | null;
  unscheduled: Version[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthStart(year: number, month: number): ISODate {
  return formatDate(year, month, 1);
}

/** Month starts (or quarter starts) from `start` to `end`, labelled. */
export function makeTicks(
  start: ISODate,
  end: ISODate,
  zoom: Zoom,
  x: (d: ISODate) => number,
): Tick[] {
  const ticks: Tick[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const step = zoom === 'quarter' ? 3 : 1;
  if (zoom === 'quarter') m = Math.floor((m - 1) / 3) * 3 + 1;
  for (;;) {
    const d = monthStart(y, m);
    if (d > end) break;
    const label =
      zoom === 'quarter'
        ? `Q${Math.floor((m - 1) / 3) + 1} ${y}`
        : m === 1
          ? `${MONTHS[0]} ${y}`
          : (MONTHS[m - 1] ?? '');
    if (d >= start || ticks.length === 0)
      ticks.push({ x: x(d < start ? start : d), label, major: m === 1 });
    m += step;
    if (m > 12) {
      m -= 12;
      y++;
    }
  }
  return ticks;
}

export function layoutTimeline(data: ProjectData, zoom: Zoom = 'month'): TimelineLayout {
  const { width, labelWidth, rightPad, headerHeight, rowHeight, groupHeight } = LAYOUT;
  const scheduled = data.versions.filter((v) => v.window !== null);
  const unscheduled = data.versions.filter((v) => v.window === null);
  const { start, end } = data.derived.timeline;

  if (start === null || end === null) {
    return {
      width,
      height: headerHeight,
      start: data.today,
      end: data.today,
      ticks: [],
      rows: [],
      today: null,
      unscheduled,
    };
  }

  const first = toDayNumber(start);
  const span = Math.max(1, toDayNumber(end) - first + 1);
  const chart = width - labelWidth - rightPad;
  const x = (d: ISODate): number => labelWidth + (chart * (toDayNumber(d) - first)) / span;
  const xEnd = (d: ISODate): number => labelWidth + (chart * (toDayNumber(d) - first + 1)) / span;

  const phaseOf = (v: Version): string => data.phases.find((p) => p.id === v.phaseId)?.title ?? '';
  const rows: Row[] = [];
  let y = headerHeight;
  let lastGroup: string | null = null;
  for (const v of scheduled) {
    const win = v.window;
    if (!win) continue;
    const group = phaseOf(v);
    if (group !== lastGroup && (group !== '' || lastGroup !== null)) {
      if (group !== '') {
        rows.push({ kind: 'group', label: group, y });
        y += groupHeight;
      }
      lastGroup = group;
    }
    const lo = win.start < win.end ? win.start : win.end;
    const hi = win.start < win.end ? win.end : win.start;
    const bx = x(lo);
    const width2 = Math.max(4, xEnd(hi) - bx);
    rows.push({
      kind: 'bar',
      version: v,
      y,
      x: bx,
      width: width2,
      fill: (width2 * v.progress.pct) / 100,
      milestone: v.milestoneId ? { id: v.milestoneId, x: bx + width2 } : null,
    });
    y += rowHeight;
  }

  const inRange = data.today >= start && data.today <= end;
  return {
    width,
    height: y + 8,
    start,
    end,
    ticks: makeTicks(start, end, zoom, x),
    rows,
    today: inRange ? { x: x(data.today), date: data.today } : null,
    unscheduled,
  };
}
