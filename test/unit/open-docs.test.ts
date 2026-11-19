// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot as bootPage } from '../../src/render/client/main.js';
import { classify, parsePicked, readFiles } from '../../src/render/client/open-docs.js';
import { tidepool } from './helpers.js';

const rd = (f: string): string => readFileSync(`examples/tidepool/${f}`, 'utf8');
const ROADMAP = rd('docs/project/ROADMAP.md');
const DECISIONS = rd('docs/project/DECISIONS.md');
const CHANGELOG = rd('CHANGELOG.md');
const NOW = '2026-11-25T00:00:00Z';

describe('classify', () => {
  it('guesses the role from the file name', () => {
    expect(classify('ROADMAP.md')).toBe('roadmap');
    expect(classify('my-roadmap.markdown')).toBe('roadmap');
    expect(classify('DECISIONS.md')).toBe('decisions');
    expect(classify('open-decisions.txt')).toBe('decisions');
    expect(classify('CHANGELOG.md')).toBe('changelog');
    expect(classify('release-notes.md')).toBe('changelog');
    expect(classify('HISTORY.md')).toBe('changelog');
  });
  it('ignores other files and non-text extensions', () => {
    for (const n of ['README.md', 'notes.md', 'ROADMAP.pdf', 'roadmap', 'image.png'])
      expect(classify(n)).toBeNull();
  });
});

describe('parsePicked', () => {
  it('parses a full set into project data without git facts', () => {
    const r = parsePicked(
      [
        { name: 'ROADMAP.md', text: ROADMAP },
        { name: 'DECISIONS.md', text: DECISIONS },
        { name: 'CHANGELOG.md', text: CHANGELOG },
      ],
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.project.title).toBe('Tidepool');
    expect(r.data.versions).toHaveLength(5);
    expect(r.data.decisions).toHaveLength(4);
    expect(r.data.releases.length).toBeGreaterThan(0);
    expect(r.data.git).toBeNull();
    expect(r.used).toEqual(['ROADMAP.md', 'DECISIONS.md', 'CHANGELOG.md']);
    expect(r.ignored).toEqual([]);
  });
  it('needs a roadmap, and works with only a roadmap', () => {
    expect(parsePicked([{ name: 'CHANGELOG.md', text: CHANGELOG }], NOW)).toEqual({
      ok: false,
      error: expect.stringContaining('ROADMAP.md'),
    });
    expect(parsePicked([], NOW).ok).toBe(false);
    expect(parsePicked([{ name: 'roadmap.md', text: ROADMAP }], NOW).ok).toBe(true);
  });
  it('leaves out duplicates, unknown files and anything past the limit', () => {
    const files = [
      { name: 'ROADMAP.md', text: ROADMAP },
      { name: 'old-roadmap.md', text: '# old' },
      { name: 'notes.md', text: 'x' },
      ...Array.from({ length: 8 }, (_, i) => ({ name: `extra${i}.md`, text: 'x' })),
    ];
    const r = parsePicked(files, NOW);
    expect(r.ok && r.used).toEqual(['ROADMAP.md']);
    expect(r.ok && r.ignored).toEqual(
      expect.arrayContaining(['old-roadmap.md', 'notes.md', 'extra5.md']),
    );
  });
  it('reports a bad clock instead of throwing', () => {
    const r = parsePicked([{ name: 'ROADMAP.md', text: ROADMAP }], 'not a date');
    expect(r.ok).toBe(false);
  });
});

describe('readFiles', () => {
  it('reads files as text and skips big ones', async () => {
    const small = new File(['hello'], 'a.md');
    const big = new File([new Uint8Array(2_000_001)], 'big.md');
    const r = await readFiles([small, big]);
    expect(r.picked).toEqual([{ name: 'a.md', text: 'hello' }]);
    expect(r.tooBig).toEqual(['big.md']);
  });
});

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
function mount(): void {
  document.body.replaceChildren();
  const app = document.createElement('div');
  app.id = 'app';
  const json = document.createElement('script');
  json.type = 'application/json';
  json.id = 'opmap-data';
  json.textContent = JSON.stringify(tidepool());
  document.body.append(app, json);
}
function choose(files: File[]): void {
  const input = document.getElementById('open-docs-input') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}
const roadmapFile = (text: string): File => new File([text], 'ROADMAP.md');

/** Every page started in a test is undone afterwards, so window listeners do not pile up. */
const stops: (() => void)[] = [];
const boot = (doc: Document): (() => void) => {
  const stop = bootPage(doc);
  stops.push(stop);
  return stop;
};

describe('Open docs… in the page', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  afterEach(() => {
    while (stops.length > 0) stops.pop()?.();
  });

  it('has a button, a hidden file input and a note about uploads', () => {
    mount();
    boot(document);
    const footer = document.querySelector('footer');
    expect(footer?.querySelector('button.link')?.textContent).toBe('Open docs…');
    expect(footer?.textContent).toContain('Nothing is uploaded');
    const input = document.getElementById('open-docs-input') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
    expect(input.getAttribute('accept')).toContain('.md');
  });
  it('the button opens the picker', () => {
    mount();
    boot(document);
    const input = document.getElementById('open-docs-input') as HTMLInputElement;
    let clicks = 0;
    input.addEventListener('click', () => clicks++);
    (document.querySelector('footer button.link') as HTMLElement).click();
    expect(clicks).toBe(1);
  });
  it('re-renders the page from the chosen files and says what it shows', async () => {
    mount();
    boot(document);
    const changed = ROADMAP.replace('# Tidepool', '# Opened in the browser');
    choose([
      roadmapFile(changed),
      new File([DECISIONS], 'DECISIONS.md'),
      new File(['x'], 'README.md'),
    ]);
    await tick(20);
    expect(document.querySelector('h1')?.textContent).toBe('Opened in the browser');
    const note = document.getElementById('open-note')?.textContent ?? '';
    expect(note).toContain('Showing ROADMAP.md, DECISIONS.md');
    expect(note).toContain('left out: README.md');
    expect(note).toContain('not saved');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelectorAll('footer')).toHaveLength(1);
  });
  it('explains when there is no roadmap and keeps the current page', async () => {
    mount();
    boot(document);
    choose([new File([CHANGELOG], 'CHANGELOG.md')]);
    await tick(20);
    expect(document.getElementById('open-note')?.textContent).toContain('ROADMAP.md');
    expect(document.querySelector('h1')?.textContent).toBe('Tidepool');
  });
  it('mentions a file that was too big', async () => {
    mount();
    boot(document);
    choose([new File([new Uint8Array(2_000_001)], 'ROADMAP.md')]);
    await tick(20);
    expect(document.getElementById('open-note')?.textContent).toContain(
      'too big to open: ROADMAP.md',
    );
  });
  it('ignores an empty selection', async () => {
    mount();
    boot(document);
    choose([]);
    await tick(10);
    expect(document.getElementById('open-note')?.textContent).toBe('');
  });
  it('accepts files dropped on the page, and lets other drops through', async () => {
    mount();
    boot(document);
    const over = new Event('dragover', { cancelable: true });
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const empty = new Event('drop', { cancelable: true });
    Object.assign(empty, { dataTransfer: { files: [] } });
    window.dispatchEvent(empty);
    expect(empty.defaultPrevented).toBe(false);
    const drop = new Event('drop', { cancelable: true });
    Object.assign(drop, {
      dataTransfer: { files: [roadmapFile(ROADMAP.replace('# Tidepool', '# Dropped'))] },
    });
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await tick(20);
    expect(document.querySelector('h1')?.textContent).toBe('Dropped');
  });
  it('shows the staleness banner and views for the opened docs, and undoes cleanly', async () => {
    mount();
    const stop = boot(document);
    choose([roadmapFile(ROADMAP.replace(/\*\*Updated:\*\* \S+/, '**Updated:** 2026-01-01'))]);
    await tick(20);
    expect(document.querySelector('.banner')).not.toBeNull(); // the browser's clock is well past that date
    window.location.hash = '#/timeline';
    await tick();
    expect(document.querySelector('svg')).not.toBeNull();
    stop();
    const drop = new Event('drop', { cancelable: true });
    Object.assign(drop, { dataTransfer: { files: [roadmapFile(ROADMAP)] } });
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(false);
  });
});
