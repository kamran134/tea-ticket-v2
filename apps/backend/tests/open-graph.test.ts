import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock('../src/db', () => ({
  prisma: {
    venue: {
      findUnique,
    },
  },
}));

import { createApp } from '../src/app';
import {
  buildEventOpenGraphMeta,
  escapeHtml,
  renderOpenGraphHtml,
  stripHtmlToPlainText,
  truncateForOg,
} from '../src/services/open-graph';

describe('open-graph helpers', () => {
  it('escapes HTML in meta fields', () => {
    expect(escapeHtml(`a & b <script>"'`)).toBe('a &amp; b &lt;script&gt;&quot;&#39;');
  });

  it('strips description HTML and truncates for og:description', () => {
    const plain = stripHtmlToPlainText('<p>Hello <b>world</b><br/>again</p>');
    expect(plain).toBe('Hello world again');
    expect(truncateForOg('x'.repeat(250)).length).toBeLessThanOrEqual(200);
  });

  it('builds absolute poster and fallback image URLs', () => {
    const meta = buildEventOpenGraphMeta(
      {
        name: 'Tea night',
        slug: 'tea-night',
        date: new Date('2026-10-12T15:00:00.000Z'),
        description: 'Warm evening',
        posterImage: '/uploads/posters/x/poster.jpg',
      },
      'https://stolits.art',
    );
    expect(meta.pageUrl).toBe('https://stolits.art/e/tea-night');
    expect(meta.imageUrl).toBe('https://stolits.art/uploads/posters/x/poster.jpg');
    expect(meta.title).toContain('Tea night');
  });

  it('renders og tags without raw user HTML', () => {
    const html = renderOpenGraphHtml({
      title: '<Evil>',
      description: 'a & b',
      imageUrl: 'https://stolits.art/og-image.jpg',
      pageUrl: 'https://stolits.art/e/x',
      imageAlt: '<Evil>',
    });
    expect(html).toContain('content="&lt;Evil&gt;"');
    expect(html).toContain('content="a &amp; b"');
    expect(html).not.toContain('<Evil>');
  });
});

describe('GET /e/:slug preview HTML', () => {
  const app = createApp().app;

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('returns 404 for missing or inactive venue', async () => {
    findUnique.mockResolvedValue(null);
    await request(app).get('/e/missing-slug').expect(404);

    findUnique.mockResolvedValue({
      name: 'Hidden',
      slug: 'hidden',
      active: false,
      date: new Date(),
      description: null,
      posterImage: null,
    });
    await request(app).get('/e/hidden').expect(404);
  });

  it('returns Open Graph HTML for active venue', async () => {
    findUnique.mockResolvedValue({
      name: 'Preview Event',
      slug: 'preview-event',
      date: new Date('2026-11-20T18:00:00.000Z'),
      active: true,
      description: '<p>Описание <strong>события</strong></p>',
      posterImage: '/uploads/posters/test/poster.jpg',
    });

    const res = await request(app)
      .get('/e/preview-event')
      .set('Host', 'stolits.art')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('property="og:title" content="Preview Event');
    expect(res.text).toContain('property="og:image" content="https://stolits.art/uploads/posters/test/poster.jpg"');
    expect(res.text).toContain('property="og:url" content="https://stolits.art/e/preview-event"');
    expect(res.text).toContain('Описание события');
    expect(res.text).not.toContain('<strong>');
  });
});
