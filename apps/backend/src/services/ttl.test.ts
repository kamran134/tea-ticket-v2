import { afterEach, describe, expect, it } from 'vitest';
import { getBookingTtlSeconds, getPaymentTtlSeconds } from './ttl';

describe('TTL config', () => {
  const keys = ['BOOKING_TTL_SECONDS', 'PAYMENT_TTL_SECONDS', 'PAYMENT_HOLD_SECONDS', 'PAYMENT_HOLD_MINUTES'];
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('defaults to 900 seconds', () => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    expect(getBookingTtlSeconds()).toBe(900);
    expect(getPaymentTtlSeconds()).toBe(900);
  });

  it('reads BOOKING_TTL_SECONDS and PAYMENT_TTL_SECONDS independently', () => {
    for (const key of keys) saved[key] = process.env[key];
    process.env.BOOKING_TTL_SECONDS = '30';
    process.env.PAYMENT_TTL_SECONDS = '45';
    delete process.env.PAYMENT_HOLD_SECONDS;
    delete process.env.PAYMENT_HOLD_MINUTES;
    expect(getBookingTtlSeconds()).toBe(30);
    expect(getPaymentTtlSeconds()).toBe(45);
  });
});
