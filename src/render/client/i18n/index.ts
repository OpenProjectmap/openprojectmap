// Looks messages up by key in the current locale and falls back to English (spec 05 §8). The page
// language comes from `<html lang>`, which the renderer sets from the config's `locale`.
import { en } from './en.js';
import type { MessageKey, Messages } from './en.js';
import { pseudoAccents, pseudoBidi } from './pseudo.js';

export type { MessageKey, Messages } from './en.js';
export { en } from './en.js';

/**
 * Translations that ship. English is the source; a contributed language is added here (one import
 * and one entry). `en-XA` and `ar-XB` are generated from English to test the page: accented and
 * expanded text, and right-to-left text.
 */
export const TRANSLATIONS: Record<string, Messages> = {};

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'ckb', 'dv']);

export interface Locale {
  /** The tag the page asked for, e.g. `ar-SA`. */
  tag: string;
  /** The tag whose messages are shown (`en` when there is no translation). */
  messages: string;
  dir: 'ltr' | 'rtl';
}

const TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,4}$/;

/** `ar-XB` (the right-to-left test locale) and every Arabic, Hebrew, Persian... tag read right to left. */
export function dirOf(tag: string): 'ltr' | 'rtl' {
  if (tag.toLowerCase() === 'ar-xb') return 'rtl';
  return RTL_LANGUAGES.has(tag.slice(0, tag.search(/[-_]|$/)).toLowerCase()) ? 'rtl' : 'ltr';
}

/** The tag to use for messages: the exact tag, then its language, else English. */
export function resolveMessages(tag: string): string {
  const lower = tag.toLowerCase();
  if (lower === 'en-xa' || lower === 'ar-xb') return lower;
  for (const candidate of [tag, tag.split(/[-_]/)[0] ?? '']) {
    if (candidate !== '' && candidate.toLowerCase() !== 'en' && candidate in TRANSLATIONS)
      return candidate;
  }
  return 'en';
}

export function describeLocale(tag: string): Locale {
  const valid = TAG.test(tag) ? tag : 'en';
  return { tag: valid, messages: resolveMessages(valid), dir: dirOf(valid) };
}

/** Whether the interface has a translation for `tag` (English and the test locales count). */
export function hasTranslation(tag: string): boolean {
  const valid = TAG.test(tag) ? tag : 'en';
  const language = valid.slice(0, valid.search(/[-_]|$/)).toLowerCase();
  return language === 'en' || resolveMessages(valid) !== 'en';
}

let current: Locale = describeLocale('en');

export function setLocale(tag: string): Locale {
  current = describeLocale(tag);
  return current;
}

export const locale = (): Locale => current;

function raw(key: MessageKey): string {
  const base = en[key];
  switch (current.messages) {
    case 'en':
      return base;
    case 'en-xa':
      return pseudoAccents(base);
    case 'ar-xb':
      return pseudoBidi(base);
    default:
      return TRANSLATIONS[current.messages]?.[key] ?? base;
  }
}

/** The message for `key`, with `{name}` filled from `params`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return raw(key).replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** A message with plural forms: `key.one`, `key.other`, ... chosen by the locale's plural rules. */
export function tn(
  key: 'versions.shown' | 'timeline.summary',
  count: number,
  params: Record<string, string | number> = {},
): string {
  let rule = 'other';
  try {
    rule = new Intl.PluralRules(current.tag).select(count);
  } catch {
    // an unknown tag: English rules below
    rule = count === 1 ? 'one' : 'other';
  }
  const specific = `${key}.${rule}` as MessageKey;
  const k = specific in en ? specific : (`${key}.other` as MessageKey);
  return t(k, { n: count, ...params });
}

/**
 * A message with a node inside it, such as a `<code>` element: `{name}` becomes the node. Returns
 * the pieces in order (strings and nodes).
 */
export function tParts(
  key: MessageKey,
  params: Record<string, string | number | Node>,
): (string | Node)[] {
  const out: (string | Node)[] = [];
  let last = 0;
  const text = raw(key);
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const v = params[m[1] ?? ''];
    out.push(v === undefined ? m[0] : typeof v === 'object' ? v : String(v));
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A `YYYY-MM-DD` date for this locale. English keeps the ISO form (it is what the documents use). */
export function formatDay(iso: string): string {
  const base = current.tag.slice(0, current.tag.search(/[-_]|$/)).toLowerCase();
  if (base === 'en' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Intl.DateTimeFormat(current.tag, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  } catch {
    return iso;
  }
}

/** The short name of a month (1 to 12) in this locale; English keeps its three letters. */
export function monthName(month: number): string {
  const base = current.tag.slice(0, current.tag.search(/[-_]|$/)).toLowerCase();
  const english = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  if (base === 'en') return english[month - 1] ?? '';
  try {
    return new Intl.DateTimeFormat(current.tag, { month: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2000, month - 1, 1)),
    );
  } catch {
    return english[month - 1] ?? '';
  }
}
