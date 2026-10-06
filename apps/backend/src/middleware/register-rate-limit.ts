import type { NextFunction, Request, Response } from 'express';
import { ErrorCodes, fail, isTestMode } from '../errors';
import { MAX_SLOTS_PER_ORDER } from '../services/cart-plan';

/**
 * A booking hold lasts 15 minutes, and one register call can take 50 seats.
 * The window is longer than the hold and the seat budget is one full order,
 * so a script cannot refresh a sold-out hall from the same IP.
 */
export const REGISTER_RATE_WINDOW_MS = 60 * 60 * 1000;
export const REGISTER_RATE_MAX_REQUESTS = 20;
export const REGISTER_RATE_MAX_SEATS = MAX_SLOTS_PER_ORDER;

type Bucket = { windowStart: number; requests: number; seats: number };

const buckets = new Map<string, Bucket>();

export function resetRegisterRateLimit(): void {
  buckets.clear();
}

/** How many seats this body would try to hold. Capped so one huge quantity cannot poison the bucket. */
export function requestedSeatCount(body: unknown): number {
  if (!body || typeof body !== 'object') return 1;
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return 1;

  let seats = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      seats += 1;
    } else {
      const record = item as { seatIds?: unknown; quantity?: unknown };
      if (Array.isArray(record.seatIds) && record.seatIds.length > 0) {
        seats += record.seatIds.length;
      } else if (typeof record.quantity === 'number' && Number.isFinite(record.quantity) && record.quantity > 0) {
        seats += Math.floor(record.quantity);
      } else {
        seats += 1;
      }
    }
    if (seats >= REGISTER_RATE_MAX_SEATS) return REGISTER_RATE_MAX_SEATS;
  }
  return Math.max(1, seats);
}

function freshBucket(now: number, ip: string): Bucket {
  const bucket: Bucket = { windowStart: now, requests: 0, seats: 0 };
  buckets.set(ip, bucket);
  return bucket;
}

function bucketFor(ip: string, now: number): Bucket {
  const existing = buckets.get(ip);
  if (!existing || now - existing.windowStart >= REGISTER_RATE_WINDOW_MS) {
    return freshBucket(now, ip);
  }
  return existing;
}

function pruneExpired(now: number): void {
  if (buckets.size < 5000) return;
  for (const [ip, bucket] of buckets) {
    if (now - bucket.windowStart >= REGISTER_RATE_WINDOW_MS) buckets.delete(ip);
  }
}

export function registerRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (isTestMode()) {
    next();
    return;
  }

  const now = Date.now();
  pruneExpired(now);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const seats = requestedSeatCount(req.body);
  const bucket = bucketFor(ip, now);

  bucket.requests += 1;
  if (bucket.requests > REGISTER_RATE_MAX_REQUESTS || bucket.seats + seats > REGISTER_RATE_MAX_SEATS) {
    const retryAfter = Math.max(1, Math.ceil((bucket.windowStart + REGISTER_RATE_WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    fail(
      res,
      429,
      ErrorCodes.RATE_LIMITED,
      'Too many bookings from this network. Please try again later',
    );
    return;
  }

  bucket.seats += seats;
  res.on('finish', () => {
    if (res.statusCode !== 201) {
      bucket.seats = Math.max(0, bucket.seats - seats);
    }
  });
  next();
}
