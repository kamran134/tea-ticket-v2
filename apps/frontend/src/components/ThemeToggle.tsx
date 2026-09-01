import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';

interface Props {
  variant?: 'header' | 'page';
}

export function ThemeToggle({ variant = 'page' }: Props) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const header = variant === 'header';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t('header.toggleTheme', { theme: t(next === 'dark' ? 'header.themeDark' : 'header.themeLight') })}
      aria-pressed={theme === 'dark'}
      title={t(next === 'dark' ? 'header.themeDark' : 'header.themeLight')}
      className={
        header
          ? 'size-10 grid place-items-center rounded-sm border border-[var(--header-border)] text-[var(--header-muted)] hover:text-[var(--header-accent)] transition-colors'
          : 'size-10 grid place-items-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors'
      }
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}
