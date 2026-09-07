import { Router } from 'express';
import { prisma } from '../db';
import { ErrorCodes, fail } from '../errors';
import { requireAuth } from '../middleware/auth';

export const inboundEmailsRouter = Router();

inboundEmailsRouter.get('/unread-count', requireAuth, async (_req, res) => {
  try {
    const unreadCount = await prisma.inboundEmail.count({
      where: { isRead: false },
    });
    return res.json({ success: true, data: { unreadCount } });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch unread count');
  }
});

inboundEmailsRouter.post('/mark-all-read', requireAuth, async (_req, res) => {
  try {
    const result = await prisma.inboundEmail.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });
    return res.json({ success: true, data: { markedCount: result.count } });
  } catch {
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to mark inbound emails as read');
  }
});
