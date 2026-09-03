import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { PaymentService, getPaymentHoldMs } from '../src/services/payments/payment-service';
import {
  createPayment,
  FakeSyncProvider,
  postMockWebhook,
  registerTicket,
  resetDatabase,
  seedVenueWithZone,
} from './helpers';

const prisma = new PrismaClient();
let app: ReturnType<typeof createApp>['app'];

beforeAll(() => {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
  const ctx = createApp({ prisma });
  app = ctx.app;
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

describe('Payment API', () => {
  it('creates payment with amount calculated from DB', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({ where: { id: zoneId }, data: { price: 12.34 } });
    const { ticketId } = await registerTicket(app, venueId, zoneId);

    const payment = await createPayment(app, ticketId);

    expect(payment.amount).toBe('12.3400');
    expect(payment.redirectUrl).toContain('/api/mock-payments/');
  });

  it('returns the same active payment for duplicate create (idempotent)', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);

    const first = await createPayment(app, ticketId);
    const second = await createPayment(app, ticketId);

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.redirectUrl).toBe(first.redirectUrl);
  });

  it('confirms tickets on successful webhook', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);

    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    await postMockWebhook(app, 'mock', {
      eventId: 'evt_success_1',
      event: 'payment.succeeded',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
    }).expect(200);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('CONFIRMED');
    expect(ticket.confirmationSource).toBe('PAYMENT');
    expect(ticket.confirmedAt).not.toBeNull();

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });
    expect(updatedPayment.status).toBe('SUCCEEDED');
  });

  it('rejects webhook with invalid signature', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    const body = JSON.stringify({
      eventId: 'evt_bad_sig',
      event: 'payment.succeeded',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
    });

    await request(app)
      .post('/api/webhooks/payments/mock')
      .set('Content-Type', 'application/json')
      .set('X-Mock-Payment-Signature', 'invalid')
      .send(body)
      .expect(400)
      .expect(res => {
        expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
      });
  });

  it('rejects webhook with wrong amount', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    await postMockWebhook(app, 'mock', {
      eventId: 'evt_wrong_amount',
      event: 'payment.succeeded',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: '9999.0000',
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
    }).expect(400)
      .expect(res => {
        expect(res.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
      });
  });

  it('rejects webhook with non-AZN currency', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    await postMockWebhook(app, 'mock', {
      eventId: 'evt_wrong_currency',
      event: 'payment.succeeded',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'USD',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
    }).expect(400);
  });

  it('handles duplicate webhook idempotently', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    const payload = {
      eventId: 'evt_duplicate',
      event: 'payment.succeeded',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
    };

    await postMockWebhook(app, 'mock', payload).expect(200);
    const second = await postMockWebhook(app, 'mock', payload).expect(200);

    expect(second.body.data.processed).toBe(false);

    const events = await prisma.paymentWebhookEvent.count({
      where: { providerEventId: 'evt_duplicate' },
    });
    expect(events).toBe(1);
  });

  it('marks payment REQUIRES_REVIEW when success arrives after booking expired', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'EXPIRED' },
    });

    await postMockWebhook(app, 'mock', {
      eventId: 'evt_late_success',
      event: 'payment.succeeded',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
    }).expect(200);

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });
    expect(updatedPayment.status).toBe('REQUIRES_REVIEW');

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('EXPIRED');
  });

  it('polls payment status by id and return token', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);

    const res = await request(app)
      .get(`/api/payments/${payment.paymentId}/status`)
      .query({ token: payment.returnToken })
      .expect(200);

    expect(res.body.data.paymentId).toBe(payment.paymentId);
    expect(res.body.data.status).toBe('CREATED');
  });

  it('does not confirm tickets on failed or cancelled payment', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    await postMockWebhook(app, 'mock', {
      eventId: 'evt_failed',
      event: 'payment.failed',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'FAILED',
    }).expect(200);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('BOOKED');
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });
    expect(updated.status).toBe('FAILED');
  });

  it('ignores a success webhook after a terminal failure', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    await postMockWebhook(app, 'mock', {
      eventId: 'evt_fail_then_success_1',
      event: 'payment.failed',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'FAILED',
    }).expect(200);

    await postMockWebhook(app, 'mock', {
      eventId: 'evt_fail_then_success_2',
      event: 'payment.succeeded',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
    }).expect(200);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('BOOKED');
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });
    expect(updated.status).toBe('FAILED');
  });

  it('echoes X-Request-ID when provided', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', 'qa-corr-1')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('qa-corr-1');
  });
});

/**
 * A webhook-less provider (Kapital TXPG in production) can't rely on the webhook-driven
 * paths above — status only ever arrives via getPaymentStatus(), polled by
 * reconcilePendingPayments (cron) and syncFromProvider (on-demand, from getPaymentStatus
 * and getReturnRedirect). These tests build their own PaymentService around
 * FakeSyncProvider so they exercise that logic through the real HTTP stack without
 * calling the actual bank sandbox. See TZ-KAPITAL-TXPG.md §A7.
 */
describe('Webhook-less provider (Kapital-style)', () => {
  let provider: FakeSyncProvider;
  let paymentService: PaymentService;
  let app: ReturnType<typeof createApp>['app'];

  beforeEach(() => {
    provider = new FakeSyncProvider();
    paymentService = new PaymentService({
      prisma,
      provider,
      publicAppUrl: process.env.PUBLIC_APP_URL!,
      webhookBaseUrl: process.env.PUBLIC_APP_URL!,
      paymentHoldMs: getPaymentHoldMs(),
    });
    app = createApp({ prisma, paymentService }).app;
  });

  it('rejects the webhook route with 404 instead of crashing (no verifyAndParseWebhook)', async () => {
    const res = await request(app)
      .post('/api/webhooks/payments/kapital-fake')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'))
      .expect(404);

    // The error envelope is { code, message } since the QA error-code work; the
    // frontend's readError still accepts the older plain-string shape too.
    expect(res.body.error.message).toMatch(/does not support webhooks/i);
  });

  it('reconcilePendingPayments picks up CREATED, not just PROCESSING', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);

    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });
    expect(dbPayment.status).toBe('CREATED'); // never touched PROCESSING — the old filter would miss this

    provider.nextState = {
      providerPaymentId: dbPayment.providerPaymentId!,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
      failureCode: null,
    };

    const count = await paymentService.reconcilePendingPayments();
    expect(count).toBe(1);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('CONFIRMED');
  });

  it('flags REQUIRES_REVIEW/AMOUNT_MISMATCH instead of trusting the DB amount blindly', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    provider.nextState = {
      providerPaymentId: dbPayment.providerPaymentId!,
      orderId: payment.paymentId,
      amount: '9999.0000', // does not match payment.amount
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
      failureCode: null,
    };

    await paymentService.reconcilePendingPayments();

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });
    expect(updated.status).toBe('REQUIRES_REVIEW');
    expect(updated.failureCode).toBe('AMOUNT_MISMATCH');

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('BOOKED'); // not silently confirmed
  });

  it('GET status syncs from the provider and throttles a second call within the window', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    provider.nextState = {
      providerPaymentId: dbPayment.providerPaymentId!,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
      failureCode: null,
    };

    const first = await request(app).get(`/api/payments/${payment.paymentId}/status`).expect(200);
    expect(first.body.data.status).toBe('SUCCEEDED');
    expect(provider.statusCallCount).toBe(1);

    // Second call lands well inside the 2s throttle window and must not re-hit the provider.
    await request(app).get(`/api/payments/${payment.paymentId}/status`).expect(200);
    expect(provider.statusCallCount).toBe(1);
  });

  it('return redirect ignores the bank-appended ?ID=&STATUS= query params', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    provider.nextState = {
      providerPaymentId: dbPayment.providerPaymentId!,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'CREATED',
      paidAt: null,
      failureCode: null,
    };

    const res = await request(app)
      .get(`/api/payments/return/${payment.returnToken}`)
      // A different payment's id + a status the DB never saw — must have zero effect.
      .query({ ID: '999999999', STATUS: 'FullyPaid' })
      .expect(302);

    const location = new URL(res.headers.location);
    expect(location.searchParams.get('paymentId')).toBe(payment.paymentId);
    expect(location.searchParams.get('checkoutId')).toBe(dbPayment.checkoutId);
  });
});
