import {
  absoluteUrl,
  escapeHtml,
  formatEventDate,
  formatEventDay,
  htmlToParagraphs,
  stripHtmlToPlainText,
  truncateForOg,
} from '../open-graph';
import { DATE_LOCALE, DEFAULT_SEO_LANG, localizedUrl, OG_LOCALE, SEO_LANGS, type SeoLang } from './locale';
import type { SeoEvent, SeoPage } from './pages';
import { buildEventPageJsonLd, buildHomePageJsonLd, localizedDescription, serializeJsonLd } from './structured-data';
import { PERFORMER, SITE_COPY, SITE_NAME, type SiteCopy } from './site';

// The body fragment is shown until the bundle mounts (and to clients without JS).
// Tailwind classes would be purged from the bundle, so it carries its own small styles.
const PRERENDER_STYLE =
  '.seo-prerender{max-width:56rem;margin:0 auto;padding:1.5rem 1rem;line-height:1.55;' +
  'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
  '.seo-prerender h1{font-size:1.75rem;line-height:1.2;margin:0 0 .75rem}' +
  '.seo-prerender h2{font-size:1.2rem;margin:1.5rem 0 .5rem}' +
  '.seo-prerender img{display:block;max-width:100%;height:auto;border-radius:1rem;margin:1rem 0}' +
  '.seo-prerender a{color:#d4af37}' +
  '.seo-prerender ul{padding-left:1.25rem}';

export function formatPrice(price: number, currency: string | null | undefined): string {
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  return `${amount} ${currency?.trim() || '₼'}`;
}

/** Link to another public page, keeping the current language. */
function pageHref(path: string, lang: SeoLang): string {
  return lang === DEFAULT_SEO_LANG ? path : `${path}?lang=${lang}`;
}

function minPriceLabel(event: SeoEvent, copy: SiteCopy): string | null {
  if (event.prices.length === 0) return null;
  const prices = event.prices.map(p => p.price);
  const min = Math.min(...prices);
  const label = formatPrice(min, event.currency);
  return Math.max(...prices) > min ? copy.priceFrom(label) : label;
}

/** "Hall, street, city" — whatever of it is known. */
function placeLabel(event: SeoEvent, copy: SiteCopy): string {
  return [event.venueName?.trim(), event.venueAddress?.trim(), copy.city].filter(Boolean).join(', ');
}

function eventDescription(event: SeoEvent, lang: SeoLang): string {
  const copy = SITE_COPY[lang];
  const lead = [
    copy.eventLead(event.name, formatEventDate(event.date, DATE_LOCALE[lang]), placeLabel(event, copy)),
    copy.eventTicketsLine(minPriceLabel(event, copy)),
  ].join(' ');
  const source = localizedDescription(event, lang);
  const details = source ? stripHtmlToPlainText(source) : '';
  return truncateForOg(details ? `${lead} ${details}` : lead);
}

interface HeadMeta {
  title: string;
  description: string;
  imageUrl: string;
  indexable: boolean;
  jsonLd?: Record<string, unknown>;
}

function headMeta(page: SeoPage, origin: string, lang: SeoLang): HeadMeta {
  const copy = SITE_COPY[lang];
  const defaultImage = absoluteUrl(origin, null);
  const home = { title: copy.homeTitle, description: copy.homeDescription, imageUrl: defaultImage };

  switch (page.kind) {
    case 'home':
      return { ...home, indexable: true, jsonLd: buildHomePageJsonLd(page.events, origin, lang) };
    case 'unavailable':
      return { ...home, indexable: true };
    case 'event':
      return {
        title: copy.eventTitle(page.event.name, formatEventDay(page.event.date, DATE_LOCALE[lang])),
        description: eventDescription(page.event, lang),
        imageUrl: absoluteUrl(origin, page.event.posterImage),
        indexable: true,
        jsonLd: buildEventPageJsonLd(page.event, origin, lang),
      };
    case 'past-event':
      // Kept for old links (social posts), but nothing to sell: out of the index.
      return {
        title: copy.pastTitle(page.event.name, formatEventDay(page.event.date, DATE_LOCALE[lang])),
        description: copy.homeDescription,
        imageUrl: absoluteUrl(origin, page.event.posterImage),
        indexable: false,
      };
    case 'static': {
      const staticCopy = copy.staticPages[page.path];
      return { title: staticCopy.title, description: staticCopy.description, imageUrl: defaultImage, indexable: true };
    }
    case 'not-found':
      return { title: copy.notFoundTitle, description: copy.homeDescription, imageUrl: defaultImage, indexable: false };
  }
}

/** Language alternates of an indexable page; Russian (bare URL) is the x-default. */
function hreflangLinks(origin: string, path: string): string[] {
  return [
    ...SEO_LANGS.map(
      l => `<link rel="alternate" hreflang="${l}" href="${escapeHtml(localizedUrl(origin, path, l))}">`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(localizedUrl(origin, path, DEFAULT_SEO_LANG))}">`,
  ];
}

/** Everything page-specific in <head>: title, description, canonical, hreflang, OG/Twitter, JSON-LD. */
export function renderSeoHead(page: SeoPage, origin: string, lang: SeoLang = DEFAULT_SEO_LANG): string {
  const meta = headMeta(page, origin, lang);
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const pageUrl = escapeHtml(localizedUrl(origin, page.path, lang));
  const image = escapeHtml(meta.imageUrl);

  const lines = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${meta.indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">`,
    ...(meta.indexable ? [`<link rel="canonical" href="${pageUrl}">`, ...hreflangLinks(origin, page.path)] : []),
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:alt" content="${title}">`,
    `<meta property="og:url" content="${pageUrl}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}">`,
    ...SEO_LANGS.filter(l => l !== lang).map(l => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`),
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<style>${PRERENDER_STYLE}</style>`,
    ...(meta.jsonLd ? [`<script type="application/ld+json">${serializeJsonLd(meta.jsonLd)}</script>`] : []),
  ];
  return lines.join('\n');
}

function renderPriceList(event: SeoEvent, copy: SiteCopy): string {
  if (event.prices.length === 0) return `<p>${escapeHtml(copy.pricesSoon)}</p>`;
  const items = event.prices.map(p => {
    const status = p.soldOut ? ` — ${escapeHtml(copy.soldOut)}` : '';
    return `<li>${escapeHtml(p.zoneName)} — ${escapeHtml(formatPrice(p.price, event.currency))}${status}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

function renderPoster(event: SeoEvent, origin: string, copy: SiteCopy): string {
  if (!event.posterImage) return '';
  const src = escapeHtml(absoluteUrl(origin, event.posterImage));
  return `<img src="${src}" alt="${escapeHtml(copy.posterAlt(event.name))}">`;
}

function renderFactsLine(event: SeoEvent, lang: SeoLang, copy: SiteCopy): string {
  const facts = [formatEventDate(event.date, DATE_LOCALE[lang]), placeLabel(event, copy), event.ageRating?.trim()]
    .filter(Boolean)
    .join(' · ');
  return `<p>${escapeHtml(facts)} · <a href="${escapeHtml(PERFORMER.url)}">${escapeHtml(PERFORMER.name)}</a></p>`;
}

function renderEventBody(event: SeoEvent, origin: string, lang: SeoLang): string {
  const copy = SITE_COPY[lang];
  const source = localizedDescription(event, lang);
  const paragraphs = source ? htmlToParagraphs(source) : [];

  return [
    '<main class="seo-prerender">',
    `<h1>${escapeHtml(event.name)}</h1>`,
    renderFactsLine(event, lang, copy),
    renderPoster(event, origin, copy),
    `<h2>${escapeHtml(copy.ticketsHeading)}</h2>`,
    renderPriceList(event, copy),
    `<p>${escapeHtml(copy.howToBuy)}</p>`,
    ...(paragraphs.length > 0
      ? [`<h2>${escapeHtml(copy.aboutConcert)}</h2>`, ...paragraphs.map(p => `<p>${escapeHtml(p)}</p>`)]
      : []),
    `<p><a href="${pageHref('/', lang)}">${escapeHtml(copy.allConcerts)}</a></p>`,
    '</main>',
  ].join('\n');
}

function renderPastEventBody(event: SeoEvent, origin: string, lang: SeoLang): string {
  const copy = SITE_COPY[lang];
  return [
    '<main class="seo-prerender">',
    `<h1>${escapeHtml(event.name)}</h1>`,
    `<p>${escapeHtml(copy.pastNotice(formatEventDate(event.date, DATE_LOCALE[lang])))}</p>`,
    renderPoster(event, origin, copy),
    `<p><a href="${pageHref('/', lang)}">${escapeHtml(copy.allConcerts)}</a></p>`,
    '</main>',
  ].join('\n');
}

function renderNotFoundBody(lang: SeoLang): string {
  const copy = SITE_COPY[lang];
  return [
    '<main class="seo-prerender">',
    `<h1>${escapeHtml(copy.notFoundTitle)}</h1>`,
    `<p>${escapeHtml(copy.notFoundText)}</p>`,
    `<p><a href="${pageHref('/', lang)}">${escapeHtml(copy.allConcerts)}</a></p>`,
    '</main>',
  ].join('\n');
}

function renderHomeBody(events: SeoEvent[], lang: SeoLang): string {
  const copy = SITE_COPY[lang];
  const list =
    events.length === 0
      ? `<p>${escapeHtml(copy.noUpcoming)}</p>`
      : `<ul>${events
          .map(event => {
            const details = [formatEventDate(event.date, DATE_LOCALE[lang]), minPriceLabel(event, copy)]
              .filter(Boolean)
              .join(', ');
            const href = escapeHtml(pageHref(`/e/${encodeURIComponent(event.slug)}`, lang));
            return `<li><a href="${href}">${escapeHtml(event.name)}</a> — ${escapeHtml(details)}</li>`;
          })
          .join('')}</ul>`;

  return [
    '<main class="seo-prerender">',
    `<h1>${escapeHtml(copy.homeHeading)}</h1>`,
    `<p>${escapeHtml(copy.homeIntro)}</p>`,
    `<h2>${escapeHtml(copy.upcomingHeading)}</h2>`,
    list,
    `<p>${escapeHtml(copy.bandSite)} <a href="${escapeHtml(PERFORMER.url)}">${escapeHtml(PERFORMER.name)}</a>.</p>`,
    '</main>',
  ].join('\n');
}

/**
 * Readable page content placed inside #root. React replaces it on mount, so it only
 * has to be correct and indexable, not interactive.
 */
export function renderSeoBody(page: SeoPage, origin: string, lang: SeoLang = DEFAULT_SEO_LANG): string {
  switch (page.kind) {
    case 'home':
      return renderHomeBody(page.events, lang);
    case 'event':
      return renderEventBody(page.event, origin, lang);
    case 'past-event':
      return renderPastEventBody(page.event, origin, lang);
    case 'not-found':
      return renderNotFoundBody(lang);
    case 'static':
    case 'unavailable':
      return '';
  }
}
