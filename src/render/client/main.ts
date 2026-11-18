// Client entry: reads the embedded data, renders the tabs and the current view.
import type { ProjectData } from '../../core/types.js';
import { chip, stateChip } from './components.js';
import { append, h } from './h.js';
import { formatHash, parseHash, VIEWS } from './router.js';
import type { State, View } from './router.js';
import { loadMode, nextMode, saveMode } from './theme.js';
import { renderDecisions } from './views/decisions.js';
import { renderHistory } from './views/history.js';
import { renderParked } from './views/parked.js';
import { renderTimeline } from './views/timeline.js';
import { renderOverview } from './views/overview.js';
import { renderVersions } from './views/versions.js';

const LABELS: Record<View, string> = {
  overview: 'Overview',
  versions: 'Versions',
  timeline: 'Timeline',
  decisions: 'Decisions',
  history: 'History',
  parked: 'Parked',
};

export function readData(doc: Document): ProjectData {
  const el = doc.getElementById('opmap-data');
  if (!el) throw new Error('The page has no embedded data');
  return JSON.parse(el.textContent ?? '') as ProjectData;
}

function renderView(data: ProjectData, state: State, onChange: (s: State) => void): Node {
  switch (state.view) {
    case 'versions':
      return renderVersions(data, state, onChange);
    case 'decisions':
      return renderDecisions(data);
    case 'timeline':
      return renderTimeline(data, state);
    case 'history':
      return renderHistory(data);
    case 'parked':
      return renderParked(data);
    default:
      return renderOverview(data);
  }
}

/** Render the page. Returns a function that stops listening for hash changes. */
export function boot(doc: Document = document): () => void {
  const data = readData(doc);
  const app = doc.getElementById('app');
  if (!app) return () => undefined;
  const root = doc.documentElement;
  let mode = loadMode(root.dataset['theme'] ?? 'auto');
  root.dataset['theme'] = mode;

  const themeButton = h(
    'button',
    {
      type: 'button',
      class: 'theme',
      onClick: () => {
        mode = nextMode(mode);
        root.dataset['theme'] = mode;
        saveMode(mode);
        themeButton.textContent = `Theme: ${mode}`;
      },
    },
    `Theme: ${mode}`,
  );

  const current = data.versions.find((v) => v.id === data.derived.currentVersionId);
  const header = h(
    'header',
    { class: 'top' },
    h('h1', null, data.project.title),
    h(
      'p',
      { class: 'meta' },
      current ? [h('span', null, current.id, ' '), stateChip(current.state)] : null,
      data.now?.updated ? h('span', { class: 'muted' }, ` Updated ${data.now.updated}`) : null,
      data.derived.stale.isStale
        ? chip(`stale: ${data.derived.stale.reason ?? ''}`, 'blocked')
        : null,
    ),
    themeButton,
  );

  const tabs = h('div', { role: 'tablist', 'aria-label': 'Views', class: 'tabs' });
  // <main> is the landmark; the tab panel inside it is what the tabs control.
  const panel = h('div', { id: 'panel', role: 'tabpanel', tabindex: '-1' });
  const main = h('main', { id: 'main' }, panel);
  const nav = h('nav', { 'aria-label': 'Project map' }, tabs);
  const footer = h(
    'footer',
    null,
    `Generated ${data.generatedAt.slice(0, 10)} by openprojectmap ${data.tool.version}`,
  );

  const paint = (): void => {
    const state = parseHash(doc.defaultView?.location.hash ?? '');
    const hadFocus = tabs.contains(doc.activeElement);
    tabs.replaceChildren();
    for (const v of VIEWS) {
      tabs.appendChild(
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            id: `tab-${v}`,
            'aria-selected': String(v === state.view),
            'aria-controls': 'panel',
            tabindex: v === state.view ? '0' : '-1',
            onClick: () => {
              if (doc.defaultView)
                doc.defaultView.location.hash = formatHash({
                  view: v,
                  versionId: null,
                  status: [],
                  q: '',
                  zoom: 'month',
                });
            },
          },
          LABELS[v],
        ),
      );
    }
    if (hadFocus) doc.getElementById(`tab-${state.view}`)?.focus();
    panel.setAttribute('aria-labelledby', `tab-${state.view}`);
    panel.replaceChildren(
      renderView(data, state, (s) => {
        doc.defaultView?.history.replaceState(null, '', formatHash(s));
      }),
    );
  };

  tabs.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const index = VIEWS.indexOf(parseHash(doc.defaultView?.location.hash ?? '').view);
    const move =
      ev.key === 'ArrowRight'
        ? index + 1
        : ev.key === 'ArrowLeft'
          ? index - 1
          : ev.key === 'Home'
            ? 0
            : ev.key === 'End'
              ? VIEWS.length - 1
              : null;
    if (move === null) return;
    ev.preventDefault();
    const view = VIEWS[(move + VIEWS.length) % VIEWS.length] ?? 'overview';
    if (doc.defaultView)
      doc.defaultView.location.hash = formatHash({
        view,
        versionId: null,
        status: [],
        q: '',
        zoom: 'month',
      });
  });

  // Printing shows every view in sequence (spec 05 §5). The extra copy exists only while printing.
  const beforePrint = (): void => {
    if (doc.getElementById('print-all')) return;
    const all = h('div', { id: 'print-all', 'aria-hidden': 'true' });
    for (const v of VIEWS) {
      const state: State = { view: v, versionId: null, status: [], q: '', zoom: 'month' };
      all.appendChild(h('h2', { class: 'print-title' }, LABELS[v]));
      all.appendChild(renderView(data, state, () => undefined));
    }
    main.appendChild(all);
  };
  const afterPrint = (): void => {
    doc.getElementById('print-all')?.remove();
  };

  app.replaceChildren();
  append(app, [header, nav, main, footer]);
  const win = doc.defaultView;
  win?.addEventListener('hashchange', paint);
  win?.addEventListener('beforeprint', beforePrint);
  win?.addEventListener('afterprint', afterPrint);
  paint();
  return () => {
    win?.removeEventListener('hashchange', paint);
    win?.removeEventListener('beforeprint', beforePrint);
    win?.removeEventListener('afterprint', afterPrint);
  };
}

if (typeof document !== 'undefined' && document.getElementById('opmap-data')) boot(document);
