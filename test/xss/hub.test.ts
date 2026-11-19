// @vitest-environment jsdom
// The hub index (AGENTS.md §5): every string that reaches it comes from a user's document or hub
// file, so a payload in each one must render as text and nothing else.
import { describe, expect, it } from 'vitest';
import type { HubCard } from '../../src/core/hub.js';
import { failedCard } from '../../src/core/hub.js';
import { renderHtml } from '../../src/render/render.js';
import { renderHubHtml } from '../../src/render/hub.js';
import { CLIENT_JS, STYLES_CSS, TEMPLATE_HTML } from '../../src/render/assets.generated.js';
import { boot } from '../../src/render/client/main.js';
import { parseProject } from '../../src/core/index.js';

const PAYLOADS = [
  '<script>window.__pwned=1</script>',
  '"><img src=x onerror=window.__pwned=1>',
  "' onmouseover='window.__pwned=1' x='",
  '</style><script>window.__pwned=1</script>',
  '<svg onload=window.__pwned=1>',
  '<iframe srcdoc="<script>window.__pwned=1</script>"></iframe>',
  '[click](javascript:window.__pwned=1)',
  '  </style><style>*{display:none}</style>',
  '${alert(1)} {{data}} $& $1',
];

function card(payload: string): HubCard {
  return {
    name: payload,
    slug: 'safe-slug',
    error: null,
    projectTitle: payload,
    version: payload,
    state: payload,
    pct: 40,
    nextStep: payload,
    needsCall: 2,
    stale: true,
    lastCommit: payload,
  };
}

describe('hub index XSS', () => {
  for (const payload of PAYLOADS) {
    it(`renders ${JSON.stringify(payload).slice(0, 36)} as text`, () => {
      const { html, csp } = renderHubHtml(
        payload,
        [card(payload), failedCard(payload, 'p2', payload)],
        {
          version: payload,
          generated: payload,
        },
      );
      expect(csp).not.toContain('unsafe');
      expect(csp).not.toContain('script-src');
      document.open();
      document.write(html);
      document.close();
      expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
      for (const el of document.querySelectorAll('*')) {
        expect(['SCRIPT', 'IFRAME', 'IMG', 'SVG', 'OBJECT', 'EMBED']).not.toContain(
          el.tagName.toUpperCase(),
        );
        for (const attr of el.getAttributeNames()) expect(attr.startsWith('on')).toBe(false);
      }
      expect(document.querySelectorAll('style')).toHaveLength(1);
      const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual(['safe-slug/index.html']);
      // The payload is visible as words, which proves it was escaped rather than parsed.
      expect(document.querySelector('h1')?.textContent).toBe(payload);
      expect(document.body.textContent).toContain(payload);
    });
  }
});

describe('hub child page', () => {
  const data = parseProject(
    { roadmap: { path: 'R.md', text: '<!-- opmap: 1 -->\n# T\n\n## Now\n\n**Next step:** x\n' } },
    { now: '2026-11-25T00:00:00Z', toolVersion: 't' },
  );
  const assets = { clientJs: CLIENT_JS, stylesCss: STYLES_CSS, templateHtml: TEMPLATE_HTML };
  it('links back to the index only when built for a hub', () => {
    for (const [hubChild, expected] of [
      [true, ['../index.html']],
      [false, []],
    ] as const) {
      const { html } = renderHtml(data, assets, undefined, { hubChild });
      document.open();
      document.write(html);
      document.close();
      const stop = boot(document);
      expect([...document.querySelectorAll('a.back')].map((a) => a.getAttribute('href'))).toEqual(
        expected,
      );
      if (hubChild) expect(document.querySelector('a.back')?.textContent).toBe('← All projects');
      stop();
    }
  });
});
