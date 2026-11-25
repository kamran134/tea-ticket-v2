import { Router, type Request } from 'express';
import { prisma } from '../db';
import { resolvePublicOrigin } from '../services/open-graph';
import { loadSeoPage, normalizePagePath, SeoPageCache, type SeoPage } from '../services/seo/pages';
import { DEFAULT_SEO_LANG, isSeoLang } from '../services/seo/locale';
import { renderSeoBody, renderSeoHead } from '../services/seo/render';
import { loadSitemapEntries, renderSitemapXml } from '../services/seo/sitemap';

// Fragments for nginx SSI: the frontend's index.html includes
//   /api/seo/head<page uri>  inside <head>
//   /api/seo/body<page uri>  inside #root
// so every client — browser, search engine or AI crawler — gets the same real HTML.

const pageCache = new SeoPageCache(path => loadSeoPage(prisma, path));

function originOf(req: Request): string {
  return resolvePublicOrigin(req.get('x-forwarded-proto'), req.get('host'));
}

export const seoRouter = Router();

seoRouter.get('/sitemap.xml', async (req, res) => {
  try {
    const entries = await loadSitemapEntries(prisma);
    res.type('application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(renderSitemapXml(entries, originOf(req)));
  } catch (err) {
    console.error('[seo] sitemap failed', err);
    res.status(500).type('text/plain').send('Sitemap unavailable');
  }
});

seoRouter.get(/^\/(head|body)(\/.*)?$/, async (req, res) => {
  const fragment = req.params[0] as 'head' | 'body';
  // nginx passes the page's own $request_uri, so its query (and `lang`) is ours too.
  const path = normalizePagePath(req.params[1] ?? '/');
  const lang = isSeoLang(req.query.lang) ? req.query.lang : DEFAULT_SEO_LANG;
  const origin = originOf(req);

  res.type('text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  let page: SeoPage;
  try {
    page = await pageCache.get(path);
  } catch (err) {
    // The page itself still works without the fragment; only log and degrade.
    console.error(`[seo] ${fragment} fragment failed for ${path}`, err);
    // Site-level copy only: an empty event list would wrongly tell crawlers there are no concerts.
    page = { kind: 'unavailable', path };
  }

  res.send(fragment === 'head' ? renderSeoHead(page, origin, lang) : renderSeoBody(page, origin, lang));
});

