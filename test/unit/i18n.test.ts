// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/node/doctor.js';
import { validateConfig } from '../../src/node/config.js';
import { CLIENT_JS, STYLES_CSS, TEMPLATE_HTML } from '../../src/render/assets.generated.js';
import { en } from '../../src/render/client/i18n/en.js';
import {
  describeLocale,
  dirOf,
  formatDay,
  hasTranslation,
  monthName,
  setLocale,
  t,
  TRANSLATIONS,
  tn,
  tParts,
} from '../../src/render/client/i18n/index.js';
import { boot } from '../../src/render/client/main.js';
import { renderHtml } from '../../src/render/render.js';
import { tidepool } from './helpers.js';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function mount(lang: string): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = describeLocale(lang).dir;
  document.body.replaceChildren();
  const app = document.createElement('div');
  app.id = 'app';
  const json = document.createElement('script');
  json.type = 'application/json';
  json.id = 'opmap-data';
  json.textContent = JSON.stringify(tidepool());
  document.body.append(app, json);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('the catalogue', () => {
  const sources = [...walk('src/render/client'), 'src/render/render.ts'].filter(
    (f) => !f.includes('/i18n/'),
  );
  const text = sources.map((f) => readFileSync(f, 'utf8')).join('\n');

  it('has every key the code asks for', () => {
    const used = new Set<string>();
    for (const m of text.matchAll(/\bt(?:n|Parts)?\(\s*'([a-z][\w.]*)'/g)) used.add(m[1] ?? '');
    expect(used.size).toBeGreaterThan(60);
    for (const key of used) {
      const plural = key === 'versions.shown' || key === 'timeline.summary';
      expect(plural ? `${key}.other` in en : key in en, key).toBe(true);
    }
  });

  it('has a word for every status, state, decision status and tab', () => {
    for (const s of ['todo', 'doing', 'review', 'blocked', 'done', 'parked'])
      expect(`status.${s}` in en).toBe(true);
    for (const s of ['planned', 'active', 'shipped']) expect(`state.${s}` in en).toBe(true);
    for (const s of ['open', 'decided', 'defaulted']) expect(`decision.${s}` in en).toBe(true);
    for (const s of ['overview', 'timeline', 'versions', 'decisions', 'history', 'parked'])
      expect(`tab.${s}` in en).toBe(true);
  });

  it('writes every placeholder the same way', () => {
    for (const [key, value] of Object.entries(en)) {
      for (const m of value.matchAll(/\{([^}]*)\}/g)) expect(m[1], key).toMatch(/^\w+$/);
    }
  });
});

describe('contributed translations', () => {
  it('use only keys that exist and the same placeholders as English', () => {
    for (const [tag, messages] of Object.entries(TRANSLATIONS)) {
      for (const [key, value] of Object.entries(messages)) {
        expect(key in en, `${tag}: unknown key ${key}`).toBe(true);
        const names = (s: string): string[] =>
          [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
        expect(names(value), `${tag}: ${key}`).toEqual(names(en[key as keyof typeof en]));
      }
    }
  });
});

describe('looking messages up', () => {
  beforeEach(() => setLocale('en'));

  it('fills placeholders and keeps unknown ones', () => {
    expect(t('page.updated', { date: '2026-11-20' })).toBe('Updated 2026-11-20');
    expect(t('page.updated')).toBe('Updated {date}');
  });

  it('chooses the plural form', () => {
    expect(tn('versions.shown', 1)).toBe('1 deliverable shown');
    expect(tn('versions.shown', 0)).toBe('0 deliverables shown');
    expect(tn('versions.shown', 12)).toBe('12 deliverables shown');
  });

  it('puts a node inside a sentence', () => {
    const code = document.createElement('code');
    const parts = tParts('banner.update', { reason: 'late', command: code });
    expect(parts).toEqual(['late', '. Update the Now block and its Updated date (', code, ').']);
  });

  it('falls back to English for a language without a translation', () => {
    expect(hasTranslation('en')).toBe(true);
    expect(hasTranslation('pt-BR')).toBe(false);
    setLocale('pt-BR');
    expect(t('tab.overview')).toBe('Overview');
  });

  it('formats dates: ISO for English, the locale form otherwise', () => {
    expect(formatDay('2026-11-25')).toBe('2026-11-25');
    expect(monthName(3)).toBe('Mar');
    setLocale('de');
    expect(formatDay('2026-11-25')).toMatch(/2026/);
    expect(formatDay('2026-11-25')).not.toBe('2026-11-25');
    expect(formatDay('not a date')).toBe('not a date');
    expect(monthName(3).length).toBeGreaterThan(0);
  });

  it('reads right to left for Arabic, Hebrew and the test locale only', () => {
    for (const tag of ['ar', 'ar-SA', 'he', 'fa', 'ur', 'ar-XB'])
      expect(dirOf(tag), tag).toBe('rtl');
    for (const tag of ['en', 'de', 'pt-BR', 'zh-Hans', 'ja', 'arm'])
      expect(dirOf(tag), tag).toBe('ltr');
  });

  it('ignores a tag that is not a language tag', () => {
    expect(describeLocale('<script>').tag).toBe('en');
    expect(describeLocale('').tag).toBe('en');
  });
});

describe('the page in the accented test locale (en-XA)', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  const accented = /[À-ÿĀ-ſƀ-ɏṀ-ỿ]/;

  async function textOfChrome(view: string): Promise<string[]> {
    window.location.hash = `#/${view}`;
    await tick();
    const found: string[] = [];
    for (const el of document.querySelectorAll(
      'h1, h2, h3, h4, th, button, label, summary, legend, [aria-label], .banner, footer p, .muted.empty',
    )) {
      if (el.closest('code') || el.closest('.release')) continue; // ids and changelog text are the user's
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (el.tagName === 'H1') continue; // the project title is the user's text
      const label = el.getAttribute('aria-label');
      if (label) found.push(label);
      if (own) found.push(own);
    }
    return found;
  }

  for (const view of [
    'overview',
    'versions',
    'timeline',
    'timeline?zoom=quarter',
    'decisions',
    'history',
    'parked',
  ]) {
    it(`${view}: every label and heading comes from the catalogue`, async () => {
      mount('en-XA');
      boot(document);
      const texts = await textOfChrome(view);
      expect(texts.length).toBeGreaterThan(3);
      const stray = texts.filter((s) => !accented.test(s));
      expect(stray).toEqual([]);
    });
  }

  it('shows accented tab labels and status words', async () => {
    mount('en-XA');
    boot(document);
    await tick();
    for (const tab of document.querySelectorAll('[role=tab]'))
      expect(tab.textContent).toMatch(accented);
    window.location.hash = '#/versions';
    await tick();
    for (const chip of document.querySelectorAll('.chip'))
      expect(chip.textContent).toMatch(accented);
  });
});

describe('right to left', () => {
  it('sets lang and dir on the page, and translates the title and the noscript text', () => {
    const assets = { clientJs: CLIENT_JS, stylesCss: STYLES_CSS, templateHtml: TEMPLATE_HTML };
    const rtl = renderHtml(tidepool(), assets, undefined, { locale: 'ar-XB' }).html;
    expect(rtl).toContain('<html lang="ar-XB" dir="rtl"');
    expect(rtl).toMatch(/<title>[^<]*Tidepool[^<]*<\/title>/);
    expect(rtl).toMatch(/<noscript>[^]*ŕ[^]*<\/noscript>|<noscript>[^]*[À-ÿ][^]*<\/noscript>/);
    const ltr = renderHtml(tidepool(), assets).html;
    expect(ltr).toContain('<html lang="en" dir="ltr"');
    expect(ltr).toContain('<title>Tidepool · Project map</title>');
    const plain = renderHtml(tidepool(), assets, undefined, { locale: 'he' }).html;
    expect(plain).toContain('<html lang="he" dir="rtl"');
    expect(plain).toContain('<title>Tidepool · Project map</title>');
  });

  it('refuses a locale that could break out of the attribute', () => {
    const assets = { clientJs: CLIENT_JS, stylesCss: STYLES_CSS, templateHtml: TEMPLATE_HTML };
    const html = renderHtml(tidepool(), assets, undefined, { locale: '"><script>x</script>' }).html;
    expect(html).toContain('<html lang="en" dir="ltr"');
    expect(html).not.toContain('<script>x</script>');
  });

  it('draws the page from the document language', async () => {
    mount('ar-XB');
    boot(document);
    await tick();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.querySelector('[role=tab]')?.textContent?.startsWith('‏')).toBe(true);
  });

  it('uses logical CSS properties, so the layout mirrors', () => {
    const css = readFileSync('src/render/styles.css', 'utf8');
    expect(css).not.toMatch(/\b(margin|padding|border)-(left|right)\b/);
    expect(css).not.toMatch(/text-align:\s*(left|right)/);
    expect(css).not.toMatch(/(^|[;{\s])(left|right)\s*:/m);
  });
});

describe('the locale option', () => {
  it('accepts a language tag', () => {
    for (const ok of ['en', 'ar', 'pt-BR', 'zh-Hans-CN'])
      expect(validateConfig({ format: 1, locale: ok }).problems, ok).toEqual([]);
  });
  it('rejects other text', () => {
    for (const bad of ['english please', '', 'x', '<b>', 5])
      expect(
        validateConfig({ format: 1, locale: bad }).problems.length,
        String(bad),
      ).toBeGreaterThan(0);
  });
  it('doctor says when a language has no interface translation yet', () => {
    const checks = runDoctor({
      cwd: '.',
      configPath: 'test/fixtures/locale-pt.json',
      env: {},
    });
    const locale = checks.find((c) => c.name === 'locale');
    expect(locale).toMatchObject({ level: 'warn' });
    expect(locale?.detail).toContain('pt-BR');
  });
});
