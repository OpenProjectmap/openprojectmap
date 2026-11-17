import type { Deliverable, ProjectData, Status, Version } from '../../../core/types.js';
import { inlineText, parseInline } from '../../../core/inline.js';
import { chip, emptyNote, progressBar, stateChip, statusChip, table } from '../components.js';
import { h } from '../h.js';
import { rich } from '../rich.js';
import { formatHash, STATUS_LIST } from '../router.js';
import type { State } from '../router.js';
import { ctxOf } from './overview.js';

/** Does a deliverable match the status filter and the search text? */
export function matches(d: Deliverable, status: readonly Status[], q: string): boolean {
  if (status.length > 0 && !status.includes(d.status)) return false;
  const needle = q.trim().toLowerCase();
  if (needle === '') return true;
  const hay = [d.id, d.title, d.detail, d.notes ?? '', d.owner ?? '', ...Object.values(d.extra)];
  return hay.some((s) => inlineText(parseInline(s)).toLowerCase().includes(needle));
}

function deliverableTable(data: ProjectData, v: Version, list: Deliverable[]): HTMLElement {
  const ctx = ctxOf(data);
  const extraKeys = [...new Set(list.flatMap((d) => Object.keys(d.extra)))];
  return table(
    ['ID', 'Deliverable', 'Status', 'Owner', 'Notes', ...extraKeys],
    list.map((d) => [
      h('code', { id: `d-${d.id}` }, d.id),
      rich(d.detail, ctx),
      statusChip(d),
      d.owner ?? '',
      rich(d.notes, ctx),
      ...extraKeys.map((k) => rich(d.extra[k], ctx)),
    ]),
    `Deliverables of ${v.id}`,
  );
}

function versionCard(
  data: ProjectData,
  v: Version,
  list: Deliverable[],
  open: boolean,
): HTMLElement {
  const ctx = ctxOf(data);
  const last = v.statusLines[v.statusLines.length - 1];
  return h(
    'article',
    { class: 'card version', id: v.id },
    h('h2', null, h('a', { href: `#/versions/${v.id}` }, `${v.id} · ${v.title}`)),
    h(
      'p',
      { class: 'meta' },
      stateChip(v.state),
      ' ',
      v.window ? h('span', null, v.window.raw) : chip('no window', 'todo'),
      v.milestoneId ? h('span', { class: 'muted' }, ` · completes ${v.milestoneId}`) : null,
    ),
    progressBar(v.progress, v.id),
    v.goal ? h('p', null, h('strong', null, 'Goal: '), rich(v.goal, ctx)) : null,
    v.exit ? h('p', null, h('strong', null, 'Exit: '), rich(v.exit, ctx)) : null,
    last
      ? h(
          'p',
          { class: 'status-line' },
          h('strong', null, last.date ?? 'Status', ': '),
          rich(last.text, ctx),
        )
      : null,
    v.statusLines.length > 1
      ? h(
          'details',
          null,
          h('summary', null, `History (${v.statusLines.length})`),
          h(
            'ul',
            null,
            v.statusLines.map((s) =>
              h('li', null, h('strong', null, `${s.date ?? 'undated'}: `), rich(s.text, ctx)),
            ),
          ),
        )
      : null,
    list.length === 0
      ? emptyNote(
          v.deliverables.length === 0 ? 'No deliverables.' : 'No deliverable matches the filters.',
        )
      : deliverableTable(data, v, list),
    open ? null : null,
  ) as HTMLElement;
}

export function renderVersions(
  data: ProjectData,
  state: State,
  onChange: (s: State) => void,
): Node {
  const results = h('div', { class: 'results', 'aria-live': 'polite' }) as HTMLElement;
  const count = h('p', { class: 'muted count' }) as HTMLElement;
  let current = state;

  const paint = (): void => {
    const shown = data.versions.filter(
      (v) => current.versionId === null || v.id === current.versionId,
    );
    let total = 0;
    const cards = shown.map((v) => {
      const list = v.deliverables.filter((d) => matches(d, current.status, current.q));
      total += list.length;
      return versionCard(data, v, list, current.versionId !== null);
    });
    results.replaceChildren(...(cards.length === 0 ? [emptyNote('No such version.')] : cards));
    count.textContent = `${total} deliverable${total === 1 ? '' : 's'} shown`;
  };

  const set = (next: State): void => {
    current = next;
    onChange(next);
    paint();
    for (const b of document.querySelectorAll<HTMLElement>('[data-filter-status]')) {
      b.setAttribute(
        'aria-pressed',
        String(next.status.includes(b.dataset['filterStatus'] as Status)),
      );
    }
  };

  const chips = STATUS_LIST.map((s) =>
    h(
      'button',
      {
        type: 'button',
        class: 'filter',
        'data-filter-status': s,
        'aria-pressed': String(current.status.includes(s)),
        onClick: () => {
          const on = current.status.includes(s);
          set({
            ...current,
            status: on ? current.status.filter((x) => x !== s) : [...current.status, s],
          });
        },
      },
      s,
    ),
  );
  const search = h('input', {
    type: 'search',
    placeholder: 'Search deliverables',
    'aria-label': 'Search deliverables',
    value: current.q,
    autocomplete: 'off',
    onInput: (e: Event) =>
      set({ ...current, q: (e.target as HTMLInputElement).value.slice(0, 200) }),
  });

  paint();
  return h(
    'div',
    null,
    current.versionId
      ? h(
          'p',
          null,
          h('a', { href: formatHash({ ...current, versionId: null }) }, '← All versions'),
        )
      : null,
    h(
      'div',
      { class: 'filters' },
      search,
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by status' }, chips),
      count,
    ),
    results,
  );
}
