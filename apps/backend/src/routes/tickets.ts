import { Router } from 'express';
import { PrismaClient, TicketStatus as PrismaTicketStatus } from '@prisma/client';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { uploadFile } from '../services/storage';
import { getPaymentHoldMinutes } from '../services/payments/payment-service';
import { z } from 'zod';

const prisma = new PrismaClient();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

export const ticketsRouter = Router();

// GET /api/tickets?status=PENDING&venueId=xxx  (admin only)
ticketsRouter.get('/', requireAuth, async (req, res) => {
  const { status, venueId } = req.query;
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        ...(status ? { status: status as PrismaTicketStatus } : {}),
        ...(venueId ? { venueId: venueId as string } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: tickets });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
  }
});

// GET /api/tickets/group/:groupId
ticketsRouter.get('/group/:groupId', async (req, res) => {
  try {
    const members = await prisma.ticket.findMany({
      where: { groupId: req.params.groupId },
    });
    if (!members.length) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    const mainTicket = members.find(m => m.id === req.params.groupId) ?? members[0];
    const venue = await prisma.venue.findUnique({
      where: { id: mainTicket.venueId },
      select: { currency: true },
    });
    return res.json({
      success: true,
      data: { ticket: mainTicket, members, currency: venue?.currency ?? '₼' },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch group' });
  }
});

// GET /api/tickets/:id
ticketsRouter.get('/:id', async (req, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    let members: typeof ticket[] | null = null;
    if (ticket.groupId) {
      members = await prisma.ticket.findMany({ where: { groupId: ticket.groupId } });
    }
    const venue = await prisma.venue.findUnique({
      where: { id: ticket.venueId },
      select: { currency: true },
    });
    return res.json({
      success: true,
      data: { ticket, members, currency: venue?.currency ?? '₼' },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch ticket' });
  }
});

// POST /api/tickets/register
// A single checkout can span multiple zones — each cart item is either a set
// of specific seats (SEATED), a quantity of chairs at one table (TABLE), or
// a plain quantity (GENERAL). One ticket row is created per person/seat, all
// sharing one groupId. The buyer's own name covers the first ticket; the
// rest use guestNames[i] if given, otherwise an auto "Гость N" placeholder.
const cartItemSchema = z.object({
  zoneId: z.string().min(1),
  seatIds: z.array(z.string().min(1)).optional(),
  tableId: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
});

const registerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(7).max(20),
  email: z.string().trim().email().max(200),
  venueId: z.string().min(1),
  items: z.array(cartItemSchema).min(1),
  guestNames: z.array(z.string().max(200)).optional().default([]),
});

class RegisterError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

ticketsRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { name, phone, email, venueId, items, guestNames } = parsed.data;
  const activeStatuses: PrismaTicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];
  const now = new Date();

  try {
    const result = await prisma.$transaction(async tx => {
      const zoneIds = [...new Set(items.map(i => i.zoneId))];
      const zones = await tx.zone.findMany({ where: { id: { in: zoneIds }, venueId } });
      const zoneById = new Map(zones.map(z => [z.id, z]));
      if (zoneById.size !== zoneIds.length) {
        throw new RegisterError(404, 'One or more zones not found');
      }

      interface Slot { zoneId: string; zone: (typeof zones)[number]; seatId?: string; tableId?: string }
      const slots: Slot[] = [];

      for (const item of items) {
        const zone = zoneById.get(item.zoneId)!;

        if (item.seatIds && item.seatIds.length > 0) {
          if (zone.type !== 'SEATED') {
            throw new RegisterError(400, `Zone "${zone.name}" is not a seated zone`);
          }
          if (new Set(item.seatIds).size !== item.seatIds.length) {
            throw new RegisterError(400, 'Duplicate seats selected');
          }
          for (const seatId of item.seatIds) slots.push({ zoneId: zone.id, zone, seatId });
        } else if (item.tableId) {
          if (zone.type !== 'TABLE') {
            throw new RegisterError(400, `Zone "${zone.name}" is not a table zone`);
          }
          const qty = item.quantity ?? 0;
          if (qty < 1) {
            throw new RegisterError(400, 'quantity is required for table items');
          }
          for (let i = 0; i < qty; i++) slots.push({ zoneId: zone.id, zone, tableId: item.tableId });
        } else if (item.quantity) {
          if (zone.type !== 'GENERAL') {
            throw new RegisterError(400, `Zone "${zone.name}" requires seatIds or a tableId`);
          }
          for (let i = 0; i < item.quantity; i++) slots.push({ zoneId: zone.id, zone });
        } else {
          throw new RegisterError(400, 'Each item needs seatIds, tableId+quantity, or quantity');
        }
      }

      if (slots.length === 0) {
        throw new RegisterError(400, 'Cart is empty');
      }

      // Seats: exist, belong to the right zone, not already taken
      const allSeatIds = slots.map(s => s.seatId).filter((x): x is string => !!x);
      if (new Set(allSeatIds).size !== allSeatIds.length) {
        throw new RegisterError(400, 'Duplicate seats selected');
      }
      if (allSeatIds.length > 0) {
        const seats = await tx.seat.findMany({ where: { id: { in: allSeatIds } } });
        if (seats.length !== allSeatIds.length) {
          throw new RegisterError(404, 'One or more seats not found');
        }
        const seatById = new Map(seats.map(s => [s.id, s]));
        for (const slot of slots) {
          if (slot.seatId && seatById.get(slot.seatId)!.zoneId !== slot.zoneId) {
            throw new RegisterError(400, 'Seat does not belong to the selected zone');
          }
        }
        const taken = await tx.ticket.findFirst({
          where: { seatId: { in: allSeatIds }, status: { in: activeStatuses } },
        });
        if (taken) {
          throw new RegisterError(409, 'One or more seats are already taken');
        }
      }

      // Tables: exist, enough free chairs for what this checkout is claiming
      const tableIds = [...new Set(slots.map(s => s.tableId).filter((x): x is string => !!x))];
      if (tableIds.length > 0) {
        const tables = await tx.zoneTable.findMany({ where: { id: { in: tableIds } } });
        const tableById = new Map(tables.map(t => [t.id, t]));
        if (tableById.size !== tableIds.length) {
          throw new RegisterError(404, 'One or more tables not found');
        }
        for (const tableId of tableIds) {
          const table = tableById.get(tableId)!;
          const requested = slots.filter(s => s.tableId === tableId).length;
          const occupied = await tx.ticket.count({ where: { tableId, status: { in: activeStatuses } } });
          if (occupied + requested > table.chairCount) {
            throw new RegisterError(409, 'Not enough chairs available at the selected table');
          }
        }
      }

      // GENERAL zones: enough declared capacity left
      const generalZoneIds = [...new Set(
        slots.filter(s => !s.seatId && !s.tableId).map(s => s.zoneId),
      )];
      for (const zoneId of generalZoneIds) {
        const zone = zoneById.get(zoneId)!;
        const requested = slots.filter(s => s.zoneId === zoneId && !s.seatId && !s.tableId).length;
        const occupied = await tx.ticket.count({ where: { zoneId, status: { in: activeStatuses } } });
        if (occupied + requested > zone.capacity) {
          throw new RegisterError(409, `Not enough seats available in zone "${zone.name}"`);
        }
      }

      const holdMinutes = getPaymentHoldMinutes();
      const expiresAt = new Date(now.getTime() + holdMinutes * 60 * 1000);

      const names = [
        name,
        ...Array.from({ length: slots.length - 1 }, (_, i) => guestNames[i]?.trim() || `Гость ${i + 1}`),
      ];
      const ticketRows = slots.map((slot, i) => ({
        name: names[i],
        phone,
        email,
        venueId,
        zoneId: slot.zoneId,
        zoneName: slot.zone.name,
        price: slot.zone.price,
        status: 'BOOKED' as const,
        bookedAt: now,
        expiresAt,
        seatId: slot.seatId,
        tableId: slot.tableId,
      }));

      const mainTicket = await tx.ticket.create({ data: ticketRows[0] });
      const groupId = ticketRows.length > 1 ? mainTicket.id : null;
      if (groupId) {
        await tx.ticket.update({ where: { id: mainTicket.id }, data: { groupId } });
        await tx.ticket.createMany({
          data: ticketRows.slice(1).map(t => ({ ...t, groupId })),
        });
      }

      const totalPrice = ticketRows.reduce((sum, t) => sum + t.price, 0);
      return { id: mainTicket.id, groupId, totalPrice, expiresAt: expiresAt.toISOString() };
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err instanceof RegisterError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    console.error('[register] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to register' });
  }
});

// POST /api/tickets/:id/confirm-manually  (admin: gift / giveaway)
const confirmManuallySchema = z.object({
  reason: z.string().min(3).max(500),
  confirmGroup: z.boolean().optional().default(true),
});

ticketsRouter.post('/:id/confirm-manually', requireAuth, async (req, res) => {
  const parsed = confirmManuallySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { reason, confirmGroup } = parsed.data;
  const activeStatuses: PrismaTicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];

  try {
    const result = await prisma.$transaction(async tx => {
      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id } });
      if (!ticket) {
        throw new RegisterError(404, 'Ticket not found');
      }
      if (ticket.status === 'CONFIRMED' && ticket.confirmationSource === 'MANUAL') {
        return { ticket, alreadyConfirmed: true };
      }
      if (ticket.status !== 'BOOKED') {
        throw new RegisterError(409, 'Only booked tickets can be confirmed manually');
      }

      const checkoutId = ticket.groupId ?? ticket.id;
      const filter = confirmGroup && ticket.groupId
        ? { groupId: ticket.groupId }
        : { id: ticket.id };

      const targets = await tx.ticket.findMany({ where: filter });
      if (targets.some(t => t.status !== 'BOOKED')) {
        throw new RegisterError(409, 'Not all tickets in the group are booked');
      }

      for (const target of targets) {
        if (target.seatId) {
          const conflict = await tx.ticket.findFirst({
            where: {
              seatId: target.seatId,
              status: { in: activeStatuses },
              id: { not: target.id },
            },
          });
          if (conflict) {
            throw new RegisterError(409, 'Seat is no longer available');
          }
        }
      }

      const now = new Date();
      await tx.ticket.updateMany({
        where: { id: { in: targets.map(t => t.id) } },
        data: {
          status: 'CONFIRMED',
          confirmationSource: 'MANUAL',
          confirmedAt: now,
          confirmationNote: reason,
        },
      });

      const updated = await tx.ticket.findUnique({ where: { id: req.params.id } });
      return { ticket: updated, alreadyConfirmed: false, checkoutId };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof RegisterError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    console.error('[confirm-manually] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to confirm manually' });
  }
});

// POST /api/tickets/:id/upload-receipt
ticketsRouter.post('/:id/upload-receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (ticket.status !== 'BOOKED') {
      return res.status(409).json({ success: false, error: 'Receipt already uploaded' });
    }

    const ext = req.file.originalname.split('.').pop() ?? 'bin';
    const key = `receipts/${req.params.id}/${Date.now()}.${ext}`;
    const receiptLink = await uploadFile(req.file.buffer, key, req.file.mimetype);

    const updateFilter = ticket.groupId ? { groupId: ticket.groupId } : { id: ticket.id };
    await prisma.ticket.updateMany({
      where: updateFilter,
      data: { receiptLink, status: 'PENDING' },
    });

    const updated = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[upload-receipt] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to upload receipt' });
  }
});

// POST /api/tickets/:id/checkin
ticketsRouter.post('/:id/checkin', requireAuth, async (req, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    if (ticket.status !== 'CONFIRMED') {
      return res.status(409).json({ success: false, error: 'Ticket is not confirmed' });
    }
    if (ticket.checkedIn) {
      return res.status(409).json({ success: false, error: 'Already checked in' });
    }
    const updated = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { checkedIn: true },
    });
    return res.json({ success: true, data: updated });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to check in' });
  }
});

// POST /api/tickets/group/:groupId/checkin
const checkinGroupSchema = z.object({
  personIds: z.array(z.string()).min(1),
});

ticketsRouter.post('/group/:groupId/checkin', requireAuth, async (req, res) => {
  const parsed = checkinGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  try {
    await prisma.ticket.updateMany({
      where: {
        id: { in: parsed.data.personIds },
        groupId: req.params.groupId,
        status: 'CONFIRMED',
        checkedIn: false,
      },
      data: { checkedIn: true },
    });
    const members = await prisma.ticket.findMany({
      where: { groupId: req.params.groupId },
    });
    return res.json({ success: true, data: { groupId: req.params.groupId, members } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to check in group' });
  }
});

// DELETE /api/tickets/:id  (admin: delete a single ticket, even inside a group)
ticketsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    await prisma.ticket.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: { deleted: true } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to delete ticket' });
  }
});

// PATCH /api/tickets/:id/status  (admin: confirm or reject)
const statusSchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED']),
});

ticketsRouter.patch('/:id/status', requireAuth, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    const updateFilter = ticket.groupId ? { groupId: ticket.groupId } : { id: ticket.id };
    await prisma.ticket.updateMany({
      where: updateFilter,
      data: { status: parsed.data.status },
    });
    const updated = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    return res.json({ success: true, data: updated });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});
