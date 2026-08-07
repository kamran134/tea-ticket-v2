import { Router } from 'express';
import { Prisma, TicketStatus } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { expireStaleBookings } from '../services/booking-expiry';
import { prisma } from '../db';
import { z } from 'zod';

export const zonesRouter = Router();

// GET /api/zones?venueId=xxx
zonesRouter.get('/', async (req, res) => {
  const { venueId } = req.query;
  if (!venueId || typeof venueId !== 'string') {
    return res.status(400).json({ success: false, error: 'venueId is required' });
  }

  try {
    await expireStaleBookings(prisma);

    const zones = await prisma.zone.findMany({
      where: { venueId },
      orderBy: { sortOrder: 'asc' },
    });

    const activeStatuses: TicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];
    const activeWhere = { venueId, status: { in: activeStatuses } };

    const ticketCounts = await prisma.ticket.groupBy({
      by: ['zoneId'],
      where: activeWhere,
      _count: { _all: true },
    });
    const ticketCountMap = Object.fromEntries(ticketCounts.map(c => [c.zoneId, c._count._all]));

    const tableSums = await prisma.zoneTable.groupBy({
      by: ['zoneId'],
      where: { zoneId: { in: zones.map(z => z.id) } },
      _sum: { chairCount: true },
      _count: { id: true },
    });
    const tableCapMap = Object.fromEntries(tableSums.map(t => [t.zoneId, t._sum.chairCount ?? 0]));

    const seatCounts = await prisma.seat.groupBy({
      by: ['zoneId'],
      where: { zoneId: { in: zones.map(z => z.id) } },
      _count: { id: true },
    });
    const seatTotalMap = Object.fromEntries(seatCounts.map(s => [s.zoneId, s._count.id]));

    const zonesWithAvailability = zones.map(z => {
      let available: number;
      let totalCapacity: number;
      if (z.type === 'SEATED') {
        const occupied = ticketCountMap[z.id] ?? 0;
        totalCapacity = seatTotalMap[z.id] ?? 0;
        available = totalCapacity - occupied;
      } else if (z.type === 'TABLE') {
        const occupied = ticketCountMap[z.id] ?? 0;
        totalCapacity = tableCapMap[z.id] ?? 0;
        available = totalCapacity - occupied;
      } else {
        totalCapacity = z.capacity;
        available = z.capacity - (ticketCountMap[z.id] ?? 0);
      }
      return { ...z, available, totalCapacity };
    });

    return res.json({ success: true, data: zonesWithAvailability });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch zones' });
  }
});
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const createZoneSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().min(1).max(200),
  price: z.number().positive(),
  capacity: z.number().int().positive(),
  sortOrder: z.number().int().default(0),
  type: z.enum(['GENERAL', 'SEATED', 'TABLE']).default('GENERAL'),
  color: hexColor.nullable().optional(),
  tableChairs: z.number().int().positive().nullable().optional(),
  tableShape: z.enum(['ROUND', 'RECT', 'SOFA']).nullable().optional(),
}).refine(d => d.type !== 'TABLE' || !!d.tableChairs, {
  message: 'tableChairs is required for TABLE zones',
  path: ['tableChairs'],
}).refine(d => d.type !== 'TABLE' || !!d.tableShape, {
  message: 'tableShape is required for TABLE zones',
  path: ['tableShape'],
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
  capacity: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
  type: z.enum(['GENERAL', 'SEATED', 'TABLE']).optional(),
  color: hexColor.nullable().optional(),
  tableChairs: z.number().int().positive().nullable().optional(),
  tableShape: z.enum(['ROUND', 'RECT', 'SOFA']).nullable().optional(),
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
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return res.status(409).json({ success: false, error: 'Cannot delete zone: tickets already exist for it' });
    }
    return res.status(500).json({ success: false, error: 'Failed to delete zone' });
  }
});

// GET /api/zones/:id/seats
zonesRouter.get('/:id/seats', async (req, res) => {
  try {
    await expireStaleBookings(prisma);

    const seats = await prisma.seat.findMany({
      where: { zoneId: req.params.id },
      orderBy: [{ row: 'asc' }, { sectionIndex: 'asc' }, { posInSection: 'asc' }],
      include: {
        ticket: {
          select: { id: true, status: true },
          where: { status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
        },
      },
    });
    const data = seats.map(s => ({ ...s, occupied: s.ticket !== null }));
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch seats' });
  }
});

// GET /api/zones/:id/tables
zonesRouter.get('/:id/tables', async (req, res) => {
  try {
    await expireStaleBookings(prisma);

    const tables = await prisma.zoneTable.findMany({
      where: { zoneId: req.params.id },
      orderBy: { number: 'asc' },
      include: {
        _count: {
          select: {
            tickets: { where: { status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } } },
          },
        },
      },
    });
    const data = tables.map(t => ({
      ...t,
      occupied: t._count.tickets,
      available: t.chairCount - t._count.tickets,
    }));
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch tables' });
  }
});
