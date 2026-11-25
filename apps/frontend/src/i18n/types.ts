export const LANGS = ['ru', 'az', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'ru';
export const LANG_STORAGE_KEY = 'tea-ticket-lang';
/** `?lang=az|en` — language versions of public pages (backend services/seo/locale.ts). */
export const LANG_URL_PARAM = 'lang';

export const LOCALE_BY_LANG: Record<Lang, string> = {
  ru: 'ru-RU',
  az: 'az-AZ',
  en: 'en-GB',
};

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

export function readStoredLang(): Lang {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_LANG;
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && isLang(stored)) return stored;
  } catch {
    // ignore storage errors
  }
  return DEFAULT_LANG;
}

function readUrlLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(LANG_URL_PARAM);
  return value && isLang(value) ? value : null;
}

/** A language in the URL wins (shared/indexed links), then the visitor's last choice. */
export function readInitialLang(): Lang {
  return readUrlLang() ?? readStoredLang();
}

/** Keeps `?lang=` in step with the shown language; the default language has no parameter. */
export function syncUrlLang(lang: Lang): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const current = url.searchParams.get(LANG_URL_PARAM);
  const wanted = lang === DEFAULT_LANG ? null : lang;
  if (current === wanted) return;
  if (wanted) url.searchParams.set(LANG_URL_PARAM, wanted);
  else url.searchParams.delete(LANG_URL_PARAM);
  window.history.replaceState(window.history.state, '', url);
}
