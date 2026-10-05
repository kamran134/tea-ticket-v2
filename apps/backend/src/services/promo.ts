import { Prisma, PromoCode, PromoDiscountType } from '@prisma/client';
import { AppError, ErrorCodes } from '../errors';
import { hasAtMostTwoDecimals } from './promo-pricing';

const PROMO_CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/;

type PromoDb = Prisma.TransactionClient | {
  promoCode: Prisma.TransactionClient['promoCode'];
  $queryRaw: Prisma.TransactionClient['$queryRaw'];
};

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function assertPromoCodeFormat(code: string): void {
  if (!PROMO_CODE_RE.test(code)) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Код: 3–32 символа, латиница, цифры и дефис, без дефиса по краям',
      400,
    );
  }
}

export function assertDiscountValue(type: PromoDiscountType, value: number): void {
  if (!hasAtMostTwoDecimals(value)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Значение скидки — не больше двух знаков после запятой', 400);
  }
  const cents = Math.round(value * 100);
  if (type === 'PERCENT') {
    if (cents < 1 || cents > 10_000) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Процент скидки — от 0.01 до 100', 400);
    }
    return;
  }
  if (cents < 1 || cents > 100_000_000) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Сумма скидки — от 0.01 до 1 000 000', 400);
  }
}

export function assertPromoWindow(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Дата окончания раньше даты начала', 400);
  }
}

export function assertPromoUsable(promo: PromoCode, now: Date): void {
  if (!promo.active) {
    throw new AppError(ErrorCodes.PROMO_INVALID, 'Promo code is not valid', 400);
  }
  if (promo.startsAt && now < promo.startsAt) {
    throw new AppError(ErrorCodes.PROMO_NOT_STARTED, 'Promo code is not active yet', 400);
  }
  if (promo.endsAt && now > promo.endsAt) {
    throw new AppError(ErrorCodes.PROMO_EXPIRED, 'Promo code has expired', 400);
  }
}

export function assertDiscountApplies(discount: number): void {
  if (discount <= 0) {
    throw new AppError(ErrorCodes.PROMO_INVALID, 'Promo code is not valid', 400);
  }
}

/**
 * One order is one use. An unpaid BOOKED hold occupies a use until expiresAt;
 * expireStaleBookings turns it into EXPIRED, which no longer counts. A use
 * stays after the ticket is CONFIRMED (payment or manual). PENDING is legacy.
 */
export async function countActiveRedemptions(db: PromoDb, promoId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM (
      SELECT COALESCE("groupId", "id") AS order_id
      FROM "Ticket"
      WHERE "promoCodeId" = ${promoId}
        AND "status" IN ('BOOKED', 'PENDING', 'CONFIRMED')
      GROUP BY COALESCE("groupId", "id")
    ) orders
  `;
  return Number(rows[0]?.count ?? 0);
}

async function lockPromo(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PromoCode" WHERE "id" = ${id} FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.PROMO_INVALID, 'Promo code is not valid', 400);
  }
}

/**
 * Venue-specific code wins. A global code (venueId null) is used only when
 * this event has no row with the same text.
 */
export async function findPromo(db: PromoDb, venueId: string, rawCode: string): Promise<PromoCode> {
  const code = normalizePromoCode(rawCode);
  if (!PROMO_CODE_RE.test(code)) {
    throw new AppError(ErrorCodes.PROMO_INVALID, 'Promo code is not valid', 400);
  }
  const forVenue = await db.promoCode.findUnique({
    where: { venueId_code: { venueId, code } },
  });
  if (forVenue) return forVenue;

  const globalPromo = await db.promoCode.findFirst({
    where: { venueId: null, code },
  });
  if (!globalPromo) {
    throw new AppError(ErrorCodes.PROMO_INVALID, 'Promo code is not valid', 400);
  }
  return globalPromo;
}

/**
 * Loads a promo and, inside a registration transaction, holds its row so two
 * checkouts cannot both consume the last remaining use.
 */
export async function lockUsablePromo(
  tx: Prisma.TransactionClient,
  venueId: string,
  rawCode: string,
  now: Date,
): Promise<PromoCode> {
  const located = await findPromo(tx, venueId, rawCode);
  await lockPromo(tx, located.id);
  const promo = await tx.promoCode.findUnique({ where: { id: located.id } });
  if (!promo) {
    throw new AppError(ErrorCodes.PROMO_INVALID, 'Promo code is not valid', 400);
  }
  assertPromoUsable(promo, now);
  if (promo.maxUses != null) {
    const used = await countActiveRedemptions(tx, promo.id);
    if (used >= promo.maxUses) {
      throw new AppError(ErrorCodes.PROMO_EXHAUSTED, 'Promo code has no uses left', 400);
    }
  }
  return promo;
}
