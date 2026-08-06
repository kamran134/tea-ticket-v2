import { useTranslation } from 'react-i18next';
import brandLogo from '../assets/brand-logo.svg';
import {
  WHATSAPP_URL,
  PHONE_DISPLAY,
  PHONE_HREF,
  EMAIL,
  INSTAGRAM,
  TIKTOK,
  SITE_URL,
  ridersUrl,
} from '../lib/site';
import type { Lang } from '../i18n/types';

export function Footer() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Lang;
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer border-t border-[var(--footer-border)] mt-12 md:mt-32">
      <div className="site-container py-10 md:py-16 grid gap-10 md:gap-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <a href={SITE_URL} target="_blank" rel="noreferrer">
            <img
              src={brandLogo}
              alt="BIR MANAT BAND"
              width={1419}
              height={556}
              className="h-[4.6rem] w-auto"
            />
          </a>
          <p className="mt-5 text-[var(--footer-muted)] max-w-md text-[15px] leading-relaxed">
            {t('footer.tagline')}
          </p>
          <div className="mt-6 flex flex-col items-start gap-3">
            <a
              href={INSTAGRAM}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 footer-eyebrow hover:text-[var(--footer-accent-hover)]"
            >
              <InstagramIcon className="size-4 shrink-0" />
              Instagram →
            </a>
            <a
              href={TIKTOK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 footer-eyebrow hover:text-[var(--footer-accent-hover)]"
            >
              <TikTokIcon className="size-4 shrink-0" />
              TikTok →
            </a>
          </div>
        </div>

        <div>
          <p className="footer-eyebrow mb-4">{t('footer.contactTitle')}</p>
          <ul className="space-y-2 text-[15px] text-[var(--footer-fg)]">
            <li>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--footer-accent)]"
              >
                WhatsApp
              </a>
            </li>
            <li>
              <a href={PHONE_HREF} className="hover:text-[var(--footer-accent)]">
                {PHONE_DISPLAY}
              </a>
            </li>
            <li>
              <a href={`mailto:${EMAIL}`} className="hover:text-[var(--footer-accent)]">
                {EMAIL}
              </a>
            </li>
            <li className="text-[var(--footer-muted)]">Baku, Azerbaijan</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--footer-border)]">
        <div className="site-container py-8 flex flex-wrap justify-center gap-3">
          <a href={ridersUrl(lang)} target="_blank" rel="noreferrer" className="footer-btn-ghost">
            {t('footer.riders')}
          </a>
        </div>
      </div>

      <div className="border-t border-[var(--footer-border)]">
        <div className="site-container py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-[12px] tracking-[0.18em] uppercase text-[var(--footer-muted)]">
          <p>
            © {year} {t('footer.rights')}. {t('footer.legal')}
          </p>
          <p>Baku · AZ</p>
        </div>
      </div>
    </footer>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M14.5 3c.3 2.4 1.7 4.2 4 4.7v2.4c-1.4-.05-2.7-.5-3.8-1.25V15.2c0 3.1-2.5 5.6-5.6 5.6S3.5 18.3 3.5 15.2 6 9.6 9.1 9.6c.4 0 .8.05 1.2.14v2.55a3.1 3.1 0 0 0-1.2-.24c-1.7 0-3.05 1.4-3.05 3.15S7.4 18.35 9.1 18.35s3.05-1.4 3.05-3.15V3h2.35Z" />
    </svg>
  );
}
