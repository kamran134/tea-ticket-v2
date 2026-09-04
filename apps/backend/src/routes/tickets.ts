import { Router } from 'express';
import {
  EmailJobStatus,
  Ticket,
  TicketStatus as PrismaTicketStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';
import { resolveUploadPath } from '../services/storage';
import { prisma } from '../db';
import { getBookingHoldMs } from '../services/payments/payment-service';
import { expireStaleBookings } from '../services/booking-expiry';
import { enqueueTicketConfirmedEmail, kickEmailJobProcessing } from '../services/email';
import type { EmailJobProcessor } from '../services/email';
import { z } from 'zod';
import { AppError, ErrorCodes, fail, failApp, failZod, isPrismaErrorCode, registerValidationCode } from '../errors';
import { logScope } from '../middleware/requestId';
import { TICKET_PLACE_INCLUDE, eventSummary, withPlace } from '../services/ticket-dto';
import { allocateFreeTableSeats, lockSeats } from '../services/tableSeats';

let emailJobProcessor: EmailJobProcessor | null = null;

/** Optional post-response kick; set from createApp when available. */
export function setTicketsEmailProcessor(processor: EmailJobProcessor): void {
  emailJobProcessor = processor;
}

function kickEmailJobs(): void {
  if (emailJobProcessor) {
    kickEmailJobProcessing(emailJobProcessor);
  }
}

export const ticketsRouter = Router();

const ACTIVE_TICKET_STATUSES: PrismaTicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];

async function getTicketEmailDelivery(checkoutId: string): Promise<{
  status: EmailJobStatus;
  acceptedAt: string | null;
  deliveredAt: string | null;
} | null> {
  const job = await prisma.emailJob.findUnique({
    where: {
      type_checkoutId: {
        type: 'TICKET_CONFIRMED',
        checkoutId,
      },
    },
    select: {
      status: true,
      acceptedAt: true,
      deliveredAt: true,
    },
  });
  if (!job) return null;
  return {
    status: job.status,
    acceptedAt: job.acceptedAt?.toISOString() ?? null,
    deliveredAt: job.deliveredAt?.toISOString() ?? null,
  };
}

function toEmailDeliveryDto(job: {
  status: EmailJobStatus;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
}) {
  return {
    status: job.status,
    acceptedAt: job.acceptedAt?.toISOString() ?? null,
    deliveredAt: job.deliveredAt?.toISOString() ?? null,
  };
}

// Public ticket URLs are capability-links, but they still must not leak
// phone/email (AUDIT S5). Name/status/zone stay; contacts stay on requireAuth
// list endpoints only. TicketView already hides missing phone/email.
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
      include: TICKET_PLACE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const checkoutIds = [...new Set(tickets.map(t => t.groupId ?? t.id))];
    const jobs =
      checkoutIds.length === 0
        ? []
        : await prisma.emailJob.findMany({
            where: {
              type: 'TICKET_CONFIRMED',
              checkoutId: { in: checkoutIds },
            },
            select: {
              checkoutId: true,
              status: true,
              acceptedAt: true,
              deliveredAt: true,
            },
          });
    const jobByCheckout = new Map(jobs.map(j => [j.checkoutId, j]));

    const data = tickets.map(ticket => {
      const checkoutId = ticket.groupId ?? ticket.id;
      const job = jobByCheckout.get(checkoutId);
      return {
        ...withPlace(ticket),
        emailDelivery: job ? toEmailDeliveryDto(job) : null,
      };
    });

    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Failed to fetch tickets' } });
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
      include: TICKET_PLACE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    if (!members.length) {
      return fail(res, 404, ErrorCodes.TICKET_NOT_FOUND, 'Group not found');
    }
    const mainTicket = members[0];
    const venue = await prisma.venue.findUnique({
      where: { id: mainTicket.venueId },
      select: { currency: true, name: true, slug: true, date: true },
    });
    const emailDelivery = await getTicketEmailDelivery(req.params.groupId);
    return res.json({
      success: true,
      data: {
        ticket: withoutContactInfo(withPlace(mainTicket)),
        members: members.map(m => withoutContactInfo(withPlace(m))),
        currency: venue?.currency ?? '₼',
        event: eventSummary(venue),
        emailDelivery,
      },
    });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch group');
  }
});

// GET /api/tickets/:id
// id may be an individual ticket's own id, or — for a group purchase — the
// group's shared QR value, which is a standalone groupId rather than any
// member's own id (see /register). Try a direct lookup first, then fall back
// to treating id as a groupId, so scanning the group QR keeps working no
// matter which member ticket gets deleted later.
ticketsRouter.get('/:id', async (req, res) => {
  try {
    let ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: TICKET_PLACE_INCLUDE,
    });
    let members: (Ticket & { seat: { number: number; posInSection: number; tableId: string | null } | null; table: { number: number } | null })[] | null = null;
    if (!ticket) {
      const groupMembers = await prisma.ticket.findMany({
        where: { groupId: req.params.id },
        include: TICKET_PLACE_INCLUDE,
        orderBy: { createdAt: 'asc' },
      });
      if (groupMembers.length === 0) {
        return fail(res, 404, ErrorCodes.TICKET_NOT_FOUND, 'Ticket not found');
      }
      ticket = groupMembers[0];
      members = groupMembers;
    } else if (ticket.groupId) {
      members = await prisma.ticket.findMany({
        where: { groupId: ticket.groupId },
        include: TICKET_PLACE_INCLUDE,
        orderBy: { createdAt: 'asc' },
      });
    }
    const venue = await prisma.venue.findUnique({
      where: { id: ticket.venueId },
      select: { currency: true, name: true, slug: true, date: true },
    });
    const checkoutId = ticket.groupId ?? ticket.id;
    const emailDelivery = await getTicketEmailDelivery(checkoutId);
    return res.json({
      success: true,
      data: {
        ticket: withoutContactInfo(withPlace(ticket)),
        members: members?.map(m => withoutContactInfo(withPlace(m))) ?? null,
        currency: venue?.currency ?? '₼',
        event: eventSummary(venue),
        emailDelivery,
      },
    });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch ticket');
  }
});

// POST /api/tickets/register
// A single checkout can span multiple zones — each cart item is either a set
// of specific seats (SEATED or TABLE chairs), a quantity of chairs at one
// table (legacy TABLE), or a plain quantity (GENERAL). One ticket row is
// created per person/seat, all sharing one groupId. Table chairs are real
// Seat rows: the purchasable unit is the chair, not the table.
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

ticketsRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return failZod(res, parsed.error, registerValidationCode(parsed.error));
  }
  const { name, phone, email, venueId, items, guestNames } = parsed.data;
  const activeStatuses: PrismaTicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];
  const now = new Date();

  try {
    await expireStaleBookings(prisma);

    const result = await prisma.$transaction(async tx => {
      // Mirrors the by-slug lookup's 404 for hidden venues (venues.ts) — a
      // venueId is visible to anyone who viewed the event page before it was
      // hidden or the date passed, so this must be re-checked here too, not
      // just when the page first loads.
      const venue = await tx.venue.findUnique({ where: { id: venueId } });
      if (!venue) {
        throw new AppError(ErrorCodes.EVENT_NOT_FOUND, 'Event not found', 404);
      }
      if (!venue.active || venue.date < now) {
        throw new AppError(ErrorCodes.EVENT_NOT_AVAILABLE, 'Event is not available for purchase', 409);
      }

      const zoneIds = [...new Set(items.map(i => i.zoneId))];
      const zones = await tx.zone.findMany({ where: { id: { in: zoneIds }, venueId } });
      const zoneById = new Map(zones.map(z => [z.id, z]));
      if (zoneById.size !== zoneIds.length) {
        throw new AppError(ErrorCodes.ZONE_NOT_FOUND, 'One or more zones not found', 404);
      }

      interface Slot { zoneId: string; zone: (typeof zones)[number]; seatId?: string; tableId?: string }
      const slots: Slot[] = [];

      for (const item of items) {
        const zone = zoneById.get(item.zoneId)!;

        if (item.seatIds && item.seatIds.length > 0) {
          if (zone.type !== 'SEATED' && zone.type !== 'TABLE') {
            throw new AppError(ErrorCodes.VALIDATION_ERROR, `Zone "${zone.name}" does not sell individual seats`, 400);
          }
          if (new Set(item.seatIds).size !== item.seatIds.length) {
            throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Duplicate seats selected', 400);
          }
          for (const seatId of item.seatIds) slots.push({ zoneId: zone.id, zone, seatId });
        } else if (item.tableId) {
          if (zone.type !== 'TABLE') {
            throw new AppError(ErrorCodes.VALIDATION_ERROR, `Zone "${zone.name}" is not a table zone`, 400);
          }
          const qty = item.quantity ?? 0;
          if (qty < 1) {
            throw new AppError(ErrorCodes.INVALID_QUANTITY, 'quantity is required for table items', 400);
          }
          for (let i = 0; i < qty; i++) slots.push({ zoneId: zone.id, zone, tableId: item.tableId });
        } else if (item.quantity) {
          if (zone.type !== 'GENERAL') {
            throw new AppError(ErrorCodes.VALIDATION_ERROR, `Zone "${zone.name}" requires seatIds or a tableId`, 400);
          }
          for (let i = 0; i < item.quantity; i++) slots.push({ zoneId: zone.id, zone });
        } else {
          throw new AppError(ErrorCodes.INVALID_QUANTITY, 'Each item needs seatIds, tableId+quantity, or quantity', 400);
        }
      }

      if (slots.length === 0) {
        throw new AppError(ErrorCodes.INVALID_QUANTITY, 'Cart is empty', 400);
      }
      if (slots.length > MAX_SLOTS_PER_ORDER) {
        throw new AppError(ErrorCodes.INVALID_QUANTITY, `Cannot register more than ${MAX_SLOTS_PER_ORDER} tickets in one order`, 400);
      }

      const claimedSeatIds = new Set<string>();

      const explicitSeatIds = slots.map(s => s.seatId).filter((x): x is string => !!x);
      if (new Set(explicitSeatIds).size !== explicitSeatIds.length) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Duplicate seats selected', 400);
      }

      if (explicitSeatIds.length > 0) {
        const seats = await tx.seat.findMany({ where: { id: { in: explicitSeatIds } } });
        if (seats.length !== explicitSeatIds.length) {
          throw new AppError(ErrorCodes.SEAT_NOT_FOUND, 'One or more seats not found', 404);
        }
        const seatById = new Map(seats.map(s => [s.id, s]));
        for (const slot of slots) {
          if (!slot.seatId) continue;
          const seat = seatById.get(slot.seatId)!;
          if (seat.zoneId !== slot.zoneId) {
            throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Seat does not belong to the selected zone', 400);
          }
          if (slot.zone.type === 'TABLE') {
            if (!seat.tableId) {
              throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Seat is not a table chair', 400);
            }
            slot.tableId = seat.tableId;
          } else if (seat.tableId) {
            throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Table chairs cannot be booked in a seated zone', 400);
          }
        }
      }

      // Lock tables before seats (sorted) so a seatIds checkout and a
      // tableId+quantity checkout cannot deadlock on the same table.
      const tableIds = [...new Set(slots.map(s => s.tableId).filter((x): x is string => !!x))].sort();
      if (tableIds.length > 0) {
        const tables = await tx.zoneTable.findMany({ where: { id: { in: tableIds } } });
        if (tables.length !== tableIds.length) {
          throw new AppError(ErrorCodes.TABLE_NOT_FOUND, 'One or more tables not found', 404);
        }
        for (const tableId of tableIds) {
          await tx.$queryRaw`SELECT id FROM "ZoneTable" WHERE id = ${tableId} FOR UPDATE`;
        }
      }

      const quantityTableIds = [...new Set(
        slots.filter(s => s.tableId && !s.seatId).map(s => s.tableId!),
      )];
      const quantityChairs = quantityTableIds.length > 0
        ? await tx.seat.findMany({ where: { tableId: { in: quantityTableIds } }, select: { id: true } })
        : [];
      const seatsToLock = [...new Set([...explicitSeatIds, ...quantityChairs.map(c => c.id)])].sort();
      await lockSeats(tx, seatsToLock);

      for (const seatId of explicitSeatIds) claimedSeatIds.add(seatId);

      for (const tableId of quantityTableIds) {
        const unassigned = slots.filter(s => s.tableId === tableId && !s.seatId);
        const allocated = await allocateFreeTableSeats(tx, tableId, unassigned.length, claimedSeatIds);
        for (let i = 0; i < unassigned.length; i++) {
          unassigned[i].seatId = allocated[i];
          claimedSeatIds.add(allocated[i]);
        }
      }

      const allSeatIds = slots.map(s => s.seatId).filter((x): x is string => !!x);
      if (allSeatIds.length > 0) {
        const taken = await tx.ticket.findFirst({
          where: { seatId: { in: allSeatIds }, status: { in: activeStatuses } },
        });
        if (taken) {
          throw new AppError(ErrorCodes.SEAT_ALREADY_BOOKED, 'Seat is already booked', 409);
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
          throw new AppError(ErrorCodes.ZONE_CAPACITY_EXCEEDED, `Not enough seats available in zone "${zone.name}"`, 409);
        }
      }

      const holdMs = getBookingHoldMs();
      const expiresAt = new Date(now.getTime() + holdMs);

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
      return { id: mainTicket.id, groupId, totalPrice, expiresAt: expiresAt.toISOString() };
    });

      logScope('tickets/register', 'checkout created', {
        ticketId: result.id,
        groupId: result.groupId,
        totalPrice: result.totalPrice,
      });
      return res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AppError) {
      return failApp(res, err);
    }
    // SEATED zones have no row-lock (unlike tables/GENERAL zones above) —
    // the partial unique index on live seatId is the actual guard against a
    // double-booking race. Concurrent checkout for the same seat surfaces
    // here as P2002 rather than failing the earlier findFirst pre-check.
    // Check .code (and nested cause) rather than instanceof: Prisma may wrap
    // the error across the transaction boundary or a duplicate client copy.
    if (isPrismaErrorCode(err, 'P2002')) {
      return fail(res, 409, ErrorCodes.SEAT_ALREADY_BOOKED, 'Seat is already booked');
    }
    console.error('[register] error:', err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to register');
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
        throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket not found', 404);
      }
      if (ticket.status === 'CONFIRMED' && ticket.confirmationSource === 'MANUAL') {
        return { ticket, alreadyConfirmed: true };
      }
      if (ticket.status !== 'BOOKED') {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Only booked tickets can be confirmed manually', 409);
      }

      const filter = confirmGroup && ticket.groupId
        ? { groupId: ticket.groupId }
        : { id: ticket.id };

      const targets = await tx.ticket.findMany({ where: filter });
      if (targets.some(t => t.status !== 'BOOKED')) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Not all tickets in the group are booked', 409);
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
            throw new AppError(ErrorCodes.SEAT_ALREADY_BOOKED, 'Seat is no longer available', 409);
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

      const emailCheckoutId =
        confirmGroup && ticket.groupId ? ticket.groupId : ticket.id;
      await enqueueTicketConfirmedEmail(tx, emailCheckoutId, targets);

      const updated = await tx.ticket.findUnique({ where: { id: req.params.id } });
      return { ticket: updated, alreadyConfirmed: false, checkoutId: emailCheckoutId };
    });

    if (!result.alreadyConfirmed) {
      kickEmailJobs();
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AppError) {
      return failApp(res, err);
    }
    console.error('[confirm-manually] error:', err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to confirm manually');
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
      return fail(res, 404, ErrorCodes.TICKET_NOT_FOUND, 'Ticket not found');
    }
    if (ticket.status !== 'CONFIRMED') {
      return fail(res, 409, ErrorCodes.TICKET_NOT_CONFIRMED, 'Ticket is not confirmed');
    }
    if (ticket.checkedIn) {
      return fail(res, 409, ErrorCodes.TICKET_ALREADY_CHECKED_IN, 'Ticket already checked in');
    }
    const updated = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { checkedIn: true },
    });
    logScope('tickets/checkin', 'ticket checked in', { ticketId: ticket.id, groupId: ticket.groupId });
    return res.json({ success: true, data: updated });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to check in');
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
    const members = await prisma.ticket.findMany({
      where: { groupId: req.params.groupId },
    });
    if (!members.length) {
      return fail(res, 404, ErrorCodes.TICKET_NOT_FOUND, 'Group not found');
    }
    const targets = members.filter(m => parsed.data.personIds.includes(m.id));
    if (targets.length === 0) {
      return fail(res, 400, ErrorCodes.VALIDATION_ERROR, 'No matching tickets in group');
    }
    if (targets.some(t => t.status !== 'CONFIRMED')) {
      return fail(res, 409, ErrorCodes.TICKET_NOT_CONFIRMED, 'Ticket is not confirmed');
    }
    if (targets.every(t => t.checkedIn)) {
      return fail(res, 409, ErrorCodes.TICKET_ALREADY_CHECKED_IN, 'Ticket already checked in');
    }
    await prisma.ticket.updateMany({
      where: {
        id: { in: targets.filter(t => !t.checkedIn).map(t => t.id) },
        groupId: req.params.groupId,
        status: 'CONFIRMED',
        checkedIn: false,
      },
      data: { checkedIn: true },
    });
    const updatedMembers = await prisma.ticket.findMany({
      where: { groupId: req.params.groupId },
    });
    logScope('tickets/checkin-group', 'group checked in', {
      groupId: req.params.groupId,
      count: targets.filter(t => !t.checkedIn).length,
    });
    return res.json({ success: true, data: { groupId: req.params.groupId, members: updatedMembers } });
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
    if (parsed.data.status === 'REJECTED') {
      const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
      if (!ticket) {
        return res.status(404).json({ success: false, error: 'Ticket not found' });
      }
      const updateFilter = ticket.groupId ? { groupId: ticket.groupId } : { id: ticket.id };
      await prisma.ticket.updateMany({
        where: updateFilter,
        data: { status: 'REJECTED' },
      });
      const updated = await prisma.ticket.findUnique({ where: { id: req.params.id } });
      return res.json({ success: true, data: updated });
    }

    const result = await prisma.$transaction(async tx => {
      const ticket = await tx.ticket.findUnique({ where: { id: req.params.id } });
      if (!ticket) {
        throw new AppError(ErrorCodes.TICKET_NOT_FOUND, 'Ticket not found', 404);
      }

      const checkoutId = ticket.groupId ?? ticket.id;
      const group = await tx.ticket.findMany({
        where: {
          OR: [{ id: checkoutId }, { groupId: checkoutId }],
        },
      });

      const toConfirm = group.filter(t => t.status !== 'CONFIRMED');
      if (toConfirm.length === 0) {
        const updated = await tx.ticket.findUnique({ where: { id: req.params.id } });
        return { ticket: updated, newlyConfirmed: false, checkoutId };
      }

      // An EXPIRED/REJECTED ticket keeps its seatId, and the seat may have
      // been resold meanwhile. Reviving it would violate the partial unique
      // index on live seatId and surface as a 500, so refuse explicitly.
      const seatIds = [...new Set(toConfirm.map(t => t.seatId).filter((s): s is string => !!s))];
      if (seatIds.length > 0) {
        const conflict = await tx.ticket.findFirst({
          where: {
            seatId: { in: seatIds },
            status: { in: ACTIVE_TICKET_STATUSES },
            id: { notIn: toConfirm.map(t => t.id) },
          },
        });
        if (conflict) {
          throw new AppError(ErrorCodes.SEAT_ALREADY_BOOKED, 'Seat is no longer available', 409);
        }
      }

      const now = new Date();
      await tx.ticket.updateMany({
        where: { id: { in: toConfirm.map(t => t.id) } },
        data: {
          status: 'CONFIRMED',
          confirmationSource: 'MANUAL',
          confirmedAt: now,
        },
      });

      await enqueueTicketConfirmedEmail(tx, checkoutId, group);

      const updated = await tx.ticket.findUnique({ where: { id: req.params.id } });
      return { ticket: updated, newlyConfirmed: true, checkoutId };
    });

    if (result.newlyConfirmed) {
      kickEmailJobs();
    }

    return res.json({ success: true, data: result.ticket });
  } catch (err) {
    if (err instanceof AppError) {
      return failApp(res, err);
    }
    // Last-resort guard for the seat race: the pre-check above and a
    // concurrent checkout can interleave, and the partial unique index wins.
    if (isPrismaErrorCode(err, 'P2002')) {
      return fail(res, 409, ErrorCodes.SEAT_ALREADY_BOOKED, 'Seat is no longer available');
    }
    console.error('[status] error:', err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to update status');
  }
});
