import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDatabase, seedSuperAdmin } from './helpers';

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
  await prisma.gridTemplate.deleteMany();
});

const auth = () => ({ Authorization: `Bearer ${adminToken}` });

describe('Grid templates', () => {
  it('saves TABLE zones, stage cells, and tableChairs/tableShape without data loss', async () => {
    const payload = {
      name: 'Hall with tables',
      rows: 4,
      cols: 6,
      cells: [
        ['slot-seated', 'slot-seated', 'empty', 'stage', 'stage', 'empty'],
        ['slot-seated', 'slot-seated', 'empty', 'stage', 'stage', 'empty'],
        ['slot-table', 'slot-table', 'slot-table', 'slot-table', 'empty', 'slot-general'],
        ['slot-table', 'slot-table', 'slot-table', 'slot-table', 'empty', 'slot-general'],
      ],
      zones: [
        { slotId: 'slot-seated', name: 'Seats', color: '#059669', type: 'SEATED' },
        { slotId: 'slot-general', name: 'Standing', color: '#2563eb', type: 'GENERAL', capacity: 20 },
        { slotId: 'slot-table', name: 'Tables', color: '#d97706', type: 'TABLE', tableChairs: 8, tableShape: 'ROUND' },
      ],
    };

    const created = await request(app)
      .post('/api/grid-templates')
      .set(auth())
      .send(payload)
      .expect(201);

    const id = created.body.data.id as string;
    const loaded = await request(app)
      .get(`/api/grid-templates/${id}`)
      .set(auth())
      .expect(200);

    expect(loaded.body.data.cells).toEqual(payload.cells);
    const tableSlot = loaded.body.data.zones.find((z: { slotId: string }) => z.slotId === 'slot-table');
    expect(tableSlot.type).toBe('TABLE');
    expect(tableSlot.tableChairs).toBe(8);
    expect(tableSlot.tableShape).toBe('ROUND');
    expect(loaded.body.data.cells.flat().includes('stage')).toBe(true);
  });

  it('rejects TABLE slots without tableChairs', async () => {
    const res = await request(app)
      .post('/api/grid-templates')
      .set(auth())
      .send({
        name: 'Bad table',
        rows: 1,
        cols: 1,
        cells: [['slot-t']],
        zones: [{ slotId: 'slot-t', name: 'T', color: '#000000', type: 'TABLE', tableShape: 'ROUND' }],
      });
    expect(res.status).toBe(400);
  });
});
