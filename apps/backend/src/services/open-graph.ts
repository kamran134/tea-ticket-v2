// Text and URL helpers shared by the server-rendered SEO fragments (services/seo).

export const DEFAULT_PUBLIC_ORIGIN = 'https://tickets.birmanat.band';
export const DEFAULT_OG_IMAGE_PATH = '/og-image.jpg';

const OG_DESCRIPTION_MAX = 200;
const EVENT_TIME_ZONE = 'Asia/Baku';

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => HTML_ESCAPE[ch] ?? ch);
}

function decodeBasicEntities(value: string): string {
  return value.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, entity => HTML_ENTITIES[entity] ?? entity);
}

/** Elements whose text is never page content. */
function dropNonContentElements(html: string): string {
  return html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
}

export function stripHtmlToPlainText(html: string): string {
  return decodeBasicEntities(
    dropNonContentElements(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits admin rich-text (or plain text with blank lines) into plain-text paragraphs,
 * so it can be re-rendered escaped instead of trusting the stored markup.
 */
export function htmlToParagraphs(html: string): string[] {
  return dropNonContentElements(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .split(/\n\s*\n/)
    .map(block => stripHtmlToPlainText(block))
    .filter(Boolean);
}

export function truncateForOg(text: string, max = OG_DESCRIPTION_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).trimEnd();
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base}…`;
}

function toDate(iso: string | Date): Date {
  return typeof iso === 'string' ? new Date(iso) : iso;
}

/** "8 декабря 2026 г., 20:00" in Baku time, in the given Intl locale. */
export function formatEventDate(iso: string | Date, locale: string): string {
  const d = toDate(iso);
  const day = d.toLocaleDateString(locale, { timeZone: EVENT_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString(locale, { timeZone: EVENT_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${time}`;
}

/** "8 декабря" in Baku time — short form for titles. */
export function formatEventDay(iso: string | Date, locale: string): string {
  return toDate(iso).toLocaleDateString(locale, { timeZone: EVENT_TIME_ZONE, day: 'numeric', month: 'long' });
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
