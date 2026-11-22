// Two locales made from English, to test the page without a real translation (spec 05 §8):
// `en-XA` shows accented, longer text (catches clipped layouts and strings that bypass the
// catalogue); `ar-XB` shows right-to-left text (catches left-to-right assumptions).

const ACCENTS: Record<string, string> = {
  a: 'à',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'ï',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ö',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ü',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'À',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Ï',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ļ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Ü',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

/** Maps every letter outside `{placeholders}`, and adds a tail so the text is about 30% longer. */
function mapOutsidePlaceholders(text: string, map: (s: string) => string): string {
  return text
    .split(/(\{\w+\})/)
    .map((part) => (/^\{\w+\}$/.test(part) ? part : map(part)))
    .join('');
}

export function pseudoAccents(text: string): string {
  const mapped = mapOutsidePlaceholders(text, (s) =>
    s.replace(/[A-Za-z]/g, (c) => ACCENTS[c] ?? c),
  );
  const tail = '·'.repeat(Math.max(1, Math.ceil(text.replace(/\{\w+\}/g, '').length * 0.3)));
  return `${mapped}${tail}`;
}

/** Accented text marked right to left (a leading right-to-left mark; the page sets dir="rtl"). */
export function pseudoBidi(text: string): string {
  return `‏${mapOutsidePlaceholders(text, (s) => s.replace(/[A-Za-z]/g, (c) => ACCENTS[c] ?? c))}`;
}
