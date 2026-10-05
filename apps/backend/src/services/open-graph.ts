import type { Venue } from '@prisma/client';

export const DEFAULT_PUBLIC_ORIGIN = 'https://stolits.art';
export const SITE_NAME = 'StolitsArt Ticket';
export const DEFAULT_OG_IMAGE_PATH = '/og-image.jpg';

const OG_DESCRIPTION_MAX = 200;

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => HTML_ESCAPE[ch] ?? ch);
}

export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateForOg(text: string, max = OG_DESCRIPTION_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).trimEnd();
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base}…`;
}

/** Russian date/time for link previews (matches public RU copy). */
export function formatEventDateRu(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('ru-RU', {
    timeZone: 'Asia/Baku',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function resolvePublicOrigin(forwardedProto: string | undefined, host: string | undefined): string {
  const fallback =
    process.env.PUBLIC_FRONTEND_URL ?? process.env.PUBLIC_APP_URL ?? DEFAULT_PUBLIC_ORIGIN;
  if (!host) return fallback.replace(/\/$/, '');
  const proto = forwardedProto?.split(',')[0]?.trim() || 'https';
  return `${proto}://${host}`.replace(/\/$/, '');
}

export function absoluteUrl(origin: string, pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return `${origin}${DEFAULT_OG_IMAGE_PATH}`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin}${path}`;
}

export function buildEventOgDescription(venue: Pick<Venue, 'name' | 'date' | 'description'>): string {
  const plain = venue.description ? stripHtmlToPlainText(venue.description) : '';
  if (plain) return truncateForOg(plain);
  const dateLabel = formatEventDateRu(venue.date);
  return truncateForOg(`${venue.name}. ${dateLabel}. Билеты на StolitsArt Ticket.`);
}

export function buildEventOgTitle(venue: Pick<Venue, 'name' | 'date'>): string {
  return `${venue.name} — ${formatEventDateRu(venue.date)} — ${SITE_NAME}`;
}

export interface EventOpenGraphMeta {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
  imageAlt: string;
}

export function buildEventOpenGraphMeta(
  venue: Pick<Venue, 'name' | 'date' | 'description' | 'posterImage' | 'slug'>,
  origin: string,
): EventOpenGraphMeta {
  const title = buildEventOgTitle(venue);
  const description = buildEventOgDescription(venue);
  const pageUrl = `${origin}/e/${venue.slug}`;
  const imageUrl = absoluteUrl(origin, venue.posterImage);
  return {
    title,
    description,
    imageUrl,
    pageUrl,
    imageAlt: title,
  };
}

export function renderOpenGraphHtml(meta: {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
  imageAlt: string;
  siteName?: string;
}): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const imageUrl = escapeHtml(meta.imageUrl);
  const pageUrl = escapeHtml(meta.pageUrl);
  const imageAlt = escapeHtml(meta.imageAlt);
  const siteName = escapeHtml(meta.siteName ?? SITE_NAME);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:alt" content="${imageAlt}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${siteName}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${imageUrl}">
</head>
<body></body>
</html>`;
}
