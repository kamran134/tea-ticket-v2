import { isLang, type Lang } from '../i18n/types';

export interface VenueDescriptionFields {
  description: string | null;
  descriptionAz: string | null;
  descriptionEn: string | null;
}

/** Description for the active language. Empty translations fall back to Russian. */
export function localizedVenueDescription(venue: VenueDescriptionFields, lang: string): string {
  const code: Lang = isLang(lang) ? lang : 'ru';
  const localized =
    code === 'az' ? venue.descriptionAz :
    code === 'en' ? venue.descriptionEn :
    venue.description;
  return localized || venue.description || '';
}
