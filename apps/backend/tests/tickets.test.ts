import { execSync } from 'child_process';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { registerTicket, resetDatabase, seedVenueWithZone } from './helpers';
import { expireStaleBookings } from '../src/services/booking-expiry';
import { ErrorCodes } from '../src/errors';

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

function expectError(res: { status: number; body: { error?: { code?: string } } }, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body.error?.code).toBe(code);
}

async function seedSeatedZone(seatCount = 4) {
  const { venueId, zoneId } = await seedVenueWithZone(prisma);
  await prisma.zone.update({ where: { id: zoneId }, data: { type: 'SEATED', capacity: seatCount } });
  const seats = [];
  for (let i = 0; i < seatCount; i++) {
    seats.push(await prisma.seat.create({
      data: { zoneId, number: i + 1, row: 0, sectionIndex: 0, posInSection: i },
    }));
  }
  return { venueId, zoneId, seats };
}

async function seedTableZone(chairs = 8) {
  const { venueId, zoneId } = await seedVenueWithZone(prisma);
  await prisma.zone.update({
    where: { id: zoneId },
    data: { type: 'TABLE', capacity: chairs, tableChairs: chairs, tableShape: 'ROUND' },
  });
  const table = await prisma.zoneTable.create({
    data: { zoneId, number: 1, shape: 'ROUND', chairCount: chairs, row: 0, col: 0, rows: 4, cols: 4 },
  });
  return { venueId, zoneId, table };
}

describe('Ticket registration', () => {
  it('creates a single ticket without a groupId', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.groupId).toBeNull();
    const res = await request(app).get(`/api/tickets/${ticketId}`).expect(200);
    expect(res.body.data.ticket.id).toBe(ticketId);
    expect(res.body.data.ticket).not.toHaveProperty('phone');
    expect(res.body.data.ticket).not.toHaveProperty('email');
  });

  it('creates a group of 4 with a standalone groupId', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const res = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, quantity: 4 }],
      })
      .expect(201);

    expect(res.body.data.groupId).toBeTruthy();
    const members = await prisma.ticket.findMany({ where: { groupId: res.body.data.groupId }, orderBy: { createdAt: 'asc' } });
    expect(members).toHaveLength(4);
    expect(members.every(m => m.groupId === res.body.data.groupId)).toBe(true);
    expect(members.every(m => m.id !== res.body.data.groupId)).toBe(true);
  });

  it('keeps group QR working after deleting first, middle, and last tickets', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const created = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, quantity: 4 }],
      })
      .expect(201);

    const groupId = created.body.data.groupId as string;
    const members = await prisma.ticket.findMany({ where: { groupId }, orderBy: { createdAt: 'asc' } });
    expect(members).toHaveLength(4);

    await request(app).delete(`/api/tickets/${members[0].id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app).get(`/api/tickets/group/${groupId}`).expect(200);
    await request(app).get(`/api/tickets/${groupId}`).expect(200);

    const remaining = await prisma.ticket.findMany({ where: { groupId }, orderBy: { createdAt: 'asc' } });
    await request(app).delete(`/api/tickets/${remaining[1].id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app).get(`/api/tickets/${groupId}`).expect(200);

    const lastTwo = await prisma.ticket.findMany({ where: { groupId }, orderBy: { createdAt: 'asc' } });
    await request(app).delete(`/api/tickets/${lastTwo[lastTwo.length - 1].id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);

    const leftover = await prisma.ticket.findMany({ where: { groupId } });
    expect(leftover).toHaveLength(1);
    expect(leftover[0].groupId).toBe(groupId);
    const open = await request(app).get(`/api/tickets/${groupId}`).expect(200);
    expect(open.body.data.ticket.id).toBe(leftover[0].id);
  });

  it('rejects quantity 100000000 with 4xx before allocating a huge array', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const res = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, quantity: 100000000 }],
      });
    expectError(res, 400, ErrorCodes.INVALID_QUANTITY);
  });

  it('rejects purchase for an inactive venue', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.venue.update({ where: { id: venueId }, data: { active: false } });
    const res = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, quantity: 1 }],
      });
    expectError(res, 409, ErrorCodes.EVENT_NOT_AVAILABLE);
  });

  it('rejects purchase for a past venue', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await prisma.venue.update({ where: { id: venueId }, data: { date: new Date('2020-01-01T00:00:00Z') } });
    const res = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, quantity: 1 }],
      });
    expectError(res, 409, ErrorCodes.EVENT_NOT_AVAILABLE);
  });

  it('rejects an occupied seated seat with SEAT_ALREADY_BOOKED', async () => {
    const { venueId, zoneId, seats } = await seedSeatedZone(2);
    await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'First',
        phone: '+994501234567',
        email: 'a@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      })
      .expect(201);

    const res = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Second',
        phone: '+994501234568',
        email: 'b@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      });
    expectError(res, 409, ErrorCodes.SEAT_ALREADY_BOOKED);
  });

  it('allows rebooking a seat after the previous booking expires', async () => {
    const { venueId, zoneId, seats } = await seedSeatedZone(2);
    const created = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'First',
        phone: '+994501234567',
        email: 'a@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      })
      .expect(201);

    await prisma.ticket.update({
      where: { id: created.body.data.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00Z') },
    });
    await expireStaleBookings(prisma);

    const expired = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(expired.status).toBe('EXPIRED');
    expect(expired.seatId).toBe(seats[0].id);

    const listed = await request(app).get(`/api/zones/${zoneId}/seats`).expect(200);
    const listedSeat = listed.body.data.find((s: { id: string }) => s.id === seats[0].id);
    expect(listedSeat.occupied).toBe(false);

    await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Second',
        phone: '+994501234568',
        email: 'b@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      })
      .expect(201);

    const live = await prisma.ticket.findMany({
      where: { seatId: seats[0].id, status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
    });
    expect(live).toHaveLength(1);
  });

  it('allows rebooking a seat after the previous booking is rejected', async () => {
    const { venueId, zoneId, seats } = await seedSeatedZone(2);
    const created = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'First',
        phone: '+994501234567',
        email: 'a@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      })
      .expect(201);

    await request(app)
      .patch(`/api/tickets/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED' })
      .expect(200);

    await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Second',
        phone: '+994501234568',
        email: 'b@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      })
      .expect(201);
  });

  it('rejects table overbooking with TABLE_CAPACITY_EXCEEDED', async () => {
    const { venueId, zoneId, table } = await seedTableZone(2);
    const res = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, tableId: table.id, quantity: 3 }],
      });
    expectError(res, 409, ErrorCodes.TABLE_CAPACITY_EXCEEDED);
  });
});

describe('PATCH /api/tickets/:id/status', () => {
  it('rejects confirming an expired ticket whose seat was resold', async () => {
    const { venueId, zoneId, seats } = await seedSeatedZone(2);
    const first = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'First',
        phone: '+994501234567',
        email: 'a@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      })
      .expect(201);

    await prisma.ticket.update({
      where: { id: first.body.data.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00Z') },
    });
    await expireStaleBookings(prisma);

    await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Second',
        phone: '+994501234568',
        email: 'b@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      })
      .expect(201);

    const res = await request(app)
      .patch(`/api/tickets/${first.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' });

    expectError(res, 409, ErrorCodes.SEAT_ALREADY_BOOKED);

    const stale = await prisma.ticket.findUniqueOrThrow({ where: { id: first.body.data.id } });
    expect(stale.status).toBe('EXPIRED');
    const live = await prisma.ticket.findMany({
      where: { seatId: seats[0].id, status: { in: ['BOOKED', 'PENDING', 'CONFIRMED'] } },
    });
    expect(live).toHaveLength(1);
  });

  it('confirms an expired ticket when its seat is still free', async () => {
    const { venueId, zoneId, seats } = await seedSeatedZone(2);
    const created = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'First',
        phone: '+994501234567',
        email: 'a@example.com',
        venueId,
        items: [{ zoneId, seatIds: [seats[0].id] }],
      })
      .expect(201);

    await prisma.ticket.update({
      where: { id: created.body.data.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00Z') },
    });
    await expireStaleBookings(prisma);

    await request(app)
      .patch(`/api/tickets/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);

    const confirmed = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(confirmed.status).toBe('CONFIRMED');
  });
});

describe('Check-in', () => {
  it('checks in a confirmed ticket and rejects a double check-in', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'CONFIRMED' } });

    await request(app)
      .post(`/api/tickets/${ticketId}/checkin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const again = await request(app)
      .post(`/api/tickets/${ticketId}/checkin`)
      .set('Authorization', `Bearer ${adminToken}`);
    expectError(again, 409, ErrorCodes.TICKET_ALREADY_CHECKED_IN);
  });

  it('rejects check-in of a booked ticket', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const { ticketId } = await registerTicket(app, venueId, zoneId);
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/checkin`)
      .set('Authorization', `Bearer ${adminToken}`);
    expectError(res, 409, ErrorCodes.TICKET_NOT_CONFIRMED);
  });

  it('checks in a group by person ids', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const created = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items: [{ zoneId, quantity: 2 }],
      })
      .expect(201);
    const groupId = created.body.data.groupId as string;
    await prisma.ticket.updateMany({ where: { groupId }, data: { status: 'CONFIRMED' } });
    const members = await prisma.ticket.findMany({ where: { groupId } });

    await request(app)
      .post(`/api/tickets/group/${groupId}/checkin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personIds: members.map(m => m.id) })
      .expect(200);

    const after = await prisma.ticket.findMany({ where: { groupId } });
    expect(after.every(t => t.checkedIn)).toBe(true);

    const again = await request(app)
      .post(`/api/tickets/group/${groupId}/checkin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ personIds: members.map(m => m.id) });
    expectError(again, 409, ErrorCodes.TICKET_ALREADY_CHECKED_IN);
  });
});

describe('GET /api/venues?all=true', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/venues?all=true');
    expect(res.status).toBe(401);
  });
});
