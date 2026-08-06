import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import brandLogo from '../assets/brand-logo.svg';
import { changeLanguage } from '../i18n';
import { LANGS, type Lang } from '../i18n/types';
import { SITE_URL, siteSectionUrl } from '../lib/site';

export function Header() {
  const { t, i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const lang = i18n.language as Lang;

  const sectionLinks = useMemo(() => [
    { href: `${siteSectionUrl(lang, '')}#videos`, label: t('header.videos') },
    { href: siteSectionUrl(lang, '/repertoire'), label: t('header.repertoire') },
    { href: `${siteSectionUrl(lang, '')}#reviews`, label: t('header.reviews') },
    { href: `${siteSectionUrl(lang, '')}#contact`, label: t('header.contacts') },
  ], [lang, t]);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 0);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const handleLangChange = (next: Lang) => {
    void changeLanguage(next);
  };

  return (
    <header
      className={`site-header fixed top-0 left-0 right-0 z-50 ${
        scrolled || open ? 'is-scrolled' : ''
      }`}
    >
      <div className="site-container flex h-[72px] sm:h-[86px] items-center justify-between gap-3">
        <a href={SITE_URL} target="_blank" rel="noreferrer" className="group block shrink-0 min-w-0">
          <img
            src={brandLogo}
            alt="BIR MANAT BAND"
            width={1419}
            height={556}
            className="h-9 sm:h-11 lg:h-[3.15rem] w-auto max-w-[min(42vw,11rem)] sm:max-w-none transition-opacity group-hover:opacity-80"
          />
        </a>

        <nav className="hidden lg:flex items-center gap-4 xl:gap-7 min-w-0">
          {sectionLinks.map(l => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] xl:text-[13px] tracking-[0.12em] xl:tracking-[0.18em] uppercase text-[var(--header-muted)] hover:text-[var(--header-accent)] transition-colors whitespace-nowrap"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-1 mr-1 xl:mr-2">
            {LANGS.map(l => (
              <button
                key={l}
                type="button"
                onClick={() => handleLangChange(l)}
                aria-label={t('header.switchLanguage', { lang: l.toUpperCase() })}
                aria-pressed={l === lang}
                className={`text-[11px] tracking-[0.2em] uppercase px-2 py-1 transition-colors ${
                  l === lang
                    ? 'text-[var(--header-accent)]'
                    : 'text-[var(--header-muted)] hover:text-white'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label={t('common.menu')}
            aria-expanded={open}
            className="lg:hidden size-10 grid place-items-center border border-[var(--header-border)] rounded-sm"
          >
            <span className="relative block w-5 h-[2px] bg-white before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-5 before:h-[2px] before:bg-white after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-5 after:h-[2px] after:bg-white" />
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-[var(--header-border)] bg-[#0a0a0a] max-h-[calc(100dvh-72px)] overflow-y-auto">
          <div className="site-container py-6 flex flex-col gap-4">
            {sectionLinks.map(l => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm tracking-[0.2em] uppercase text-[var(--header-muted)] hover:text-[var(--header-accent)]"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="flex items-center gap-3 pt-4 border-t border-[var(--header-border)]">
              {LANGS.map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleLangChange(l)}
                  aria-label={t('header.switchLanguage', { lang: l.toUpperCase() })}
                  aria-pressed={l === lang}
                  className={`text-xs tracking-[0.2em] uppercase px-2 py-1 ${
                    l === lang ? 'text-[var(--header-accent)]' : 'text-[var(--header-muted)]'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
