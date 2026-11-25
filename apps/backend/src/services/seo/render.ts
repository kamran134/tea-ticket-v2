import {
  absoluteUrl,
  escapeHtml,
  formatEventDateRu,
  formatEventDayRu,
  htmlToParagraphs,
  stripHtmlToPlainText,
  truncateForOg,
} from '../open-graph';
import type { SeoEvent, SeoPage } from './pages';
import { buildEventPageJsonLd, buildHomePageJsonLd, serializeJsonLd } from './structured-data';
import {
  EVENT_CITY,
  HOME_DESCRIPTION,
  HOME_HEADING,
  HOME_INTRO,
  HOME_TITLE,
  PERFORMER,
  SITE_NAME,
} from './site';

const NOT_FOUND_TITLE = `Страница не найдена — ${SITE_NAME}`;

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

function minPriceLabel(event: SeoEvent): string | null {
  if (event.prices.length === 0) return null;
  const prices = event.prices.map(p => p.price);
  const min = Math.min(...prices);
  const label = formatPrice(min, event.currency);
  return Math.max(...prices) > min ? `от ${label}` : label;
}

function eventTitle(event: SeoEvent): string {
  return `${event.name}, ${formatEventDayRu(event.date)} — билеты | ${PERFORMER.name}`;
}

function eventDescription(event: SeoEvent): string {
  const price = minPriceLabel(event);
  const lead = [
    `${event.name} — ${formatEventDateRu(event.date)}, ${EVENT_CITY}.`,
    price ? `Билеты на ${PERFORMER.name} ${price} онлайн.` : `Билеты на ${PERFORMER.name} онлайн.`,
  ].join(' ');
  const details = event.description ? stripHtmlToPlainText(event.description) : '';
  return truncateForOg(details ? `${lead} ${details}` : lead);
}

interface HeadMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  indexable: boolean;
  jsonLd?: Record<string, unknown>;
}

function headMeta(page: SeoPage, origin: string): HeadMeta {
  const canonicalUrl = `${origin}${page.path === '/' ? '/' : page.path}`;
  const defaultImage = absoluteUrl(origin, null);

  switch (page.kind) {
    case 'home':
      return {
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
        canonicalUrl,
        imageUrl: defaultImage,
        indexable: true,
        jsonLd: buildHomePageJsonLd(page.events, origin),
      };
    case 'event':
      return {
        title: eventTitle(page.event),
        description: eventDescription(page.event),
        canonicalUrl,
        imageUrl: absoluteUrl(origin, page.event.posterImage),
        indexable: true,
        jsonLd: buildEventPageJsonLd(page.event, origin),
      };
    case 'static':
      return {
        title: page.copy.title,
        description: page.copy.description,
        canonicalUrl,
        imageUrl: defaultImage,
        indexable: true,
      };
    case 'not-found':
      return {
        title: NOT_FOUND_TITLE,
        description: HOME_DESCRIPTION,
        canonicalUrl,
        imageUrl: defaultImage,
        indexable: false,
      };
  }
}

/** Everything page-specific in <head>: title, description, canonical, OG/Twitter, JSON-LD. */
export function renderSeoHead(page: SeoPage, origin: string): string {
  const meta = headMeta(page, origin);
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = escapeHtml(meta.canonicalUrl);
  const image = escapeHtml(meta.imageUrl);

  const lines = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${meta.indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">`,
    ...(meta.indexable ? [`<link rel="canonical" href="${canonical}">`] : []),
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:alt" content="${title}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<style>${PRERENDER_STYLE}</style>`,
    ...(meta.jsonLd ? [`<script type="application/ld+json">${serializeJsonLd(meta.jsonLd)}</script>`] : []),
  ];
  return lines.join('\n');
}

function renderPriceList(event: SeoEvent): string {
  if (event.prices.length === 0) return '<p>Цены появятся, когда откроется продажа.</p>';
  const items = event.prices.map(p => {
    const status = p.soldOut ? ' — мест нет' : '';
    return `<li>${escapeHtml(p.zoneName)} — ${escapeHtml(formatPrice(p.price, event.currency))}${status}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

function renderEventBody(event: SeoEvent, origin: string): string {
  const facts = [formatEventDateRu(event.date), EVENT_CITY, event.ageRating?.trim()].filter(Boolean);
  const paragraphs = event.description ? htmlToParagraphs(event.description) : [];
  const poster = event.posterImage
    ? `<img src="${escapeHtml(absoluteUrl(origin, event.posterImage))}" alt="${escapeHtml(`${event.name} — афиша концерта`)}">`
    : '';

  return [
    '<main class="seo-prerender">',
    `<h1>${escapeHtml(event.name)}</h1>`,
    `<p>${escapeHtml(facts.join(' · '))} · <a href="${escapeHtml(PERFORMER.url)}">${escapeHtml(PERFORMER.name)}</a></p>`,
    poster,
    '<h2>Билеты</h2>',
    renderPriceList(event),
    '<p>Билеты продаются онлайн на этой странице: выберите места на схеме зала, укажите контакты и оформите заказ.</p>',
    ...(paragraphs.length > 0
      ? ['<h2>О концерте</h2>', ...paragraphs.map(p => `<p>${escapeHtml(p)}</p>`)]
      : []),
    `<p><a href="/">Все концерты ${escapeHtml(PERFORMER.name)}</a></p>`,
    '</main>',
  ].join('\n');
}

function renderHomeBody(events: SeoEvent[]): string {
  const list =
    events.length === 0
      ? '<p>Пока нет предстоящих концертов — следите за анонсами.</p>'
      : `<ul>${events
          .map(event => {
            const price = minPriceLabel(event);
            const details = [formatEventDateRu(event.date), price].filter(Boolean).join(', ');
            return `<li><a href="/e/${encodeURIComponent(event.slug)}">${escapeHtml(event.name)}</a> — ${escapeHtml(details)}</li>`;
          })
          .join('')}</ul>`;

  return [
    '<main class="seo-prerender">',
    `<h1>${escapeHtml(HOME_HEADING)}</h1>`,
    `<p>${escapeHtml(HOME_INTRO)}</p>`,
    '<h2>Ближайшие концерты</h2>',
    list,
    `<p>О группе, репертуаре и заказе выступлений — на сайте <a href="${escapeHtml(PERFORMER.url)}">${escapeHtml(PERFORMER.name)}</a>.</p>`,
    '</main>',
  ].join('\n');
}

/**
 * Readable page content placed inside #root. React replaces it on mount, so it only
 * has to be correct and indexable, not interactive.
 */
export function renderSeoBody(page: SeoPage, origin: string): string {
  switch (page.kind) {
    case 'home':
      return renderHomeBody(page.events);
    case 'event':
      return renderEventBody(page.event, origin);
    case 'static':
    case 'not-found':
      return '';
  }
}
