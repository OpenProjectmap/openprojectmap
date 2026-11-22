import type { ProjectData } from '../../../core/types.js';
import { card, emptyNote, table } from '../components.js';
import { h } from '../h.js';
import { t } from '../i18n/index.js';
import { rich } from '../rich.js';
import { ctxOf } from './overview.js';

export function renderParked(data: ProjectData): Node {
  const ctx = ctxOf(data);
  return card(
    t('parked.title'),
    h('p', { class: 'muted' }, t('parked.hint')),
    data.parked.length === 0
      ? emptyNote(t('parked.none'))
      : table(
          [t('parked.col.item'), t('parked.col.why'), t('parked.col.revisit')],
          data.parked.map((p) => [rich(p.item, ctx), rich(p.why, ctx), rich(p.revisitWhen, ctx)]),
          t('parked.items'),
        ),
  );
}
