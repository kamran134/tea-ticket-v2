import { Router } from 'express';
import { Prisma, TicketStatus } from '@prisma/client';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { uploadFile } from '../services/storage';
import { generateVenueSlug, slugify } from '../services/slug';
import { isNonZoneCell, findTableBlobs } from '../services/gridCells';
import { prisma } from '../db';
import { z } from 'zod';
import { AppError, ErrorCodes, failApp } from '../errors';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

export const venuesRouter = Router();

venuesRouter.get('/', async (req, res) => {
  const all = req.query.all === 'true';
  const upcoming = req.query.upcoming === 'true';

  const respond = async () => {
    try {
      const venues = await prisma.venue.findMany({
        where: upcoming
          ? { active: true, date: { gte: new Date() } }
          : (all ? undefined : { active: true }),
        orderBy: { date: upcoming ? 'asc' : 'desc' },
      });
      res.json({ success: true, data: venues });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch venues' });
    }
  };

  // all=true also surfaces hidden/past venues — admin only. The default and
  // upcoming=true modes (Afisha, event pages) stay public.
  if (all) {
    requireAuth(req, res, respond);
  } else {
    await respond();
  }
});

// GET /api/venues/slug-available?slug=&excludeId=  (admin: live availability check)
venuesRouter.get('/slug-available', requireAuth, async (req, res) => {
  const { slug, excludeId } = req.query;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ success: false, error: 'slug is required' });
  }
  const normalized = slugify(slug);
  try {
    const existing = await prisma.venue.findUnique({ where: { slug: normalized } });
    const available = !existing || existing.id === excludeId;
    return res.json({ success: true, data: { slug: normalized, available } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to check slug' });
  }
});

// GET /api/venues/by-slug/:slug  (public: resolve a venue for its event page)
venuesRouter.get('/by-slug/:slug', async (req, res) => {
  try {
    const venue = await prisma.venue.findUnique({ where: { slug: req.params.slug } });
    if (!venue || !venue.active) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }
    return res.json({ success: true, data: venue });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch venue' });
  }
});

const CURRENCY = '₼';

const createVenueSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().datetime(),
  slug: z.string().min(1).max(100).optional(),
});

venuesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createVenueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const date = new Date(parsed.data.date);
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : generateVenueSlug(parsed.data.name, date);
  if (!slug) {
    return res.status(400).json({ success: false, error: 'Could not derive a slug from the name' });
  }
  try {
    const venue = await prisma.venue.create({
      data: {
        name: parsed.data.name,
        date,
        currency: CURRENCY,
        slug,
      },
    });
    return res.status(201).json({ success: true, data: venue });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ success: false, error: `Slug "${slug}" is already taken` });
    }
    return res.status(500).json({ success: false, error: 'Failed to create venue' });
  }
});

const patchVenueSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  date: z.string().datetime().optional(),
  active: z.boolean().optional(),
  floorPlanImage: z.string().nullable().optional(),
  posterImage: z.string().nullable().optional(),
  slug: z.string().min(1).max(100).optional(),
}).refine(d => Object.values(d).some(v => v !== undefined), {
  message: 'Provide name, date, active, floorPlanImage, posterImage, or slug',
});

venuesRouter.patch('/:id', requireAuth, async (req, res) => {
  const parsed = patchVenueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { slug, date, ...rest } = parsed.data;
  const normalizedSlug = slug !== undefined ? slugify(slug) : undefined;
  if (slug !== undefined && !normalizedSlug) {
    return res.status(400).json({ success: false, error: 'Invalid slug' });
  }
  try {
    const venue = await prisma.venue.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(date !== undefined && { date: new Date(date) }),
        ...(normalizedSlug !== undefined && { slug: normalizedSlug }),
      },
    });
    return res.json({ success: true, data: venue });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ success: false, error: `Slug "${normalizedSlug}" is already taken` });
    }
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

class GridConflictError extends AppError {
  constructor(message: string, code: string = ErrorCodes.VALIDATION_ERROR) {
    super(code, message, 409);
    this.name = 'GridConflictError';
  }
}

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

  const [existingVenue, zones] = await Promise.all([
    prisma.venue.findUnique({ where: { id: venueId }, select: { gridLayout: true } }),
    prisma.zone.findMany({ where: { venueId } }),
  ]);
  if (!existingVenue) {
    return res.status(404).json({ success: false, error: 'Venue not found' });
  }
  const zoneById = new Map(zones.map(z => [z.id, z]));

  const usedZoneIds = new Set<string>();
  for (const row of cells) {
    for (const cell of row) {
      if (isNonZoneCell(cell)) continue;
      const zone = zoneById.get(cell);
      if (!zone) {
        return res.status(400).json({ success: false, error: `Unknown zone id in grid: ${cell}` });
      }
      usedZoneIds.add(cell);
    }
  }

  // A zone is only "grid-managed" if it's painted now, or was painted in the
  // previously saved layout — zones with seats from the old row/section
  // generator (ZoneConfigurator) never appear in any gridLayout and must be
  // left untouched here.
  const previouslyGridZoneIds = new Set<string>();
  const previousLayout = existingVenue.gridLayout as { cells?: string[][] } | null;
  if (previousLayout?.cells) {
    for (const row of previousLayout.cells) {
      for (const cell of row) {
        if (!isNonZoneCell(cell)) previouslyGridZoneIds.add(cell);
      }
    }
  }

  const seatedZoneIds = new Set<string>();
  const tableZoneIds = new Set<string>();
  for (const id of usedZoneIds) {
    const type = zoneById.get(id)!.type;
    if (type === 'SEATED') seatedZoneIds.add(id);
    if (type === 'TABLE') tableZoneIds.add(id);
  }
  for (const id of previouslyGridZoneIds) {
    const zone = zoneById.get(id);
    if (zone?.type === 'SEATED') seatedZoneIds.add(id);
    if (zone?.type === 'TABLE') tableZoneIds.add(id);
  }

  for (const id of tableZoneIds) {
    const zone = zoneById.get(id)!;
    if (!zone.tableChairs || !zone.tableShape) {
      return res.status(400).json({
        success: false,
        error: `Zone "${zone.name}" has no chairs-per-table/shape configured`,
      });
    }
    if (findTableBlobs(cells, rows, cols, id) === null) {
      return res.status(400).json({
        success: false,
        error: `Zone "${zone.name}": tables must be painted as solid rectangles`,
      });
    }
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
            tickets: { where: { status: { in: ACTIVE_TICKET_STATUSES } }, select: { status: true } },
          },
        });
        const existingByKey = new Map(existingSeats.map(s => [`${s.row}-${s.posInSection}`, s]));

        const toRemove = existingSeats.filter(s => !desired.has(`${s.row}-${s.posInSection}`));
        const blocked = toRemove.find(s => s.tickets.length > 0);
        if (blocked) {
          throw new GridConflictError(
            `Zone "${zone.name}": seat at row ${blocked.row + 1}, col ${blocked.posInSection + 1} is booked and cannot be removed`,
            ErrorCodes.SEAT_ALREADY_BOOKED,
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

      for (const zoneId of tableZoneIds) {
        const zone = zoneById.get(zoneId)!;
        const chairCount = zone.tableChairs!;
        const shape = zone.tableShape!;
        const desiredBlobs = findTableBlobs(cells, rows, cols, zoneId) ?? [];
        const desiredByAnchor = new Map(desiredBlobs.map(b => [`${b.row}-${b.col}`, b]));

        // Only diff grid-placed tables (row/col set) — tables from the old
        // bulk "generate tables" flow (row/col null) are left untouched.
        const allZoneTables = await tx.zoneTable.findMany({
          where: { zoneId },
          include: { tickets: { where: { status: { in: ACTIVE_TICKET_STATUSES } }, select: { status: true } } },
        });
        const gridTables = allZoneTables.filter(t => t.row !== null && t.col !== null);
        const existingByAnchor = new Map(gridTables.map(t => [`${t.row}-${t.col}`, t]));

        const toRemove = gridTables.filter(t => !desiredByAnchor.has(`${t.row}-${t.col}`));
        const blockedRemove = toRemove.find(t => t.tickets.length > 0);
        if (blockedRemove) {
          throw new GridConflictError(
            `Zone "${zone.name}": table at row ${blockedRemove.row! + 1}, col ${blockedRemove.col! + 1} has active tickets and cannot be removed`,
          );
        }

        // Tables kept at the same anchor still need chairCount/shape (and the
        // footprint, if the admin resized the painted area without moving its
        // top-left corner) refreshed to the zone's current settings — these
        // otherwise get copied onto ZoneTable only once, at creation, so an
        // edit to the zone's table config would never reach tables already
        // placed on the grid.
        const toKeep = gridTables.filter(t => desiredByAnchor.has(`${t.row}-${t.col}`));
        const blockedShrink = toKeep.find(t => t.tickets.length > chairCount);
        if (blockedShrink) {
          throw new GridConflictError(
            `Zone "${zone.name}": table at row ${blockedShrink.row! + 1}, col ${blockedShrink.col! + 1} ` +
            `has ${blockedShrink.tickets.length} active ticket(s) and cannot be reduced to ${chairCount} chairs`,
            ErrorCodes.TABLE_CAPACITY_EXCEEDED,
          );
        }

        if (toRemove.length > 0) {
          await tx.zoneTable.deleteMany({ where: { id: { in: toRemove.map(t => t.id) } } });
        }

        for (const table of toKeep) {
          const blob = desiredByAnchor.get(`${table.row}-${table.col}`)!;
          if (
            table.chairCount !== chairCount || table.shape !== shape ||
            table.rows !== blob.rows || table.cols !== blob.cols
          ) {
            await tx.zoneTable.update({
              where: { id: table.id },
              data: { chairCount, shape, rows: blob.rows, cols: blob.cols },
            });
          }
        }

        const toAdd = desiredBlobs
          .filter(b => !existingByAnchor.has(`${b.row}-${b.col}`))
          .sort((a, b) => a.row - b.row || a.col - b.col);

        if (toAdd.length > 0) {
          let counter = allZoneTables.reduce((m, t) => Math.max(m, t.number), 0) + 1;
          await tx.zoneTable.createMany({
            data: toAdd.map(b => ({
              zoneId, number: counter++, chairCount, shape,
              row: b.row, col: b.col, rows: b.rows, cols: b.cols,
            })),
          });
        }

        await tx.zone.update({ where: { id: zoneId }, data: { capacity: desiredBlobs.length * chairCount } });
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
      return failApp(res, err);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }
    console.error('[grid-layout] error:', err);
    return res.status(500).json({ success: false, error: 'Failed to save grid layout' });
  }
});

// req.params.id ends up in a filesystem path below (posters/floorplans/<id>/...) —
// pin it to the shape a real cuid always has before it ever touches a path,
// instead of trusting whatever was in the URL segment.
const VENUE_ID_PATTERN = /^[a-z0-9]{20,32}$/;

// Extension from the upload's mimetype (a small, server-controlled set —
// multer's fileFilter above already restricts it to these three), not from
// the client-supplied original filename.
const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// POST /api/venues/:id/upload-floor-plan
venuesRouter.post('/:id/upload-floor-plan', requireAuth, upload.single('floorPlan'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  if (!VENUE_ID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid venue id' });
  }
  try {
    const exists = await prisma.venue.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }
    const ext = IMAGE_EXT_BY_MIME[req.file.mimetype] ?? 'bin';
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

// POST /api/venues/:id/upload-poster
venuesRouter.post('/:id/upload-poster', requireAuth, upload.single('poster'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  if (!VENUE_ID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid venue id' });
  }
  try {
    const exists = await prisma.venue.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }
    const ext = IMAGE_EXT_BY_MIME[req.file.mimetype] ?? 'bin';
    const key = `posters/${req.params.id}/${Date.now()}.${ext}`;
    const url = await uploadFile(req.file.buffer, key, req.file.mimetype);
    const venue = await prisma.venue.update({
      where: { id: req.params.id },
      data: { posterImage: url },
    });
    return res.json({ success: true, data: venue });
  } catch (err) {
    console.error('[upload-poster]', err);
    return res.status(500).json({ success: false, error: 'Failed to upload poster' });
  }
});

// GET /api/venues/:id/grid-data
// Seats and tables for every SEATED/TABLE zone of this venue in one call —
// the buyer's grid map used to fetch these one zone at a time (N+1), same
// shape as zones.ts's per-zone /seats and /tables, just batched by venueId.
venuesRouter.get('/:id/grid-data', async (req, res) => {
  try {
    const zones = await prisma.zone.findMany({
      where: { venueId: req.params.id },
      select: { id: true, type: true },
    });
    const seatedZoneIds = zones.filter(z => z.type === 'SEATED').map(z => z.id);
    const tableZoneIds = zones.filter(z => z.type === 'TABLE').map(z => z.id);

    const [seats, tables] = await Promise.all([
      seatedZoneIds.length > 0
        ? prisma.seat.findMany({
            where: { zoneId: { in: seatedZoneIds } },
            orderBy: [{ row: 'asc' }, { sectionIndex: 'asc' }, { posInSection: 'asc' }],
            include: {
              tickets: {
                select: { id: true, status: true },
                where: { status: { in: ACTIVE_TICKET_STATUSES } },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
      tableZoneIds.length > 0
        ? prisma.zoneTable.findMany({
            where: { zoneId: { in: tableZoneIds } },
            orderBy: { number: 'asc' },
            include: {
              _count: { select: { tickets: { where: { status: { in: ACTIVE_TICKET_STATUSES } } } } },
            },
          })
        : Promise.resolve([]),
    ]);

    return res.json({
      success: true,
      data: {
        seats: seats.map(({ tickets, ...s }) => {
          const ticket = tickets[0] ?? null;
          return { ...s, ticket, occupied: ticket !== null };
        }),
        tables: tables.map(t => ({ ...t, occupied: t._count.tickets, available: t.chairCount - t._count.tickets })),
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch grid data' });
  }
});
