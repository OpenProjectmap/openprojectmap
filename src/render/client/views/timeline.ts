import type { ProjectData, Version } from '../../../core/types.js';
import { card, chip, emptyNote, stateChip } from '../components.js';
import { h } from '../h.js';
import { formatDay, t, tn } from '../i18n/index.js';
import type { MessageKey } from '../i18n/index.js';
import type { Child } from '../h.js';
import { formatHash } from '../router.js';
import type { State } from '../router.js';
import { LAYOUT, layoutTimeline } from './timeline-layout.js';
import type { Bar, Group } from './timeline-layout.js';

const MAX_LABEL = 26;
/** Cut a label to fit the column. No ellipsis character: a link's name must contain its visible text (WCAG 2.5.3), so the visible text stays a prefix of the full aria-label. */
const short = (s: string): string => (s.length > MAX_LABEL ? s.slice(0, MAX_LABEL).trimEnd() : s);

function barSummary(v: Version): string {
  return t('timeline.bar', {
    id: v.id,
    title: v.title,
    state: t(`state.${v.state}` as MessageKey),
    pct: v.progress.pct,
    window: v.window ? v.window.raw : t('versions.noWindow'),
    milestone: v.milestoneId ? t('timeline.bar.milestone', { id: v.milestoneId }) : '',
  });
}

function open(id: string, trackId: string | null): void {
  window.location.hash = formatHash({
    view: trackId === null ? 'versions' : 'track',
    trackId,
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
      onClick: () => open(v.id, row.trackId),
      onKeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') open(v.id, row.trackId);
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
    return card(t('timeline.title'), emptyNote(t('timeline.empty')));
  }
  const { headerHeight, rightPad } = LAYOUT;
  const summary = tn('timeline.summary', layout.rows.filter((r) => r.kind === 'bar').length, {
    start: formatDay(layout.start),
    end: formatDay(layout.end),
  });

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
            t('timeline.today', { date: formatDay(layout.today.date) }),
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
    { class: 'plain legend', 'aria-label': t('timeline.legend') },
    h('li', null, stateChip('planned'), t('timeline.legend.outline')),
    h('li', null, stateChip('active'), t('timeline.legend.accent')),
    h('li', null, stateChip('shipped'), t('timeline.legend.green')),
    h('li', null, chip(t('timeline.legend.tentative'), 'todo'), t('timeline.legend.dashed')),
    h(
      'li',
      null,
      h('span', { class: 'diamond-key', 'aria-hidden': 'true' }, '◆'),
      t('timeline.legend.milestone'),
    ),
    h(
      'li',
      null,
      h('span', { class: 'today-key', 'aria-hidden': 'true' }, '|'),
      t('timeline.legend.today'),
    ),
  );

  return h(
    'div',
    null,
    card(
      t('timeline.title'),
      h(
        'div',
        { class: 'filters' },
        h(
          'div',
          { class: 'chips', role: 'group', 'aria-label': t('timeline.zoom') },
          zoomButton('month', t('timeline.months')),
          zoomButton('quarter', t('timeline.quarters')),
        ),
      ),
      h(
        'div',
        {
          class: 'table-wrap timeline-wrap',
          role: 'region',
          'aria-label': t('timeline.chart'),
          tabindex: 0,
        },
        svg,
      ),
      legend,
    ),
    layout.unscheduled.length === 0
      ? null
      : card(
          t('timeline.unscheduled'),
          h(
            'ul',
            { class: 'plain' },
            layout.unscheduled.map(({ version: v, trackId, trackTitle }) =>
              h(
                'li',
                null,
                h(
                  'a',
                  {
                    href: formatHash({
                      view: trackId === null ? 'versions' : 'track',
                      trackId,
                      versionId: v.id,
                      status: [],
                      q: '',
                      zoom: 'month',
                    }),
                  },
                  `${v.id} · ${v.title}`,
                ),
                trackTitle === null ? null : h('span', { class: 'muted' }, ` (${trackTitle})`),
                ' ',
                stateChip(v.state),
              ),
            ),
          ),
        ),
  );
}
