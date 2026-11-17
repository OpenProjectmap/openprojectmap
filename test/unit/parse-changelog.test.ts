import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChangelog, parseReleaseHeading } from '../../src/core/parse-changelog.js';

const parse = (text: string) => parseChangelog({ path: 'CHANGELOG.md', text }).releases;

describe('parseReleaseHeading', () => {
  it.each([
    ['[Unreleased]', { version: null, date: null, title: null, unreleased: true }],
    ['Unreleased', { version: null, date: null, title: null, unreleased: true }],
    ['[unreleased] - next', { version: null, date: null, title: 'next', unreleased: true }],
    [
      '[0.2.0] - 2027-01-03',
      { version: '0.2.0', date: '2027-01-03', title: null, unreleased: false },
    ],
    [
      '0.2.0 - 2027-01-03',
      { version: '0.2.0', date: '2027-01-03', title: null, unreleased: false },
    ],
    [
      'v0.2.0 (2027-01-03)',
      { version: '0.2.0', date: '2027-01-03', title: null, unreleased: false },
    ],
    [
      '[0.2.0] — 2027-01-03 — Safe renderer',
      { version: '0.2.0', date: '2027-01-03', title: 'Safe renderer', unreleased: false },
    ],
    [
      '[v1.0.0-rc.1] – 2027-06-01 [YANKED]',
      { version: '1.0.0-rc.1', date: '2027-06-01', title: '[YANKED]', unreleased: false },
    ],
    ['[0.3.0]', { version: '0.3.0', date: null, title: null, unreleased: false }],
    ['0.3.0 - soon', { version: '0.3.0', date: null, title: 'soon', unreleased: false }],
    ['[0.3.0] - 2027-02-30', { version: '0.3.0', date: null, title: null, unreleased: false }],
  ])('%s', (text, expected) => {
    expect(parseReleaseHeading(text)).toEqual(expected);
  });
  it('is null for headings that are not releases', () => {
    for (const t of ['Contributing', '[0.2.0', '0.2.0x', '0.2', ''])
      expect(parseReleaseHeading(t)).toBeNull();
  });
});

describe('parseChangelog', () => {
  const doc = `# Changelog

Intro text.

## [Unreleased]

### Added

- First **thing**.
- Second thing that
  wraps onto a second line.
* Star bullet

### Fixed

- Bug [#3](https://x/3)

## [0.2.0] - 2027-01-03

### Changed

- Something

## Notes

- not a release

## 0.1.0 - 2026-12-01

- Bullets without a heading
+ Plus bullet

[Unreleased]: https://example.com/compare
[0.2.0]: https://example.com/0.2.0
`;
  it('reads releases in document order with sections and items', () => {
    const r = parse(doc);
    expect(r.map((x) => [x.version, x.date, x.unreleased])).toEqual([
      [null, null, true],
      ['0.2.0', '2027-01-03', false],
      ['0.1.0', '2026-12-01', false],
    ]);
    expect(r[0]?.sections).toEqual([
      {
        heading: 'Added',
        items: ['First **thing**.', 'Second thing that wraps onto a second line.', 'Star bullet'],
      },
      { heading: 'Fixed', items: ['Bug [#3](https://x/3)'] },
    ]);
    expect(r[0]).toMatchObject({ versionId: null, source: { file: 'CHANGELOG.md', line: 5 } });
    expect(r[1]?.sections).toEqual([{ heading: 'Changed', items: ['Something'] }]);
  });
  it('puts bullets that come before any H3 in an untitled section', () => {
    expect(parse(doc)[2]?.sections).toEqual([
      { heading: '', items: ['Bullets without a heading', 'Plus bullet'] },
    ]);
  });
  it('ignores link definitions, prose, other sections and the title', () => {
    const r = parse(doc);
    expect(JSON.stringify(r)).not.toContain('example.com');
    expect(JSON.stringify(r)).not.toContain('not a release');
    expect(JSON.stringify(r)).not.toContain('Intro text');
  });
  it('returns nothing for an empty file or one without releases', () => {
    expect(parse('')).toEqual([]);
    expect(parse('# Changelog\n\nNothing yet.\n')).toEqual([]);
  });
  it('keeps a release with no items', () => {
    expect(parse('## [1.0.0] - 2027-01-01\n\n### Added\n')).toMatchObject([
      { sections: [{ heading: 'Added', items: [] }] },
    ]);
  });
  it('treats an H1 as the end of a release', () => {
    expect(parse('## [1.0.0] - 2027-01-01\n# Other\n### Added\n- x')).toMatchObject([
      { sections: [] },
    ]);
  });
  it('parses this repo and the tidepool changelog', () => {
    const own = parse(readFileSync('CHANGELOG.md', 'utf8'));
    expect(own[0]).toMatchObject({ unreleased: true });
    expect(own[0]?.sections.length).toBeGreaterThan(0);
    const t = parse(readFileSync('examples/tidepool/CHANGELOG.md', 'utf8'));
    expect(t.map((x) => x.version)).toEqual([null, '0.1.0']);
  });
});
