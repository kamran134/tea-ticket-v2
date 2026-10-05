import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  createPayment,
  postMockWebhook,
  resetDatabase,
  seedAdminUser,
  seedSuperAdmin,
  seedSystemRoles,
  seedVenueWithZone,
} from './helpers';

const prisma = new PrismaClient();
let app: ReturnType<typeof createApp>['app'];
let adminToken: string;

beforeAll(() => {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
  app = createApp({ prisma }).app;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  adminToken = (await seedSuperAdmin(prisma)).token;
});

async function paidGroup(price = 10): Promise<{ ticketIds: string[]; paymentId: string; amount: string }> {
  const { venueId, zoneId } = await seedVenueWithZone(prisma);
  await prisma.zone.update({ where: { id: zoneId }, data: { price } });
  const registered = await request(app)
    .post('/api/tickets/register')
    .send({
      name: 'Buyer',
      phone: '+994501234567',
      email: 'buyer@example.com',
      venueId,
      items: [{ zoneId, quantity: 2 }],
    })
    .expect(201);

  const groupId = registered.body.data.groupId as string;
  const members = await prisma.ticket.findMany({
    where: { groupId },
    orderBy: { createdAt: 'asc' },
  });
  expect(members).toHaveLength(2);

  const payment = await createPayment(app, registered.body.data.id);
  const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });
  await postMockWebhook(app, 'mock', {
    eventId: `evt_refund_${groupId}`,
    event: 'payment.succeeded',
    paymentId: dbPayment.providerPaymentId,
    orderId: payment.paymentId,
    amount: payment.amount,
    currency: 'AZN',
    status: 'SUCCEEDED',
    paidAt: new Date().toISOString(),
  }).expect(200);

  return {
    ticketIds: members.map(t => t.id),
    paymentId: payment.paymentId,
    amount: payment.amount,
  };
}

function refund(ticketId: string, ticketIds: string[], token = adminToken) {
  return request(app)
    .post(`/api/tickets/${ticketId}/refund`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ticketIds });
}

describe('ticket refunds', () => {
  it('refunds one person in a group and leaves the other ticket valid', async () => {
    const { ticketIds, paymentId } = await paidGroup(10);

    const res = await refund(ticketIds[0], [ticketIds[0]]).expect(200);
    expect(res.body.data.partial).toBe(true);
    expect(res.body.data.amount).toBe('10.0000');

    const refunded = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketIds[0] } });
    const kept = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketIds[1] } });
    expect(refunded.status).toBe('REFUNDED');
    expect(kept.status).toBe('CONFIRMED');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.refundedAmount.toFixed(4)).toBe('10.0000');

    const rows = await prisma.paymentRefund.findMany({ where: { paymentId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].partial).toBe(true);
    expect(rows[0].ticketIds).toEqual([ticketIds[0]]);
    expect(rows[0].pmoResultCode).toBe('2');
  });

  it('refunds the rest of the group up to the paid amount', async () => {
    const { ticketIds, paymentId, amount } = await paidGroup(10);

    await refund(ticketIds[0], [ticketIds[0]]).expect(200);
    const second = await refund(ticketIds[1], [ticketIds[1]]).expect(200);
    expect(second.body.data.partial).toBe(false);
    expect(second.body.data.amount).toBe('10.0000');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.refundedAmount.toFixed(4)).toBe(amount);
    const statuses = await prisma.ticket.findMany({ where: { id: { in: ticketIds } } });
    expect(statuses.every(t => t.status === 'REFUNDED')).toBe(true);
  });

  it('does not refund a ticket that was already used for entry', async () => {
    const { ticketIds } = await paidGroup();
    await prisma.ticket.update({ where: { id: ticketIds[0] }, data: { checkedIn: true } });

    const res = await refund(ticketIds[0], [ticketIds[0]]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TICKET_ALREADY_CHECKED_IN');

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketIds[0] } });
    expect(ticket.status).toBe('CONFIRMED');
  });

  it('refuses a second refund of the same ticket', async () => {
    const { ticketIds } = await paidGroup();
    await refund(ticketIds[0], [ticketIds[0]]).expect(200);
    const again = await refund(ticketIds[0], [ticketIds[0]]);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REFUND_NOT_ALLOWED');
  });

  it('refuses a refund when the ticket was confirmed without a card payment', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const registered = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, quantity: 1 }],
      })
      .expect(201);
    const ticketId = registered.body.data.id as string;
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'CONFIRMED', confirmationSource: 'MANUAL' },
    });

    const res = await refund(ticketId, [ticketId]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REFUND_NOT_AVAILABLE');
  });

  it('hides the action from a manager', async () => {
    await seedSystemRoles(prisma);
    const manager = await seedAdminUser(prisma, {
      email: 'manager@test.local',
      password: 'manager-password',
      roleSlug: 'manager',
    });
    const { ticketIds } = await paidGroup();
    const res = await refund(ticketIds[0], [ticketIds[0]], manager.token);
    expect(res.status).toBe(403);
  });
});
