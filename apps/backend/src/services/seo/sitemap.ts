import type { PrismaClient } from '@prisma/client';
import { escapeHtml } from '../open-graph';
import { STATIC_PAGES } from './site';

export interface SitemapEntry {
  path: string;
  priority: number;
}

export async function loadSitemapEntries(prisma: PrismaClient, now = new Date()): Promise<SitemapEntry[]> {
  const venues = await prisma.venue.findMany({
    where: { active: true },
    select: { slug: true, date: true },
    orderBy: { date: 'desc' },
  });

  return [
    { path: '/', priority: 1 },
    ...venues.map(v => ({
      path: `/e/${encodeURIComponent(v.slug)}`,
      // Past concerts keep their URL (links from social posts) but rank below upcoming ones.
      priority: v.date >= now ? 0.9 : 0.3,
    })),
    ...Object.keys(STATIC_PAGES).map(path => ({ path, priority: 0.2 })),
  ];
}

export function renderSitemapXml(entries: SitemapEntry[], origin: string): string {
  const urls = entries.map(
    e => `  <url><loc>${escapeHtml(`${origin}${e.path}`)}</loc><priority>${e.priority.toFixed(1)}</priority></url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
