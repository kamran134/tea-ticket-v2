import { Router } from 'express';
import { Prisma, PrismaClient, TicketStatus } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';

const prisma = new PrismaClient();
export const zonesRouter = Router();

// GET /api/zones?venueId=xxx
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

    const activeStatuses: TicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];
    const activeWhere = { venueId, status: { in: activeStatuses } };

    const ticketCounts = await prisma.ticket.groupBy({
      by: ['zoneId'],
      where: activeWhere,
      _count: { _all: true },
    });
    const ticketCountMap = Object.fromEntries(ticketCounts.map(c => [c.zoneId, c._count._all]));

    const tableOccupied = await prisma.ticket.groupBy({
      by: ['tableId'],
      where: { ...activeWhere, tableId: { not: null } },
      _count: { _all: true },
    });
    const tableTicketMap = Object.fromEntries(
      tableOccupied.filter(t => t.tableId).map(t => [t.tableId!, t._count._all]),
    );

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
      if (z.type === 'SEATED') {
        const occupied = ticketCountMap[z.id] ?? 0;
        available = (seatTotalMap[z.id] ?? 0) - occupied;
      } else if (z.type === 'TABLE') {
        const totalChairs = tableCapMap[z.id] ?? 0;
        const occupied = ticketCountMap[z.id] ?? 0;
        available = totalChairs - occupied;
      } else {
        available = z.capacity - (ticketCountMap[z.id] ?? 0);
      }
      return { ...z, available };
    });

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
  type: z.enum(['GENERAL', 'SEATED', 'TABLE']).default('GENERAL'),
  layoutData: z.record(z.unknown()).nullable().optional(),
});

function toJsonValue(v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}

zonesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { layoutData, ...rest } = parsed.data;
  try {
    const zone = await prisma.zone.create({
      data: { ...rest, ...(layoutData !== undefined && { layoutData: toJsonValue(layoutData) }) },
    });
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
  type: z.enum(['GENERAL', 'SEATED', 'TABLE']).optional(),
  layoutData: z.record(z.unknown()).nullable().optional(),
});

zonesRouter.put('/:id', requireAuth, async (req, res) => {
  const parsed = updateZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { layoutData, ...rest } = parsed.data;
  try {
    const zone = await prisma.zone.update({
      where: { id: req.params.id },
      data: { ...rest, ...(layoutData !== undefined && { layoutData: toJsonValue(layoutData) }) },
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

// GET /api/zones/:id/seats
zonesRouter.get('/:id/seats', async (req, res) => {
  try {
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

const generateSeatsSchema = z.object({
  sections: z
    .array(
      z.object({
        label: z.string().min(1),
        rows: z.number().int().positive(),
        seatsPerRow: z.number().int().positive(),
      }),
    )
    .min(1),
  numberingOrder: z.enum(['row-first', 'section-first']).default('row-first'),
  startFrom: z.number().int().min(1).default(1),
});

// POST /api/zones/:id/generate-seats
zonesRouter.post('/:id/generate-seats', requireAuth, async (req, res) => {
  const parsed = generateSeatsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const zoneId = req.params.id;
  const { sections, numberingOrder, startFrom } = parsed.data;

  try {
    const hasActiveTickets = await prisma.ticket.count({
      where: { zoneId, seatId: { not: null }, status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
    });
    if (hasActiveTickets > 0) {
      return res.status(409).json({
        success: false,
        error: 'Cannot regenerate seats: active tickets exist',
      });
    }

    interface SeatInput {
      zoneId: string;
      number: number;
      row: number;
      sectionIndex: number;
      posInSection: number;
    }

    const seatsToCreate: SeatInput[] = [];
    let counter = startFrom;

    if (numberingOrder === 'row-first') {
      const maxRows = Math.max(...sections.map(s => s.rows));
      for (let row = 1; row <= maxRows; row++) {
        for (let si = 0; si < sections.length; si++) {
          const section = sections[si];
          if (row > section.rows) continue;
          for (let pos = 1; pos <= section.seatsPerRow; pos++) {
            seatsToCreate.push({ zoneId, number: counter++, row, sectionIndex: si, posInSection: pos });
          }
        }
      }
    } else {
      for (let si = 0; si < sections.length; si++) {
        const section = sections[si];
        for (let row = 1; row <= section.rows; row++) {
          for (let pos = 1; pos <= section.seatsPerRow; pos++) {
            seatsToCreate.push({ zoneId, number: counter++, row, sectionIndex: si, posInSection: pos });
          }
        }
      }
    }

    await prisma.$transaction([
      prisma.seat.deleteMany({ where: { zoneId } }),
      prisma.seat.createMany({ data: seatsToCreate }),
      prisma.zone.update({
        where: { id: zoneId },
        data: { capacity: seatsToCreate.length, type: 'SEATED' },
      }),
    ]);

    return res.status(201).json({ success: true, data: { count: seatsToCreate.length } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to generate seats' });
  }
});

// DELETE /api/zones/:id/seats
zonesRouter.delete('/:id/seats', requireAuth, async (req, res) => {
  const zoneId = req.params.id;
  try {
    const hasActiveTickets = await prisma.ticket.count({
      where: { zoneId, seatId: { not: null }, status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
    });
    if (hasActiveTickets > 0) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete seats: active tickets exist',
      });
    }
    const { count } = await prisma.seat.deleteMany({ where: { zoneId } });
    return res.json({ success: true, data: { deleted: count } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to delete seats' });
  }
});

// GET /api/zones/:id/tables
zonesRouter.get('/:id/tables', async (req, res) => {
  try {
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

const generateTablesSchema = z.object({
  count: z.number().int().positive(),
  shape: z.enum(['ROUND', 'RECT']).default('ROUND'),
  chairCount: z.number().int().positive(),
});

// POST /api/zones/:id/generate-tables
zonesRouter.post('/:id/generate-tables', requireAuth, async (req, res) => {
  const parsed = generateTablesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }

  const zoneId = req.params.id;
  const { count, shape, chairCount } = parsed.data;

  try {
    const hasActiveTickets = await prisma.ticket.count({
      where: { zoneId, tableId: { not: null }, status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
    });
    if (hasActiveTickets > 0) {
      return res.status(409).json({
        success: false,
        error: 'Cannot regenerate tables: active tickets exist',
      });
    }

    const tablesToCreate = Array.from({ length: count }, (_, i) => ({
      zoneId,
      number: i + 1,
      shape,
      chairCount,
    }));

    await prisma.$transaction([
      prisma.zoneTable.deleteMany({ where: { zoneId } }),
      prisma.zoneTable.createMany({ data: tablesToCreate }),
      prisma.zone.update({
        where: { id: zoneId },
        data: { capacity: count * chairCount, type: 'TABLE' },
      }),
    ]);

    return res.status(201).json({ success: true, data: { count, totalSeats: count * chairCount } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to generate tables' });
  }
});
