import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { createPaymentProvider, loadPaymentProviderConfig } from './payments/factory';
import { getPaymentHoldMinutes, PaymentService } from './payments/payment-service';

let started = false;

export function startCronJobs(): void {
  if (started || process.env.NODE_ENV === 'test') {
    return;
  }
  started = true;

  const prisma = new PrismaClient();
  const config = loadPaymentProviderConfig();
  const provider = createPaymentProvider(config);
  const paymentService = new PaymentService({
    prisma,
    provider,
    publicAppUrl: config.publicAppUrl,
    webhookBaseUrl: config.webhookBaseUrl,
    paymentHoldMinutes: getPaymentHoldMinutes(),
  });

  cron.schedule('*/5 * * * *', () => {
    void paymentService.expireStaleBookings().then(count => {
      if (count > 0) console.log(`[cron] expired ${count} bookings`);
    });
    void paymentService.expireStalePayments().then(count => {
      if (count > 0) console.log(`[cron] expired ${count} payments`);
    });
  });

  cron.schedule('*/10 * * * *', () => {
    void paymentService.reconcileProcessingPayments().then(count => {
      if (count > 0) console.log(`[cron] reconciled ${count} payments`);
    });
  });
}

export async function runExpiryJobs(paymentService: PaymentService): Promise<{
  expiredBookings: number;
  expiredPayments: number;
}> {
  const expiredBookings = await paymentService.expireStaleBookings();
  const expiredPayments = await paymentService.expireStalePayments();
  return { expiredBookings, expiredPayments };
}
