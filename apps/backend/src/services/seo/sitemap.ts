import type { PrismaClient } from '@prisma/client';
import { escapeHtml } from '../open-graph';
import { DEFAULT_SEO_LANG, localizedUrl, SEO_LANGS } from './locale';
import { STATIC_PAGE_PATHS } from './site';

export interface SitemapEntry {
  path: string;
  priority: number;
}

export async function loadSitemapEntries(prisma: PrismaClient, now = new Date()): Promise<SitemapEntry[]> {
  // Past concerts keep their URL for old links but are noindex, so they are not listed.
  const venues = await prisma.venue.findMany({
    where: { active: true, date: { gte: now } },
    select: { slug: true },
    orderBy: { date: 'asc' },
  });

  return [
    { path: '/', priority: 1 },
    ...venues.map(v => ({ path: `/e/${encodeURIComponent(v.slug)}`, priority: 0.9 })),
    ...STATIC_PAGE_PATHS.map(path => ({ path, priority: 0.2 })),
  ];
}

/** Every language version is its own <url>, each listing all alternates (incl. x-default). */
export function renderSitemapXml(entries: SitemapEntry[], origin: string): string {
  const urls = entries.flatMap(entry => {
    const alternates = [
      ...SEO_LANGS.map(lang => ({ hreflang: lang, href: localizedUrl(origin, entry.path, lang) })),
      { hreflang: 'x-default', href: localizedUrl(origin, entry.path, DEFAULT_SEO_LANG) },
    ]
      .map(a => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeHtml(a.href)}"/>`)
      .join('');
    return SEO_LANGS.map(
      lang =>
        `  <url><loc>${escapeHtml(localizedUrl(origin, entry.path, lang))}</loc>${alternates}` +
        `<priority>${entry.priority.toFixed(1)}</priority></url>`,
    );
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
