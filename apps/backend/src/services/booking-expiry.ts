import { PrismaClient } from '@prisma/client';
import { ACTIVE_PAYMENT_STATUSES } from './payments/types';

/** Переводит просроченные BOOKED-брони в EXPIRED. Место снова продаётся,
 *  потому что unique по seatId действует только на BOOKED/PENDING/CONFIRMED. */
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
  if (
    process.env.PAYMENT_HOLD_SECONDS ||
    process.env.BOOKING_TTL_SECONDS ||
    process.env.PAYMENT_TTL_SECONDS
  ) {
    return '*/5 * * * * *';
  }
  return '0 * * * * *';
}
