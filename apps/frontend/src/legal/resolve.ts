import { DEFAULT_LANG, isLang, type Lang } from '../i18n/types';

export function resolveLegalText(
  texts: Partial<Record<Lang, string>>,
  lang: string,
): { text: string; usedLang: Lang; usedFallback: boolean } {
  const requested: Lang = isLang(lang) ? lang : DEFAULT_LANG;
  const preferred: Lang[] = [requested, DEFAULT_LANG, 'en', 'az', 'ru'];
  const seen = new Set<Lang>();

  for (const candidate of preferred) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const text = texts[candidate]?.trim();
    if (text) {
      return {
        text,
        usedLang: candidate,
        usedFallback: candidate !== requested,
      };
    }
  }

  return { text: '', usedLang: requested, usedFallback: true };
}
