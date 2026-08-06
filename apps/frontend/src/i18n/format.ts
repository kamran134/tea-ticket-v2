import i18n from './index';
import { LOCALE_BY_LANG, type Lang } from './types';

export function getCurrentLocale(): string {
  const lang = i18n.language as Lang;
  return LOCALE_BY_LANG[lang] ?? LOCALE_BY_LANG.ru;
}

export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const locale = getCurrentLocale();
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export function formatEventDateTime(iso: string): string {
  return new Date(iso).toLocaleString(getCurrentLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPrice(amount: number, currency: string): string {
  const formatted = amount.toLocaleString(getCurrentLocale());
  return `${formatted} ${currency}`;
}
