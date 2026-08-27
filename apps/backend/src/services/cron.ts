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

  // createPaymentProvider() has a side effect for the mock provider: it overwrites
  // globalThis.__mockPaymentProvider (factory.ts), which the /api/mock-payments routes
  // read from to find the session a checkout just created. index.ts always passes an
  // already-built paymentService here, but this used to call createPaymentProvider()
  // unconditionally anyway -- clobbering the app's real mock instance (built in
  // createApp()) with a second, throwaway one whose session Map was always empty. Every
  // mock checkout would 404 with "Payment session not found" as soon as this ran, which
  // happens on every boot since index.ts calls startCronJobs() right after createApp().
  // Only build a provider (and trigger that side effect) when one isn't already injected.
  const paymentService =
    options?.paymentService ??
    (() => {
      const config = loadPaymentProviderConfig();
      const provider = createPaymentProvider(config);
      return new PaymentService({
        prisma,
        provider,
        publicAppUrl: config.publicAppUrl,
        webhookBaseUrl: config.webhookBaseUrl,
        paymentHoldMs: getPaymentHoldMs(),
      });
    })();
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
    void paymentService.reconcilePendingPayments().then(count => {
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
