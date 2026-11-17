import type { ProjectData } from '../../../core/types.js';
import { chip, emptyNote, table } from '../components.js';
import { h } from '../h.js';
import { rich } from '../rich.js';
import { ctxOf } from './overview.js';

export function renderDecisions(data: ProjectData): Node {
  const ctx = ctxOf(data);
  const decisions =
    data.decisions.length === 0
      ? emptyNote('No decisions are recorded.')
      : table(
          ['ID', 'Decision', 'Default', 'Needed by', 'Status', 'Outcome'],
          data.decisions.map((d) => [
            h('code', null, d.id),
            rich(d.question, ctx),
            rich(d.default, ctx),
            d.neededBy ?? '',
            h(
              'span',
              null,
              chip(d.status, d.status === 'open' ? 'doing' : 'done'),
              d.overdue ? h('small', { class: 'overdue' }, ' overdue') : null,
            ),
            rich(d.outcome, ctx),
          ]),
          'Decisions',
        );
  const risks =
    data.risks.length === 0
      ? emptyNote('No risks are recorded.')
      : table(
          ['ID', 'Risk', 'Likelihood', 'Impact', 'Score', 'Mitigation', 'Owner'],
          [...data.risks]
            .sort((a, b) => b.score - a.score)
            .map((r) => [
              h('code', null, r.id),
              rich(r.risk, ctx),
              r.likelihood ?? '?',
              r.impact ?? '?',
              h('span', null, String(r.score), r.open ? '' : ' (closed)'),
              rich(r.mitigation, ctx),
              r.owner ?? '',
            ]),
          'Risks',
        );
  return h(
    'div',
    null,
    h('section', { class: 'card' }, h('h2', null, 'Decisions'), decisions),
    h('section', { class: 'card' }, h('h2', null, 'Risks'), risks),
  );
}
