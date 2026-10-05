import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatEventDate } from '../i18n/format';
import { api } from '../services/api';
import type { Venue } from '../types';
import { EventShareActions } from './EventShareActions';
import { PublicLayout } from './PublicLayout';
import { SupportContact } from './SupportContact';
import { TicketMark } from './TicketMark';

export function Afisha() {
  const { t } = useTranslation();
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    document.title = t('titles.afisha');
  }, [t]);

  useEffect(() => {
    api.getVenues({ upcoming: true }).then(setVenues).catch(() => setLoadFailed(true));
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

          {loadFailed && (
            <div className="text-center text-gray-500 py-16">{t('common.unknownError')}</div>
          )}

          {venues === null && !loadFailed && (
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
                    <EventShareActions name={v.name} slug={v.slug} />
                  </div>
                  <a href={`/e/${v.slug}`} className="block p-4">
                    <h2 data-testid="event-open" className="font-semibold text-gray-800 text-lg">{v.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">{formatEventDate(v.date)}</p>
                  </a>
                </article>
              ))}
            </div>
          )}

          <SupportContact className="text-center mt-10" />
        </div>
      </div>
    </PublicLayout>
  );
}
