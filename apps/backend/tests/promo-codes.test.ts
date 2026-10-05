import { execSync } from 'child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { ErrorCodes } from '../src/errors';
import { resetDatabase, seedAdminUser, seedSuperAdmin, seedVenueWithZone } from './helpers';

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

function auth() {
  return { Authorization: `Bearer ${adminToken}` };
}

function expectError(res: { status: number; body: { error?: { code?: string } } }, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body.error?.code).toBe(code);
}

async function createPromo(venueId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/promo-codes')
    .set(auth())
    .send({
      venueId,
      code: 'TEA10',
      type: 'PERCENT',
      value: 10,
      ...overrides,
    });
  return res;
}

describe('promo codes', () => {
  it('quotes a percent discount and stores the payable price on each ticket', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const created = await createPromo(venueId);
    expect(created.status).toBe(201);

    const items = [{ zoneId, quantity: 2 }];
    const quote = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId, code: 'tea10', items })
      .expect(200);
    expect(quote.body.data).toMatchObject({ code: 'TEA10', subtotal: 50, discount: 5, total: 45 });

    const registered = await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId,
        items,
        promoCode: 'tea10',
      })
      .expect(201);
    expect(registered.body.data.totalPrice).toBe(45);
    expect(registered.body.data.discount).toBe(5);
    expect(registered.body.data.promoCode).toBe('TEA10');

    const tickets = await prisma.ticket.findMany({ where: { venueId }, orderBy: { createdAt: 'asc' } });
    expect(tickets).toHaveLength(2);
    expect(tickets.map(ticket => ticket.price)).toEqual([22.5, 22.5]);
    expect(tickets.every(ticket => ticket.listPrice === 25 && ticket.discountAmount === 2.5)).toBe(true);
    expect(tickets.every(ticket => ticket.promoCode === 'TEA10')).toBe(true);

    const listed = await request(app).get(`/api/promo-codes?venueId=${venueId}`).set(auth()).expect(200);
    expect(listed.body.data[0].usedCount).toBe(1);
  });

  it('frees a use when the booking is rejected and blocks a code that is used up', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await createPromo(venueId, { code: 'ONCE', maxUses: 1 });
    const buyer = {
      name: 'Buyer',
      phone: '+994501234567',
      email: 'buyer@example.com',
      venueId,
      items: [{ zoneId, quantity: 1 }],
      promoCode: 'ONCE',
    };

    const first = await request(app).post('/api/tickets/register').send(buyer).expect(201);
    const blocked = await request(app).post('/api/tickets/register').send({ ...buyer, email: 'other@example.com' });
    expectError(blocked, 400, ErrorCodes.PROMO_EXHAUSTED);

    await request(app)
      .patch(`/api/tickets/${first.body.data.id}/status`)
      .set(auth())
      .send({ status: 'REJECTED' })
      .expect(200);

    await request(app).post('/api/tickets/register').send({ ...buyer, email: 'third@example.com' }).expect(201);
  });

  it('frees a promo after an unpaid hold expires and keeps it after confirmation', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    await createPromo(venueId, { code: 'HOLD', maxUses: 1 });
    const buyer = {
      name: 'Buyer',
      phone: '+994501234567',
      email: 'buyer@example.com',
      venueId,
      items: [{ zoneId, quantity: 1 }],
      promoCode: 'HOLD',
    };

    const booked = await request(app).post('/api/tickets/register').send(buyer).expect(201);
    const held = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId, code: 'HOLD', items: [{ zoneId, quantity: 1 }] });
    expectError(held, 400, ErrorCodes.PROMO_EXHAUSTED);

    await prisma.ticket.updateMany({
      where: { id: booked.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const released = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId, code: 'HOLD', items: [{ zoneId, quantity: 1 }] })
      .expect(200);
    expect(released.body.data.code).toBe('HOLD');

    const listed = await request(app).get(`/api/promo-codes?venueId=${venueId}`).set(auth()).expect(200);
    expect(listed.body.data[0].usedCount).toBe(0);

    const again = await request(app).post('/api/tickets/register').send({
      ...buyer,
      email: 'second@example.com',
    }).expect(201);

    await request(app)
      .patch(`/api/tickets/${again.body.data.id}/status`)
      .set(auth())
      .send({ status: 'CONFIRMED' })
      .expect(200);
    await prisma.ticket.updateMany({
      where: { id: again.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const kept = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId, code: 'HOLD', items: [{ zoneId, quantity: 1 }] });
    expectError(kept, 400, ErrorCodes.PROMO_EXHAUSTED);
  });

  it('caps a fixed discount at the cart total and rejects a code from another event', async () => {
    const { venueId, zoneId } = await seedVenueWithZone(prisma);
    const other = await seedVenueWithZone(prisma);
    await createPromo(venueId, { code: 'GIFT', type: 'FIXED', value: 100 });
    await createPromo(other.venueId, { code: 'OTHER', type: 'PERCENT', value: 50 });

    const quote = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId, code: 'GIFT', items: [{ zoneId, quantity: 1 }] })
      .expect(200);
    expect(quote.body.data).toMatchObject({ subtotal: 25, discount: 25, total: 0 });

    const foreign = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId, code: 'OTHER', items: [{ zoneId, quantity: 1 }] });
    expectError(foreign, 400, ErrorCodes.PROMO_INVALID);
  });

  it('hides promo management of someone else\'s event', async () => {
    const { venueId } = await seedVenueWithZone(prisma);
    const manager = await seedAdminUser(prisma, {
      email: 'manager@test.local',
      password: 'secret',
      roleSlug: 'manager',
    });
    const res = await request(app)
      .post('/api/promo-codes')
      .set('Authorization', `Bearer ${manager.token}`)
      .send({ venueId, code: 'NOPE', type: 'PERCENT', value: 10 });
    expectError(res, 403, ErrorCodes.FORBIDDEN);
  });

  it('applies a global code on every event and lets a venue code win', async () => {
    const first = await seedVenueWithZone(prisma);
    const second = await seedVenueWithZone(prisma);
    const created = await request(app)
      .post('/api/promo-codes')
      .set(auth())
      .send({ venueId: null, code: 'ALL20', type: 'PERCENT', value: 20 })
      .expect(201);
    expect(created.body.data.venueId).toBeNull();

    const listed = await request(app).get('/api/promo-codes?scope=global').set(auth()).expect(200);
    expect(listed.body.data.map((row: { code: string }) => row.code)).toEqual(['ALL20']);

    const onFirst = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId: first.venueId, code: 'all20', items: [{ zoneId: first.zoneId, quantity: 1 }] })
      .expect(200);
    expect(onFirst.body.data).toMatchObject({ code: 'ALL20', subtotal: 25, discount: 5, total: 20 });

    await createPromo(second.venueId, { code: 'ALL20', type: 'PERCENT', value: 50 });
    const shadowed = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId: second.venueId, code: 'ALL20', items: [{ zoneId: second.zoneId, quantity: 1 }] })
      .expect(200);
    expect(shadowed.body.data).toMatchObject({ discount: 12.5, total: 12.5 });

    const duplicate = await request(app)
      .post('/api/promo-codes')
      .set(auth())
      .send({ venueId: null, code: 'ALL20', type: 'PERCENT', value: 5 });
    expectError(duplicate, 409, ErrorCodes.CONFLICT);
  });

  it('counts a global code use across events', async () => {
    const first = await seedVenueWithZone(prisma);
    const second = await seedVenueWithZone(prisma);
    await request(app)
      .post('/api/promo-codes')
      .set(auth())
      .send({ venueId: null, code: 'ONCE', type: 'FIXED', value: 5, maxUses: 1 })
      .expect(201);

    await request(app)
      .post('/api/tickets/register')
      .send({
        name: 'Buyer',
        phone: '+994501234567',
        email: 'buyer@example.com',
        venueId: first.venueId,
        items: [{ zoneId: first.zoneId, quantity: 1 }],
        promoCode: 'ONCE',
      })
      .expect(201);

    const blocked = await request(app)
      .post('/api/promo-codes/quote')
      .send({ venueId: second.venueId, code: 'ONCE', items: [{ zoneId: second.zoneId, quantity: 1 }] });
    expectError(blocked, 400, ErrorCodes.PROMO_EXHAUSTED);
  });

  it('refuses a manager to create or list global codes', async () => {
    const manager = await seedAdminUser(prisma, {
      email: 'manager@test.local',
      password: 'secret',
      roleSlug: 'manager',
    });
    const headers = { Authorization: `Bearer ${manager.token}` };
    const created = await request(app)
      .post('/api/promo-codes')
      .set(headers)
      .send({ venueId: null, code: 'ALL10', type: 'PERCENT', value: 10 });
    expectError(created, 403, ErrorCodes.FORBIDDEN);

    const listed = await request(app).get('/api/promo-codes?scope=global').set(headers);
    expectError(listed, 403, ErrorCodes.FORBIDDEN);
  });
});
