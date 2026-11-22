import type { ProjectData } from '../../../core/types.js';
import { card, chip, emptyNote, progressBar, stateChip } from '../components.js';
import { h } from '../h.js';
import { formatDay, t } from '../i18n/index.js';
import { rich } from '../rich.js';
import type { RichContext } from '../rich.js';

export function ctxOf(data: ProjectData): RichContext {
  return { versions: new Set(data.versions.map((v) => v.id)) };
}

export function renderOverview(data: ProjectData): Node {
  const ctx = ctxOf(data);
  const { now, derived } = data;
  const current = data.versions.find((v) => v.id === derived.currentVersionId) ?? null;
  const cards: Node[] = [];

  cards.push(
    card(
      t('overview.now'),
      now === null
        ? emptyNote(t('overview.noNow'))
        : [
            h('p', { class: 'next' }, rich(now.nextStep, ctx)),
            now.why ? h('p', { class: 'why' }, rich(now.why, ctx)) : null,
            now.target
              ? h('p', null, h('strong', null, t('overview.target')), rich(now.target, ctx))
              : null,
            now.facts.length === 0
              ? null
              : h(
                  'dl',
                  { class: 'facts' },
                  now.facts.map((f) => [h('dt', null, f.key), h('dd', null, rich(f.value, ctx))]),
                ),
          ],
    ),
  );

  cards.push(
    card(
      t('overview.progress'),
      current
        ? [
            h(
              'p',
              null,
              h('a', { href: `#/versions/${current.id}` }, `${current.id} ${current.title}`),
              ' ',
              stateChip(current.state),
            ),
            progressBar(current.progress, current.id),
          ]
        : emptyNote(t('overview.noCurrent')),
      h('p', { class: 'muted' }, t('overview.overall')),
      progressBar(derived.overall, t('overview.overall')),
    ),
  );

  const milestones = data.milestones.map((m) => {
    const mp = derived.milestoneProgress.find((x) => x.id === m.id);
    return h(
      'li',
      { class: mp?.reached ? 'ms reached' : 'ms' },
      h('strong', null, m.id),
      ' ',
      m.name,
      ' ',
      mp?.reached
        ? chip(
            t('overview.reached', {
              date: m.reachedOn === null ? '' : formatDay(m.reachedOn),
            }).trim(),
            'done',
          )
        : chip(`${mp?.pct ?? 0}%`, 'todo'),
    );
  });
  if (milestones.length > 0)
    cards.push(card(t('overview.milestones'), h('ul', { class: 'plain' }, milestones)));

  const calls = derived.needsYourCall
    .map((id) => data.decisions.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => d !== undefined);
  cards.push(
    card(
      t('overview.calls'),
      calls.length === 0
        ? emptyNote(t('overview.noCalls'))
        : h(
            'ul',
            { class: 'plain' },
            calls.map((d) =>
              h(
                'li',
                null,
                h('strong', null, d.id),
                ' ',
                rich(d.question, ctx),
                h('div', { class: 'muted' }, t('overview.default'), rich(d.default, ctx)),
                d.neededBy
                  ? h(
                      'div',
                      { class: d.overdue ? 'overdue' : 'muted' },
                      d.overdue
                        ? t('overview.proceeding', { date: formatDay(d.neededBy) })
                        : t('overview.neededBy', { date: formatDay(d.neededBy) }),
                    )
                  : null,
              ),
            ),
          ),
    ),
  );

  const risks = derived.topRisks
    .map((id) => data.risks.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
  cards.push(
    card(
      t('overview.risks'),
      risks.length === 0
        ? emptyNote(t('overview.noRisks'))
        : h(
            'ul',
            { class: 'plain' },
            risks.map((r) =>
              h(
                'li',
                null,
                h('strong', null, r.id),
                ' ',
                rich(r.risk, ctx),
                ' ',
                chip(t('overview.score', { n: r.score }), 'blocked'),
              ),
            ),
          ),
    ),
  );

  const latest = data.releases.find((r) => !r.unreleased) ?? data.releases[0];
  if (latest) {
    const items = latest.sections.flatMap((s) => s.items).slice(0, 6);
    cards.push(
      card(
        t('overview.latest'),
        h(
          'p',
          null,
          h(
            'strong',
            null,
            latest.unreleased ? t('common.unreleased') : `v${latest.version ?? ''}`,
          ),
          latest.date ? ` · ${formatDay(latest.date)}` : '',
          latest.title ? ` · ${latest.title}` : '',
        ),
        items.length === 0
          ? emptyNote(t('common.noEntries'))
          : h(
              'ul',
              null,
              items.map((i) => h('li', null, rich(i, ctx))),
            ),
      ),
    );
  }

  if (data.git?.head) {
    const heads = Object.entries(data.git.branches).filter(([, c]) => c !== null);
    cards.push(
      card(
        t('overview.git'),
        h(
          'ul',
          { class: 'plain' },
          [['head', data.git.head] as const, ...heads].map(([role, c]) =>
            c
              ? h(
                  'li',
                  null,
                  h('strong', null, role),
                  ' ',
                  h('code', null, c.sha),
                  ' ',
                  formatDay(c.date.slice(0, 10)),
                  ' ',
                  c.subject,
                )
              : null,
          ),
        ),
      ),
    );
  }

  return h('div', { class: 'grid' }, cards);
}
