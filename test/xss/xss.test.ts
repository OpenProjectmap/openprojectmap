// @vitest-environment jsdom
// The XSS suite (AGENTS.md §5): every string that reaches the page is classified, and a payload in
// each free-text field must render inert in every view.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject } from '../../src/core/index.js';
import type { ProjectData } from '../../src/core/types.js';
import { boot } from '../../src/render/client/main.js';
import { renderHtml } from '../../src/render/render.js';
import { CLIENT_JS, STYLES_CSS, TEMPLATE_HTML } from '../../src/render/assets.generated.js';

const PAYLOADS = [
  '<script>window.__pwned=1</script>',
  '"><img src=x onerror=window.__pwned=1>',
  "' onmouseover='window.__pwned=1' x='",
  '</script><script>window.__pwned=1</script>',
  '<svg onload=window.__pwned=1>',
  '<iframe srcdoc="<script>window.__pwned=1</script>"></iframe>',
  '[click](javascript:window.__pwned=1)',
  '[click](data:text/html;base64,PHNjcmlwdD4=)',
  '[click](java\tscript:window.__pwned=1)',
  '<javascript:window.__pwned=1>',
  '**<b onclick=window.__pwned=1>x</b>**',
  '`</code><img src=x onerror=1>`',
  '[x](//evil.dev) [y](\\\\evil.dev) <https://evil.dev/"onmouseover="1>',
  '0.1.0-D1<img src=x onerror=1> 9.9.9-D9',
  '\u2028\u2029</style><style>*{display:none}</style>',
  '${alert(1)} {{data}} {{script}} $& $1',
];

/** Fields whose text is free (from the user's documents) and must render inert. */
const FREE_TEXT = new Set([
  'title',
  'name',
  'goal',
  'exit',
  'text',
  'nextStep',
  'why',
  'target',
  'key',
  'value',
  'question',
  'default',
  'outcome',
  'risk',
  'mitigation',
  'owner',
  'notes',
  'detail',
  'reachedWhen',
  'item',
  'revisitWhen',
  'subject',
  'reason',
  'raw',
  'statusRaw',
  'ref',
  'dependsOn',
  'heading',
  'note',
  'root',
  'sha',
  'file',
  'options',
  'items',
  'message',
  'hint',
  'extra',
]);
/** Fields that are structural (enums, dates, ids): they cannot carry free text from the parser. */
const STRUCTURAL = new Set([
  'schema',
  'version',
  'generatedAt',
  'today',
  'formatVersion',
  'status',
  'state',
  'likelihood',
  'impact',
  'date',
  'neededBy',
  'reachedOn',
  'updated',
  'start',
  'end',
  'id',
  'semver',
  'versionId',
  'phaseId',
  'milestoneId',
  'currentVersion',
  'currentVersionId',
  'nextVersionId',
  'statusDate',
  'weekStarts',
  'versionIds',
  'needsYourCall',
  'topRisks',
  'code',
  'severity',
]);

/** Values under `extra` are keyed by the user's column names, so they all count as the key `extra`. */
function leafKeys(value: unknown, key = '', out = new Set<string>()): Set<string> {
  if (typeof value === 'string') out.add(key);
  else if (Array.isArray(value)) for (const v of value) leafKeys(v, key, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leafKeys(v, key === 'extra' ? 'extra' : k, out);
  }
  return out;
}

function mapStrings(value: unknown, key: string, fn: (s: string, key: string) => string): unknown {
  if (typeof value === 'string') return fn(value, key);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, key, fn));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapStrings(v, key === 'extra' ? 'extra' : k, fn)]),
    );
  }
  return value;
}

function sample(): ProjectData {
  const read = (f: string) => ({ path: f, text: readFileSync(`examples/tidepool/${f}`, 'utf8') });
  const d = parseProject(
    {
      roadmap: read('docs/project/ROADMAP.md'),
      decisions: read('docs/project/DECISIONS.md'),
      changelog: read('CHANGELOG.md'),
    },
    { now: '2026-11-25T00:00:00Z', toolVersion: '0.1.0-test' },
  );
  d.derived.stale = { isStale: true, days: 30, commitsSince: 3, reason: 'an old reason' };
  const c = { sha: 'abc1234', date: '2026-11-16T09:00:00Z', subject: 'subject' };
  d.git = {
    root: 'repo',
    head: c,
    branches: { live: c },
    activity: { weekStarts: ['2026-11-16'], commits: [1], areas: { src: 1 } },
    shallow: false,
  };
  const first = d.versions[0]?.deliverables[0];
  if (first) first.extra = { Risk: 'low' };
  return d;
}

function pageAfter(data: ProjectData): HTMLElement[] {
  const roots: HTMLElement[] = [];
  const views = [
    '#/overview',
    '#/versions',
    '#/decisions',
    `#/versions/${data.versions[0]?.id}?q=a&status=todo,doing`,
  ];
  for (const hash of views) {
    window.location.hash = hash;
    document.body.replaceChildren();
    const app = document.createElement('div');
    app.id = 'app';
    const json = document.createElement('script');
    json.type = 'application/json';
    json.id = 'opmap-data';
    json.textContent = JSON.stringify(data);
    document.body.append(app, json);
    boot(document)(); // we only need the first render
    roots.push(app);
  }
  return roots;
}

const FORBIDDEN =
  'script, iframe, object, embed, img, link, meta, base, style, form, svg, audio, video, source';
const URL_ATTRS = ['href', 'src', 'srcdoc', 'action', 'formaction', 'xlink:href', 'data'];

function assertInert(root: HTMLElement): void {
  expect(root.querySelectorAll(FORBIDDEN)).toHaveLength(0);
  for (const el of root.querySelectorAll('*')) {
    for (const a of el.getAttributeNames()) {
      expect(a.startsWith('on'), `${el.tagName} has attribute ${a}`).toBe(false);
      expect(a === 'srcdoc' || a === 'title', `${el.tagName} has attribute ${a}`).toBe(false);
      // A style attribute is allowed only when it holds numeric custom properties set through the CSSOM.
      if (a === 'style')
        expect(el.getAttribute('style'), `${el.tagName} style`).toMatch(
          /^(--[a-z][a-z0-9-]*:\s*\d+;?\s*)+$/,
        );
    }
    for (const a of URL_ATTRS) {
      const v = el.getAttribute(a);
      if (v !== null)
        expect(
          /^(https?:|mailto:|#|[^:]*$)/i.test(v) && !v.startsWith('//') && !v.startsWith('\\'),
          `${a}=${v}`,
        ).toBe(true);
    }
  }
  expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
}

describe('classification', () => {
  it('knows every string field that reaches the page', () => {
    const keys = leafKeys(sample());
    const unknown = [...keys].filter((k) => !FREE_TEXT.has(k) && !STRUCTURAL.has(k));
    // A new string field must be added to FREE_TEXT (and so be exercised below) or to STRUCTURAL.
    expect(unknown).toEqual([]);
  });
});

describe('free text renders inert in every view', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  for (const payload of PAYLOADS) {
    it(`payload ${JSON.stringify(payload).slice(0, 50)}`, () => {
      const hostile = mapStrings(sample(), '', (s, k) =>
        FREE_TEXT.has(k) ? payload : s,
      ) as ProjectData;
      for (const root of pageAfter(hostile)) assertInert(root);
    });
  }
  it('shows the payload as text, not markup', () => {
    const payload = '<img src=x onerror=1>';
    const hostile = mapStrings(sample(), '', (s, k) =>
      k === 'nextStep' ? payload : s,
    ) as ProjectData;
    const [overview] = pageAfter(hostile);
    expect(overview?.textContent).toContain(payload);
  });
});

describe('IDs and references with payloads render inert', () => {
  it('appends a payload to every id wherever it is referenced', () => {
    const data = sample();
    const ids = new Set<string>();
    const collect = (v: unknown, k = ''): void => {
      if (
        typeof v === 'string' &&
        ['id', 'versionId', 'milestoneId', 'phaseId', 'currentVersionId', 'nextVersionId'].includes(
          k,
        )
      )
        ids.add(v);
      else if (Array.isArray(v)) v.forEach((x) => collect(x, k));
      else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, x]) => collect(x, kk));
    };
    collect(data);
    const tail = '"><img src=x onerror=1>';
    const hostile = mapStrings(data, '', (s) => (ids.has(s) ? s + tail : s)) as ProjectData;
    for (const root of pageAfter(hostile)) assertInert(root);
  });
});

describe('the HTML page', () => {
  const assets = { clientJs: CLIENT_JS, stylesCss: STYLES_CSS, templateHtml: TEMPLATE_HTML };
  it('keeps hostile text inside the data block and the title', () => {
    for (const payload of PAYLOADS) {
      const hostile = mapStrings(sample(), '', (s, k) =>
        FREE_TEXT.has(k) ? payload : s,
      ) as ProjectData;
      const { html } = renderHtml(hostile, assets);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      expect(doc.querySelectorAll('script')).toHaveLength(2);
      expect(doc.querySelectorAll('style')).toHaveLength(1);
      expect(
        doc.querySelectorAll('noscript img, noscript iframe, noscript script, noscript svg'),
      ).toHaveLength(0);
      const json = JSON.parse(doc.getElementById('opmap-data')?.textContent ?? '') as ProjectData;
      expect(json.project.title).toBe(payload);
      // document.title collapses whitespace, so compare that way.
      expect(doc.title).toBe(`${payload} · Project map`.replace(/[ \t\n\f\r]+/g, ' '));
    }
  });
});
