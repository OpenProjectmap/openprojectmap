// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CLIENT_JS, STYLES_CSS, TEMPLATE_HTML } from '../../src/render/assets.generated.js';
import {
  escapeHtml,
  embedJson,
  noscriptSummary,
  onAccent,
  renderHtml,
} from '../../src/render/render.js';
import { tidepool } from './helpers.js';

const assets = { clientJs: CLIENT_JS, stylesCss: STYLES_CSS, templateHtml: TEMPLATE_HTML };
const sha = (t: string): string =>
  `'sha256-${createHash('sha256').update(t, 'utf8').digest('base64')}'`;

describe('escapeHtml', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&#60;a href=&#34;x&#34; onclick=&#39;y&#39;&#62;&#38;&#60;/a&#62;',
    );
    expect(escapeHtml('plain')).toBe('plain');
  });
});

describe('embedJson', () => {
  it('leaves no <, >, & or line-separator in the output and parses back to the same value', () => {
    const value = { a: '</script><script>x</script> & > \u2028 \u2029', n: [1, null, true] };
    const out = embedJson(value);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(value);
  });
});

describe('onAccent', () => {
  it('picks the higher-contrast text colour', () => {
    expect(onAccent('#2f6fed')).toBe('#000000'); // 4.8:1 against black beats 4.4:1 against white
    expect(onAccent('#0f8b8d')).toBe('#000000');
    expect(onAccent('#ffffff')).toBe('#000000');
    expect(onAccent('#000000')).toBe('#ffffff');
    expect(onAccent('#ffd400')).toBe('#000000');
    expect(onAccent('#7a1fa2')).toBe('#ffffff');
  });
});

describe('noscriptSummary', () => {
  it('lists the title, next step and versions, escaped', () => {
    const d = tidepool();
    d.project.title = '<b>T</b>';
    const html = noscriptSummary(d);
    expect(html).toContain('<h1>&#60;b&#62;T&#60;/b&#62;</h1>');
    expect(html).toContain('<strong>Next step:</strong>');
    expect((html.match(/<li>/g) ?? []).length).toBe(d.versions.length);
    expect(html).toContain('Turn on JavaScript');
  });
  it('copes with no Now block and no Why', () => {
    const d = tidepool();
    d.now = null;
    expect(noscriptSummary(d)).not.toContain('Next step');
    const e = tidepool();
    if (e.now) e.now.why = null;
    expect(noscriptSummary(e)).not.toContain('Why:');
  });
});

describe('live pages for opmap serve', () => {
  it('a live page may connect to its own origin and says so; a normal page may not', () => {
    const live = renderHtml(tidepool(), assets, undefined, { live: true });
    const plain = renderHtml(tidepool(), assets);
    expect(live.csp).toContain("connect-src 'self'");
    expect(plain.csp).not.toContain('connect-src');
    expect(live.html).toContain('<meta name="opmap-live" content="1">');
    expect(plain.html).not.toContain('<meta name="opmap-live"');
    expect(
      new DOMParser()
        .parseFromString(live.html, 'text/html')
        .querySelector('meta[http-equiv=Content-Security-Policy]')
        ?.getAttribute('content'),
    ).toBe(live.csp);
  });
});

describe('renderHtml', () => {
  const { html, cspHashes } = renderHtml(tidepool(), assets, {
    accent: '#0f8b8d',
    mode: 'dark',
    density: 'compact',
  });
  const doc = new DOMParser().parseFromString(html, 'text/html');

  it('builds the skeleton from spec 05 §1', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(doc.documentElement.dataset['theme']).toBe('dark');
    expect(doc.documentElement.dataset['density']).toBe('compact');
    expect(doc.title).toBe('Tidepool · Project map');
    expect(doc.querySelector('meta[name=generator]')?.getAttribute('content')).toBe(
      'openprojectmap 0.1.0-test',
    );
    expect(doc.querySelector('meta[name=referrer]')?.getAttribute('content')).toBe('no-referrer');
    expect(doc.querySelector('meta[name=viewport]')?.getAttribute('content')).toContain(
      'viewport-fit=cover',
    );
    expect(doc.querySelector('#app noscript')?.textContent).toContain('Tidepool');
  });
  it('hashes the exact inline script and style in the CSP, with no unsafe-inline', () => {
    const csp =
      doc.querySelector('meta[http-equiv=Content-Security-Policy]')?.getAttribute('content') ?? '';
    const scripts = [...doc.querySelectorAll('script')].filter(
      (s) => s.type !== 'application/json',
    );
    expect(scripts).toHaveLength(1);
    expect(sha(scripts[0]?.textContent ?? '')).toBe(cspHashes.script);
    expect(sha(doc.querySelector('style')?.textContent ?? '')).toBe(cspHashes.style);
    expect(csp).toBe(
      `default-src 'none'; script-src ${cspHashes.script}; style-src ${cspHashes.style}; img-src data:; base-uri 'none'; form-action 'none'`,
    );
    expect(csp).not.toContain('unsafe');
  });
  it('sets the accent and a readable text colour', () => {
    expect(doc.querySelector('style')?.textContent).toContain(
      '--accent:#0f8b8d;--on-accent:#000000',
    );
  });
  it('embeds data that parses back, with no raw < or & in the block', () => {
    const block = doc.getElementById('opmap-data');
    expect(block?.getAttribute('type')).toBe('application/json');
    expect(block?.textContent).not.toMatch(/[<>&]/);
    expect(JSON.parse(block?.textContent ?? '').project.title).toBe('Tidepool');
  });
  it('uses the default theme and does not expand placeholders inside values', () => {
    const d = tidepool();
    d.project.title = 'T {{script}} {{data}}';
    const out = renderHtml(d, assets);
    expect(out.html).toContain('data-theme="auto"');
    expect(new DOMParser().parseFromString(out.html, 'text/html').title).toBe(
      'T {{script}} {{data}} · Project map',
    );
    expect(renderHtml(d, { ...assets, templateHtml: '{{unknown}}|{{title}}' }).html).toBe(
      '|T {{script}} {{data}}',
    );
  });
  it('is the same bytes for the same input', () => {
    expect(renderHtml(tidepool(), assets).html).toBe(renderHtml(tidepool(), assets).html);
  });
  it('stays small', () => {
    expect(Buffer.byteLength(html)).toBeLessThan(120_000);
  });
});
