import type { ProjectData } from '../../../core/types.js';
import { card, chip, emptyNote, progressBar, stateChip } from '../components.js';
import { h } from '../h.js';
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
      'Now',
      now === null
        ? emptyNote('The roadmap has no Now block.')
        : [
            h('p', { class: 'next' }, rich(now.nextStep, ctx)),
            now.why ? h('p', { class: 'why' }, rich(now.why, ctx)) : null,
            now.target ? h('p', null, h('strong', null, 'Target: '), rich(now.target, ctx)) : null,
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
      'Progress',
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
        : emptyNote('No current version.'),
      h('p', { class: 'muted' }, 'Overall'),
      progressBar(derived.overall, 'Overall'),
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
        ? chip(`reached ${m.reachedOn ?? ''}`.trim(), 'done')
        : chip(`${mp?.pct ?? 0}%`, 'todo'),
    );
  });
  if (milestones.length > 0)
    cards.push(card('Milestones', h('ul', { class: 'plain' }, milestones)));

  const calls = derived.needsYourCall
    .map((id) => data.decisions.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => d !== undefined);
  cards.push(
    card(
      'Needs your call',
      calls.length === 0
        ? emptyNote('Nothing is waiting for a decision.')
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
                h('div', { class: 'muted' }, 'Default: ', rich(d.default, ctx)),
                d.neededBy
                  ? h(
                      'div',
                      { class: d.overdue ? 'overdue' : 'muted' },
                      d.overdue
                        ? `Proceeding with the default since ${d.neededBy}`
                        : `Needed by ${d.neededBy}`,
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
      'Top risks',
      risks.length === 0
        ? emptyNote('No open risk scores 6 or more.')
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
                chip(`score ${r.score}`, 'blocked'),
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
        'Latest release',
        h(
          'p',
          null,
          h('strong', null, latest.unreleased ? 'Unreleased' : `v${latest.version ?? ''}`),
          latest.date ? ` · ${latest.date}` : '',
          latest.title ? ` · ${latest.title}` : '',
        ),
        items.length === 0
          ? emptyNote('No entries.')
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
        'Git',
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
                  c.date.slice(0, 10),
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
