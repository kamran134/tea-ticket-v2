import { useEffect, useState } from 'react';
import brandLogo from '../assets/brand-logo.svg';
import { SITE_URL, WHATSAPP_URL } from '../lib/site';

const LANGS = ['ru', 'en', 'az'] as const;
type Lang = (typeof LANGS)[number];

const nav = {
  videos: 'Видео',
  repertoire: 'Репертуар',
  reviews: 'Отзывы',
  contacts: 'Контакты',
  whatsapp: 'WhatsApp',
};

const sectionLinks = [
  { href: `${SITE_URL}/ru#videos`, label: nav.videos },
  { href: `${SITE_URL}/ru/repertoire`, label: nav.repertoire },
  { href: `${SITE_URL}/ru#reviews`, label: nav.reviews },
  { href: `${SITE_URL}/ru#contact`, label: nav.contacts },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const lang: Lang = 'ru';

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 0);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

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
              <a
                key={l}
                href={`${SITE_URL}/${l}`}
                target="_blank"
                rel="noreferrer"
                className={`text-[11px] tracking-[0.2em] uppercase px-2 py-1 transition-colors ${
                  l === lang
                    ? 'text-[var(--header-accent)]'
                    : 'text-[var(--header-muted)] hover:text-white'
                }`}
              >
                {l}
              </a>
            ))}
          </div>

          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden lg:inline-flex btn-whatsapp !w-36 !py-2.5 !px-4 !text-[12px] whitespace-nowrap"
          >
            <WhatsAppIcon />
            {nav.whatsapp}
          </a>

          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
            aria-expanded={open}
            className="lg:hidden size-10 grid place-items-center border border-[var(--header-border)] rounded-sm"
          >
            <span className="relative block w-5 h-[2px] bg-white before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-5 before:h-[2px] before:bg-white after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-5 after:h-[2px] after:bg-white" />
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-[var(--header-border)] bg-[color-mix(in_oklab,#0b0b0b_92%,transparent)] max-h-[calc(100dvh-72px)] overflow-y-auto">
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
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-whatsapp w-full justify-center"
            >
              <WhatsAppIcon />
              {nav.whatsapp}
            </a>
            <div className="flex items-center gap-3 pt-4 border-t border-[var(--header-border)]">
              {LANGS.map(l => (
                <a
                  key={l}
                  href={`${SITE_URL}/${l}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`text-xs tracking-[0.2em] uppercase px-2 py-1 ${
                    l === lang ? 'text-[var(--header-accent)]' : 'text-[var(--header-muted)]'
                  }`}
                >
                  {l}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 fill-current" aria-hidden="true">
      <path d="M11.42 9.49c-.19-.09-1.1-.54-1.27-.61s-.29-.09-.42.1-.48.6-.59.73-.21.14-.4 0a5.13 5.13 0 0 1-1.49-.92 5.25 5.25 0 0 1-1-1.29c-.11-.18 0-.28.08-.38s.18-.21.28-.32a1.39 1.39 0 0 0 .18-.31.38.38 0 0 0 0-.33c0-.09-.42-1-.58-1.37s-.3-.32-.41-.32h-.4a.72.72 0 0 0-.5.23 2.1 2.1 0 0 0-.65 1.55A3.59 3.59 0 0 0 5 8.2 8.32 8.32 0 0 0 8.19 11c.44.19.78.3 1.05.39a2.53 2.53 0 0 0 1.17.07 1.93 1.93 0 0 0 1.26-.88 1.67 1.67 0 0 0 .11-.88c-.05-.07-.17-.12-.36-.21z" />
      <path d="M13.29 2.68A7.36 7.36 0 0 0 8 .5a7.44 7.44 0 0 0-6.41 11.15l-1 3.85 3.94-1a7.4 7.4 0 0 0 3.55.9H8a7.44 7.44 0 0 0 5.29-12.72zM8 14.12a6.12 6.12 0 0 1-3.15-.87l-.22-.13-2.34.61.62-2.28-.14-.23a6.18 6.18 0 0 1 9.6-7.65 6.12 6.12 0 0 1 1.81 4.37A6.19 6.19 0 0 1 8 14.12z" />
    </svg>
  );
}
