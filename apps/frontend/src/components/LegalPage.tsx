import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ABOUT_COPY } from '../legal/about';
import { LegalDocument } from '../legal/LegalDocument';
import { isLegalDocumentId, LEGAL_TEXTS, type LegalPageDef } from '../legal/pages';
import { resolveLegalText } from '../legal/resolve';
import { isLang, type Lang } from '../i18n/types';
import { BackLink } from './BackLink';
import { PublicLayout } from './PublicLayout';

const ABOUT_FIELDS = [
  { labelKey: 'legal.companyName', valueKey: 'legal.requisitePlaceholder' },
  { labelKey: 'legal.voen', valueKey: 'legal.requisitePlaceholder' },
  { labelKey: 'legal.registrationNumber', valueKey: 'legal.requisitePlaceholder' },
  { labelKey: 'legal.address', valueKey: 'legal.requisitePlaceholder' },
] as const;

export function LegalPage({ page }: { page: LegalPageDef }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = isLang(i18n.language) ? i18n.language : 'ru';

  useEffect(() => {
    document.title = t(page.browserTitleKey);
  }, [t, page.browserTitleKey]);

  return (
    <PublicLayout>
      <article className="flex-1 px-4 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          <BackLink href="/" label={t('common.toAfisha')} className="mb-6" />
          {page.id === 'about' ? (
            <AboutContent lang={lang} />
          ) : (
            <DocumentContent page={page} lang={lang} />
          )}
        </div>
      </article>
    </PublicLayout>
  );
}

function DocumentContent({ page, lang }: { page: LegalPageDef; lang: Lang }) {
  const { t } = useTranslation();
  if (!isLegalDocumentId(page.id)) return null;
  const { text, usedFallback } = resolveLegalText(LEGAL_TEXTS[page.id], lang);

  return (
    <>
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
    </>
  );
}

function AboutContent({ lang }: { lang: Lang }) {
  const { t } = useTranslation();
  const copy = ABOUT_COPY[lang];

  return (
    <div className="space-y-10 text-[15px] leading-relaxed text-gray-700">
      <h1 className="text-2xl sm:text-3xl font-bold text-emerald-800 tracking-tight text-center">
        {t('legal.about')}
      </h1>
      <div className="space-y-4">
        {copy.intro.map(paragraph => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div>
        <p className="font-semibold text-gray-800">{copy.whatWeDo}</p>
        <ol className="mt-4 space-y-4">
          {copy.activities.map((item, index) => (
            <li key={item.title}>
              <p className="font-semibold text-gray-800">
                {index + 1}. {item.title}.
              </p>
              <p className="mt-1">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-4">
        {copy.closing.map(paragraph => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <dl className="space-y-6">
        {ABOUT_FIELDS.map(field => (
          <div key={field.labelKey}>
            <dt className="text-sm text-gray-500">{t(field.labelKey)}</dt>
            <dd className="mt-1 text-gray-800">{t(field.valueKey)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
