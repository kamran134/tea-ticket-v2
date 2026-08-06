import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru';
import az from './locales/az';
import en from './locales/en';
import { DEFAULT_LANG, LANG_STORAGE_KEY, readStoredLang, type Lang } from './types';

const resources = {
  ru: { translation: ru },
  az: { translation: az },
  en: { translation: en },
} as const;

function syncDocumentLang(lang: Lang): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: readStoredLang(),
    fallbackLng: DEFAULT_LANG,
    interpolation: { escapeValue: false },
    pluralSeparator: '_',
  });

syncDocumentLang(i18n.language as Lang);

i18n.on('languageChanged', (lang: string) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
  } catch {
    // ignore storage errors
  }
  syncDocumentLang(lang as Lang);
});

export function changeLanguage(lang: Lang): Promise<unknown> {
  return i18n.changeLanguage(lang);
}

export default i18n;
