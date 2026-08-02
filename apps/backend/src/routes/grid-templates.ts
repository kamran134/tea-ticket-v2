import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { isNonZoneCell } from '../services/gridCells';
import { prisma } from '../db';
import { z } from 'zod';

export const gridTemplatesRouter = Router();

const templateZoneSchema = z.object({
  slotId: z.string().min(1),
  name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  type: z.enum(['GENERAL', 'SEATED', 'TABLE']),
  capacity: z.number().int().positive().optional(),
  tableChairs: z.number().int().positive().optional(),
  tableShape: z.enum(['ROUND', 'RECT', 'SOFA']).optional(),
}).refine(d => d.type !== 'TABLE' || !!d.tableChairs, {
  message: 'tableChairs is required for TABLE zone slots',
  path: ['tableChairs'],
}).refine(d => d.type !== 'TABLE' || !!d.tableShape, {
  message: 'tableShape is required for TABLE zone slots',
  path: ['tableShape'],
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  rows: z.number().int().min(1).max(100),
  cols: z.number().int().min(1).max(100),
  cells: z.array(z.array(z.string())),
  zones: z.array(templateZoneSchema).min(1),
});

// GET /api/grid-templates
gridTemplatesRouter.get('/', requireAuth, async (_req, res) => {
  try {
    const templates = await prisma.gridTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, rows: true, cols: true, zones: true, createdAt: true },
    });
    const data = templates.map(t => ({
      id: t.id,
      name: t.name,
      rows: t.rows,
      cols: t.cols,
      zoneCount: Array.isArray(t.zones) ? t.zones.length : 0,
      createdAt: t.createdAt,
    }));
    return res.json({ success: true, data });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

// GET /api/grid-templates/:id
gridTemplatesRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const template = await prisma.gridTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    return res.json({ success: true, data: template });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch template' });
  }
});

// POST /api/grid-templates
gridTemplatesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { name, rows, cols, cells, zones } = parsed.data;

  if (cells.length !== rows || cells.some(row => row.length !== cols)) {
    return res.status(400).json({ success: false, error: 'cells dimensions must match rows/cols' });
  }
  const slotIds = new Set(zones.map(z => z.slotId));
  for (const row of cells) {
    for (const cell of row) {
      if (!isNonZoneCell(cell) && !slotIds.has(cell)) {
        return res.status(400).json({ success: false, error: `Unknown slot id in cells: ${cell}` });
      }
    }
  }

  try {
    const template = await prisma.gridTemplate.create({
      data: { name, rows, cols, cells, zones },
    });
    return res.status(201).json({ success: true, data: template });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to save template' });
  }
});

// DELETE /api/grid-templates/:id
gridTemplatesRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    await prisma.gridTemplate.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: { deleted: true } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});
