// Client entry: reads the embedded data, renders the tabs and the current view.
import type { ProjectData } from '../../core/types.js';
import { stateChip } from './components.js';
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
import { parsePicked, readFiles } from './open-docs.js';

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
/** `opmap serve` pages reload themselves when the docs change (spec 04 §2). */
export function connectLive(doc: Document, reload?: () => void): () => void {
  const win = doc.defaultView;
  if (
    !doc.querySelector('meta[name="opmap-live"]') ||
    !win ||
    typeof win.EventSource !== 'function'
  )
    return () => undefined;
  const source = new win.EventSource('/events');
  source.addEventListener('reload', reload ?? (() => win.location.reload()));
  return () => source.close();
}

/** Render the page from the embedded data. Returns a function that undoes it. */
export function boot(doc: Document = document): () => void {
  return mount(doc, readData(doc));
}

interface Opened {
  used: string[];
  ignored: string[];
}

function mount(doc: Document, data: ProjectData, opened: Opened | null = null): () => void {
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
    ),
    themeButton,
  );

  // The staleness banner (spec 03 §3.6): the map is only as good as the Now block behind it.
  const stale = data.derived.stale;
  const banner = stale.isStale
    ? h(
        'div',
        { class: 'banner', role: 'status' },
        h('strong', null, 'This map may be out of date. '),
        `${stale.reason ?? 'The Now block has not been updated'}. Update the Now block and its Updated date (`,
        h('code', null, 'opmap now'),
        ').',
      )
    : null;

  const tabs = h('div', { role: 'tablist', 'aria-label': 'Views', class: 'tabs' });
  // <main> is the landmark; the tab panel inside it is what the tabs control.
  const panel = h('div', { id: 'panel', role: 'tabpanel', tabindex: '-1' });
  const main = h('main', { id: 'main' }, panel);
  const nav = h('nav', { 'aria-label': 'Project map' }, tabs);
  const note = h('p', { class: 'muted', role: 'status', id: 'open-note' });
  if (opened) {
    note.textContent = `Showing ${opened.used.join(', ')}${opened.ignored.length > 0 ? ` (left out: ${opened.ignored.join(', ')})` : ''}. These files stay in your browser and are not saved; reload the page to go back.`;
  }
  const win = doc.defaultView;
  // The mount that replaced this one when files were opened (so one undo stops everything).
  let child = (): void => undefined;
  let stopSelf = (): void => undefined;
  const openFiles = async (list: ArrayLike<File>): Promise<void> => {
    const { picked, tooBig } = await readFiles(list);
    const result = parsePicked(picked, new Date().toISOString());
    if (!result.ok) {
      note.textContent = `${result.error}${tooBig.length > 0 ? ` (too big to open: ${tooBig.join(', ')})` : ''}`;
      return;
    }
    stopSelf();
    child();
    child = mount(doc, result.data, { used: result.used, ignored: [...result.ignored, ...tooBig] });
  };
  const picker = h('input', {
    type: 'file',
    id: 'open-docs-input',
    accept: '.md,.markdown,.txt,text/markdown,text/plain',
    multiple: true,
    'aria-label': 'Open markdown files',
    class: 'visually-hidden',
    tabindex: '-1',
    onChange: (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.files && input.files.length > 0) void openFiles(input.files);
    },
  });
  const footer = h(
    'footer',
    null,
    h(
      'p',
      null,
      `Generated ${data.generatedAt.slice(0, 10)} by openprojectmap ${data.tool.version}. `,
      h(
        'button',
        { type: 'button', class: 'link', onClick: () => (picker as HTMLInputElement).click() },
        'Open docs…',
      ),
      h(
        'span',
        { class: 'muted' },
        ' or drop ROADMAP.md, DECISIONS.md and CHANGELOG.md on this page. Nothing is uploaded.',
      ),
    ),
    picker,
    note,
  );
  const onDragOver = (e: Event): void => e.preventDefault();
  const onDrop = (e: Event): void => {
    const files = (e as DragEvent).dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    void openFiles(files);
  };

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
  append(app, [header, banner, nav, main, footer]);
  win?.addEventListener('hashchange', paint);
  win?.addEventListener('dragover', onDragOver);
  win?.addEventListener('drop', onDrop);
  win?.addEventListener('beforeprint', beforePrint);
  win?.addEventListener('afterprint', afterPrint);
  paint();
  const stopLive = connectLive(doc);
  stopSelf = () => {
    stopLive();
    win?.removeEventListener('dragover', onDragOver);
    win?.removeEventListener('drop', onDrop);
    win?.removeEventListener('hashchange', paint);
    win?.removeEventListener('beforeprint', beforePrint);
    win?.removeEventListener('afterprint', afterPrint);
  };
  return () => {
    stopSelf();
    child();
  };
}

if (typeof document !== 'undefined' && document.getElementById('opmap-data')) boot(document);
