import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDatabase, seedSuperAdmin, seedVenueWithZone } from './helpers';
import { tableFootprint } from '../src/services/tableFootprint';

const prisma = new PrismaClient();
let app: ReturnType<typeof createApp>['app'];
let adminToken: string;

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
  });
  process.env.ADMIN_PASSWORD_HASH = 'unused-in-tests';
  app = createApp({ prisma }).app;
});

beforeEach(async () => {
  await resetDatabase(prisma);
  adminToken = (await seedSuperAdmin(prisma)).token;
});

const fp = tableFootprint('ROUND', 4);

function paint(zoneId: string, anchors: { row: number; col: number }[]) {
  const rows = 10;
  const cols = 16;
  const cells = Array.from({ length: rows }, () => Array<string>(cols).fill('empty'));
  for (const anchor of anchors) {
    for (let r = 0; r < fp.rows; r++) {
      for (let c = 0; c < fp.cols; c++) {
        cells[anchor.row + r][anchor.col + c] = zoneId;
      }
    }
  }
  return { rows, cols, cells };
}

async function saveGrid(
  venueId: string,
  zoneId: string,
  anchors: { row: number; col: number; number?: number }[],
) {
  const layout = paint(zoneId, anchors);
  return request(app)
    .put(`/api/venues/${venueId}/grid-layout`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      ...layout,
      ...(anchors.some(a => a.number != null)
        ? {
            tableNumbers: anchors
              .filter(a => a.number != null)
              .map(a => ({ zoneId, row: a.row, col: a.col, number: a.number })),
          }
        : {}),
    });
}

describe('manual table numbers', () => {
  it('stores the venue number and renumbers chairs from it', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({
      where: { id: zoneId },
      data: { type: 'TABLE', name: 'Зал', tableChairs: 4, tableShape: 'ROUND', capacity: 4 },
    });

    const res = await saveGrid(venueId, zoneId, [{ row: 0, col: 0, number: 12 }]);
    expect(res.status).toBe(200);

    const table = await prisma.zoneTable.findFirstOrThrow({ where: { zoneId } });
    expect(table.number).toBe(12);
    const seats = await prisma.seat.findMany({ where: { tableId: table.id }, orderBy: { posInSection: 'asc' } });
    expect(seats.map(s => s.number)).toEqual([1201, 1202, 1203, 1204]);
  });

  it('swaps two table numbers without tripping the unique constraint', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({
      where: { id: zoneId },
      data: { type: 'TABLE', name: 'Зал', tableChairs: 4, tableShape: 'ROUND', capacity: 8 },
    });

    expect((await saveGrid(venueId, zoneId, [
      { row: 0, col: 0, number: 1 },
      { row: 0, col: 4, number: 2 },
    ])).status).toBe(200);

    const swapped = await saveGrid(venueId, zoneId, [
      { row: 0, col: 0, number: 2 },
      { row: 0, col: 4, number: 1 },
    ]);
    expect(swapped.status).toBe(200);

    const tables = await prisma.zoneTable.findMany({ where: { zoneId }, orderBy: { col: 'asc' } });
    expect(tables.map(t => t.number)).toEqual([2, 1]);
    const firstSeats = await prisma.seat.findMany({
      where: { tableId: tables[0].id },
      orderBy: { posInSection: 'asc' },
    });
    expect(firstSeats.map(s => s.number)).toEqual([201, 202, 203, 204]);
  });

  it('rejects a duplicate number and leaves the saved numbering in place', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({
      where: { id: zoneId },
      data: { type: 'TABLE', name: 'Зал', tableChairs: 4, tableShape: 'ROUND', capacity: 8 },
    });
    expect((await saveGrid(venueId, zoneId, [
      { row: 0, col: 0, number: 4 },
      { row: 0, col: 4, number: 9 },
    ])).status).toBe(200);

    const res = await saveGrid(venueId, zoneId, [
      { row: 0, col: 0, number: 9 },
      { row: 0, col: 4, number: 9 },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/уже используется/);

    const tables = await prisma.zoneTable.findMany({ where: { zoneId }, orderBy: { col: 'asc' } });
    expect(tables.map(t => t.number)).toEqual([4, 9]);
  });

  it('keeps an existing number when the client does not send one and continues past it', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.zone.update({
      where: { id: zoneId },
      data: { type: 'TABLE', name: 'Зал', tableChairs: 4, tableShape: 'ROUND', capacity: 8 },
    });
    expect((await saveGrid(venueId, zoneId, [{ row: 0, col: 0, number: 12 }])).status).toBe(200);

    const res = await saveGrid(venueId, zoneId, [
      { row: 0, col: 0 },
      { row: 0, col: 4 },
    ]);
    expect(res.status).toBe(200);

    const tables = await prisma.zoneTable.findMany({ where: { zoneId }, orderBy: { col: 'asc' } });
    expect(tables.map(t => t.number)).toEqual([12, 13]);
  });
});
