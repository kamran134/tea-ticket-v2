import type { PrismaClient, Venue } from '@prisma/client';
import { loadZonesWithAvailability } from '../zone-availability';
import { STATIC_PAGES, type StaticPageCopy } from './site';

export interface EventPrice {
  zoneName: string;
  price: number;
  /** null when availability was not loaded (list pages). */
  soldOut: boolean | null;
}

export type SeoEvent = Pick<
  Venue,
  'name' | 'slug' | 'date' | 'description' | 'posterImage' | 'ageRating' | 'currency'
> & {
  prices: EventPrice[];
};

export type SeoPage =
  | { kind: 'home'; path: '/'; events: SeoEvent[] }
  | { kind: 'event'; path: string; event: SeoEvent }
  | { kind: 'static'; path: string; copy: StaticPageCopy }
  | { kind: 'not-found'; path: string };

const EVENT_PATH = /^\/e\/([^/]+)$/;

/**
 * Normalises the URI nginx passes for the page being served: drops the query string,
 * `/index.html` and trailing slashes, so `/e/x/?utm=1` and `/e/x` share one page.
 */
export function normalizePagePath(rawUri: string): string {
  let path = rawUri.split(/[?#]/, 1)[0] || '/';
  try {
    path = decodeURI(path);
  } catch {
    // keep the raw path; it simply will not match any page
  }
  if (path === '/index.html') return '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

const VENUE_SELECT = {
  id: true,
  name: true,
  slug: true,
  date: true,
  description: true,
  posterImage: true,
  ageRating: true,
  currency: true,
} as const;

async function loadEventPage(prisma: PrismaClient, path: string, slug: string): Promise<SeoPage> {
  const venue = await prisma.venue.findFirst({ where: { slug, active: true }, select: VENUE_SELECT });
  if (!venue) return { kind: 'not-found', path };

  const zones = await loadZonesWithAvailability(prisma, venue.id);
  const { id: _id, ...fields } = venue;
  return {
    kind: 'event',
    path,
    event: {
      ...fields,
      prices: zones.map(z => ({ zoneName: z.name, price: z.price, soldOut: z.available <= 0 })),
    },
  };
}

async function loadHomePage(prisma: PrismaClient, now: Date): Promise<SeoPage> {
  const venues = await prisma.venue.findMany({
    where: { active: true, date: { gte: now } },
    orderBy: { date: 'asc' },
    select: { ...VENUE_SELECT, zones: { select: { name: true, price: true }, orderBy: { sortOrder: 'asc' } } },
  });
  return {
    kind: 'home',
    path: '/',
    events: venues.map(({ id: _id, zones, ...fields }) => ({
      ...fields,
      prices: zones.map(z => ({ zoneName: z.name, price: z.price, soldOut: null })),
    })),
  };
}

export async function loadSeoPage(prisma: PrismaClient, path: string, now = new Date()): Promise<SeoPage> {
  if (path === '/') return loadHomePage(prisma, now);

  const eventMatch = path.match(EVENT_PATH);
  if (eventMatch) return loadEventPage(prisma, path, eventMatch[1]);

  const copy = STATIC_PAGES[path];
  return copy ? { kind: 'static', path, copy } : { kind: 'not-found', path };
}

/**
 * Every page view asks for two fragments (head + body) of the same page, and crawlers
 * come in bursts. A short-lived cache of in-flight/settled loads answers both from one
 * set of queries; edits in the admin show up within the TTL.
 */
export class SeoPageCache {
  private readonly entries = new Map<string, { expiresAt: number; page: Promise<SeoPage> }>();

  constructor(
    private readonly load: (path: string) => Promise<SeoPage>,
    private readonly ttlMs = 30_000,
    private readonly maxEntries = 500,
    private readonly clock: () => number = Date.now,
  ) {}

  get(path: string): Promise<SeoPage> {
    const now = this.clock();
    const cached = this.entries.get(path);
    if (cached && cached.expiresAt > now) return cached.page;

    const page = this.load(path);
    this.entries.delete(path);
    this.entries.set(path, { expiresAt: now + this.ttlMs, page });
    // A failed load must not be served from cache for the whole TTL.
    page.catch(() => {
      if (this.entries.get(path)?.page === page) this.entries.delete(path);
    });
    this.evictOverflow();
    return page;
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}
