import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from './db';
import { authRouter } from './routes/auth';
import { ticketsRouter, setTicketsEmailProcessor } from './routes/tickets';
import { venuesRouter } from './routes/venues';
import { zonesRouter } from './routes/zones';
import { gridTemplatesRouter } from './routes/grid-templates';
import { paymentsRouter } from './routes/payments';
import { createWebhookHandler } from './routes/webhooks';
import { createResendWebhookHandler } from './routes/resend-webhooks';
import { createResendInboundWebhookHandler } from './routes/resend-inbound';
import { mockPaymentsRouter } from './routes/mock-payments';
import { testRouter } from './routes/test';
import { requestIdMiddleware } from './middleware/requestId';
import { createPaymentProvider, loadPaymentProviderConfig } from './services/payments/factory';
import {
  getPaymentHoldMs,
  PaymentService,
} from './services/payments/payment-service';
import {
  createEmailRuntime,
  type EmailConfig,
  type EmailJobProcessor,
  type TicketEmailSender,
} from './services/email';

export interface AppContext {
  app: Express;
  prisma: PrismaClient;
  paymentService: PaymentService;
  emailJobProcessor: EmailJobProcessor;
  emailConfig: EmailConfig;
}

export function createApp(options?: {
  prisma?: PrismaClient;
  paymentService?: PaymentService;
  emailSender?: TicketEmailSender;
}): AppContext {
  const prisma = options?.prisma ?? sharedPrisma;
  const providerConfig = loadPaymentProviderConfig();
  const provider = createPaymentProvider(providerConfig);

  const paymentService = options?.paymentService ?? new PaymentService({
    prisma,
    provider,
    publicAppUrl: providerConfig.publicAppUrl,
    webhookBaseUrl: providerConfig.webhookBaseUrl,
    paymentHoldMs: getPaymentHoldMs(),
  });

  const emailRuntime = createEmailRuntime(prisma, {
    sender: options?.emailSender,
  });
  setTicketsEmailProcessor(emailRuntime.processor);

  const app = express();
  const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads';

  // Production traffic passes through one nginx proxy. This keeps req.ip
  // client-specific so the authentication rate limiter works correctly.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));

  // Webhook до JSON parser — см. routes/webhooks.ts
  app.post(
    '/api/webhooks/payments/:provider',
    express.raw({ type: 'application/json', limit: '1mb' }),
    createWebhookHandler(paymentService, emailRuntime.processor),
  );

  app.post(
    '/api/webhooks/resend',
    express.raw({ type: 'application/json', limit: '1mb' }),
    createResendWebhookHandler(prisma, emailRuntime.config),
  );

  app.post(
    '/api/resend/inbound',
    express.raw({ type: 'application/json', limit: '1mb' }),
    createResendInboundWebhookHandler(),
  );

  app.use(express.json({ limit: '10mb' }));
  // Receipts contain sensitive payment data and are only available through
  // the authenticated ticket receipt route.
  app.use('/uploads/receipts', (_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });
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
  app.use('/api/test', testRouter(paymentService));

  // Mock hosted page — только для PAYMENT_PROVIDER=mock
  if (providerConfig.provider === 'mock') {
    app.use('/api/mock-payments', mockPaymentsRouter());
  }

  return {
    app,
    prisma,
    paymentService,
    emailJobProcessor: emailRuntime.processor,
    emailConfig: emailRuntime.config,
  };
}
