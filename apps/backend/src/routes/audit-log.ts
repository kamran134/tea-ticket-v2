import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ErrorCodes, fail, failZod } from '../errors';
import { requireAuth, requirePermission } from '../middleware/auth';

export const auditLogRouter = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().max(100).optional(),
  actorId: z.string().max(50).optional(),
});

auditLogRouter.get('/', requireAuth, requirePermission('audit.view'), async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return failZod(res, parsed.error);

  const { limit, offset, action, actorId } = parsed.data;
  const where = {
    ...(action && { action }),
    ...(actorId && { actorId }),
  };

  try {
    const [entries, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);
    return res.json({ success: true, data: { entries, total, limit, offset } });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch audit log');
  }
});
