import type { ProjectData } from '../../../core/types.js';
import { card, emptyNote, table } from '../components.js';
import { h } from '../h.js';
import { rich } from '../rich.js';
import { ctxOf } from './overview.js';

export function renderParked(data: ProjectData): Node {
  const ctx = ctxOf(data);
  return card(
    'Parked',
    h(
      'p',
      { class: 'muted' },
      "Parked items are ideas you've decided not to do yet. Revisit them when the condition is met.",
    ),
    data.parked.length === 0
      ? emptyNote('Nothing is parked.')
      : table(
          ['Item', 'Why', 'Revisit when'],
          data.parked.map((p) => [rich(p.item, ctx), rich(p.why, ctx), rich(p.revisitWhen, ctx)]),
          'Parked items',
        ),
  );
}
