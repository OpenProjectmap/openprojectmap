// Inline rich text as DOM nodes (spec 05 §3). Text only ever reaches the page as text nodes.
import { parseInline } from '../../core/inline.js';
import type { Inline } from '../../core/inline.js';
import { h } from './h.js';
import type { Child } from './h.js';
import { safeHref } from './safe.js';

export interface RichContext {
  /** Version ids (`v0.2.0`) that exist, so a deliverable ID can link to its version. */
  versions?: ReadonlySet<string>;
}

function nodes(tokens: readonly Inline[], ctx: RichContext): Child[] {
  return tokens.map((t): Child => {
    switch (t.t) {
      case 'text':
        return t.s;
      case 'code':
        return h('code', null, t.s);
      case 'bold':
        return h('strong', null, nodes(t.c, ctx));
      case 'italic':
        return h('em', null, nodes(t.c, ctx));
      case 'strike':
        return h('s', null, nodes(t.c, ctx));
      case 'link': {
        const href = safeHref(t.href);
        const external = href !== null && /^https?:/i.test(href);
        return href === null
          ? h('span', null, nodes(t.c, ctx))
          : h('a', { href, ...(external ? { 'data-external': 'true' } : {}) }, nodes(t.c, ctx));
      }
      case 'id': {
        const version = `v${t.id.slice(0, t.id.indexOf('-D'))}`;
        return ctx.versions?.has(version)
          ? h(
              'a',
              { href: `#/versions/${version}?q=${encodeURIComponent(t.id)}`, 'data-id': t.id },
              t.id,
            )
          : h('code', null, t.id);
      }
    }
  });
}

/** Render a markdown value into a fragment of safe DOM nodes. */
export function rich(text: string | null | undefined, ctx: RichContext = {}): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const n of nodes(parseInline(text ?? ''), ctx)) {
    if (typeof n === 'string') frag.appendChild(document.createTextNode(n));
    else if (n) frag.appendChild(n as Node);
  }
  return frag;
}
