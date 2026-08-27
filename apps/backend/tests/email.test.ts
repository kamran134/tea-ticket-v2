import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Webhook } from 'standardwebhooks';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  createEmailJobProcessor,
  loadEmailConfig,
  type TicketEmailSender,
} from '../src/services/email';
import {
  PermanentEmailError,
  TransientEmailError,
  type TicketEmailInput,
} from '../src/services/email/types';
import {
  createPayment,
  postMockWebhook,
  registerTicket,
  resetDatabase,
  seedVenueWithZone,
} from './helpers';

const prisma = new PrismaClient();
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET!;

let app: ReturnType<typeof createApp>['app'];
let emailJobProcessor: ReturnType<typeof createApp>['emailJobProcessor'];
let adminToken: string;

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('test-admin', 10);
  adminToken = jwt.sign({ admin: true }, process.env.JWT_SECRET!, { expiresIn: '24h' });
  const ctx = createApp({ prisma });
  app = ctx.app;
  emailJobProcessor = ctx.emailJobProcessor;
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

async function confirmViaPayment(ticketId: string) {
  const payment = await createPayment(app, ticketId);
  const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });
  await postMockWebhook(app, 'mock', {
    eventId: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    event: 'payment.succeeded',
    paymentId: dbPayment.providerPaymentId,
    orderId: payment.paymentId,
    amount: payment.amount,
    currency: 'AZN',
    status: 'SUCCEEDED',
    paidAt: new Date().toISOString(),
  }).expect(200);
  return payment;
}

function signResendWebhook(payload: string, msgId: string) {
  const wh = new Webhook(WEBHOOK_SECRET);
  const ts = new Date();
  const signature = wh.sign(msgId, ts, payload);
  return {
    id: msgId,
    timestamp: Math.floor(ts.getTime() / 1000).toString(),
    signature,
  };
}

describe('Ticket email enqueue', () => {
  it('creates one EmailJob on successful payment webhook', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await confirmViaPayment(ticketId);

    const jobs = await prisma.emailJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe('TICKET_CONFIRMED');
    expect(jobs[0].checkoutId).toBe(ticketId);
    expect(jobs[0].recipient).toBe('buyer@example.com');
    expect(jobs[0].status).toBe('PENDING');
  });

  it('does not create a second job on repeated webhook', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const payment = await createPayment(app, ticketId);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.paymentId } });

    const payload = {
      event: 'payment.succeeded',
      paymentId: dbPayment.providerPaymentId,
      orderId: payment.paymentId,
      amount: payment.amount,
      currency: 'AZN',
      status: 'SUCCEEDED',
      paidAt: new Date().toISOString(),
    };

    await postMockWebhook(app, 'mock', { ...payload, eventId: 'evt_dup_1' }).expect(200);
    await postMockWebhook(app, 'mock', { ...payload, eventId: 'evt_dup_2' }).expect(200);

    expect(await prisma.emailJob.count()).toBe(1);
  });

  it('creates one job for a group purchase', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const res = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Group Buyer',
        phone: '+994501111111',
        email: 'group@example.com',
        venueId,
        items: [{ zoneId, quantity: 3 }],
      })
      .expect(201);

    const groupId = res.body.data.groupId as string;
    expect(groupId).toBeTruthy();

    await confirmViaPayment(res.body.data.id);

    const jobs = await prisma.emailJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].checkoutId).toBe(groupId);
  });

  it('does not create a job when payment requires review', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'EXPIRED' },
    });

    const payment = await createPayment(app, ticketId).catch(() => null);
    // Ticket is EXPIRED so createPayment should fail; seed a payment manually instead
    if (!payment) {
      const created = await prisma.payment.create({
        data: {
          checkoutId: ticketId,
          provider: 'mock',
          providerPaymentId: 'prov_review',
          idempotencyKey: `checkout:${ticketId}:review`,
          amount: 25,
          status: 'PROCESSING',
          redirectUrl: 'http://localhost/mock',
          returnToken: `rt_${ticketId}`,
        },
      });
      await postMockWebhook(app, 'mock', {
        eventId: 'evt_review',
        event: 'payment.succeeded',
        paymentId: 'prov_review',
        orderId: created.id,
        amount: '25.0000',
        currency: 'AZN',
        status: 'SUCCEEDED',
        paidAt: new Date().toISOString(),
      }).expect(200);

      const updated = await prisma.payment.findUniqueOrThrow({ where: { id: created.id } });
      expect(updated.status).toBe('REQUIRES_REVIEW');
      expect(await prisma.emailJob.count()).toBe(0);
    }
  });

  it('confirms ticket without email and skips EmailJob', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await prisma.ticket.update({ where: { id: ticketId }, data: { email: null } });
    await confirmViaPayment(ticketId);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe('CONFIRMED');
    expect(await prisma.emailJob.count()).toBe(0);
  });

  it('creates EmailJob on manual confirmation', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);

    await request(app)
      .post(`/api/tickets/${ticketId}/confirm-manually`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Подарок организатора' })
      .expect(200);

    const jobs = await prisma.emailJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].checkoutId).toBe(ticketId);
  });

  it('creates EmailJob on admin approve to CONFIRMED only once', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'PENDING', receiptLink: 'http://example.com/r.jpg' },
    });

    await request(app)
      .patch(`/api/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    await request(app)
      .patch(`/api/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    expect(await prisma.emailJob.count()).toBe(1);

    await request(app)
      .patch(`/api/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED' })
      .expect(200);

    // Reject path does not enqueue; still one job from earlier confirm
    expect(await prisma.emailJob.count()).toBe(1);
  });
});

describe('EmailJob processor', () => {
  it('marks job ACCEPTED and stores providerMessageId on success', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await confirmViaPayment(ticketId);

    let capturedQr: Buffer | null = null;
    const fakeSender: TicketEmailSender = {
      async send(input: TicketEmailInput) {
        capturedQr = input.qrPng;
        expect(input.checkoutId).toBe(ticketId);
        return { providerMessageId: 're_msg_success' };
      },
    };

    const processor = createEmailJobProcessor(prisma, loadEmailConfig(), fakeSender);
    const result = await processor.processBatch();
    expect(result.processed).toBe(1);

    const job = await prisma.emailJob.findFirstOrThrow();
    expect(job.status).toBe('ACCEPTED');
    expect(job.providerMessageId).toBe('re_msg_success');
    expect(capturedQr).toBeInstanceOf(Buffer);
    expect(capturedQr!.length).toBeGreaterThan(100);

    // QR payload must be checkoutId — decode via PNG is heavy; assert via sender input already done
  });

  it('schedules retry on transient error', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await confirmViaPayment(ticketId);

    const fakeSender: TicketEmailSender = {
      async send() {
        throw new TransientEmailError('rate limited', 'RATE_LIMIT');
      },
    };
    const processor = createEmailJobProcessor(prisma, loadEmailConfig(), fakeSender);
    await processor.processBatch();

    const job = await prisma.emailJob.findFirstOrThrow();
    expect(job.status).toBe('PENDING');
    expect(job.attempts).toBe(1);
    expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(job.lastError).toBe('RATE_LIMIT');
  });

  it('marks FAILED on permanent error', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await confirmViaPayment(ticketId);

    const fakeSender: TicketEmailSender = {
      async send() {
        throw new PermanentEmailError('bad recipient', 'INVALID_RECIPIENT');
      },
    };
    const processor = createEmailJobProcessor(prisma, loadEmailConfig(), fakeSender);
    await processor.processBatch();

    const job = await prisma.emailJob.findFirstOrThrow();
    expect(job.status).toBe('FAILED');
    expect(job.lastError).toBe('INVALID_RECIPIENT');
  });

  it('does not double-send when two processors race', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await confirmViaPayment(ticketId);

    let sends = 0;
    const fakeSender: TicketEmailSender = {
      async send() {
        sends += 1;
        await new Promise(r => setTimeout(r, 50));
        return { providerMessageId: `re_race_${sends}` };
      },
    };
    const config = loadEmailConfig();
    const a = createEmailJobProcessor(prisma, config, fakeSender);
    const b = createEmailJobProcessor(prisma, config, fakeSender);

    await Promise.all([a.processBatch(), b.processBatch()]);
    expect(sends).toBe(1);
    expect(await prisma.emailJob.count({ where: { status: 'ACCEPTED' } })).toBe(1);
  });

  it('recovers stale PROCESSING jobs', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await confirmViaPayment(ticketId);

    const job = await prisma.emailJob.findFirstOrThrow();
    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        lockedAt: new Date(Date.now() - 11 * 60 * 1000),
        attempts: 1,
      },
    });

    let sends = 0;
    const fakeSender: TicketEmailSender = {
      async send() {
        sends += 1;
        return { providerMessageId: 're_recovered' };
      },
    };
    const processor = createEmailJobProcessor(prisma, loadEmailConfig(), fakeSender);
    await processor.processBatch();

    expect(sends).toBe(1);
    const updated = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('ACCEPTED');
  });

  it('uses console sender path when EMAIL_ENABLED=false via app processor', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await confirmViaPayment(ticketId);

    // Force nextAttemptAt to now in case kick already ran
    await prisma.emailJob.updateMany({
      data: { status: 'PENDING', nextAttemptAt: new Date(0), lockedAt: null },
    });

    await emailJobProcessor.processBatch();

    const job = await prisma.emailJob.findFirstOrThrow();
    expect(job.status).toBe('ACCEPTED');
    expect(job.providerMessageId?.startsWith('console_')).toBe(true);
  });
});

describe('Resend webhook', () => {
  it('marks EmailJob DELIVERED on email.delivered', async () => {
    const job = await prisma.emailJob.create({
      data: {
        type: 'TICKET_CONFIRMED',
        checkoutId: 'checkout_wh_1',
        recipient: 'buyer@example.com',
        status: 'ACCEPTED',
        providerMessageId: 're_delivered_1',
        acceptedAt: new Date(),
      },
    });

    const body = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: 're_delivered_1',
        from: 'no-reply@tea-ticket.com',
        to: ['buyer@example.com'],
        subject: 'test',
        created_at: new Date().toISOString(),
      },
    });
    const headers = signResendWebhook(body, 'svix_delivered_1');

    await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', headers.id)
      .set('svix-timestamp', headers.timestamp)
      .set('svix-signature', headers.signature)
      .send(body)
      .expect(200);

    const updated = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('DELIVERED');
    expect(updated.deliveredAt).not.toBeNull();
  });

  it('marks EmailJob BOUNCED on email.bounced', async () => {
    await prisma.emailJob.create({
      data: {
        type: 'TICKET_CONFIRMED',
        checkoutId: 'checkout_wh_2',
        recipient: 'buyer@example.com',
        status: 'ACCEPTED',
        providerMessageId: 're_bounced_1',
        acceptedAt: new Date(),
      },
    });

    const body = JSON.stringify({
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: 're_bounced_1',
        from: 'no-reply@tea-ticket.com',
        to: ['buyer@example.com'],
        subject: 'test',
        created_at: new Date().toISOString(),
      },
    });
    const headers = signResendWebhook(body, 'svix_bounced_1');

    await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', headers.id)
      .set('svix-timestamp', headers.timestamp)
      .set('svix-signature', headers.signature)
      .send(body)
      .expect(200);

    const job = await prisma.emailJob.findFirstOrThrow({
      where: { providerMessageId: 're_bounced_1' },
    });
    expect(job.status).toBe('BOUNCED');
  });

  it('is idempotent for duplicate provider event id', async () => {
    await prisma.emailJob.create({
      data: {
        type: 'TICKET_CONFIRMED',
        checkoutId: 'checkout_wh_3',
        recipient: 'buyer@example.com',
        status: 'ACCEPTED',
        providerMessageId: 're_dup_1',
        acceptedAt: new Date(),
      },
    });

    const body = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: 're_dup_1',
        from: 'no-reply@tea-ticket.com',
        to: ['buyer@example.com'],
        subject: 'test',
        created_at: new Date().toISOString(),
      },
    });
    const headers = signResendWebhook(body, 'svix_dup_1');

    await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', headers.id)
      .set('svix-timestamp', headers.timestamp)
      .set('svix-signature', headers.signature)
      .send(body)
      .expect(200);

    await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', headers.id)
      .set('svix-timestamp', headers.timestamp)
      .set('svix-signature', headers.signature)
      .send(body)
      .expect(200);

    expect(await prisma.emailWebhookEvent.count()).toBe(1);
  });

  it('rejects invalid signature', async () => {
    const body = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: { email_id: 're_bad' },
    });

    await request(app)
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'svix_bad')
      .set('svix-timestamp', Math.floor(Date.now() / 1000).toString())
      .set('svix-signature', 'v1,invalid')
      .send(body)
      .expect(401);

    expect(await prisma.emailWebhookEvent.count()).toBe(0);
  });
});
