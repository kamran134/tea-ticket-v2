import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ABOUT_COPY, BAND_WEBSITE_URL } from '../legal/about';
import { LegalDocument } from '../legal/LegalDocument';
import { isLegalDocumentId, LEGAL_TEXTS, type LegalPageDef } from '../legal/pages';
import { resolveLegalText } from '../legal/resolve';
import { EMAIL, PHONE_DISPLAY, PHONE_HREF } from '../lib/site';
import { isLang, type Lang } from '../i18n/types';
import { BackLink } from './BackLink';
import { PublicLayout } from './PublicLayout';

const ABOUT_FIELDS = [
  { labelKey: 'legal.companyName', valueKey: 'legal.companyNameValue' },
  { labelKey: 'legal.voen', valueKey: 'legal.voenValue' },
  { labelKey: 'legal.registrationNumber', valueKey: 'legal.registrationNumberValue' },
  { labelKey: 'legal.address', valueKey: 'legal.addressValue' },
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
        {copy.title}
      </h1>
      <div className="space-y-4">
        {copy.intro.map(paragraph => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {copy.sections.map(section => (
        <section key={section.heading} className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">{section.heading}</h2>
          {section.paragraphs.map(paragraph => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.list && (
            <ul className="list-disc pl-6 space-y-1">
              {section.list.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <div>
        <p className="font-semibold text-gray-800">{copy.bookingTitle}</p>
        <p className="mt-1">
          <a href={`mailto:${EMAIL}`} className="text-emerald-700 hover:underline">
            {EMAIL}
          </a>
        </p>
        <p>
          <a href={PHONE_HREF} className="text-emerald-700 hover:underline">
            {PHONE_DISPLAY}
          </a>
        </p>
        <p>
          <a
            href={BAND_WEBSITE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-700 hover:underline"
          >
            birmanat.band
          </a>
        </p>
      </div>
      <div className="border-t border-gray-200 pt-8">
        <p className="font-semibold text-gray-800">{copy.legalTitle}</p>
        <dl className="mt-6 space-y-6">
          {ABOUT_FIELDS.map(field => (
            <div key={field.labelKey}>
              <dt className="text-sm text-gray-500">{t(field.labelKey)}</dt>
              <dd className="mt-1 text-gray-800">{t(field.valueKey)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
