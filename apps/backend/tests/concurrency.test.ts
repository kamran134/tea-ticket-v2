import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDatabase, seedVenueWithZone } from './helpers';
import { ErrorCodes } from '../src/errors';

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

describe('Concurrent registration', () => {
  it('does not overbook a GENERAL zone of capacity 10', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({ where: { id: zoneId }, data: { capacity: 10 } });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post('/api/tickets/register')
          .send({
            name: `Buyer ${i}`,
            phone: '+994501234567',
            email: `buyer${i}@example.com`,
            venueId,
            items: [{ zoneId, quantity: 1 }],
          }),
      ),
    );

    const successes = results.filter(r => r.status === 201);
    const rejected = results.filter(r => r.status === 409);
    expect(successes).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    expect(rejected.every(r => r.body.error.code === ErrorCodes.ZONE_CAPACITY_EXCEEDED)).toBe(true);

    const booked = await prisma.ticket.count({
      where: { zoneId, status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
    });
    expect(booked).toBe(10);
  });

  it('does not overbook a TABLE of 8 chairs', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({
      where: { id: zoneId },
      data: { type: 'TABLE', capacity: 8, tableChairs: 8, tableShape: 'ROUND' },
    });
    const table = await prisma.zoneTable.create({
      data: { zoneId, number: 1, shape: 'ROUND', chairCount: 8, row: 0, col: 0, rows: 4, cols: 4 },
    });

    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        request(app)
          .post('/api/tickets/register')
          .send({
            name: `Buyer ${i}`,
            phone: '+994501234567',
            email: `t${i}@example.com`,
            venueId,
            items: [{ zoneId, tableId: table.id, quantity: 1 }],
          }),
      ),
    );

    const successes = results.filter(r => r.status === 201);
    const rejected = results.filter(r => r.status === 409);
    expect(successes).toHaveLength(8);
    expect(rejected).toHaveLength(8);
    expect(rejected.every(r => r.body.error.code === ErrorCodes.TABLE_CAPACITY_EXCEEDED)).toBe(true);

    const booked = await prisma.ticket.count({
      where: { tableId: table.id, status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
    });
    expect(booked).toBe(8);
  });
});
