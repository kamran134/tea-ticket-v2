// Languages of the public pages. Russian lives on the bare URL; Azerbaijani and English
// are the same URL with `?lang=az|en` (the frontend reads the same parameter).

export const SEO_LANGS = ['ru', 'az', 'en'] as const;
export type SeoLang = (typeof SEO_LANGS)[number];

export const DEFAULT_SEO_LANG: SeoLang = 'ru';

/** BCP 47 locale for Intl date formatting. */
export const DATE_LOCALE: Record<SeoLang, string> = {
  ru: 'ru-RU',
  az: 'az-AZ',
  en: 'en-GB',
};

/** og:locale values. */
export const OG_LOCALE: Record<SeoLang, string> = {
  ru: 'ru_RU',
  az: 'az_AZ',
  en: 'en_GB',
};

export function isSeoLang(value: unknown): value is SeoLang {
  return typeof value === 'string' && (SEO_LANGS as readonly string[]).includes(value);
}

/** URL of a page path in a language: the default language has no parameter. */
export function localizedUrl(origin: string, path: string, lang: SeoLang): string {
  const base = `${origin}${path}`;
  return lang === DEFAULT_SEO_LANG ? base : `${base}?lang=${lang}`;
}
