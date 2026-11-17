import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDecisions, splitOptions } from '../../src/core/parse-decisions.js';

const parse = (text: string, today?: string) =>
  parseDecisions({ path: 'docs/project/DECISIONS.md', text }, today ? { today } : {});
const codes = (text: string, today?: string): string[] =>
  parse(text, today).diagnostics.map((d) => d.code);

const DEC =
  '| ID | Decision | Options | Default | Needed by | Status | Outcome |\n| --- | --- | --- | --- | --- | --- | --- |\n';
const RISK =
  '| ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |\n| --- | --- | --- | --- | --- | --- | --- |\n';

describe('parseDecisions: decisions', () => {
  const doc = `# D\n\n## Decisions\n\n${DEC}| D1 | **Pick** a thing? | a · b / c; d | a | 2026-12-01 | open | |\n| D2 | Q2 | | b | 2026-11-01 | decided | Chose b |\n| D3 | Q3 | | c | | Defaulted | on 2026-11-02 |\n`;
  it('reads every column', () => {
    const r = parse(doc, '2026-11-16');
    expect(r.diagnostics).toEqual([]);
    expect(r.decisions).toEqual([
      {
        id: 'D1',
        question: '**Pick** a thing?',
        options: ['a', 'b', 'c', 'd'],
        default: 'a',
        neededBy: '2026-12-01',
        status: 'open',
        outcome: null,
        overdue: false,
        source: { file: 'docs/project/DECISIONS.md', line: 7 },
      },
      expect.objectContaining({
        id: 'D2',
        status: 'decided',
        outcome: 'Chose b',
        options: [],
        overdue: false,
      }),
      expect.objectContaining({ id: 'D3', status: 'defaulted', neededBy: null }),
    ]);
  });
  it('accepts the section aliases and column aliases', () => {
    for (const name of ['Open decisions', 'Needs your call']) {
      const t = `## ${name}\n\n| ID | Question | Proposed default | Status |\n| --- | --- | --- | --- |\n| D1 | Q | x | open |\n`;
      expect(parse(t).decisions).toHaveLength(1);
    }
  });
  it('maps status aliases', () => {
    const t = `## Decisions\n\n| ID | Decision | Default | Status |\n| --- | --- | --- | --- |\n| D1 | Q | x | closed |\n| D2 | Q | x | done 2026-01-01 |\n| D3 | Q | x | Proceeding |\n| D4 | Q | x | **open** |\n`;
    expect(parse(t).decisions.map((d) => d.status)).toEqual([
      'decided',
      'decided',
      'defaulted',
      'open',
    ]);
  });
  it('OPM-W501 for an open decision past its date, only when today is known', () => {
    const t = `## Decisions\n\n${DEC}| D1 | Q | | x | 2026-11-01 | open | |\n| D2 | Q | | x | 2026-11-01 | decided | |\n`;
    const r = parse(t, '2026-11-16');
    expect(r.diagnostics.map((d) => [d.code, d.line])).toEqual([['OPM-W501', 5]]);
    expect(r.decisions.map((d) => d.overdue)).toEqual([true, false]);
    expect(codes(t)).toEqual([]);
    expect(parse(t, '2026-11-01').decisions[0]?.overdue).toBe(false);
  });
  it('OPM-W502 for an empty default', () => {
    expect(codes(`## Decisions\n\n${DEC}| D1 | Q | | | | open | |\n`)).toEqual(['OPM-W502']);
  });
  it('OPM-W503 for duplicate IDs, per table kind', () => {
    const t = `## Decisions\n\n${DEC}| D1 | Q | | x | | open | |\n| D1 | Q | | x | | open | |\n\n## Risks\n\n${RISK}| D1 | r | L | L | | | |\n`;
    expect(codes(t)).toEqual(['OPM-W503']);
  });
  it('OPM-W505 for an unknown status, which counts as open', () => {
    const r = parse(`## Decisions\n\n${DEC}| D1 | Q | | x | | maybe | |\n`);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['OPM-W505']);
    expect(r.decisions[0]?.status).toBe('open');
  });
  it('treats an empty status as open without a warning', () => {
    expect(codes(`## Decisions\n\n${DEC}| D1 | Q | | x | | | |\n`)).toEqual([]);
  });
  it('OPM-W701 for missing columns', () => {
    const r = parse('## Decisions\n\n| ID | Decision |\n| --- | --- |\n| D1 | Q |\n');
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      'Decisions table is missing the Default column',
      'Decisions table is missing the Status column',
    ]);
  });
  it('ignores blank rows, other sections and tables outside a section', () => {
    const t = `| ID | Decision | Default | Status |\n| --- | --- | --- | --- |\n| D9 | Q | x | open |\n\n## Notes\n\n${DEC}| D8 | Q | | x | | open | |\n\n## Decisions\n\n${DEC}| | | | | | | |\n`;
    expect(parse(t).decisions).toEqual([]);
  });
  it('stops reading after a new H1 or H2', () => {
    const t = `## Decisions\n\n${DEC}| D1 | Q | | x | | open | |\n\n# Other\n\n${DEC}| D2 | Q | | x | | open | |\n`;
    expect(parse(t).decisions.map((d) => d.id)).toEqual(['D1']);
  });
  it('keeps reading under an H3 inside the section', () => {
    expect(
      parse(`## Decisions\n\n### Group\n\n${DEC}| D1 | Q | | x | | open | |\n`).decisions,
    ).toHaveLength(1);
  });
});

describe('parseDecisions: risks', () => {
  it('reads levels, score, owner and open state', () => {
    const t = `## Risks\n\n${RISK}| R1 | Bad | M | **H** | Fix it | me | open |\n| R2 | Worse | low | Medium | | | closed |\n| R3 | X | high | high | | | Resolved |\n`;
    const r = parse(t);
    expect(r.diagnostics).toEqual([]);
    expect(r.risks).toMatchObject([
      {
        id: 'R1',
        likelihood: 'M',
        impact: 'H',
        score: 6,
        mitigation: 'Fix it',
        owner: 'me',
        open: true,
      },
      {
        id: 'R2',
        likelihood: 'L',
        impact: 'M',
        score: 2,
        mitigation: null,
        owner: null,
        open: false,
      },
      { id: 'R3', score: 9, open: false },
    ]);
  });
  it('OPM-W504 for a bad level, with score 0', () => {
    const r = parse(`## Risks\n\n${RISK}| R1 | Bad | maybe | H | | | |\n`);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['OPM-W504']);
    expect(r.risks[0]).toMatchObject({ likelihood: null, impact: 'H', score: 0 });
  });
  it('OPM-W701 for missing columns and OPM-W503 for a duplicate', () => {
    expect(codes('## Risks\n\n| ID | Risk |\n| --- | --- |\n| R1 | x |\n')).toEqual([
      'OPM-W701',
      'OPM-W701',
    ]);
    expect(
      codes(
        `## Risks\n\n${RISK}| R1 | a | L | L | | | |\n| R1 | b | L | L | | | |\n| | | | | | | |\n`,
      ),
    ).toEqual(['OPM-W503']);
  });
  it('works with only the four required columns', () => {
    const r = parse(
      '## Risks\n\n| ID | Risk | Likelihood | Impact |\n| --- | --- | --- | --- |\n| R1 | x | M | M |\n',
    );
    expect(r.risks[0]).toMatchObject({ open: true, owner: null, mitigation: null, score: 4 });
  });
});

describe('splitOptions', () => {
  it('splits on the three separators and drops empties', () => {
    expect(splitOptions('a · b / c ; d ;; ')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitOptions('')).toEqual([]);
  });
});

describe('dogfood', () => {
  it('parses this repo decisions with no problems', () => {
    const r = parse(readFileSync('docs/project/DECISIONS.md', 'utf8'), '2026-11-17');
    expect(r.diagnostics).toEqual([]);
    expect(r.decisions.length).toBeGreaterThanOrEqual(19);
    expect(r.risks.length).toBeGreaterThanOrEqual(9);
  });
  it('parses the tidepool decisions', () => {
    const r = parse(
      readFileSync('examples/tidepool/docs/project/DECISIONS.md', 'utf8'),
      '2026-11-25',
    );
    expect(r.decisions.map((d) => d.status)).toEqual(['open', 'open', 'defaulted', 'decided']);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['OPM-W501']);
  });
});
