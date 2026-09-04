export const THEME_STORAGE_KEY = 'tea-ticket-theme';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Used only where the OS preference cannot be read at all. */
export const DEFAULT_THEME: Theme = 'light';

export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

/** The OS preference, falling back to DEFAULT_THEME where matchMedia is unavailable. */
export function systemTheme(): Theme {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return DEFAULT_THEME;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * The theme the user explicitly picked, or null if they never did. Kept separate from
 * readStoredTheme so callers can tell "chose light" apart from "never chose" — only the
 * latter should keep following the OS.
 */
export function readExplicitTheme(): Theme | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && isTheme(stored)) return stored;
  } catch {
    // ignore storage errors
  }
  return null;
}

/** An explicit choice if one exists, otherwise whatever the OS is set to. */
export function readStoredTheme(): Theme {
  return readExplicitTheme() ?? systemTheme();
}

/**
 * Paints the theme. Deliberately does NOT persist: the public pages have no toggle, so
 * writing the OS-derived theme on first paint would freeze it into localStorage and the
 * page would stop following the OS from then on. Persist only a real choice — persistTheme.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/** Records an explicit user choice so it outlives the OS preference. */
export function persistTheme(theme: Theme): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage errors
  }
}

export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
