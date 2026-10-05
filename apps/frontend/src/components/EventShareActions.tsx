import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../services/toast';

function eventUrl(slug: string): string {
  return `${window.location.origin}/e/${slug}`;
}

export function EventShareActions({ name, slug }: { name: string; slug: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(eventUrl(slug));
      setCopied(true);
      toast.success(t('afisha.linkCopied'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('common.unknownError'));
    }
  };

  const share = async () => {
    const url = eventUrl(slug);
    if (navigator.share) {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    await copyLink();
  };

  return (
    <div className="absolute top-2.5 left-2.5 z-20">
      <div className="relative">
        <div aria-hidden className="absolute -inset-1.5 rounded-full bg-black/35 blur-md" />
        <div className="keep-white relative flex items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md">
          <button
            type="button"
            onClick={share}
            title={t('afisha.share')}
            aria-label={t('afisha.share')}
            className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          <span aria-hidden className="w-px h-3.5 bg-white/30" />
          <button
            type="button"
            onClick={copyLink}
            title={t('afisha.copyLink')}
            aria-label={t('afisha.copyLink')}
            className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
