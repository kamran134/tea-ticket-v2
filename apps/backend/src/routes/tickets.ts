import { Router } from 'express';
import { Prisma, Ticket, TicketStatus as PrismaTicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';
import { resolveUploadPath } from '../services/storage';
import { prisma } from '../db';
import { z } from 'zod';

export const ticketsRouter = Router();

// A ticket id or groupId reveals every member of the same group (see the two
// GET routes below) — phone/email must never leak for anyone but the ticket
// the caller can prove ownership of by knowing its own specific id (and even
// then only when that id names a real ticket, not a bare groupId — see /:id).
function withoutContactInfo<T extends { phone: string; email: string | null }>(
  ticket: T,
): Omit<T, 'phone' | 'email'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit them
  const { phone, email, ...rest } = ticket;
  return rest;
}

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
// A bare groupId establishes no single "owner" the way a specific ticket id
// does — it's someone asking about the whole group, not "my own ticket" — so
// strip contact info from everyone here, including the representative ticket.
ticketsRouter.get('/group/:groupId', async (req, res) => {
  try {
    const members = await prisma.ticket.findMany({
      where: { groupId: req.params.groupId },
      orderBy: { createdAt: 'asc' },
    });
    if (!members.length) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    const mainTicket = members[0];
    const venue = await prisma.venue.findUnique({
      where: { id: mainTicket.venueId },
      select: { currency: true },
    });
    return res.json({
      success: true,
      data: {
        ticket: withoutContactInfo(mainTicket),
        members: members.map(withoutContactInfo),
        currency: venue?.currency ?? '₼',
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch group' });
  }
});

// GET /api/tickets/:id
// id may be an individual ticket's own id, or — for a group purchase — the
// group's shared QR value, which is a standalone groupId rather than any
// member's own id (see /register). Try a direct lookup first, then fall back
// to treating id as a groupId, so scanning the group QR keeps working no
// matter which member ticket gets deleted later.
//
// Contact info (phone/email) is only ever returned for the exact ticket id
// requested — never for group members, since one member's link must not leak
// everyone else's phone number. When id resolves via the groupId fallback
// there's no single ticket the caller proved they own, so it's stripped there
// too (matches /group/:groupId above).
ticketsRouter.get('/:id', async (req, res) => {
  try {
    let ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    let members: Ticket[] | null = null;
    let stripOwnContactInfo = false;
    if (!ticket) {
      const groupMembers = await prisma.ticket.findMany({
        where: { groupId: req.params.id },
        orderBy: { createdAt: 'asc' },
      });
      if (groupMembers.length === 0) {
        return res.status(404).json({ success: false, error: 'Ticket not found' });
      }
      ticket = groupMembers[0];
      members = groupMembers;
      stripOwnContactInfo = true;
    } else if (ticket.groupId) {
      members = await prisma.ticket.findMany({
        where: { groupId: ticket.groupId },
        orderBy: { createdAt: 'asc' },
      });
    }
    const venue = await prisma.venue.findUnique({
      where: { id: ticket.venueId },
      select: { currency: true },
    });
    return res.json({
      success: true,
      data: {
        ticket: stripOwnContactInfo ? withoutContactInfo(ticket) : ticket,
        members: members?.map(withoutContactInfo) ?? null,
        currency: venue?.currency ?? '₼',
      },
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
  seatIds: z.array(z.string().min(1)).max(50).optional(),
  tableId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(50).optional(),
});

const registerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(7).max(20),
  email: z.string().trim().email().max(200),
  venueId: z.string().min(1),
  items: z.array(cartItemSchema).min(1).max(20),
  guestNames: z.array(z.string().max(200)).max(50).optional().default([]),
});

// A hard ceiling on the resulting ticket count, independent of how the
// per-item limits above combine (e.g. 20 items x 50 seats each) — one
// checkout for this many tickets is always anomalous for this use case.
const MAX_SLOTS_PER_ORDER = 50;

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
      // Mirrors the by-slug lookup's 404 for hidden venues (venues.ts) — a
      // venueId is visible to anyone who viewed the event page before it was
      // hidden or the date passed, so this must be re-checked here too, not
      // just when the page first loads.
      const venue = await tx.venue.findUnique({ where: { id: venueId } });
      if (!venue || !venue.active || venue.date < now) {
        throw new RegisterError(404, 'Venue not found');
      }

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
      if (slots.length > MAX_SLOTS_PER_ORDER) {
        throw new RegisterError(400, `Cannot register more than ${MAX_SLOTS_PER_ORDER} tickets in one order`);
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
          // Lock the table row so a concurrent checkout against the same
          // table can't read the same "occupied" count before either commits
          // — without this, two simultaneous requests can both pass this
          // check and both insert, overbooking the table (see S2 in the audit).
          await tx.$queryRaw`SELECT id FROM "ZoneTable" WHERE id = ${tableId} FOR UPDATE`;
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
        // Same race as tables above, for GENERAL zones sold by declared
        // capacity rather than a real Seat row — lock the zone row first.
        await tx.$queryRaw`SELECT id FROM "Zone" WHERE id = ${zoneId} FOR UPDATE`;
        const requested = slots.filter(s => s.zoneId === zoneId && !s.seatId && !s.tableId).length;
        const occupied = await tx.ticket.count({ where: { zoneId, status: { in: activeStatuses } } });
        if (occupied + requested > zone.capacity) {
          throw new RegisterError(409, `Not enough seats available in zone "${zone.name}"`);
        }
      }

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
        seatId: slot.seatId,
        tableId: slot.tableId,
      }));

      // groupId is a standalone identifier, not any member's own ticket id —
      // deleting one ticket (e.g. the buyer's) must never orphan the rest of
      // the group's shared QR code.
      const groupId = ticketRows.length > 1 ? randomUUID() : null;
      const mainTicket = await tx.ticket.create({ data: { ...ticketRows[0], groupId } });
      if (groupId) {
        await tx.ticket.createMany({
          data: ticketRows.slice(1).map(t => ({ ...t, groupId })),
        });
      }

      const totalPrice = ticketRows.reduce((sum, t) => sum + t.price, 0);
      return { id: mainTicket.id, groupId, totalPrice };
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err instanceof RegisterError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    // SEATED zones have no row-lock (unlike tables/GENERAL zones above) —
    // Ticket.seatId's unique constraint is the actual guard against a double
    // booking race, so a concurrent checkout for the same seat surfaces here
    // as a unique-violation on insert rather than failing the earlier
    // findFirst pre-check.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'One or more seats are already taken' });
    }
    console.error('[register] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to register' });
  }
});

// GET /api/tickets/:id/receipt  (admin only)
// receiptLink used to be served directly by express.static at a guessable
// /uploads/receipts/... path with no auth at all — a bank receipt is
// sensitive, so it's gated behind requireAuth here instead (see index.ts,
// which now blocks /uploads/receipts/* from the static mount).
ticketsRouter.get('/:id/receipt', requireAuth, async (req, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket || !ticket.receiptLink) {
      return res.status(404).json({ success: false, error: 'Receipt not found' });
    }
    return res.sendFile(resolveUploadPath(ticket.receiptLink), err => {
      if (err && !res.headersSent) {
        res.status(404).json({ success: false, error: 'Receipt file not found' });
      }
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch receipt' });
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
