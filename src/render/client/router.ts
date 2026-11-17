// View state in the URL hash: `#/versions/v0.2.0?status=doing,blocked&q=timeline`.
import type { Status } from '../../core/types.js';

export type View = 'overview' | 'versions' | 'decisions';
export const VIEWS: readonly View[] = ['overview', 'versions', 'decisions'];
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
  versionId: string | null;
  status: Status[];
  q: string;
}

export function parseHash(hash: string): State {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?', 2);
  const [view = '', versionId = ''] = path.split('/', 2);
  const params = new URLSearchParams(query);
  const status = (params.get('status') ?? '')
    .split(',')
    .filter((s): s is Status => (STATUS_LIST as readonly string[]).includes(s));
  return {
    view: (VIEWS as readonly string[]).includes(view) ? (view as View) : 'overview',
    versionId: /^v\d+\.\d+\.\d+[0-9A-Za-z.-]*$/.test(versionId) ? versionId : null,
    status,
    q: (params.get('q') ?? '').slice(0, 200),
  };
}

export function formatHash(state: State): string {
  const params = new URLSearchParams();
  if (state.status.length > 0) params.set('status', state.status.join(','));
  if (state.q !== '') params.set('q', state.q);
  const query = params.toString();
  const path = state.versionId ? `${state.view}/${state.versionId}` : state.view;
  return `#/${path}${query === '' ? '' : `?${query}`}`;
}
