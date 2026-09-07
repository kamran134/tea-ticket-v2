export const THEME_STORAGE_KEY = 'tea-ticket-theme';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Used when the user has not picked a theme, and where matchMedia is unavailable. */
export const DEFAULT_THEME: Theme = 'dark';

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
 * readStoredTheme so callers can tell "chose light" apart from "never chose".
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

/** An explicit choice if one exists, otherwise the app default (dark). */
export function readStoredTheme(): Theme {
  return readExplicitTheme() ?? DEFAULT_THEME;
}

/**
 * Paints the theme. Deliberately does NOT persist: writing the default on first paint
 * would freeze it into localStorage and look like an explicit choice. Persist only a
 * real toggle — persistTheme.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/** Records an explicit user choice so it outlives the default. */
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
