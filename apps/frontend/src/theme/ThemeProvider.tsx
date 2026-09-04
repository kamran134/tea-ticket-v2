import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  persistTheme,
  readExplicitTheme,
  readStoredTheme,
  systemTheme,
  toggleTheme as nextTheme,
  type Theme,
} from './theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = readStoredTheme();
    // Paint only. Persisting here would turn "following the OS" into a one-time snapshot.
    applyTheme(initial);
    return initial;
  });

  const commit = useCallback((next: Theme) => {
    applyTheme(next);
    persistTheme(next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(current => {
      const next = nextTheme(current);
      applyTheme(next);
      persistTheme(next);
      return next;
    });
  }, []);

  // Keep following the OS while the user has not picked a theme themselves. This is the
  // only way the public pages can reach dark mode: their toggle lives in the header,
  // which is hidden here.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readExplicitTheme() !== null) return;
      const next = systemTheme();
      applyTheme(next);
      setThemeState(next);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme: commit, toggleTheme }),
    [theme, commit, toggleTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
