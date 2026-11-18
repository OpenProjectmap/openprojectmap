import type { ProjectData, Version } from '../../../core/types.js';
import { card, chip, emptyNote, stateChip } from '../components.js';
import { h } from '../h.js';
import type { Child } from '../h.js';
import { formatHash } from '../router.js';
import type { State } from '../router.js';
import { LAYOUT, layoutTimeline } from './timeline-layout.js';
import type { Bar, Group } from './timeline-layout.js';

const MAX_LABEL = 26;
/** Cut a label to fit the column. No ellipsis character: a link's name must contain its visible text (WCAG 2.5.3), so the visible text stays a prefix of the full aria-label. */
const short = (s: string): string => (s.length > MAX_LABEL ? s.slice(0, MAX_LABEL).trimEnd() : s);

function barSummary(v: Version): string {
  const win = v.window ? v.window.raw : 'no window';
  const ms = v.milestoneId ? `, completes ${v.milestoneId}` : '';
  return `${v.id} ${v.title}: ${v.state}, ${v.progress.pct}% done, ${win}${ms}. Press Enter to open.`;
}

function open(id: string): void {
  window.location.hash = formatHash({
    view: 'versions',
    versionId: id,
    status: [],
    q: '',
    zoom: 'month',
  });
}

function barNode(row: Bar): Child {
  const v = row.version;
  const { rowHeight, barHeight } = LAYOUT;
  const cy = row.y + rowHeight / 2;
  const top = cy - barHeight / 2;
  const link = h(
    'g',
    {
      class: `bar-row state-${v.state}${v.window?.tentative ? ' tentative' : ''}`,
      role: 'link',
      tabindex: 0,
      'aria-label': barSummary(v),
      'data-version': v.id,
      onClick: () => open(v.id),
      onKeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') open(v.id);
      },
    },
    h('text', { x: 8, y: cy + 4, class: 'lbl' }, short(`${v.id} ${v.title}`)),
    h('rect', { x: row.x, y: top, width: row.width, height: barHeight, rx: 4, class: 'track' }),
    row.fill > 0
      ? h('rect', { x: row.x, y: top, width: row.fill, height: barHeight, rx: 4, class: 'fill' })
      : null,
  );
  if (!row.milestone) return link;
  // The milestone mark is outside the link: its text is not part of the link's name (WCAG 2.5.3),
  // and the milestone is already named in the link's aria-label.
  return h(
    'g',
    { class: 'bar-with-milestone' },
    link,
    h('path', {
      d: `M${row.milestone.x} ${cy - 9} l8 9 l-8 9 l-8 -9 z`,
      class: 'diamond',
      'data-milestone': row.milestone.id,
      'aria-hidden': 'true',
    }),
    h(
      'text',
      { x: row.milestone.x + 12, y: cy + 4, class: 'ms', 'aria-hidden': 'true' },
      row.milestone.id,
    ),
  );
}

function groupNode(g: Group): Child {
  return h('text', { x: 8, y: g.y + 17, class: 'group' }, g.label);
}

export function renderTimeline(data: ProjectData, state: State): Node {
  const layout = layoutTimeline(data, state.zoom);
  if (layout.rows.length === 0 && layout.unscheduled.length === 0) {
    return card(
      'Timeline',
      emptyNote('No version has a window yet. Add **Window:** to a version to see it here.'),
    );
  }
  const { headerHeight, rightPad } = LAYOUT;
  const summary = `Timeline from ${layout.start} to ${layout.end}: ${layout.rows.filter((r) => r.kind === 'bar').length} scheduled versions`;

  const svg = h(
    'svg',
    {
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      role: 'group',
      'aria-label': summary,
      class: 'timeline-svg',
      width: layout.width,
      height: layout.height,
    },
    layout.ticks.map((t) => [
      h('line', {
        x1: t.x,
        x2: t.x,
        y1: headerHeight - 6,
        y2: layout.height - 4,
        class: t.major ? 'tick major' : 'tick',
      }),
      h('text', { x: t.x + 4, y: headerHeight - 12, class: 'axis' }, t.label),
    ]),
    layout.rows.map((r) => (r.kind === 'group' ? groupNode(r) : barNode(r))),
    layout.today
      ? [
          h('line', {
            x1: layout.today.x,
            x2: layout.today.x,
            y1: headerHeight - 6,
            y2: layout.height - 4,
            class: 'today',
          }),
          h(
            'text',
            {
              x: Math.min(layout.today.x + 4, layout.width - rightPad - 40),
              y: layout.height - 6,
              class: 'today-label',
            },
            `today ${layout.today.date}`,
          ),
        ]
      : null,
  );

  const zoomButton = (zoom: 'month' | 'quarter', label: string): Child =>
    h(
      'button',
      {
        type: 'button',
        class: 'filter',
        'aria-pressed': String(state.zoom === zoom),
        onClick: () => {
          window.location.hash = formatHash({ ...state, zoom });
        },
      },
      label,
    );

  const legend = h(
    'ul',
    { class: 'plain legend', 'aria-label': 'Legend' },
    h('li', null, stateChip('planned'), ' outline'),
    h('li', null, stateChip('active'), ' accent'),
    h('li', null, stateChip('shipped'), ' green'),
    h('li', null, chip('tentative', 'todo'), ' dashed'),
    h(
      'li',
      null,
      h('span', { class: 'diamond-key', 'aria-hidden': 'true' }, '◆'),
      ' milestone reached by that version',
    ),
    h('li', null, h('span', { class: 'today-key', 'aria-hidden': 'true' }, '|'), ' today'),
  );

  return h(
    'div',
    null,
    card(
      'Timeline',
      h(
        'div',
        { class: 'filters' },
        h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': 'Zoom' },
          zoomButton('month', 'Months'),
          zoomButton('quarter', 'Quarters'),
        ),
      ),
      h(
        'div',
        {
          class: 'table-wrap timeline-wrap',
          role: 'region',
          'aria-label': 'Timeline chart',
          tabindex: 0,
        },
        svg,
      ),
      legend,
    ),
    layout.unscheduled.length === 0
      ? null
      : card(
          'Unscheduled',
          h(
            'ul',
            { class: 'plain' },
            layout.unscheduled.map((v) =>
              h(
                'li',
                null,
                h('a', { href: `#/versions/${v.id}` }, `${v.id} · ${v.title}`),
                ' ',
                stateChip(v.state),
              ),
            ),
          ),
        ),
  );
}
