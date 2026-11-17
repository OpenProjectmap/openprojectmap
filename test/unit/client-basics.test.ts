// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { append, h, setVar } from '../../src/render/client/h.js';
import { rich } from '../../src/render/client/rich.js';
import { formatHash, parseHash } from '../../src/render/client/router.js';
import { safeHref } from '../../src/render/client/safe.js';
import { loadMode, nextMode, saveMode } from '../../src/render/client/theme.js';

describe('safeHref', () => {
  it('allows https, http, mailto, fragments and relative paths', () => {
    for (const ok of [
      'https://a.dev/x?y=1#z',
      'http://a.dev',
      'HTTPS://A.DEV',
      'mailto:a@b.dev',
      '#/versions/v1',
      'docs/a.md',
      '../up.md',
      '/abs/path',
      './x',
    ]) {
      expect(safeHref(ok)).toBe(ok);
    }
    expect(safeHref('  https://a.dev  ')).toBe('https://a.dev');
  });
  it('refuses every other scheme and protocol-relative or backslash forms', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>',
      'vbscript:x',
      'file:///etc/passwd',
      'blob:x',
      'ftp://a',
      '//evil.dev',
      '\\\\evil.dev',
      '/\\evil.dev',
      '',
    ]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
  it('refuses control characters, even ones that hide a scheme', () => {
    for (const bad of [
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'https://a.dev/\u0000',
      '\u0007x',
      'a\u2028b',
      'a\u0085b',
    ]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe('h', () => {
  it('builds elements with allowed attributes, text and nested children', () => {
    const el = h(
      'div',
      {
        class: 'a',
        id: 'x',
        role: 'region',
        tabindex: 0,
        'aria-label': 'L',
        'data-k': 'v',
        hidden: undefined,
      },
      'text',
      3,
      null,
      false,
      [h('span', null, 'in')],
    );
    expect(el.outerHTML).toBe(
      '<div class="a" id="x" role="region" tabindex="0" aria-label="L" data-k="v">text3<span>in</span></div>',
    );
  });
  it('sets boolean attributes and skips false, null and undefined', () => {
    const el = h('input', { type: 'checkbox', checked: true, disabled: false, name: null });
    expect(el.outerHTML).toBe('<input type="checkbox" checked="">');
  });
  it('only sets a href that passes safeHref', () => {
    expect(h('a', { href: 'https://a.dev' }, 'x').getAttribute('href')).toBe('https://a.dev');
    expect(h('a', { href: 'javascript:alert(1)' }, 'x').hasAttribute('href')).toBe(false);
  });
  it('refuses style, title, srcdoc, event attributes and unknown tags', () => {
    for (const name of [
      'style',
      'title',
      'srcdoc',
      'onclick',
      'innerHTML',
      'src',
      'ARIA-x',
      'data-',
      'aria-A',
    ]) {
      expect(() => h('div', { [name]: 'x' })).toThrow(/not allowed|must be a function/);
    }
    for (const tag of [
      'script',
      'iframe',
      'style',
      'img',
      'object',
      'embed',
      'form',
      'link',
      'meta',
      'base',
      'svg:script',
    ]) {
      expect(() => h(tag)).toThrow(/not allowed/);
    }
  });
  it('wires onClick-style props to listeners, and refuses strings or stray functions', () => {
    let n = 0;
    const b = h('button', { type: 'button', onClick: () => n++ }, 'go');
    b.dispatchEvent(new Event('click'));
    expect(n).toBe(1);
    expect(() => h('button', { onClick: 'alert(1)' })).toThrow('must be a function');
    expect(() => h('button', { class: () => 1 })).toThrow('cannot be a function');
  });
  it('creates SVG elements in the SVG namespace', () => {
    const s = h(
      'svg',
      { viewBox: '0 0 10 10', role: 'img' },
      h('path', { d: 'M0 0L10 10', stroke: 'currentColor' }),
    );
    expect(s.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(s.firstElementChild?.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
  it('append flattens nested arrays', () => {
    const p = document.createElement('p');
    append(p, ['a', ['b', ['c', null]], 1]);
    expect(p.textContent).toBe('abc1');
  });
  it('setVar sets a custom property and refuses other names', () => {
    const el = document.createElement('span');
    setVar(el, '--n', 3);
    expect(el.style.getPropertyValue('--n')).toBe('3');
    expect(() => setVar(el, 'color' as '--x', 'red')).toThrow('bad property');
    expect(() => setVar(el, '--X' as '--x', 'red')).toThrow('bad property');
  });
});

describe('rich', () => {
  const text = (nodes: DocumentFragment): string => nodes.textContent ?? '';
  const html = (nodes: DocumentFragment): string => {
    const d = document.createElement('div');
    d.appendChild(nodes);
    return d.innerHTML;
  };
  it('renders emphasis, code and links as elements', () => {
    expect(html(rich('**b** *i* ~~s~~ `c` [l](https://a.dev)'))).toBe(
      '<strong>b</strong> <em>i</em> <s>s</s> <code>c</code> <a href="https://a.dev" data-external="true">l</a>',
    );
  });
  it('keeps HTML as text', () => {
    const out = html(rich('<img src=x onerror=alert(1)> <script>alert(1)</script>'));
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt; &lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('renders an unsafe link as plain text', () => {
    expect(html(rich('[x](javascript:alert(1))'))).toBe('<span>x</span>)');
    expect(html(rich('[x](data:text/html,1)'))).toBe('<span>x</span>');
  });
  it('links deliverable IDs to their version only when it exists', () => {
    expect(html(rich('see 0.2.0-D5', { versions: new Set(['v0.2.0']) }))).toBe(
      'see <a href="#/versions/v0.2.0?q=0.2.0-D5" data-id="0.2.0-D5">0.2.0-D5</a>',
    );
    expect(html(rich('see 0.2.0-D5', { versions: new Set() }))).toBe('see <code>0.2.0-D5</code>');
    expect(html(rich('see 0.2.0-D5'))).toBe('see <code>0.2.0-D5</code>');
  });
  it('handles empty, null and undefined', () => {
    expect(text(rich(''))).toBe('');
    expect(text(rich(null))).toBe('');
    expect(text(rich(undefined))).toBe('');
  });
});

describe('router', () => {
  it('parses views, versions, filters and search', () => {
    expect(parseHash('#/versions/v0.2.0?status=doing,blocked,nope&q=timeline')).toEqual({
      view: 'versions',
      versionId: 'v0.2.0',
      status: ['doing', 'blocked'],
      q: 'timeline',
      zoom: 'month',
    });
    expect(parseHash('')).toEqual({
      view: 'overview',
      versionId: null,
      status: [],
      q: '',
      zoom: 'month',
    });
    expect(parseHash('#/nonsense/x')).toMatchObject({ view: 'overview', versionId: null });
    expect(parseHash('#/versions/not-a-version')).toMatchObject({
      view: 'versions',
      versionId: null,
    });
    expect(parseHash(`#/versions?q=${'x'.repeat(500)}`).q).toHaveLength(200);
  });
  it('formats a hash that parses back to the same state', () => {
    for (const state of [
      { view: 'overview', versionId: null, status: [], q: '', zoom: 'month' },
      {
        view: 'versions',
        versionId: 'v1.0.0-rc.1',
        status: ['todo', 'done'],
        q: 'a b&c',
        zoom: 'month',
      },
      { view: 'decisions', versionId: null, status: [], q: 'x', zoom: 'month' },
      { view: 'timeline', versionId: null, status: [], q: '', zoom: 'quarter' },
    ] as const) {
      expect(parseHash(formatHash({ ...state, status: [...state.status] }))).toEqual(state);
    }
    expect(
      formatHash({ view: 'overview', versionId: null, status: [], q: '', zoom: 'month' }),
    ).toBe('#/overview');
  });
});

describe('theme', () => {
  it('cycles auto, light, dark', () => {
    expect(['auto', 'light', 'dark', 'auto'].map(nextMode)).toEqual([
      'light',
      'dark',
      'auto',
      'light',
    ]);
    expect(nextMode('weird')).toBe('auto');
  });
  it('remembers the mode when localStorage works and falls back when it does not', () => {
    expect(loadMode('dark')).toBe('dark');
    expect(loadMode('weird')).toBe('auto');
    saveMode('light');
    expect(loadMode('dark')).toBe('light');
    window.localStorage.setItem('opmap-theme', 'bogus');
    expect(loadMode('dark')).toBe('dark');
  });
  it('survives a localStorage that throws', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    try {
      expect(() => saveMode('dark')).not.toThrow();
      expect(loadMode('light')).toBe('light');
    } finally {
      if (real) Object.defineProperty(window, 'localStorage', real);
    }
  });
});
