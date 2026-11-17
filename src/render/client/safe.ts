// URL safety (spec 05 §2). Every href in the page goes through here.

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const ALLOWED = new Set(['https', 'http', 'mailto']);

/**
 * Allow https:, http:, mailto:, a fragment, or a relative path that does not start with `//` or
 * a backslash and has no control characters. Anything else returns null (render plain text).
 */
export function safeHref(url: string): string | null {
  const u = url.trim();
  if (u === '' || CONTROL_RE.test(u)) return null;
  if (u.startsWith('#')) return u;
  const scheme = SCHEME_RE.exec(u);
  if (scheme) return ALLOWED.has((scheme[1] ?? '').toLowerCase()) ? u : null;
  if (u.startsWith('//') || u.startsWith('\\') || u.startsWith('/\\')) return null;
  return u;
}
