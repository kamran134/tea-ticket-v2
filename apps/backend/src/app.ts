import express, { Express } from 'express';
import cors from 'cors';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { authRouter } from './routes/auth';
import { ticketsRouter } from './routes/tickets';
import { venuesRouter } from './routes/venues';
import { zonesRouter } from './routes/zones';
import { gridTemplatesRouter } from './routes/grid-templates';
import { paymentsRouter } from './routes/payments';
import { createWebhookHandler } from './routes/webhooks';
import { mockPaymentsRouter } from './routes/mock-payments';
import { createPaymentProvider, loadPaymentProviderConfig } from './services/payments/factory';
import {
  getPaymentHoldMinutes,
  PaymentService,
} from './services/payments/payment-service';

export interface AppContext {
  app: Express;
  prisma: PrismaClient;
  paymentService: PaymentService;
}

export function createApp(options?: {
  prisma?: PrismaClient;
  paymentService?: PaymentService;
}): AppContext {
  const prisma = options?.prisma ?? new PrismaClient();
  const providerConfig = loadPaymentProviderConfig();
  const provider = createPaymentProvider(providerConfig);

  const paymentService = options?.paymentService ?? new PaymentService({
    prisma,
    provider,
    publicAppUrl: providerConfig.publicAppUrl,
    paymentHoldMinutes: getPaymentHoldMinutes(),
  });

  const app = express();
  const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads';

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));

  // Webhook до JSON parser — см. routes/webhooks.ts
  app.post(
    '/api/webhooks/payments/:provider',
    express.raw({ type: 'application/json', limit: '1mb' }),
    createWebhookHandler(paymentService),
  );

  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(join(UPLOADS_DIR)));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/venues', venuesRouter);
  app.use('/api/zones', zonesRouter);
  app.use('/api/grid-templates', gridTemplatesRouter);
  app.use('/api/payments', paymentsRouter(paymentService));

  // Mock hosted page — только для PAYMENT_PROVIDER=mock
  if (providerConfig.provider === 'mock') {
    app.use('/api/mock-payments', mockPaymentsRouter());
  }

  return { app, prisma, paymentService };
}
