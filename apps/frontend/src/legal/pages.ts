import type { Lang } from '../i18n/types';
import privacyAz from './documents/privacy-policy.az.txt?raw';
import privacyEn from './documents/privacy-policy.en.txt?raw';
import privacyRu from './documents/privacy-policy.ru.txt?raw';
import refundAz from './documents/refund-policy.az.txt?raw';
import refundEn from './documents/refund-policy.en.txt?raw';
import refundRu from './documents/refund-policy.ru.txt?raw';
import termsAz from './documents/terms.az.txt?raw';
import termsEn from './documents/terms.en.txt?raw';
import termsRu from './documents/terms.ru.txt?raw';

export const LEGAL_DOCUMENT_IDS = ['privacy-policy', 'terms', 'refund-policy'] as const;
export type LegalDocumentId = (typeof LEGAL_DOCUMENT_IDS)[number];

export const LEGAL_PAGE_IDS = [...LEGAL_DOCUMENT_IDS, 'about'] as const;
export type LegalPageId = (typeof LEGAL_PAGE_IDS)[number];

export interface LegalPageDef {
  id: LegalPageId;
  path: string;
  titleKey: 'legal.privacyPolicy' | 'legal.terms' | 'legal.refundPolicy' | 'legal.about';
  browserTitleKey: 'titles.privacyPolicy' | 'titles.terms' | 'titles.refundPolicy' | 'titles.about';
}

export const LEGAL_PAGES: readonly LegalPageDef[] = [
  {
    id: 'privacy-policy',
    path: '/privacy-policy',
    titleKey: 'legal.privacyPolicy',
    browserTitleKey: 'titles.privacyPolicy',
  },
  {
    id: 'terms',
    path: '/terms',
    titleKey: 'legal.terms',
    browserTitleKey: 'titles.terms',
  },
  {
    id: 'refund-policy',
    path: '/refund-policy',
    titleKey: 'legal.refundPolicy',
    browserTitleKey: 'titles.refundPolicy',
  },
  {
    id: 'about',
    path: '/about',
    titleKey: 'legal.about',
    browserTitleKey: 'titles.about',
  },
];

export const LEGAL_TEXTS: Record<LegalDocumentId, Record<Lang, string>> = {
  'privacy-policy': { ru: privacyRu, en: privacyEn, az: privacyAz },
  terms: { ru: termsRu, en: termsEn, az: termsAz },
  'refund-policy': { ru: refundRu, en: refundEn, az: refundAz },
};

export function isLegalDocumentId(id: LegalPageId): id is LegalDocumentId {
  return id !== 'about';
}

export function legalPageByPath(pathname: string): LegalPageDef | undefined {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return LEGAL_PAGES.find(page => page.path === normalized);
}
