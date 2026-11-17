import { describe, expect, it } from 'vitest';
import { inlineText, parseInline } from '../../src/core/inline.js';

const text = (s: string) => ({ t: 'text', s });

describe('parseInline', () => {
  it('keeps plain text and HTML as literal text', () => {
    expect(parseInline('hello world')).toEqual([text('hello world')]);
    expect(parseInline('<script>alert(1)</script> <b>x</b> <img src=x onerror=y>')).toEqual([
      text('<script>alert(1)</script> <b>x</b> <img src=x onerror=y>'),
    ]);
    expect(parseInline('')).toEqual([]);
  });
  it('reads bold, italic, strike and code, nested', () => {
    expect(parseInline('a **b *c* d** e')).toEqual([
      text('a '),
      { t: 'bold', c: [text('b '), { t: 'italic', c: [text('c')] }, text(' d')] },
      text(' e'),
    ]);
    expect(parseInline('~~gone~~ and `x < y`')).toEqual([
      { t: 'strike', c: [text('gone')] },
      text(' and '),
      { t: 'code', s: 'x < y' },
    ]);
    expect(parseInline('_it_ and snake_case_name')).toEqual([
      { t: 'italic', c: [text('it')] },
      text(' and snake_case_name'),
    ]);
  });
  it('handles code with double backticks and a stray backtick', () => {
    expect(parseInline('`` a`b ``')).toEqual([{ t: 'code', s: 'a`b' }]);
    expect(parseInline('one ` two')).toEqual([text('one ` two')]);
    expect(parseInline('``')).toEqual([text('``')]);
  });
  it('does not take unmatched or spaced markers for emphasis', () => {
    for (const s of [
      '**open',
      '* not italic *',
      'a * b * c',
      '2 * 3',
      '____',
      '**',
      '~~ ~~',
      '_ x_',
      'x_y_',
    ]) {
      expect(inlineText(parseInline(s))).toBe(s);
    }
    expect(parseInline('**')).toEqual([text('**')]);
  });
  it('reads links, autolinks and bare URLs', () => {
    expect(parseInline('[the **docs**](https://x.dev/a?b=1)')).toEqual([
      {
        t: 'link',
        href: 'https://x.dev/a?b=1',
        c: [text('the '), { t: 'bold', c: [text('docs')] }],
      },
    ]);
    expect(parseInline('<https://a.dev>')).toEqual([
      { t: 'link', href: 'https://a.dev', c: [text('https://a.dev')] },
    ]);
    expect(parseInline('see https://a.dev/x, then (https://b.dev/y).')).toEqual([
      text('see '),
      { t: 'link', href: 'https://a.dev/x', c: [text('https://a.dev/x')] },
      text(', then ('),
      { t: 'link', href: 'https://b.dev/y', c: [text('https://b.dev/y')] },
      text(').'),
    ]);
  });
  it('passes odd hrefs through for the client to refuse', () => {
    expect(parseInline('[x](javascript:alert(1))')[0]).toMatchObject({
      t: 'link',
      href: 'javascript:alert(1',
    });
  });
  it('leaves broken link syntax as text', () => {
    for (const s of [
      '[x](',
      '[x] (y)',
      '[](y)',
      '[x](a b)',
      '[x](  )',
      '<a b>',
      '<https://a b>',
      'http',
      'https://',
      'xhttps://a.dev',
    ]) {
      expect(inlineText(parseInline(s))).toBe(s);
    }
    expect(parseInline('xhttps://a.dev')).toEqual([text('xhttps://a.dev')]);
  });
  it('turns deliverable IDs into id tokens', () => {
    expect(parseInline('Done in 0.2.0-D5, then 0.10.1-D12.')).toEqual([
      text('Done in '),
      { t: 'id', id: '0.2.0-D5' },
      text(', then '),
      { t: 'id', id: '0.10.1-D12' },
      text('.'),
    ]);
    expect(parseInline('v0.2.0-D5x').some((t) => t.t === 'id')).toBe(false);
    expect(parseInline('1.2.3-D').some((t) => t.t === 'id')).toBe(false);
    expect(parseInline('a0.2.0-D5')).toEqual([text('a0.2.0-D5')]);
    expect(parseInline('0.2.0-D5x')).toEqual([text('0.2.0-D5x')]);
  });
  it('stops nesting at a fixed depth', () => {
    const deep = '*'.repeat(0) + '**a *b ~~c **d *e* d** c~~ b* a**';
    expect(inlineText(parseInline(deep))).toContain('e');
  });
  it('is linear on hostile input', () => {
    const t0 = performance.now();
    parseInline(
      '*a'.repeat(20_000) +
        '[x'.repeat(20_000) +
        '`'.repeat(20_000) +
        '_'.repeat(20_000) +
        '<h'.repeat(20_000),
    );
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('inlineText', () => {
  it('flattens tokens to plain text', () => {
    expect(inlineText(parseInline('**a** [b](https://x.dev) `c` 0.1.0-D1 ~~d~~'))).toBe(
      'a b c 0.1.0-D1 d',
    );
  });
});
