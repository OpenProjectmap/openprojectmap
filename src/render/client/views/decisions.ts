import type { ProjectData } from '../../../core/types.js';
import { chip, emptyNote, table } from '../components.js';
import { h } from '../h.js';
import { formatDay, t } from '../i18n/index.js';
import type { MessageKey } from '../i18n/index.js';
import { rich } from '../rich.js';
import { ctxOf } from './overview.js';

export function renderDecisions(data: ProjectData): Node {
  const ctx = ctxOf(data);
  const decisions =
    data.decisions.length === 0
      ? emptyNote(t('decisions.none'))
      : table(
          [
            t('common.id'),
            t('decisions.title'),
            t('decisions.col.default'),
            t('decisions.col.neededBy'),
            t('common.status'),
            t('decisions.col.outcome'),
          ],
          data.decisions.map((d) => [
            h('code', null, d.id),
            rich(d.question, ctx),
            rich(d.default, ctx),
            d.neededBy === null ? '' : formatDay(d.neededBy),
            h(
              'span',
              null,
              chip(t(`decision.${d.status}` as MessageKey), d.status === 'open' ? 'doing' : 'done'),
              d.overdue ? h('small', { class: 'overdue' }, t('common.overdue')) : null,
            ),
            rich(d.outcome, ctx),
          ]),
          t('decisions.title'),
        );
  const risks =
    data.risks.length === 0
      ? emptyNote(t('risks.none'))
      : table(
          [
            t('common.id'),
            t('risks.col.risk'),
            t('risks.col.likelihood'),
            t('risks.col.impact'),
            t('risks.col.score'),
            t('risks.col.mitigation'),
            t('versions.col.owner'),
          ],
          [...data.risks]
            .sort((a, b) => b.score - a.score)
            .map((r) => [
              h('code', null, r.id),
              rich(r.risk, ctx),
              r.likelihood ?? t('risks.unknown'),
              r.impact ?? t('risks.unknown'),
              h('span', null, String(r.score), r.open ? '' : t('common.closed')),
              rich(r.mitigation, ctx),
              r.owner ?? '',
            ]),
          t('risks.title'),
        );
  return h(
    'div',
    null,
    h('section', { class: 'card' }, h('h2', null, t('decisions.title')), decisions),
    h('section', { class: 'card' }, h('h2', null, t('risks.title')), risks),
  );
}
