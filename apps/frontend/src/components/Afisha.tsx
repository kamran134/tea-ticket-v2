import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatEventDate } from '../i18n/format';
import { api } from '../services/api';
import { toast } from '../services/toast';
import type { Venue } from '../types';
import { PublicLayout } from './PublicLayout';
import { TicketMark } from './TicketMark';

function eventUrl(slug: string): string {
  return `${window.location.origin}/e/${slug}`;
}

function EventCardActions({ name, slug }: { name: string; slug: string }) {
  const { t } = useTranslation();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(eventUrl(slug));
      toast.success(t('afisha.linkCopied'));
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
    <div className="absolute top-2.5 left-2.5 z-10 max-w-[calc(100%-1.25rem)]">
      <div className="relative">
        <div aria-hidden className="absolute -inset-1.5 rounded-full bg-black/35 blur-md" />
        <div className="keep-white relative flex items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md">
          <button
            type="button"
            onClick={share}
            className="px-2.5 py-1 text-[11px] sm:text-xs leading-none rounded-full hover:bg-white/15 transition-colors"
          >
            {t('afisha.share')}
          </button>
          <span aria-hidden className="w-px h-3 bg-white/30" />
          <button
            type="button"
            onClick={copyLink}
            className="px-2.5 py-1 text-[11px] sm:text-xs leading-none rounded-full hover:bg-white/15 transition-colors"
          >
            {t('afisha.copyLink')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Afisha() {
  const { t } = useTranslation();
  const [venues, setVenues] = useState<Venue[] | null>(null);

  useEffect(() => {
    document.title = t('titles.afisha');
  }, [t]);

  useEffect(() => {
    api.getVenues({ upcoming: true }).then(setVenues);
  }, []);

  return (
    <PublicLayout>
      <div className="flex-1 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 pt-6">
            <h1 className="inline-flex items-center justify-center gap-3 text-xl sm:text-2xl font-bold text-emerald-800">
              <TicketMark className="h-8 w-8 shrink-0" />
              {t('afisha.title')}
            </h1>
            <p className="text-gray-600 mt-2">{t('afisha.subtitle')}</p>
          </div>

          {venues === null && (
            <div className="text-center text-gray-400 py-16">{t('common.loading')}</div>
          )}

          {venues !== null && venues.length === 0 && (
            <div className="text-center text-gray-400 py-16">
              {t('afisha.empty')}
            </div>
          )}

          {venues !== null && venues.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {venues.map(v => (
                <article
                  key={v.id}
                  data-testid={`event-card-${v.id}`}
                  className="group bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
                >
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-emerald-100 to-amber-100">
                    <a href={`/e/${v.slug}`} className="absolute inset-0 overflow-hidden" tabIndex={-1} aria-hidden>
                      {v.posterImage ? (
                        <img
                          src={v.posterImage}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-emerald-800/35">
                          <TicketMark className="h-16 w-16" />
                        </div>
                      )}
                    </a>
                    <EventCardActions name={v.name} slug={v.slug} />
                  </div>
                  <a href={`/e/${v.slug}`} className="block p-4">
                    <h2 data-testid="event-open" className="font-semibold text-gray-800 text-lg">{v.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">{formatEventDate(v.date)}</p>
                  </a>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
