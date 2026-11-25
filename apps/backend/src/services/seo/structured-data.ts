import { absoluteUrl, stripHtmlToPlainText, truncateForOg } from '../open-graph';
import { localizedUrl, type SeoLang } from './locale';
import type { SeoEvent } from './pages';
import { EVENT_COUNTRY_CODE, PERFORMER, SITE_COPY, SITE_NAME } from './site';

type JsonLd = Record<string, unknown>;

const SCHEMA = 'https://schema.org';

/** Venue.currency stores a display symbol; schema.org wants ISO 4217. */
export function toIsoCurrency(currency: string | null | undefined): string {
  const value = currency?.trim() ?? '';
  if (/^[A-Z]{3}$/.test(value)) return value;
  return 'AZN';
}

/** "16+" → "16-" (schema.org typicalAgeRange); anything else is left out. */
export function toTypicalAgeRange(ageRating: string | null | undefined): string | undefined {
  const match = ageRating?.match(/^\s*(\d{1,2})\s*\+\s*$/);
  return match ? `${match[1]}-` : undefined;
}

function performerJsonLd(): JsonLd {
  return {
    '@type': 'MusicGroup',
    name: PERFORMER.name,
    alternateName: [...PERFORMER.alternateName],
    url: PERFORMER.url,
    sameAs: [...PERFORMER.sameAs],
  };
}

function offersJsonLd(event: SeoEvent, pageUrl: string): JsonLd | undefined {
  if (event.prices.length === 0) return undefined;
  const prices = event.prices.map(p => p.price);
  const knownAvailability = event.prices.every(p => p.soldOut !== null);
  const soldOut = knownAvailability && event.prices.every(p => p.soldOut);

  return {
    '@type': 'AggregateOffer',
    url: pageUrl,
    priceCurrency: toIsoCurrency(event.currency),
    lowPrice: Math.min(...prices),
    highPrice: Math.max(...prices),
    offerCount: event.prices.length,
    ...(knownAvailability && {
      availability: `${SCHEMA}/${soldOut ? 'SoldOut' : 'InStock'}`,
    }),
  };
}

/** Description in the page language; Russian is the source text and the fallback. */
export function localizedDescription(event: SeoEvent, lang: SeoLang): string | null {
  const translated = lang === 'az' ? event.descriptionAz : lang === 'en' ? event.descriptionEn : null;
  return translated?.trim() ? translated : event.description;
}

function locationJsonLd(event: SeoEvent, lang: SeoLang): JsonLd {
  const city = SITE_COPY[lang].city;
  const hall = event.venueName?.trim();
  const street = event.venueAddress?.trim();
  return {
    '@type': 'Place',
    name: hall || city,
    address: {
      '@type': 'PostalAddress',
      ...(street && { streetAddress: street }),
      addressLocality: city,
      addressCountry: EVENT_COUNTRY_CODE,
    },
  };
}

export function buildMusicEventJsonLd(event: SeoEvent, origin: string, lang: SeoLang): JsonLd {
  const pageUrl = localizedUrl(origin, `/e/${event.slug}`, lang);
  const source = localizedDescription(event, lang);
  const description = source ? stripHtmlToPlainText(source) : '';
  const offers = offersJsonLd(event, pageUrl);
  const typicalAgeRange = toTypicalAgeRange(event.ageRating);

  return {
    '@type': 'MusicEvent',
    name: event.name,
    url: pageUrl,
    startDate: event.date.toISOString(),
    eventStatus: `${SCHEMA}/EventScheduled`,
    eventAttendanceMode: `${SCHEMA}/OfflineEventAttendanceMode`,
    inLanguage: lang,
    image: [absoluteUrl(origin, event.posterImage)],
    ...(description && { description: truncateForOg(description, 500) }),
    location: locationJsonLd(event, lang),
    performer: performerJsonLd(),
    organizer: { '@type': 'Organization', name: PERFORMER.name, url: PERFORMER.url },
    ...(offers && { offers }),
    ...(typicalAgeRange && { typicalAgeRange }),
  };
}

export function buildEventPageJsonLd(event: SeoEvent, origin: string, lang: SeoLang): JsonLd {
  return { '@context': SCHEMA, ...buildMusicEventJsonLd(event, origin, lang) };
}

export function buildHomePageJsonLd(events: SeoEvent[], origin: string, lang: SeoLang): JsonLd {
  const homeUrl = `${origin}/`;
  return {
    '@context': SCHEMA,
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${homeUrl}#website`,
        name: SITE_NAME,
        url: homeUrl,
        inLanguage: lang,
        about: performerJsonLd(),
      },
      {
        '@type': 'ItemList',
        name: SITE_COPY[lang].concertsListName,
        itemListElement: events.map((event, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: buildMusicEventJsonLd(event, origin, lang),
        })),
      },
    ],
  };
}

/**
 * Serialises JSON-LD for an inline <script>. `<` is escaped so stored text such as
 * "</script>" can never close the element early.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
