import { execSync } from 'child_process';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDatabase } from './helpers';
import { QA_SEED } from '../src/services/qa-seed';

const prisma = new PrismaClient();
let app: ReturnType<typeof createApp>['app'];

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
});

describe('TEST_MODE endpoints', () => {
  it('seeds the QA event idempotently', async () => {
    const first = await request(app).post('/api/test/seed').expect(200);
    const second = await request(app).post('/api/test/seed').expect(200);
    expect(first.body.data.slug).toBe(QA_SEED.venueSlug);
    expect(second.body.data.venueId).toBe(first.body.data.venueId);

    const venues = await prisma.venue.findMany({ where: { slug: QA_SEED.venueSlug } });
    expect(venues).toHaveLength(1);
    const seats = await prisma.seat.count({ where: { zoneId: QA_SEED.seatedZoneId } });
    expect(seats).toBe(20);
    const tables = await prisma.zoneTable.findMany({ where: { zoneId: QA_SEED.tableZoneId } });
    expect(tables).toHaveLength(1);
    expect(tables[0].chairCount).toBe(8);
    const tableSeats = await prisma.seat.count({ where: { tableId: QA_SEED.tableId } });
    expect(tableSeats).toBe(8);
  });

  it('reset clears tickets and restores the QA event', async () => {
    await request(app).post('/api/test/seed').expect(200);
    await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId: QA_SEED.venueId,
        items: [{ zoneId: QA_SEED.generalZoneId, quantity: 2 }],
      })
      .expect(201);

    expect(await prisma.ticket.count()).toBe(2);
    await request(app).post('/api/test/reset').expect(200);
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.venue.findUnique({ where: { slug: QA_SEED.venueSlug } })).toBeTruthy();
  });

  it('returns 404 when TEST_MODE is off', async () => {
    const prev = process.env.TEST_MODE;
    process.env.TEST_MODE = 'false';
    const res = await request(app).post('/api/test/seed');
    process.env.TEST_MODE = prev;
    expect(res.status).toBe(404);
  });
});

afterEach(() => {
  process.env.TEST_MODE = 'true';
});
