import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatEventDate } from '../i18n/format';
import { api } from '../services/api';
import type { Venue } from '../types';
import { Header } from './Header';
import { Footer } from './Footer';

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
    <div className="app-bg flex flex-col">
      <Header />
      <div className="flex-1 p-4 pt-[calc(72px+1rem)] sm:pt-[calc(86px+1rem)]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 pt-6">
            <h1 className="text-3xl font-bold text-emerald-800">🍵 {t('afisha.title')}</h1>
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
                <a
                  key={v.id}
                  href={`/e/${v.slug}`}
                  data-testid={`event-card-${v.id}`}
                  className="group block bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-emerald-100 to-amber-100 overflow-hidden">
                    {v.posterImage ? (
                      <img
                        src={v.posterImage}
                        alt={v.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl">🍵</div>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 data-testid="event-open" className="font-semibold text-gray-800 text-lg">{v.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">{formatEventDate(v.date)}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
