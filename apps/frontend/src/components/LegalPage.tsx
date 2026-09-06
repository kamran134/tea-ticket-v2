import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LegalDocument } from '../legal/LegalDocument';
import { LEGAL_TEXTS, type LegalPageDef } from '../legal/pages';
import { resolveLegalText } from '../legal/resolve';
import { isLang, type Lang } from '../i18n/types';
import { BackLink } from './BackLink';
import { PublicLayout } from './PublicLayout';

export function LegalPage({ page }: { page: LegalPageDef }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = isLang(i18n.language) ? i18n.language : 'ru';
  const { text, usedFallback } = resolveLegalText(LEGAL_TEXTS[page.id], lang);

  useEffect(() => {
    document.title = t(page.browserTitleKey);
  }, [t, page.browserTitleKey]);

  return (
    <PublicLayout>
      <article className="flex-1 px-4 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          <BackLink href="/" label={t('common.toAfisha')} className="mb-6" />
          {usedFallback && (
            <p className="mb-6 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
              {t('legal.unavailable')}
            </p>
          )}
          {text ? (
            <LegalDocument text={text} />
          ) : (
            <p className="text-gray-500">{t('legal.unavailable')}</p>
          )}
        </div>
      </article>
    </PublicLayout>
  );
}
