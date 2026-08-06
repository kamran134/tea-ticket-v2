import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { createPaymentProvider, loadPaymentProviderConfig } from './payments/factory';
import { getPaymentHoldMs, PaymentService } from './payments/payment-service';
import {
  expireStaleBookings,
  expireStalePayments,
  getExpiryCronExpression,
} from './booking-expiry';
import {
  createEmailRuntime,
  type EmailJobProcessor,
} from './email';

let started = false;

export function startCronJobs(options?: {
  prisma?: PrismaClient;
  paymentService?: PaymentService;
  emailJobProcessor?: EmailJobProcessor;
}): void {
  if (started || process.env.NODE_ENV === 'test') {
    return;
  }
  started = true;

  const prisma = options?.prisma ?? new PrismaClient();
  const config = loadPaymentProviderConfig();
  const provider = createPaymentProvider(config);
  const paymentService = options?.paymentService ?? new PaymentService({
    prisma,
    provider,
    publicAppUrl: config.publicAppUrl,
    webhookBaseUrl: config.webhookBaseUrl,
    paymentHoldMs: getPaymentHoldMs(),
  });
  const emailJobProcessor =
    options?.emailJobProcessor ?? createEmailRuntime(prisma).processor;

  const expiryCron = getExpiryCronExpression();
  cron.schedule(expiryCron, () => {
    void expireStaleBookings(prisma).then(count => {
      if (count > 0) console.log(`[cron] expired ${count} bookings`);
    });
    void expireStalePayments(prisma).then(count => {
      if (count > 0) console.log(`[cron] expired ${count} payments`);
    });
  });

  cron.schedule('*/10 * * * *', () => {
    void paymentService.reconcileProcessingPayments().then(count => {
      if (count > 0) console.log(`[cron] reconciled ${count} payments`);
    });
  });

  // Fallback for EmailJob outbox (primary kick is after payment webhook response)
  cron.schedule('* * * * *', () => {
    void emailJobProcessor.processBatch().then(result => {
      if (result.processed > 0) {
        console.log(`[cron] processed ${result.processed} email jobs`);
      }
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
