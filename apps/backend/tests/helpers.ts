import { createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { Express } from 'express';
import type { PaymentProvider } from '../src/services/payments/payment-provider';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ProviderPaymentState,
} from '../src/services/payments/types';

export const TEST_WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET ?? 'test-mock-webhook-secret';

/**
 * Stand-in for a webhook-less provider (Kapital TXPG in production) — status is only
 * ever available via getPaymentStatus(), same as the real thing. Lets tests exercise
 * payment-service.ts's sync/reconcile/amount-guard logic through the real HTTP stack
 * without a network call to the actual bank sandbox.
 */
export class FakeSyncProvider implements PaymentProvider {
  readonly name = 'kapital-fake';
  readonly supportsWebhooks = false;

  /** Set by the test before a call that should trigger a status sync. */
  nextState: ProviderPaymentState | null = null;
  /** Incremented on every getPaymentStatus() call — used to assert throttling. */
  statusCallCount = 0;

  private counter = 0;

  createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    this.counter += 1;
    return Promise.resolve({
      providerPaymentId: `fake_${this.counter}`,
      redirectUrl: `https://fake-bank.test/pay/${this.counter}`,
      status: 'CREATED',
    });
  }

  getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentState> {
    this.statusCallCount += 1;
    if (!this.nextState) {
      throw new Error('FakeSyncProvider.nextState was not set by the test');
    }
    return Promise.resolve({ ...this.nextState, providerPaymentId });
  }
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.emailWebhookEvent.deleteMany();
  await prisma.emailJob.deleteMany();
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.zoneTable.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.venue.deleteMany();
}

export async function seedVenueWithZone(prisma: PrismaClient): Promise<{
  venueId: string;
  zoneId: string;
}> {
  const venue = await prisma.venue.create({
    data: {
      name: 'Test Venue',
      slug: `test-${Date.now()}`,
      date: new Date('2026-12-01T19:00:00Z'),
      active: true,
    },
  });
  const zone = await prisma.zone.create({
    data: {
      venueId: venue.id,
      name: 'General',
      price: 25,
      capacity: 100,
      type: 'GENERAL',
    },
  });
  return { venueId: venue.id, zoneId: zone.id };
}

export async function registerTicket(
  app: Express,
  venueId: string,
  zoneId: string,
  price = 25,
): Promise<{ ticketId: string; expiresAt: string }> {
  if (price !== 25) {
    // price comes from zone; caller should create zone with desired price
  }
  const res = await request(app)
    .post('/api/tickets/register')
    .send({
      name: 'Test Buyer',
      phone: '+994501234567',
      email: 'buyer@example.com',
      venueId,
      items: [{ zoneId, quantity: 1 }],
    })
    .expect(201);

  return {
    ticketId: res.body.data.id,
    expiresAt: res.body.data.expiresAt,
  };
}

export function signMockWebhook(body: string, secret = TEST_WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function postMockWebhook(
  app: Express,
  provider: string,
  payload: Record<string, unknown>,
  secret = TEST_WEBHOOK_SECRET,
) {
  const body = JSON.stringify(payload);
  const signature = signMockWebhook(body, secret);
  return request(app)
    .post(`/api/webhooks/payments/${provider}`)
    .set('Content-Type', 'application/json')
    .set('X-Mock-Payment-Signature', signature)
    .send(body);
}

export async function createPayment(
  app: Express,
  ticketId: string,
): Promise<{
  paymentId: string;
  redirectUrl: string;
  returnToken: string;
  amount: string;
}> {
  const res = await request(app)
    .post('/api/payments')
    .send({ ticketId })
    .expect(201);

  return res.body.data;
}
