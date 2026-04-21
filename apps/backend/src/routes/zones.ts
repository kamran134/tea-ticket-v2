import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';

const prisma = new PrismaClient();
export const zonesRouter = Router();

zonesRouter.get('/', async (req, res) => {
  const { venueId } = req.query;
  if (!venueId || typeof venueId !== 'string') {
    return res.status(400).json({ success: false, error: 'venueId is required' });
  }

  try {
    const zones = await prisma.zone.findMany({
      where: { venueId },
      orderBy: { sortOrder: 'asc' },
    });

    const counts = await prisma.ticket.groupBy({
      by: ['zoneId'],
      where: {
        venueId,
        status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] },
      },
      _count: { id: true },
    });

    const countMap = Object.fromEntries(counts.map(c => [c.zoneId, c._count.id]));
    const zonesWithAvailability = zones.map(z => ({
      ...z,
      available: z.capacity - (countMap[z.id] ?? 0),
    }));

    return res.json({ success: true, data: zonesWithAvailability });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch zones' });
  }
});

const createZoneSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().min(1).max(200),
  price: z.number().positive(),
  cardNumber: z.string().min(1),
  capacity: z.number().int().positive(),
  sortOrder: z.number().int().default(0),
});

zonesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  try {
    const zone = await prisma.zone.create({ data: parsed.data });
    return res.status(201).json({ success: true, data: zone });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to create zone' });
  }
});

const updateZoneSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  price: z.number().positive().optional(),
  cardNumber: z.string().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
});

zonesRouter.put('/:id', requireAuth, async (req, res) => {
  const parsed = updateZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  try {
    const zone = await prisma.zone.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    return res.json({ success: true, data: zone });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to update zone' });
  }
});

zonesRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.zone.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: { deleted: true } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to delete zone' });
  }
});
