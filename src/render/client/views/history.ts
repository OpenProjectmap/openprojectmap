import type { ProjectData } from '../../../core/types.js';
import { card, emptyNote } from '../components.js';
import { h, setVar } from '../h.js';
import { formatDay, t } from '../i18n/index.js';
import { rich } from '../rich.js';
import { ctxOf } from './overview.js';

function releaseCard(data: ProjectData, r: ProjectData['releases'][number]): HTMLElement {
  const ctx = ctxOf(data);
  const title = r.unreleased ? t('common.unreleased') : `v${r.version ?? '?'}`;
  return h(
    'article',
    { class: 'card release' },
    h(
      'h3',
      null,
      r.versionId ? h('a', { href: `#/versions/${r.versionId}` }, title) : title,
      r.date ? h('span', { class: 'muted' }, ` · ${formatDay(r.date)}`) : null,
      r.title ? h('span', { class: 'muted' }, ` · ${r.title}`) : null,
    ),
    r.sections.length === 0
      ? emptyNote(t('common.noEntries'))
      : r.sections.map((s) => [
          s.heading === '' ? null : h('h4', null, s.heading),
          h(
            'ul',
            null,
            s.items.map((i) => h('li', null, rich(i, ctx))),
          ),
        ]),
  ) as HTMLElement;
}

/** Areas as a bar list, widest first. */
function areaBars(areas: Record<string, number>): HTMLElement {
  const entries = Object.entries(areas).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return h(
    'ul',
    { class: 'plain areas', 'aria-label': t('history.areasLabel') },
    entries.map(([name, n]) => {
      const bar = h('span', { class: 'area-bar', 'aria-hidden': 'true' }) as HTMLElement;
      setVar(bar, '--w', Math.round((100 * n) / max));
      return h('li', null, h('code', null, name), bar, h('span', { class: 'muted' }, ` ${n}`));
    }),
  ) as HTMLElement;
}

export function renderHistory(data: ProjectData): Node {
  const parts: Node[] = [];
  const g = data.git;
  if (g) {
    const heads = Object.entries(g.branches);
    parts.push(
      card(
        t('history.branches'),
        h(
          'ul',
          { class: 'plain' },
          [['head', g.head] as const, ...heads].map(([role, c]) =>
            h(
              'li',
              null,
              h('strong', null, role),
              ' ',
              c
                ? [h('code', null, c.sha), ' ', formatDay(c.date.slice(0, 10)), ' ', c.subject]
                : h('span', { class: 'muted' }, t('history.notFound')),
            ),
          ),
        ),
        g.shallow ? h('p', { class: 'muted' }, t('history.shallow')) : null,
      ),
      card(
        t('history.areas'),
        Object.keys(g.activity.areas).length === 0
          ? emptyNote(t('history.noAreas'))
          : areaBars(g.activity.areas),
      ),
    );
  }
  parts.push(
    data.releases.length === 0
      ? card(t('history.releases'), emptyNote(t('history.noReleases')))
      : h(
          'div',
          null,
          h('h2', { class: 'section' }, t('history.releases')),
          data.releases.map((r) => releaseCard(data, r)),
        ),
  );
  return h('div', null, parts);
}
