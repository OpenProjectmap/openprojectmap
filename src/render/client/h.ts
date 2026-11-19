// Element helper (spec 05 §2). Builds DOM with an allow-list of tags and attributes. There is no
// way to set innerHTML, `style` or `title`, and an event prop must be a function.
import { safeHref } from './safe.js';

export type Child = Node | string | number | null | undefined | false | Child[];
export type Props = Record<
  string,
  string | number | boolean | null | undefined | ((e: Event) => void)
>;

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'text']);
const HTML_TAGS = new Set([
  'a',
  'article',
  'aside',
  'button',
  'code',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'header',
  'hr',
  'input',
  'label',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'progress',
  'section',
  'small',
  'span',
  'strong',
  'summary',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'time',
  'tr',
  'ul',
  's',
]);
const ATTRS = new Set([
  'class',
  'id',
  'role',
  'tabindex',
  'href',
  'type',
  'value',
  'checked',
  'accept',
  'multiple',
  'disabled',
  'for',
  'name',
  'open',
  'max',
  'placeholder',
  'autocomplete',
  'scope',
  'colspan',
  'rowspan',
  'viewBox',
  'd',
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'x2',
  'y1',
  'y2',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'transform',
  'text-anchor',
]);
const DATA_ARIA_RE = /^(aria|data)-[a-z0-9-]+$/;
const EVENT_RE = /^on[A-Z][A-Za-z]*$/;

export function h(
  tag: string,
  props: Props | null = null,
  ...children: Child[]
): HTMLElement | SVGElement {
  const svg = SVG_TAGS.has(tag);
  if (!svg && !HTML_TAGS.has(tag)) throw new Error(`h: the tag <${tag}> is not allowed`);
  const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (EVENT_RE.test(name)) {
      if (typeof value !== 'function') throw new Error(`h: ${name} must be a function`);
      el.addEventListener(name.slice(2).toLowerCase(), value);
      continue;
    }
    if (typeof value === 'function') throw new Error(`h: ${name} cannot be a function`);
    if (!ATTRS.has(name) && !DATA_ARIA_RE.test(name))
      throw new Error(`h: the attribute "${name}" is not allowed`);
    if (name === 'href') {
      const safe = safeHref(String(value));
      if (safe !== null) el.setAttribute('href', safe);
      continue;
    }
    el.setAttribute(name, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (typeof c === 'string' || typeof c === 'number')
      parent.appendChild(document.createTextNode(String(c)));
    else parent.appendChild(c);
  }
}

/** Set a CSS custom property through the CSSOM (allowed by the CSP, unlike a style attribute). */
export function setVar(
  el: HTMLElement | SVGElement,
  name: `--${string}`,
  value: string | number,
): void {
  if (!/^--[a-z][a-z0-9-]*$/.test(name)) throw new Error('setVar: bad property name');
  el.style.setProperty(name, String(value));
}
