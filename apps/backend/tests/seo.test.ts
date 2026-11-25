import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const db = vi.hoisted(() => ({
  venue: { findFirst: vi.fn(), findMany: vi.fn() },
  zone: { findMany: vi.fn() },
  ticket: { groupBy: vi.fn() },
  zoneTable: { groupBy: vi.fn() },
  seat: { groupBy: vi.fn() },
}));

vi.mock('../src/db', () => ({ prisma: db }));

import { createApp } from '../src/app';
import { escapeHtml, htmlToParagraphs, stripHtmlToPlainText, truncateForOg } from '../src/services/open-graph';
import { normalizePagePath, SeoPageCache, type SeoEvent, type SeoPage } from '../src/services/seo/pages';
import { renderSeoBody, renderSeoHead } from '../src/services/seo/render';
import { renderSitemapXml } from '../src/services/seo/sitemap';
import {
  buildMusicEventJsonLd,
  serializeJsonLd,
  toIsoCurrency,
  toTypicalAgeRange,
} from '../src/services/seo/structured-data';

const ORIGIN = 'https://tickets.birmanat.band';

function makeEvent(overrides: Partial<SeoEvent> = {}): SeoEvent {
  return {
    name: 'Легенды русского рока',
    slug: 'legendy',
    date: new Date('2027-01-08T16:00:00.000Z'),
    description: '<p><strong>Хиты</strong> KINO &amp; DDT</p><p>Ждём всех!</p>',
    descriptionAz: null,
    descriptionEn: '<p>Rock hits</p>',
    posterImage: '/uploads/posters/x/poster.jpg',
    ageRating: '16+',
    currency: '₼',
    venueName: null,
    venueAddress: null,
    prices: [
      { zoneName: 'Танцпол', price: 20, soldOut: false },
      { zoneName: 'VIP', price: 50, soldOut: true },
    ],
    ...overrides,
  };
}

describe('text helpers', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`a & b <script>"'`)).toBe('a &amp; b &lt;script&gt;&quot;&#39;');
  });

  it('strips markup, decodes basic entities and truncates', () => {
    expect(stripHtmlToPlainText('<p>Hello&nbsp;<b>world</b> &amp; co<br/>again</p>')).toBe(
      'Hello world & co again',
    );
    expect(truncateForOg('x'.repeat(250)).length).toBeLessThanOrEqual(200);
  });

  it('splits rich text into plain paragraphs', () => {
    expect(htmlToParagraphs('<p>One <b>two</b></p><p>Three</p>')).toEqual(['One two', 'Three']);
    expect(htmlToParagraphs('plain\n\nsecond')).toEqual(['plain', 'second']);
  });
});

describe('normalizePagePath', () => {
  it.each([
    ['/', '/'],
    ['/index.html', '/'],
    ['/e/slug/?utm_source=ig', '/e/slug'],
    ['/about/', '/about'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePagePath(raw)).toBe(expected);
  });
});

describe('structured data', () => {
  it('builds a MusicEvent with an aggregate offer and the band as performer', () => {
    const ld = buildMusicEventJsonLd(makeEvent(), ORIGIN, 'ru');
    expect(ld).toMatchObject({
      '@type': 'MusicEvent',
      name: 'Легенды русского рока',
      url: `${ORIGIN}/e/legendy`,
      startDate: '2027-01-08T16:00:00.000Z',
      image: [`${ORIGIN}/uploads/posters/x/poster.jpg`],
      performer: { '@type': 'MusicGroup', name: 'BIR MANAT BAND' },
      typicalAgeRange: '16-',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'AZN',
        lowPrice: 20,
        highPrice: 50,
        availability: 'https://schema.org/InStock',
      },
    });
  });

  it('marks the event sold out only when every zone is', () => {
    const event = makeEvent({ prices: [{ zoneName: 'A', price: 10, soldOut: true }] });
    expect(buildMusicEventJsonLd(event, ORIGIN, 'ru').offers).toMatchObject({
      availability: 'https://schema.org/SoldOut',
    });
  });

  it('omits availability when it is unknown and offers when there are no zones', () => {
    const unknown = makeEvent({ prices: [{ zoneName: 'A', price: 10, soldOut: null }] });
    expect(buildMusicEventJsonLd(unknown, ORIGIN, 'ru').offers).not.toHaveProperty('availability');
    expect(buildMusicEventJsonLd(makeEvent({ prices: [] }), ORIGIN, 'ru')).not.toHaveProperty('offers');
  });

  it('maps currency symbols and age ratings', () => {
    expect(toIsoCurrency('₼')).toBe('AZN');
    expect(toIsoCurrency('USD')).toBe('USD');
    expect(toTypicalAgeRange('18+')).toBe('18-');
    expect(toTypicalAgeRange('для всех')).toBeUndefined();
  });

  it('cannot break out of the script element', () => {
    expect(serializeJsonLd({ name: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});

describe('rendered fragments', () => {
  const eventPage: SeoPage = { kind: 'event', path: '/e/legendy', event: makeEvent() };

  it('renders an indexable event head with canonical, OG and JSON-LD', () => {
    const head = renderSeoHead(eventPage, ORIGIN, 'ru');
    expect(head).toContain('<title>Легенды русского рока, 8 января — билеты | BIR MANAT BAND</title>');
    expect(head).toContain(`<link rel="canonical" href="${ORIGIN}/e/legendy">`);
    expect(head).toContain(`<meta property="og:image" content="${ORIGIN}/uploads/posters/x/poster.jpg">`);
    expect(head).toContain('content="index, follow, max-image-preview:large"');
    expect(head).toContain('"@type":"MusicEvent"');
    expect(head).toContain('Билеты на BIR MANAT BAND от 20 ₼ онлайн.');
  });

  it('renders event content as escaped text, never the stored markup', () => {
    const body = renderSeoBody(
      {
        kind: 'event',
        path: '/e/x',
        event: makeEvent({ name: '<img onerror=1>', description: '<script>bad()</script><p>ok</p>' }),
      },
      ORIGIN,
    );
    expect(body).toContain('<h1>&lt;img onerror=1&gt;</h1>');
    expect(body).not.toContain('<script>');
    expect(body).toContain('<p>ok</p>');
  });

  it('lists prices with sold-out zones', () => {
    const body = renderSeoBody(eventPage, ORIGIN, 'ru');
    expect(body).toContain('<li>Танцпол — 20 ₼</li>');
    expect(body).toContain('<li>VIP — 50 ₼ — мест нет</li>');
  });

  it('links every upcoming event from the home page', () => {
    const body = renderSeoBody({ kind: 'home', path: '/', events: [makeEvent()] }, ORIGIN, 'ru');
    expect(body).toContain('<a href="/e/legendy">Легенды русского рока</a>');
    expect(body).toContain('от 20 ₼');
    expect(body).toContain('<h1>Билеты на концерты BIR MANAT BAND в Баку</h1>');
  });

  it('marks unknown pages noindex without a canonical', () => {
    const head = renderSeoHead({ kind: 'not-found', path: '/e/missing' }, ORIGIN, 'ru');
    expect(head).toContain('content="noindex, follow"');
    expect(head).not.toContain('rel="canonical"');
    expect(renderSeoBody({ kind: 'not-found', path: '/e/missing' }, ORIGIN, 'ru')).toContain(
      '<a href="/">Все концерты BIR MANAT BAND</a>',
    );
  });

  it('renders a past concert as a noindex "has passed" page without offers', () => {
    const page: SeoPage = { kind: 'past-event', path: '/e/legendy', event: makeEvent({ prices: [] }) };
    const head = renderSeoHead(page, ORIGIN, 'ru');
    expect(head).toContain('<title>Легенды русского рока, 8 января — концерт прошёл | BIR MANAT BAND</title>');
    expect(head).toContain('content="noindex, follow"');
    expect(head).not.toContain('application/ld+json');
    expect(renderSeoBody(page, ORIGIN, 'ru')).toContain('Этот концерт прошёл 8 января 2027 г., 20:00.');
  });

  it('uses the hall and street address when they are known', () => {
    const event = makeEvent({ venueName: 'Jazz Center', venueAddress: 'ул. Рашида Бейбутова, 19' });
    expect(buildMusicEventJsonLd(event, ORIGIN, 'ru').location).toEqual({
      '@type': 'Place',
      name: 'Jazz Center',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'ул. Рашида Бейбутова, 19',
        addressLocality: 'Баку',
        addressCountry: 'AZ',
      },
    });
    expect(renderSeoBody({ kind: 'event', path: '/e/legendy', event }, ORIGIN, 'ru')).toContain(
      'Jazz Center, ул. Рашида Бейбутова, 19, Баку',
    );
  });

  it('renders language versions with hreflang alternates and localized copy', () => {
    const head = renderSeoHead(eventPage, ORIGIN, 'en');
    expect(head).toContain('<title>Легенды русского рока, 8 January — tickets | BIR MANAT BAND</title>');
    expect(head).toContain(`<link rel="canonical" href="${ORIGIN}/e/legendy?lang=en">`);
    expect(head).toContain(`<link rel="alternate" hreflang="az" href="${ORIGIN}/e/legendy?lang=az">`);
    expect(head).toContain(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/e/legendy">`);
    expect(head).toContain('<meta property="og:locale" content="en_GB">');
    expect(head).toContain('"inLanguage":"en"');
    const body = renderSeoBody(eventPage, ORIGIN, 'en');
    expect(body).toContain('<p>Rock hits</p>');
    expect(body).toContain('<a href="/?lang=en">');
    // No Azerbaijani translation: the Russian description is the fallback.
    expect(renderSeoBody(eventPage, ORIGIN, 'az')).toContain('Ждём всех!');
  });

  it('renders a sitemap with absolute URLs', () => {
    const xml = renderSitemapXml(
      [
        { path: '/', priority: 1 },
        { path: '/e/a&b', priority: 0.9 },
      ],
      ORIGIN,
    );
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/e/a&amp;b?lang=az</loc>`);
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/e/a&amp;b"/>`);
  });
});

describe('SeoPageCache', () => {
  it('shares one load between head and body, and expires after the TTL', async () => {
    let now = 0;
    const load = vi.fn(async (path: string): Promise<SeoPage> => ({ kind: 'not-found', path }));
    const cache = new SeoPageCache(load, 1000, 10, () => now);

    await Promise.all([cache.get('/a'), cache.get('/a')]);
    expect(load).toHaveBeenCalledTimes(1);

    now = 1500;
    await cache.get('/a');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not keep failed loads', async () => {
    const load = vi
      .fn<(path: string) => Promise<SeoPage>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({ kind: 'not-found', path: '/b' });
    const cache = new SeoPageCache(load);

    await expect(cache.get('/b')).rejects.toThrow('db down');
    await expect(cache.get('/b')).resolves.toMatchObject({ kind: 'not-found' });
  });
});

describe('GET /api/seo', () => {
  const app = createApp().app;

  beforeEach(() => {
    vi.clearAllMocks();
    db.ticket.groupBy.mockResolvedValue([]);
    db.zoneTable.groupBy.mockResolvedValue([]);
    db.seat.groupBy.mockResolvedValue([]);
  });

  it('renders head and body fragments for an active event', async () => {
    db.venue.findFirst.mockResolvedValue({
      id: 'v1',
      name: 'Route Event',
      slug: 'route-event',
      date: new Date('2027-02-01T16:00:00.000Z'),
      description: null,
      posterImage: null,
      ageRating: null,
      currency: '₼',
      venueName: null,
      venueAddress: null,
    });
    db.zone.findMany.mockResolvedValue([
      { id: 'z1', name: 'Зал', price: 30, capacity: 100, type: 'GENERAL', sortOrder: 0 },
    ]);

    const head = await request(app)
      .get('/api/seo/head/e/route-event?utm=1')
      .set('Host', 'tickets.birmanat.band')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);
    expect(head.text).toContain(
      '<link rel="canonical" href="https://tickets.birmanat.band/e/route-event">',
    );
    expect(head.text).toContain('"availability":"https://schema.org/InStock"');

    const body = await request(app).get('/api/seo/body/e/route-event').expect(200);
    expect(body.text).toContain('<h1>Route Event</h1>');
    // head and body of one page view share a single load
    expect(db.venue.findFirst).toHaveBeenCalledTimes(1);
  });

  it('renders the language from the page query', async () => {
    db.venue.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/seo/head/?lang=az&utm=1').set('Host', 'tickets.birmanat.band').expect(200);
    expect(res.text).toContain('<title>Bakıda BIR MANAT BAND konsertlərinə biletlər | Tickets Bir Manat</title>');
    expect(res.text).toContain('href="https://tickets.birmanat.band/?lang=az"');
  });

  it('serves a past concert as a "has passed" page', async () => {
    db.venue.findFirst.mockResolvedValue({ ...makeEvent({ slug: 'old', date: new Date('2020-01-01') }), id: 'v0' });
    const res = await request(app).get('/api/seo/body/e/old').expect(200);
    expect(res.text).toContain('Этот концерт прошёл');
    expect(db.zone.findMany).not.toHaveBeenCalled();
  });

  it('serves a noindex head for an unknown event', async () => {
    db.venue.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/seo/head/e/nope').expect(200);
    expect(res.text).toContain('noindex');
  });

  it('serves the home page from upcoming events', async () => {
    db.venue.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/seo/body/').expect(200);
    expect(res.text).toContain('Пока нет предстоящих концертов');
  });

  it('falls back to site copy when the database fails', async () => {
    db.venue.findFirst.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/api/seo/head/e/broken').expect(200);
    expect(res.text).toContain(
      '<title>Билеты на концерты BIR MANAT BAND в Баку | Tickets Bir Manat</title>',
    );
  });

  it('serves the sitemap', async () => {
    db.venue.findMany.mockResolvedValue([{ slug: 'soon' }]);
    const res = await request(app)
      .get('/api/seo/sitemap.xml')
      .set('Host', 'tickets.birmanat.band')
      .expect(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).toContain('<loc>https://tickets.birmanat.band/e/soon</loc>');
    expect(db.venue.findMany.mock.calls[0][0].where).toMatchObject({ active: true, date: { gte: expect.any(Date) } });
    expect(res.text).toContain('/refund-policy');
  });
});
