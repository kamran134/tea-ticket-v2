import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function startCronJobs(): void {
  // Every 5 minutes: expire bookings older than 1 hour that haven't been paid
  cron.schedule('*/5 * * * *', async () => {
    const expiredBefore = new Date(Date.now() - 60 * 60 * 1000);
    const result = await prisma.ticket.updateMany({
      where: {
        status: 'BOOKED',
        bookedAt: { lt: expiredBefore },
      },
      data: { status: 'EXPIRED' },
    });
    if (result.count > 0) {
      console.log(`[cron] Expired ${result.count} old bookings`);
    }
  });
}
