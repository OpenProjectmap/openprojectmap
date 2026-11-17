// Theme toggle: auto -> light -> dark, remembered in localStorage when it is available.
const ORDER = ['auto', 'light', 'dark'] as const;
export type ThemeMode = (typeof ORDER)[number];
const KEY = 'opmap-theme';

export function nextMode(mode: string): ThemeMode {
  const i = (ORDER as readonly string[]).indexOf(mode);
  return ORDER[(i + 1) % ORDER.length] ?? 'auto';
}

export function loadMode(fallback: string): ThemeMode {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v !== null && (ORDER as readonly string[]).includes(v)) return v as ThemeMode;
  } catch {
    // localStorage can throw on file:// in some browsers; the page works without it.
  }
  return (ORDER as readonly string[]).includes(fallback) ? (fallback as ThemeMode) : 'auto';
}

export function saveMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // ignore, see above
  }
}
