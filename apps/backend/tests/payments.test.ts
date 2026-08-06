import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { BankProvider, loadBankProviderConfig } from '../src/services/payments/bank-provider';
import {
  createPayment,
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
      .expect(500);
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
    }).expect(400);
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
    }).expect(500);
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
});

describe('BankProvider', () => {
  it('rejects webhook with invalid signature', () => {
    const bank = new BankProvider('http://localhost:8082', 'token', 'secret');
    const body = Buffer.from(JSON.stringify({
      eventId: 'evt_1',
      paymentId: 'bmp_1',
      orderId: 'pay_1',
      amount: '10.0000',
      currency: 'AZN',
      status: 'PAID',
    }));
    expect(() => bank.verifyAndParseWebhook(body, { 'x-birmanatbank-signature': 'bad' }))
      .toThrow(/signature/i);
  });

  it('throws when bank credentials are missing', () => {
    const saved = {
      base: process.env.BANK_API_BASE_URL,
      key: process.env.BANK_API_KEY,
      secret: process.env.BANK_WEBHOOK_SECRET,
    };
    delete process.env.BANK_API_BASE_URL;
    delete process.env.BANK_API_KEY;
    delete process.env.BIRMANAT_BANK_API_TOKEN;
    delete process.env.BANK_WEBHOOK_SECRET;
    delete process.env.BIRMANAT_BANK_WEBHOOK_SECRET;

    expect(() => loadBankProviderConfig()).toThrow(/requires/i);

    process.env.BANK_API_BASE_URL = saved.base;
    process.env.BANK_API_KEY = saved.key;
    process.env.BANK_WEBHOOK_SECRET = saved.secret;
  });
});
