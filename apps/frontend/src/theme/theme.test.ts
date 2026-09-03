import { describe, expect, it, beforeEach, vi } from 'vitest';
import { applyTheme, DEFAULT_THEME, readStoredTheme, THEME_STORAGE_KEY, toggleTheme } from './theme';

/**
 * The frontend suite runs in vitest's default node environment — every other test here
 * is pure logic, and jsdom would be a heavy dependency for one file. applyTheme only
 * touches documentElement.classList and .style.colorScheme, so both are stubbed the same
 * way the file already stubs localStorage.
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
    set className(value: string) {
      classes.clear();
      for (const token of value.split(/\s+/).filter(Boolean)) classes.add(token);
    },
    get className() {
      return [...classes].join(' ');
    },
  };
  vi.stubGlobal('document', { documentElement });
  return documentElement;
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
    documentElement.className = '';
    documentElement.style.colorScheme = '';
  });

  it('defaults to light', () => {
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe('light');
  });

  it('persists and applies dark class on html', () => {
    applyTheme('dark');
    expect(storage.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(documentElement.classList.contains('dark')).toBe(true);
    expect(documentElement.style.colorScheme).toBe('dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('removes the dark class when switching back to light', () => {
    applyTheme('dark');
    applyTheme('light');
    expect(documentElement.classList.contains('dark')).toBe(false);
    expect(documentElement.style.colorScheme).toBe('light');
  });

  it('toggles between light and dark', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });
});
