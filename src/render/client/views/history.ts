import type { ProjectData } from '../../../core/types.js';
import { card, emptyNote } from '../components.js';
import { h, setVar } from '../h.js';
import { rich } from '../rich.js';
import { ctxOf } from './overview.js';

function releaseCard(data: ProjectData, r: ProjectData['releases'][number]): HTMLElement {
  const ctx = ctxOf(data);
  const title = r.unreleased ? 'Unreleased' : `v${r.version ?? '?'}`;
  return h(
    'article',
    { class: 'card release' },
    h(
      'h3',
      null,
      r.versionId ? h('a', { href: `#/versions/${r.versionId}` }, title) : title,
      r.date ? h('span', { class: 'muted' }, ` · ${r.date}`) : null,
      r.title ? h('span', { class: 'muted' }, ` · ${r.title}`) : null,
    ),
    r.sections.length === 0
      ? emptyNote('No entries.')
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
    { class: 'plain areas', 'aria-label': 'Changed files per area, last 4 weeks' },
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
        'Branches',
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
                ? [h('code', null, c.sha), ' ', c.date.slice(0, 10), ' ', c.subject]
                : h('span', { class: 'muted' }, 'not found'),
            ),
          ),
        ),
        g.shallow ? h('p', { class: 'muted' }, 'Shallow clone: activity is incomplete.') : null,
      ),
      card(
        'Changed files by area, last 4 weeks',
        Object.keys(g.activity.areas).length === 0
          ? emptyNote('No changes in the configured areas.')
          : areaBars(g.activity.areas),
      ),
    );
  }
  parts.push(
    data.releases.length === 0
      ? card('Releases', emptyNote('The changelog has no releases yet.'))
      : h(
          'div',
          null,
          h('h2', { class: 'section' }, 'Releases'),
          data.releases.map((r) => releaseCard(data, r)),
        ),
  );
  return h('div', null, parts);
}
