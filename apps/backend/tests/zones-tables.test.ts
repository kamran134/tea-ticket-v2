import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDatabase, seedVenueWithZone } from './helpers';
import { ErrorCodes } from '../src/errors';
import { tableFootprint } from '../src/services/tableFootprint';
import { syncTableSeats } from '../src/services/tableSeats';

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
  app = createApp({ prisma }).app;
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

describe('Zone table sync (B3)', () => {
  it('updates existing tables when chairCount and shape change', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({
      where: { id: zoneId },
      data: { type: 'TABLE', tableChairs: 4, tableShape: 'ROUND', capacity: 4 },
    });
    const oldFp = tableFootprint('ROUND', 4);
    const table = await prisma.zoneTable.create({
      data: {
        zoneId, number: 1, shape: 'ROUND', chairCount: 4,
        row: 0, col: 0, rows: oldFp.rows, cols: oldFp.cols,
      },
    });

    const newFp = tableFootprint('RECT', 8);
    const res = await request(app)
      .put(`/api/zones/${zoneId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableChairs: 8, tableShape: 'RECT' })
      .expect(200);

    expect(res.body.data.tableChairs).toBe(8);
    expect(res.body.data.tableShape).toBe('RECT');

    const updated = await prisma.zoneTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(updated.chairCount).toBe(8);
    expect(updated.shape).toBe('RECT');
    expect(updated.rows).toBe(newFp.rows);
    expect(updated.cols).toBe(newFp.cols);
    expect(await prisma.seat.count({ where: { tableId: table.id } })).toBe(8);

    void venueId;
  });

  it('returns 409 TABLE_CAPACITY_EXCEEDED when shrinking below sold chairs', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({
      where: { id: zoneId },
      data: { type: 'TABLE', tableChairs: 8, tableShape: 'ROUND', capacity: 8 },
    });
    const table = await prisma.zoneTable.create({
      data: { zoneId, number: 1, shape: 'ROUND', chairCount: 8, row: 0, col: 0, rows: 4, cols: 4 },
    });
    await syncTableSeats(prisma, table);
    await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, tableId: table.id, quantity: 5 }],
      })
      .expect(201);

    const res = await request(app)
      .put(`/api/zones/${zoneId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableChairs: 4, tableShape: 'ROUND' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ErrorCodes.TABLE_CAPACITY_EXCEEDED);

    const unchanged = await prisma.zoneTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(unchanged.chairCount).toBe(8);
  });
});
