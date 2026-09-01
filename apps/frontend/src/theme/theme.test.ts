import { describe, expect, it, beforeEach, vi } from 'vitest';
import { applyTheme, DEFAULT_THEME, readStoredTheme, THEME_STORAGE_KEY, toggleTheme } from './theme';

describe('theme', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
  });

  it('defaults to light', () => {
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe('light');
  });

  it('persists and applies dark class on html', () => {
    applyTheme('dark');
    expect(storage.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(readStoredTheme()).toBe('dark');
  });

  it('toggles between light and dark', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });
});
