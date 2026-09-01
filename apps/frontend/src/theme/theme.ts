export const THEME_STORAGE_KEY = 'tea-ticket-theme';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'light';

export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

export function readStoredTheme(): Theme {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_THEME;
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && isTheme(stored)) return stored;
  } catch {
    // ignore storage errors
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage errors
  }
}

export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
