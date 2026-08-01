import { Router } from 'express';
import { Prisma, PrismaClient, TicketStatus } from '@prisma/client';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { uploadFile } from '../services/storage';
import { z } from 'zod';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

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
  floorPlanImage: z.string().nullable().optional(),
}).refine(d => d.active !== undefined || d.currency !== undefined || d.floorPlanImage !== undefined, {
  message: 'Provide active, currency, or floorPlanImage',
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

// PUT /api/venues/:id/grid-layout
const gridLayoutSchema = z.object({
  rows: z.number().int().min(1).max(100),
  cols: z.number().int().min(1).max(100),
  cells: z.array(z.array(z.string())),
});

const ACTIVE_TICKET_STATUSES: TicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];

class GridConflictError extends Error {}

venuesRouter.put('/:id/grid-layout', requireAuth, async (req, res) => {
  const parsed = gridLayoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { rows, cols, cells } = parsed.data;
  const venueId = req.params.id;

  if (cells.length !== rows || cells.some(row => row.length !== cols)) {
    return res.status(400).json({ success: false, error: 'cells dimensions must match rows/cols' });
  }

  const zones = await prisma.zone.findMany({ where: { venueId } });
  const zoneById = new Map(zones.map(z => [z.id, z]));

  const usedZoneIds = new Set<string>();
  for (const row of cells) {
    for (const cell of row) {
      if (cell === 'empty' || cell === 'blocked') continue;
      const zone = zoneById.get(cell);
      if (!zone) {
        return res.status(400).json({ success: false, error: `Unknown zone id in grid: ${cell}` });
      }
      if (zone.type === 'TABLE') {
        return res.status(400).json({
          success: false,
          error: `Zone "${zone.name}" is a table zone and cannot be painted on the grid`,
        });
      }
      usedZoneIds.add(cell);
    }
  }

  // Zones whose seats need re-syncing: referenced now, or previously SEATED (to allow full erase)
  const seatedZoneIds = new Set<string>();
  for (const id of usedZoneIds) {
    if (zoneById.get(id)!.type === 'SEATED') seatedZoneIds.add(id);
  }
  for (const z of zones) {
    if (z.type === 'SEATED') seatedZoneIds.add(z.id);
  }

  try {
    const result = await prisma.$transaction(async tx => {
      for (const zoneId of seatedZoneIds) {
        const zone = zoneById.get(zoneId)!;
        const desired = new Set<string>();
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (cells[r][c] === zoneId) desired.add(`${r}-${c}`);
          }
        }

        const existingSeats = await tx.seat.findMany({
          where: { zoneId, sectionIndex: 0 },
          include: {
            ticket: { select: { status: true } },
          },
        });
        const existingByKey = new Map(existingSeats.map(s => [`${s.row}-${s.posInSection}`, s]));

        const toRemove = existingSeats.filter(s => !desired.has(`${s.row}-${s.posInSection}`));
        const blocked = toRemove.find(s => s.ticket && ACTIVE_TICKET_STATUSES.includes(s.ticket.status));
        if (blocked) {
          throw new GridConflictError(
            `Zone "${zone.name}": seat at row ${blocked.row + 1}, col ${blocked.posInSection + 1} is booked and cannot be removed`,
          );
        }

        if (toRemove.length > 0) {
          await tx.seat.deleteMany({ where: { id: { in: toRemove.map(s => s.id) } } });
        }

        const toAdd = [...desired]
          .filter(key => !existingByKey.has(key))
          .map(key => {
            const [r, c] = key.split('-').map(Number);
            return { row: r, posInSection: c };
          })
          .sort((a, b) => a.row - b.row || a.posInSection - b.posInSection);

        if (toAdd.length > 0) {
          let counter = existingSeats.reduce((m, s) => Math.max(m, s.number), 0) + 1;
          await tx.seat.createMany({
            data: toAdd.map(({ row, posInSection }) => ({
              zoneId, number: counter++, row, sectionIndex: 0, posInSection,
            })),
          });
        }

        await tx.zone.update({ where: { id: zoneId }, data: { capacity: desired.size } });
      }

      const venue = await tx.venue.update({
        where: { id: venueId },
        data: { gridLayout: { rows, cols, cells } },
      });
      const updatedZones = await tx.zone.findMany({ where: { venueId }, orderBy: { sortOrder: 'asc' } });

      return { venue, zones: updatedZones };
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof GridConflictError) {
      return res.status(409).json({ success: false, error: err.message });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }
    console.error('[grid-layout] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to save grid layout' });
  }
});

// POST /api/venues/:id/upload-floor-plan
venuesRouter.post('/:id/upload-floor-plan', requireAuth, upload.single('floorPlan'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  try {
    const ext = req.file.originalname.split('.').pop() ?? 'jpg';
    const key = `floorplans/${req.params.id}/${Date.now()}.${ext}`;
    const url = await uploadFile(req.file.buffer, key, req.file.mimetype);
    const venue = await prisma.venue.update({
      where: { id: req.params.id },
      data: { floorPlanImage: url },
    });
    return res.json({ success: true, data: venue });
  } catch (err) {
    console.error('[upload-floor-plan]', err);
    return res.status(500).json({ success: false, error: 'Failed to upload floor plan' });
  }
});
