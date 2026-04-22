import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';

const prisma = new PrismaClient();
export const venuesRouter = Router();

venuesRouter.get('/', async (req, res) => {
  const all = req.query.all === 'true';
  try {
    const venues = await prisma.venue.findMany({
      where: all ? undefined : { active: true },
      orderBy: { date: 'desc' },
    });
    return res.json({ success: true, data: venues });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch venues' });
  }
});

const ALLOWED_CURRENCIES = ['₸', '₼', '$', '₽'] as const;

const createVenueSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().datetime(),
  currency: z.enum(ALLOWED_CURRENCIES).default('₼'),
});

venuesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createVenueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  try {
    const venue = await prisma.venue.create({
      data: {
        name: parsed.data.name,
        date: new Date(parsed.data.date),
        currency: parsed.data.currency,
      },
    });
    return res.status(201).json({ success: true, data: venue });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to create venue' });
  }
});

const patchVenueSchema = z.object({
  active: z.boolean().optional(),
  currency: z.enum(ALLOWED_CURRENCIES).optional(),
}).refine(d => d.active !== undefined || d.currency !== undefined, {
  message: 'Provide active or currency',
});

venuesRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = patchVenueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  try {
    const venue = await prisma.venue.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    return res.json({ success: true, data: venue });
  } catch {
    return res.status(404).json({ success: false, error: 'Venue not found' });
  }
});
