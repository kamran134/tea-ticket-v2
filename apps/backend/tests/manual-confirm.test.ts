import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { registerTicket, resetDatabase, seedVenueWithZone } from './helpers';

const prisma = new PrismaClient();
let app: ReturnType<typeof createApp>['app'];
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
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

describe('Manual ticket confirmation', () => {
  it('confirms booked ticket with mandatory reason and no Payment record', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/confirm-manually`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Подарок организатора' })
      .expect(200);

    expect(res.body.data.ticket.status).toBe('CONFIRMED');
    expect(res.body.data.ticket.confirmationSource).toBe('MANUAL');
    expect(res.body.data.ticket.confirmationNote).toBe('Подарок организатора');

    const payments = await prisma.payment.count();
    expect(payments).toBe(0);
  });

  it('rejects manual confirmation without reason', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);

    await request(app)
      .post(`/api/tickets/${ticketId}/confirm-manually`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'ab' })
      .expect(400);
  });

  it('is idempotent for repeated identical manual confirmation', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);

    await request(app)
      .post(`/api/tickets/${ticketId}/confirm-manually`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Розыгрыш в Instagram' })
      .expect(200);

    const second = await request(app)
      .post(`/api/tickets/${ticketId}/confirm-manually`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Розыгрыш в Instagram' })
      .expect(200);

    expect(second.body.data.alreadyConfirmed).toBe(true);
  });
});
