import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  REGISTER_RATE_MAX_REQUESTS,
  REGISTER_RATE_MAX_SEATS,
  registerRateLimit,
  requestedSeatCount,
  resetRegisterRateLimit,
} from '../src/middleware/register-rate-limit';
import { ErrorCodes } from '../src/errors';

function testApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/api/tickets/register', registerRateLimit, (req, res) => {
    const status = Number(req.header('x-test-status') ?? 201);
    res.status(status).json({ success: status === 201 });
  });
  return app;
}

function cart(seats: number) {
  return { items: [{ quantity: seats }] };
}

describe('requestedSeatCount', () => {
  it('counts seat ids and quantities, and caps a single body at one order', () => {
    expect(requestedSeatCount({ items: [{ seatIds: ['a', 'b'] }, { quantity: 3 }] })).toBe(5);
    expect(requestedSeatCount({ items: [{ quantity: 10_000 }] })).toBe(REGISTER_RATE_MAX_SEATS);
    expect(requestedSeatCount({})).toBe(1);
  });
});

describe('POST /api/tickets/register rate limit', () => {
  beforeEach(() => {
    resetRegisterRateLimit();
    process.env.TEST_MODE = 'false';
  });

  afterAll(() => {
    process.env.TEST_MODE = 'true';
  });

  it('does not apply while the test suite is in TEST_MODE', async () => {
    process.env.TEST_MODE = 'true';
    const app = testApp();
    for (let i = 0; i < REGISTER_RATE_MAX_REQUESTS + 5; i++) {
      await request(app).post('/api/tickets/register').send(cart(REGISTER_RATE_MAX_SEATS)).expect(201);
    }
  });

  it('blocks a second full order from the same IP inside the window', async () => {
    const app = testApp();
    await request(app)
      .post('/api/tickets/register')
      .set('X-Forwarded-For', '203.0.113.10')
      .send(cart(REGISTER_RATE_MAX_SEATS))
      .expect(201);

    const blocked = await request(app)
      .post('/api/tickets/register')
      .set('X-Forwarded-For', '203.0.113.10')
      .send(cart(1));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe(ErrorCodes.RATE_LIMITED);

    await request(app)
      .post('/api/tickets/register')
      .set('X-Forwarded-For', '203.0.113.11')
      .send(cart(1))
      .expect(201);
  });

  it('returns the seat budget when the booking itself fails', async () => {
    const app = testApp();
    await request(app)
      .post('/api/tickets/register')
      .set('X-Forwarded-For', '203.0.113.20')
      .set('x-test-status', '409')
      .send(cart(REGISTER_RATE_MAX_SEATS))
      .expect(409);

    await request(app)
      .post('/api/tickets/register')
      .set('X-Forwarded-For', '203.0.113.20')
      .send(cart(REGISTER_RATE_MAX_SEATS))
      .expect(201);
  });

  it('stops a request flood even when each call books a single seat', async () => {
    const app = testApp();
    for (let i = 0; i < REGISTER_RATE_MAX_REQUESTS; i++) {
      await request(app)
        .post('/api/tickets/register')
        .set('X-Forwarded-For', '203.0.113.30')
        .send(cart(1))
        .expect(201);
    }
    const blocked = await request(app)
      .post('/api/tickets/register')
      .set('X-Forwarded-For', '203.0.113.30')
      .send(cart(1));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe(ErrorCodes.RATE_LIMITED);
  });
});
