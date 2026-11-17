import { describe, expect, it } from 'vitest';
import { normalizeText, scan } from '../../src/core/scan.js';
import type { Block } from '../../src/core/scan.js';

const types = (blocks: Block[]): string[] => blocks.map((b) => b.type);

describe('normalizeText', () => {
  it('strips a BOM and normalises CRLF and CR, keeping tabs', () => {
    expect(normalizeText('﻿a\r\nb\rc\td')).toBe('a\nb\nc\td');
  });
  it('leaves text without a BOM alone', () => {
    expect(normalizeText('x')).toBe('x');
  });
});

describe('scan: marker', () => {
  it('reads the format marker on the first non-blank line', () => {
    expect(scan('\n\n<!-- opmap: 1 -->\n# T').marker).toEqual({ version: 1, line: 3 });
  });
  it('reads a higher version', () => {
    expect(scan('<!--opmap:12-->').marker).toEqual({ version: 12, line: 1 });
  });
  it('is null when the first non-blank line is something else', () => {
    expect(scan('# T\n<!-- opmap: 1 -->').marker).toBeNull();
  });
  it('is null for empty input', () => {
    expect(scan('')).toEqual({ blocks: [], marker: null, notes: [] });
  });
});

describe('scan: headings', () => {
  it('reads levels 1 to 6 with text, line and column', () => {
    const { blocks } = scan('# One\n\n  ### Three ###\n###### Six\n####### seven');
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1, text: 'One', line: 1, column: 1 });
    expect(blocks[1]).toMatchObject({ level: 3, text: 'Three', line: 3, column: 3 });
    expect(blocks[2]).toMatchObject({ level: 6, text: 'Six' });
    expect(blocks[3]).toMatchObject({ type: 'paragraph', text: '####### seven' });
  });
  it('treats text glued to hashes as a paragraph', () => {
    expect(types(scan('#nospace').blocks)).toEqual(['paragraph']);
  });
  it('accepts an empty heading and keeps hashes that are part of the text', () => {
    const { blocks } = scan('##\n# C#\n# ###');
    expect(blocks.map((b) => (b.type === 'heading' ? b.text : '?'))).toEqual(['', 'C#', '']);
  });
  it('does not treat setext underlines as headings', () => {
    expect(types(scan('Title\n=====').blocks)).toEqual(['paragraph']);
  });
});

describe('scan: fields', () => {
  it('reads **Key:** value', () => {
    const { blocks } = scan('**Next step:**   Do the thing  \n**  Spaced   key :** v');
    expect(blocks[0]).toMatchObject({
      type: 'field',
      key: 'Next step',
      value: 'Do the thing',
      line: 1,
      column: 1,
    });
    expect(blocks[1]).toMatchObject({ key: 'Spaced key', value: 'v' });
  });
  it('requires a value', () => {
    expect(types(scan('**Key:**').blocks)).toEqual(['paragraph']);
  });
  it('interrupts a paragraph', () => {
    expect(types(scan('prose\n**A:** b').blocks)).toEqual(['paragraph', 'field']);
  });
});

describe('scan: paragraphs', () => {
  it('joins consecutive lines and splits on blank lines', () => {
    const { blocks } = scan('one\n  two\n\nthree');
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'one two', lines: ['one', 'two'], line: 1, column: 1 },
      { type: 'paragraph', text: 'three', lines: ['three'], line: 4, column: 1 },
    ]);
  });
  it('is interrupted by a heading', () => {
    expect(types(scan('a\n# H\nb').blocks)).toEqual(['paragraph', 'heading', 'paragraph']);
  });
  it('reports the column of an indented paragraph', () => {
    expect(scan('   text').blocks[0]).toMatchObject({ column: 4 });
  });
});

describe('scan: tables', () => {
  const table =
    '| ID | Deliverable | Status |\n| --- | :---: | ---: |\n| D1 | One | done |\n| D2 | Two | todo |\n\nafter';

  it('reads head, rows and row lines', () => {
    const { blocks } = scan(table);
    expect(blocks[0]).toEqual({
      type: 'table',
      head: ['ID', 'Deliverable', 'Status'],
      rows: [
        ['D1', 'One', 'done'],
        ['D2', 'Two', 'todo'],
      ],
      rowLines: [3, 4],
      line: 1,
      column: 1,
    });
    expect(blocks[1]).toMatchObject({ type: 'paragraph', text: 'after', line: 6 });
  });
  it('works without outer pipes on the delimiter and with a missing trailing pipe', () => {
    const { blocks } = scan('| a | b\n--- | ---\n| 1 | 2');
    expect(blocks[0]).toMatchObject({ head: ['a', 'b'], rows: [['1', '2']] });
  });
  it('is a paragraph when no delimiter row follows', () => {
    expect(types(scan('| a | b |\n| 1 | 2 |').blocks)).toEqual(['paragraph']);
  });
  it('is a paragraph when the pipe line is the last line', () => {
    expect(types(scan('| a |').blocks)).toEqual(['paragraph']);
  });
  it('keeps escaped pipes and pipes inside backticks', () => {
    const { blocks } = scan('| a | b |\n| --- | --- |\n| x \\| y | `p\\|q` and `a|b` |');
    expect(blocks[0]).toMatchObject({ rows: [['x | y', '`p|q` and `a|b`']] });
  });
  it('treats an unmatched backtick as a literal', () => {
    const { blocks } = scan('| a | b |\n| --- | --- |\n| `x | y |');
    expect(blocks[0]).toMatchObject({ rows: [['`x', 'y']] });
  });
  it('skips code runs of a length that has no closer', () => {
    const { blocks } = scan('| a | b |\n| --- | --- |\n| `` ` `` | ` `` `` x | y |');
    const t = blocks[0];
    expect(t?.type === 'table' && t.rows[0]?.[0]).toBe('`` ` ``');
  });
  it('pads short rows', () => {
    const { blocks } = scan('| a | b | c |\n| --- | --- | --- |\n| 1 |');
    expect(blocks[0]).toMatchObject({ rows: [['1', '', '']] });
  });
  it('drops extra cells with an OPM-I702 note at the first extra cell', () => {
    const r = scan('| a | b |\n| --- | --- |\n| 1 | 2 | 3 | 4 |');
    expect(r.blocks[0]).toMatchObject({ rows: [['1', '2']] });
    expect(r.notes).toEqual([
      {
        code: 'OPM-I702',
        message: 'Table row has 4 cells but the header has 2',
        line: 3,
        column: 11,
      },
    ]);
  });
  it('starts the table at its own line and column', () => {
    const { blocks } = scan('intro\n\n  | a |\n  | --- |\n  | 1 |');
    expect(blocks[1]).toMatchObject({ type: 'table', line: 3, column: 3, rowLines: [5] });
  });
  it('handles empty cells and a single trailing pipe', () => {
    const { blocks } = scan('| a | b |\n| --- | --- |\n|  |  |\n| x ||');
    expect(blocks[0]).toMatchObject({
      rows: [
        ['', ''],
        ['x', ''],
      ],
    });
  });
  it('interrupts a paragraph only at a real table', () => {
    expect(types(scan('prose\n| a |\n| --- |\n| 1 |').blocks)).toEqual(['paragraph', 'table']);
  });
});

describe('scan: skipped regions', () => {
  it('skips fenced code with backticks and tildes', () => {
    const src = '```md\n# not a heading\n**A:** b\n```\n~~~\n# no\n~~~~\n# Yes';
    expect(scan(src).blocks).toEqual([
      { type: 'heading', level: 1, text: 'Yes', line: 8, column: 1 },
    ]);
  });
  it('needs a closing fence at least as long as the opener', () => {
    const src = '````\n```\n# inside\n````\n# out';
    expect(scan(src).blocks).toHaveLength(1);
  });
  it('does not close a fence on a line with other text', () => {
    expect(scan('```\n``` x\n# inside\n```\n# out').blocks).toHaveLength(1);
  });
  it('keeps skipping to the end of input when a fence never closes', () => {
    expect(scan('```\n# a\n# b').blocks).toEqual([]);
  });
  it('treats a backtick fence line with a backtick in its info string as inline code', () => {
    expect(types(scan('```x```').blocks)).toEqual(['paragraph']);
  });
  it('skips single-line and multi-line comments and keeps columns', () => {
    const src = 'a <!-- x --> b\n<!-- start\n# hidden\n**K:** v\nend --> after\n# H';
    const { blocks } = scan(src);
    expect(blocks[0]).toMatchObject({ type: 'paragraph', text: 'a b', line: 1 });
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'heading']);
    expect(blocks[2]).toMatchObject({ text: 'H', line: 6 });
  });
  it('removes a comment that closes and reopens on one line', () => {
    expect(scan('<!-- a --> x <!-- b').blocks[0]).toMatchObject({ type: 'paragraph', text: 'x' });
  });
  it('ignores a fence opener inside a comment', () => {
    expect(types(scan('<!--\n```\n-->\n# H').blocks)).toEqual(['heading']);
  });
  it('leaves comment markers inside inline code alone', () => {
    const b = scan('see `<!-- opmap: 1 -->` here').blocks[0];
    expect(b).toMatchObject({ text: 'see `<!-- opmap: 1 -->` here' });
  });
  it('treats an unclosed backtick before a comment as literal', () => {
    expect(scan('a ` b <!-- c --> d').blocks[0]).toMatchObject({ text: 'a ` b d' });
  });
  it('handles a comment that never closes', () => {
    expect(scan('x\n<!-- open\n# y').blocks).toHaveLength(1);
  });
});

describe('scan: line endings and scale', () => {
  it('reports the same blocks for CRLF, CR and a BOM', () => {
    const lf = scan('# T\n\n**A:** b\n\n| x |\n| - |\n| 1 |');
    const crlf = scan('﻿# T\r\n\r\n**A:** b\r\n\r\n| x |\r\n| - |\r\n| 1 |');
    expect(crlf.blocks).toEqual(lf.blocks);
  });
  it('stays fast on hostile input', () => {
    const t0 = performance.now();
    scan(
      '`'.repeat(50_000) +
        '\n' +
        '`a'.repeat(30_000) +
        '\n' +
        '<!--'.repeat(20_000) +
        '\n' +
        '| a '.repeat(20_000),
    );
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
