// View state in the URL hash: `#/versions/v0.2.0?status=doing,blocked&q=timeline`.
import type { Status } from '../../core/types.js';

export type View =
  'overview' | 'timeline' | 'versions' | 'track' | 'decisions' | 'history' | 'parked';
/** The fixed views; each track adds a `track` tab after Versions (spec 05 §4). */
export const VIEWS: readonly View[] = [
  'overview',
  'timeline',
  'versions',
  'decisions',
  'history',
  'parked',
];

export interface Tab {
  view: View;
  trackId: string | null;
  label: string;
  /** DOM id of the tab button. */
  id: string;
}

const VIEW_LABELS: Record<Exclude<View, 'track'>, string> = {
  overview: 'Overview',
  versions: 'Versions',
  timeline: 'Timeline',
  decisions: 'Decisions',
  history: 'History',
  parked: 'Parked',
};

/** Tabs in order: the fixed views, with one tab per track after Versions. */
export function tabsOf(tracks: readonly { id: string; title: string }[]): Tab[] {
  const tabs: Tab[] = [];
  for (const view of VIEWS) {
    tabs.push({
      view,
      trackId: null,
      label: VIEW_LABELS[view as Exclude<View, 'track'>],
      id: `tab-${view}`,
    });
    if (view === 'versions') {
      for (const t of tracks)
        tabs.push({ view: 'track', trackId: t.id, label: t.title, id: `tab-track-${t.id}` });
    }
  }
  return tabs;
}
export const STATUS_LIST: readonly Status[] = [
  'todo',
  'doing',
  'review',
  'blocked',
  'done',
  'parked',
];

export interface State {
  view: View;
  /** The track of a `track` view. */
  trackId?: string | null;
  versionId: string | null;
  status: Status[];
  q: string;
  zoom: 'month' | 'quarter';
}

export function parseHash(hash: string): State {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?', 2);
  const [view = '', second = '', third = ''] = path.split('/', 3);
  const isTrack = view === 'track';
  const trackId = isTrack && /^[a-z0-9-]{1,32}$/.test(second) ? second : null;
  const versionId = isTrack ? third : second;
  const params = new URLSearchParams(query);
  const status = (params.get('status') ?? '')
    .split(',')
    .filter((s): s is Status => (STATUS_LIST as readonly string[]).includes(s));
  return {
    view: isTrack
      ? trackId === null
        ? 'overview'
        : 'track'
      : (VIEWS as readonly string[]).includes(view)
        ? (view as View)
        : 'overview',
    ...(trackId === null ? {} : { trackId }),
    versionId: (isTrack
      ? /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
      : /^v\d+\.\d+\.\d+[0-9A-Za-z.-]*$/
    ).test(versionId)
      ? versionId
      : null,
    status,
    q: (params.get('q') ?? '').slice(0, 200),
    zoom: params.get('zoom') === 'quarter' ? 'quarter' : 'month',
  };
}

export function formatHash(state: State): string {
  const params = new URLSearchParams();
  if (state.status.length > 0) params.set('status', state.status.join(','));
  if (state.q !== '') params.set('q', state.q);
  if (state.zoom === 'quarter') params.set('zoom', 'quarter');
  const query = params.toString();
  const head = state.view === 'track' && state.trackId ? `track/${state.trackId}` : state.view;
  const path = state.versionId ? `${head}/${state.versionId}` : head;
  return `#/${path}${query === '' ? '' : `?${query}`}`;
}
