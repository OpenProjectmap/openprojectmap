// Renders ProjectData into one self-contained HTML file (spec 05 §1, §6).
import { createHash } from 'node:crypto';
import type { ProjectData } from '../core/types.js';

export interface RenderAssets {
  /** The bundled client IIFE. */
  clientJs: string;
  /** styles.css. */
  stylesCss: string;
  /** template.html with `{{placeholders}}`. */
  templateHtml: string;
}

export interface RenderTheme {
  accent: string;
  mode: 'auto' | 'light' | 'dark';
  density: 'comfortable' | 'compact';
}

export interface RenderResult {
  html: string;
  /** The `sha256-…` source tokens that went into the CSP. */
  cspHashes: { script: string; style: string };
}

export const DEFAULT_THEME: RenderTheme = {
  accent: '#2f6fed',
  mode: 'auto',
  density: 'comfortable',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** JSON for a `<script type="application/json">` block: no `<`, `>`, `&`, U+2028 or U+2029 survive. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function luminance(hex: string): number {
  const chan = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(0) + 0.7152 * chan(1) + 0.0722 * chan(2);
}

/** Black or white, whichever has the higher contrast ratio on the accent colour. */
export function onAccent(accent: string): '#000000' | '#ffffff' {
  const l = luminance(accent);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

const sha256 = (text: string): string =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** The `<noscript>` summary: title, Now block and the version list, built with escapeHtml. */
export function noscriptSummary(data: ProjectData): string {
  const e = escapeHtml;
  const parts = [`<h1>${e(data.project.title)}</h1>`];
  if (data.now) {
    parts.push(`<p><strong>Next step:</strong> ${e(data.now.nextStep ?? '')}</p>`);
    if (data.now.why) parts.push(`<p><strong>Why:</strong> ${e(data.now.why)}</p>`);
  }
  parts.push('<ul>');
  for (const v of data.versions) {
    parts.push(
      `<li>${e(v.id)} ${e(v.title)}: ${e(v.state)}, ${v.progress.pct}% (${v.progress.done}/${v.progress.total})</li>`,
    );
  }
  parts.push('</ul>', '<p>Turn on JavaScript to see the full project map.</p>');
  return parts.join('');
}

export function renderHtml(
  data: ProjectData,
  assets: RenderAssets,
  theme: RenderTheme = DEFAULT_THEME,
): RenderResult {
  const styles = `${assets.stylesCss}\n:root{--accent:${theme.accent};--on-accent:${onAccent(theme.accent)}}`;
  const script = assets.clientJs;
  const hashes = { script: sha256(script), style: sha256(styles) };
  const csp = `default-src 'none'; script-src ${hashes.script}; style-src ${hashes.style}; img-src data:; base-uri 'none'; form-action 'none'`;
  const values: Record<string, string> = {
    theme: theme.mode,
    density: theme.density,
    csp: escapeHtml(csp),
    version: escapeHtml(data.tool.version),
    title: escapeHtml(data.project.title),
    styles,
    noscript: noscriptSummary(data),
    data: embedJson(data),
    script,
  };
  // One pass, so a value that contains `{{x}}` is never expanded again.
  const html = assets.templateHtml.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
  return { html, cspHashes: hashes };
}
