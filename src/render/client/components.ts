// Small building blocks shared by the views.
import type { Deliverable, Progress, Status, VersionState } from '../../core/types.js';
import { h, setVar } from './h.js';
import type { Child } from './h.js';

const BAR_ORDER: Status[] = ['done', 'review', 'doing', 'blocked', 'todo'];

/** A word chip. Status is never shown by colour alone: the chip always carries the word. */
export function chip(label: string, kind: string): HTMLElement {
  return h(
    'span',
    { class: `chip k-${kind}` },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    label,
  ) as HTMLElement;
}

export function statusChip(d: Pick<Deliverable, 'status' | 'statusDate' | 'ref'>): HTMLElement {
  const extra = [d.statusDate, d.ref]
    .filter((x): x is string => x !== null && x !== '')
    .join(' · ');
  return h(
    'span',
    { class: 'status' },
    chip(d.status, d.status),
    extra === '' ? null : h('small', { class: 'muted' }, extra),
  ) as HTMLElement;
}

export function stateChip(state: VersionState): HTMLElement {
  return chip(state, `state-${state}`);
}

/** A stacked progress bar with the numbers in words for screen readers. */
export function progressBar(p: Progress, label: string): HTMLElement {
  const bar = h('div', {
    class: 'bar',
    role: 'img',
    'aria-label': `${label}: ${p.done} of ${p.total} done, ${p.pct}%`,
  }) as HTMLElement;
  for (const s of BAR_ORDER) {
    const n = p.byStatus[s];
    if (n === 0) continue;
    const seg = h('span', { class: `seg s-${s}` }) as HTMLElement;
    setVar(seg, '--n', n);
    bar.appendChild(seg);
  }
  return h(
    'div',
    { class: 'progress' },
    bar,
    h('span', { class: 'pct' }, `${p.pct}%`),
    h('small', { class: 'muted' }, `${p.done}/${p.total}`),
  ) as HTMLElement;
}

export function card(title: string, ...body: Child[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', null, title), body) as HTMLElement;
}

export function emptyNote(text: string): HTMLElement {
  return h('p', { class: 'muted empty' }, text) as HTMLElement;
}

/** A table that scrolls inside its own box on narrow screens. */
export function table(head: string[], rows: Child[][], caption: string): HTMLElement {
  return h(
    'div',
    { class: 'table-wrap', role: 'region', 'aria-label': caption, tabindex: 0 },
    h(
      'table',
      null,
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          head.map((c) => h('th', { scope: 'col' }, c)),
        ),
      ),
      h(
        'tbody',
        null,
        rows.map((r) =>
          h(
            'tr',
            null,
            r.map((c, i) => h('td', { 'data-label': head[i] ?? '' }, c)),
          ),
        ),
      ),
    ),
  ) as HTMLElement;
}
