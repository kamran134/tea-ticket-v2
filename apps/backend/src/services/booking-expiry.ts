import { PrismaClient } from '@prisma/client';
import { ACTIVE_PAYMENT_STATUSES } from './payments/types';

/** Переводит просроченные BOOKED-брони в EXPIRED и освобождает инвентарь. */
export async function expireStaleBookings(prisma: PrismaClient): Promise<number> {
  const result = await prisma.ticket.updateMany({
    where: {
      status: 'BOOKED',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

/** Переводит просроченные платёжные сессии в EXPIRED. */
export async function expireStalePayments(prisma: PrismaClient): Promise<number> {
  const now = new Date();
  const stale = await prisma.payment.findMany({
    where: {
      status: { in: [...ACTIVE_PAYMENT_STATUSES] },
      expiresAt: { lte: now },
    },
    select: { id: true },
  });

  if (stale.length === 0) {
    return 0;
  }

  const result = await prisma.payment.updateMany({
    where: { id: { in: stale.map(p => p.id) } },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

export function getExpiryCronExpression(): string {
  // 6-field cron (seconds): быстрее в dev при коротком hold
  if (process.env.PAYMENT_HOLD_SECONDS) {
    return '*/5 * * * * *';
  }
  return '0 * * * * *';
}
