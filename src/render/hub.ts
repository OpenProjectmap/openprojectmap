// The hub index page (spec 06 §3): one static page with a card per project. No script at all, so
// the CSP only allows its own inline style by hash, and every string goes through escapeHtml.
import { createHash } from 'node:crypto';
import type { HubCard } from '../core/hub.js';
import { escapeHtml } from './render.js';

const CSS = `:root{--bg:#fbfbfa;--surface:#ffffff;--surface-2:#f3f3f1;--text:#1b1b1a;--muted:#5f5f5b;--border:#e3e3df;--accent:#2f6fed;--ok:#187a41;--warn:#9a5b00;--danger:#c2372b;--link:#1f57c4;--radius:10px;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#121211;--surface:#1b1b1a;--surface-2:#242422;--text:#ececea;--muted:#a8a8a2;--border:#353532;--accent:#7aa7e6;--ok:#4cc17f;--warn:#e0a040;--danger:#ef6b5f;--link:#9bbcf0;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1200px;margin:0 auto;padding:16px max(16px,env(safe-area-inset-right)) 32px max(16px,env(safe-area-inset-left))}
h1{font-size:1.6rem;margin:0 0 4px}
h2{font-size:1.1rem;margin:0 0 6px}
h1,h2,p,li{overflow-wrap:anywhere}
a{color:var(--link)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.muted{color:var(--muted)}
ul.cards{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;height:100%}
.card p{margin:6px 0 0}
.chip{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:1px 10px;font-size:.85rem;background:var(--surface-2);margin-right:6px}
.warn{border-color:var(--warn);color:var(--warn)}
.danger{color:var(--danger)}
progress{width:100%;height:10px;accent-color:var(--ok)}
footer{margin-top:24px;color:var(--muted);font-size:.85rem}`;

const sha256 = (text: string): string =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

export interface HubPage {
  html: string;
  csp: string;
}

function card(c: HubCard): string {
  const e = escapeHtml;
  if (c.error !== null) {
    return `<li><article class="card"><h2>${e(c.name)}</h2><p class="danger"><strong>Could not build this map.</strong> ${e(c.error)}</p></article></li>`;
  }
  const meta: string[] = [];
  if (c.version !== null)
    meta.push(`<span class="chip">${e(c.version)}${c.state ? ` ${e(c.state)}` : ''}</span>`);
  if (c.stale) meta.push('<span class="chip warn">May be out of date</span>');
  const parts = [
    `<h2><a href="${e(c.slug)}/index.html">${e(c.name)}</a></h2>`,
    meta.length > 0 ? `<p>${meta.join('')}</p>` : '',
  ];
  if (c.pct !== null)
    parts.push(
      `<p><progress max="100" value="${c.pct}" aria-label="Progress of ${e(c.version ?? 'the current version')}">${c.pct}%</progress><span class="muted">${c.pct}% of ${e(c.version ?? 'the current version')}</span></p>`,
    );
  if (c.nextStep) parts.push(`<p><strong>Next:</strong> ${e(c.nextStep)}</p>`);
  parts.push(
    `<p class="muted">${c.needsCall === 0 ? 'Nothing needs your call' : `${c.needsCall} ${c.needsCall === 1 ? 'decision needs' : 'decisions need'} your call`}${c.lastCommit ? ` · last commit ${e(c.lastCommit)}` : ''}</p>`,
  );
  return `<li><article class="card">${parts.join('')}</article></li>`;
}

export function renderHubHtml(
  title: string,
  cards: readonly HubCard[],
  info: { version: string; generated: string },
): HubPage {
  const e = escapeHtml;
  const csp = `default-src 'none'; style-src ${sha256(CSS)}; img-src data:; base-uri 'none'; form-action 'none'`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${e(csp)}">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="openprojectmap ${e(info.version)}">
<title>${e(title)} · Project maps</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${e(title)}</h1>
<p class="muted">${cards.length} ${cards.length === 1 ? 'project' : 'projects'}</p>
<ul class="cards">
${cards.map(card).join('\n')}
</ul>
<footer>Generated ${e(info.generated)} by openprojectmap ${e(info.version)}.</footer>
</main>
</body>
</html>
`;
  return { html, csp };
}
