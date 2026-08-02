import { createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { Express } from 'express';

export const TEST_WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET ?? 'test-mock-webhook-secret';

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
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
