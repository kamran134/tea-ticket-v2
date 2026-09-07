import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { ErrorCodes } from '../src/errors';
import {
  registerTicket,
  resetDatabase,
  seedAdminUser,
  seedSuperAdmin,
  seedSystemRoles,
  TEST_ADMIN_PASSWORD,
} from './helpers';

const prisma = new PrismaClient();
let app: ReturnType<typeof createApp>['app'];

beforeAll(async () => {
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

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function expectError(res: { status: number; body: { error?: { code?: string } } }, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body.error?.code).toBe(code);
}

async function createVenue(token: string, name: string) {
  const res = await request(app)
    .post('/api/venues')
    .set(auth(token))
    .send({ name, date: '2026-12-01T19:00:00.000Z' })
    .expect(201);
  return res.body.data as { id: string; name: string; createdById: string };
}

describe('Venue ownership', () => {
  it('lets a Manager see only their own events; Super Admin sees all', async () => {
    await seedSystemRoles(prisma);
    const managerA = await seedAdminUser(prisma, {
      email: 'a@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'manager',
      name: 'Manager A',
    });
    const managerB = await seedAdminUser(prisma, {
      email: 'b@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'manager',
      name: 'Manager B',
    });
    const superAdmin = await seedSuperAdmin(prisma);

    const venueA = await createVenue(managerA.token, 'Event A');
    const venueB = await createVenue(managerB.token, 'Event B');
    expect(venueA.createdById).toBe(managerA.id);
    expect(venueB.createdById).toBe(managerB.id);

    const listA = await request(app).get('/api/venues?all=true').set(auth(managerA.token)).expect(200);
    expect(listA.body.data.map((v: { id: string }) => v.id)).toEqual([venueA.id]);

    const listB = await request(app).get('/api/venues?all=true').set(auth(managerB.token)).expect(200);
    expect(listB.body.data.map((v: { id: string }) => v.id)).toEqual([venueB.id]);

    const listAll = await request(app).get('/api/venues?all=true').set(auth(superAdmin.token)).expect(200);
    expect(listAll.body.data.map((v: { id: string }) => v.id).sort()).toEqual([venueA.id, venueB.id].sort());

    const publicList = await request(app).get('/api/venues').expect(200);
    expect(publicList.body.data.map((v: { id: string }) => v.id).sort()).toEqual([venueA.id, venueB.id].sort());
  });

  it('returns 403 when a Manager patches someone else\'s event', async () => {
    await seedSystemRoles(prisma);
    const managerA = await seedAdminUser(prisma, {
      email: 'a@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'manager',
    });
    const managerB = await seedAdminUser(prisma, {
      email: 'b@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'manager',
    });
    const superAdmin = await seedSuperAdmin(prisma);

    const venueA = await createVenue(managerA.token, 'Event A');

    const denied = await request(app)
      .patch(`/api/venues/${venueA.id}`)
      .set(auth(managerB.token))
      .send({ name: 'Hijacked' });
    expectError(denied, 403, ErrorCodes.FORBIDDEN);

    await request(app)
      .patch(`/api/venues/${venueA.id}`)
      .set(auth(managerA.token))
      .send({ name: 'Event A renamed' })
      .expect(200);

    const asSuper = await request(app)
      .patch(`/api/venues/${venueA.id}`)
      .set(auth(superAdmin.token))
      .send({ name: 'Owned by Super' })
      .expect(200);
    expect(asSuper.body.data.name).toBe('Owned by Super');
  });

  it('scopes tickets list and checkin to the event owner', async () => {
    await seedSystemRoles(prisma);
    const managerA = await seedAdminUser(prisma, {
      email: 'a@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'manager',
    });
    const managerB = await seedAdminUser(prisma, {
      email: 'b@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'manager',
    });
    const superAdmin = await seedSuperAdmin(prisma);

    const venueA = await createVenue(managerA.token, 'Event A');
    const zone = await request(app)
      .post('/api/zones')
      .set(auth(managerA.token))
      .send({ venueId: venueA.id, name: 'Hall', price: 25, capacity: 10 })
      .expect(201);
    const { ticketId } = await registerTicket(app, venueA.id, zone.body.data.id);

    const listB = await request(app).get('/api/tickets').set(auth(managerB.token)).expect(200);
    expect(listB.body.data).toEqual([]);

    const filtered = await request(app)
      .get(`/api/tickets?venueId=${venueA.id}`)
      .set(auth(managerB.token));
    expectError(filtered, 403, ErrorCodes.FORBIDDEN);

    const listA = await request(app).get('/api/tickets').set(auth(managerA.token)).expect(200);
    expect(listA.body.data.map((t: { id: string }) => t.id)).toEqual([ticketId]);

    const listAll = await request(app).get('/api/tickets').set(auth(superAdmin.token)).expect(200);
    expect(listAll.body.data.map((t: { id: string }) => t.id)).toEqual([ticketId]);

    const checkinDenied = await request(app)
      .post(`/api/tickets/${ticketId}/checkin`)
      .set(auth(managerB.token));
    expectError(checkinDenied, 403, ErrorCodes.FORBIDDEN);

    const zoneDenied = await request(app)
      .post('/api/zones')
      .set(auth(managerB.token))
      .send({ venueId: venueA.id, name: 'Intruder', price: 10, capacity: 5 });
    expectError(zoneDenied, 403, ErrorCodes.FORBIDDEN);
  });

  it('treats an event with no owner as Super Admin-only', async () => {
    await seedSystemRoles(prisma);
    const manager = await seedAdminUser(prisma, {
      email: 'a@test.local',
      password: TEST_ADMIN_PASSWORD,
      roleSlug: 'manager',
    });
    const superAdmin = await seedSuperAdmin(prisma);

    const orphan = await prisma.venue.create({
      data: {
        name: 'Orphan',
        slug: 'orphan-event',
        date: new Date('2026-12-01T19:00:00Z'),
        active: true,
      },
    });

    const listManager = await request(app).get('/api/venues?all=true').set(auth(manager.token)).expect(200);
    expect(listManager.body.data).toEqual([]);

    const listSuper = await request(app).get('/api/venues?all=true').set(auth(superAdmin.token)).expect(200);
    expect(listSuper.body.data.map((v: { id: string }) => v.id)).toEqual([orphan.id]);

    const denied = await request(app)
      .patch(`/api/venues/${orphan.id}`)
      .set(auth(manager.token))
      .send({ name: 'Claimed' });
    expectError(denied, 403, ErrorCodes.FORBIDDEN);

    await request(app)
      .patch(`/api/venues/${orphan.id}`)
      .set(auth(superAdmin.token))
      .send({ name: 'Adopted' })
      .expect(200);
  });
});
