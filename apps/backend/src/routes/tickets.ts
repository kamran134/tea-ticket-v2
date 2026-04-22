import { Router } from 'express';
import { PrismaClient, TicketStatus } from '@prisma/client';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { uploadFile } from '../services/storage';
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
        ...(status ? { status: status as TicketStatus } : {}),
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
      data: { ticket: mainTicket, members, currency: venue?.currency ?? '₸' },
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
      data: { ticket, members, currency: venue?.currency ?? '₸' },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch ticket' });
  }
});

// POST /api/tickets/register
const registerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(7).max(20),
  venueId: z.string().min(1),
  zoneId: z.string().min(1),
  guests: z.array(z.object({ name: z.string().min(1).max(200) })).default([]),
});

ticketsRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { name, phone, venueId, zoneId, guests } = parsed.data;

  try {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      return res.status(404).json({ success: false, error: 'Zone not found' });
    }

    const occupied = await prisma.ticket.count({
      where: { zoneId, status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
    });
    const totalNeeded = 1 + guests.length;
    if (occupied + totalNeeded > zone.capacity) {
      return res.status(409).json({ success: false, error: 'Not enough seats available' });
    }

    const now = new Date();
    const mainTicket = await prisma.ticket.create({
      data: {
        name,
        phone,
        venueId,
        zoneId,
        zoneName: zone.name,
        cardNumber: zone.cardNumber,
        price: zone.price,
        status: 'BOOKED',
        bookedAt: now,
      },
    });

    const groupId = guests.length > 0 ? mainTicket.id : undefined;
    if (groupId) {
      await prisma.ticket.update({
        where: { id: mainTicket.id },
        data: { groupId },
      });
      await prisma.ticket.createMany({
        data: guests.map(g => ({
          name: g.name,
          phone,
          venueId,
          zoneId,
          zoneName: zone.name,
          cardNumber: zone.cardNumber,
          price: zone.price,
          status: 'BOOKED' as const,
          bookedAt: now,
          groupId,
        })),
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        id: mainTicket.id,
        groupId: groupId ?? null,
        totalPrice: zone.price * totalNeeded,
        cardNumber: zone.cardNumber,
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to register' });
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
  } catch {
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
