import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME,
  persistTheme,
  readExplicitTheme,
  readStoredTheme,
  systemTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
} from './theme';

/**
 * The frontend suite runs in vitest's default node environment — every other test here
 * is pure logic, and jsdom would be a heavy dependency for one file. The theme module
 * only touches documentElement, localStorage and matchMedia, so all three are stubbed
 * the same way the file already stubbed localStorage.
 */
function stubDocument() {
  const classes = new Set<string>();
  const documentElement = {
    classList: {
      toggle: (token: string, force?: boolean) => {
        const on = force ?? !classes.has(token);
        if (on) classes.add(token);
        else classes.delete(token);
        return on;
      },
      contains: (token: string) => classes.has(token),
    },
    style: { colorScheme: '' },
  };
  vi.stubGlobal('document', { documentElement });
  return documentElement;
}

function stubMatchMedia(prefersDark: boolean | null) {
  vi.stubGlobal('window', prefersDark === null ? {} : {
    matchMedia: (query: string) => ({
      matches: query.includes('dark') && prefersDark,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe('theme', () => {
  const storage = new Map<string, string>();
  let documentElement: ReturnType<typeof stubDocument>;

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    documentElement = stubDocument();
    stubMatchMedia(false);
  });

  it('reports no explicit theme until one is stored', () => {
    expect(readExplicitTheme()).toBeNull();
    persistTheme('dark');
    expect(readExplicitTheme()).toBe('dark');
  });

  it('defaults to dark when the user has not chosen', () => {
    stubMatchMedia(false);
    expect(readExplicitTheme()).toBeNull();
    expect(readStoredTheme()).toBe('dark');
    expect(DEFAULT_THEME).toBe('dark');
  });

  it('prefers an explicit light choice over the dark default', () => {
    stubMatchMedia(true);
    persistTheme('light');
    expect(readStoredTheme()).toBe('light');
  });

  it('falls back to the default when matchMedia is unavailable', () => {
    stubMatchMedia(null);
    expect(systemTheme()).toBe(DEFAULT_THEME);
  });

  it('systemTheme reports the OS preference when matchMedia is available', () => {
    stubMatchMedia(true);
    expect(systemTheme()).toBe('dark');
    stubMatchMedia(false);
    expect(systemTheme()).toBe('light');
  });

  // Regression: applyTheme used to persist. That froze the default into storage
  // on first paint and made it look like an explicit user choice.
  it('applyTheme paints without persisting', () => {
    applyTheme('dark');
    expect(documentElement.classList.contains('dark')).toBe(true);
    expect(documentElement.style.colorScheme).toBe('dark');
    expect(storage.has(THEME_STORAGE_KEY)).toBe(false);
    expect(readExplicitTheme()).toBeNull();
  });

  it('removes the dark class when switching back to light', () => {
    applyTheme('dark');
    applyTheme('light');
    expect(documentElement.classList.contains('dark')).toBe(false);
    expect(documentElement.style.colorScheme).toBe('light');
  });

  it('persistTheme records the choice', () => {
    persistTheme('dark');
    expect(storage.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('toggles between light and dark', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });
});
