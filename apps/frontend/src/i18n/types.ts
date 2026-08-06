export const LANGS = ['ru', 'az', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'ru';
export const LANG_STORAGE_KEY = 'tea-ticket-lang';

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
