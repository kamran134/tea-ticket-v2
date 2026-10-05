import { Router } from 'express';
import { prisma } from '../db';
import {
  buildEventOpenGraphMeta,
  renderOpenGraphHtml,
  resolvePublicOrigin,
} from '../services/open-graph';

export const eventPreviewRouter = Router();

eventPreviewRouter.get('/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const venue = await prisma.venue.findUnique({ where: { slug } });
    if (!venue || !venue.active) {
      return res.status(404).send('Not found');
    }

    const origin = resolvePublicOrigin(req.get('x-forwarded-proto'), req.get('host'));
    const meta = buildEventOpenGraphMeta(venue, origin);
    const html = renderOpenGraphHtml(meta);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(html);
  } catch {
    return res.status(500).send('Internal server error');
  }
});
