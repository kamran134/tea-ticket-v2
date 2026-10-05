import { Router } from 'express';
import { Prisma, PromoCode, PromoDiscountType } from '@prisma/client';
import { z } from 'zod';
import { actorOf, requireAuth, requirePermission } from '../middleware/auth';
import { prisma } from '../db';
import { AuditActions, recordAudit } from '../services/audit';
import { cartItemSchema, planCartUnits } from '../services/cart-plan';
import { AppError, ErrorCodes, fail, failApp, failZod, isPrismaErrorCode } from '../errors';
import {
  assertDiscountApplies,
  assertDiscountValue,
  assertPromoCodeFormat,
  assertPromoUsable,
  assertPromoWindow,
  countActiveRedemptions,
  findPromo,
  normalizePromoCode,
} from '../services/promo';
import { expireStaleBookings } from '../services/booking-expiry';
import { quoteListPrices } from '../services/promo-pricing';
import type { Actor } from '../services/permissions';
import { loadOwnedVenue } from '../services/venue-access';

export const promoCodesRouter = Router();

const quoteSchema = z.object({
  venueId: z.string().min(1),
  code: z.string().trim().min(1).max(32),
  items: z.array(cartItemSchema).min(1).max(20),
});

const createSchema = z.object({
  venueId: z.string().min(1).nullable(),
  code: z.string().trim().min(1).max(32),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number(),
  maxUses: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const updateSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  type: z.enum(['PERCENT', 'FIXED']).optional(),
  value: z.number().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'No changes' });

function parseInstant(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

function toPromoDto(promo: PromoCode, usedCount: number) {
  return {
    id: promo.id,
    venueId: promo.venueId,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    maxUses: promo.maxUses,
    usedCount,
    active: promo.active,
    startsAt: promo.startsAt?.toISOString() ?? null,
    endsAt: promo.endsAt?.toISOString() ?? null,
    createdAt: promo.createdAt.toISOString(),
  };
}

async function usedCounts(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await prisma.$queryRaw<Array<{ promoCodeId: string; used: number }>>`
    SELECT "promoCodeId", COUNT(*)::int AS "used"
    FROM (
      SELECT "promoCodeId", COALESCE("groupId", "id") AS order_id
      FROM "Ticket"
      WHERE "promoCodeId" IN (${Prisma.join(ids)})
        AND "status" IN ('BOOKED', 'PENDING', 'CONFIRMED')
      GROUP BY "promoCodeId", COALESCE("groupId", "id")
    ) orders
    GROUP BY "promoCodeId"
  `;
  for (const row of rows) counts.set(row.promoCodeId, Number(row.used));
  return counts;
}

function assertGlobalAccess(actor: Actor): void {
  if (actor.isSuperAdmin) return;
  throw new AppError(
    ErrorCodes.FORBIDDEN,
    'Общие промокоды доступны только главному администратору',
    403,
  );
}

async function assertCanManagePromo(promo: Pick<PromoCode, 'venueId'>, actor: Actor): Promise<void> {
  if (promo.venueId == null) {
    assertGlobalAccess(actor);
    return;
  }
  await loadOwnedVenue(promo.venueId, actor);
}

function duplicateMessage(venueId: string | null): string {
  return venueId == null
    ? 'Такой общий промокод уже есть'
    : 'Такой промокод уже есть у этого мероприятия';
}

async function loadOwnedPromo(id: string, actor: ReturnType<typeof actorOf>): Promise<PromoCode> {
  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (!promo) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Промокод не найден', 404);
  }
  await assertCanManagePromo(promo, actor);
  return promo;
}

// POST /api/promo-codes/quote
promoCodesRouter.post('/quote', async (req, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) return failZod(res, parsed.error);
  const { venueId, code, items } = parsed.data;
  const now = new Date();

  try {
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new AppError(ErrorCodes.EVENT_NOT_FOUND, 'Event not found', 404);
    }
    if (!venue.active || venue.date < now) {
      throw new AppError(ErrorCodes.EVENT_NOT_AVAILABLE, 'Event is not available for purchase', 409);
    }

    const zoneIds = [...new Set(items.map(item => item.zoneId))];
    const zones = await prisma.zone.findMany({ where: { id: { in: zoneIds }, venueId } });
    const zoneById = new Map(zones.map(zone => [zone.id, zone]));
    const units = planCartUnits(items, zoneById);
    const listPrices = units.map(unit => zoneById.get(unit.zoneId)!.price);

    await expireStaleBookings(prisma);
    const promo = await findPromo(prisma, venueId, code);
    assertPromoUsable(promo, now);
    if (promo.maxUses != null) {
      const used = await countActiveRedemptions(prisma, promo.id);
      if (used >= promo.maxUses) {
        throw new AppError(ErrorCodes.PROMO_EXHAUSTED, 'Promo code has no uses left', 400);
      }
    }

    const quote = quoteListPrices(listPrices, promo.type, promo.value);
    assertDiscountApplies(quote.discount);
    return res.json({
      success: true,
      data: {
        code: promo.code,
        type: promo.type,
        value: promo.value,
        subtotal: quote.subtotal,
        discount: quote.discount,
        total: quote.total,
        currency: venue.currency,
      },
    });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    console.error('[promo/quote] error:', err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to apply promo code');
  }
});

// GET /api/promo-codes?venueId=  or  ?scope=global
promoCodesRouter.get('/', requireAuth, requirePermission('events.view'), async (req, res) => {
  const scope = req.query.scope;
  const venueId = req.query.venueId;
  const global = scope === 'global';
  if (!global && (typeof venueId !== 'string' || venueId.length === 0)) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, 'venueId is required');
  }
  try {
    await expireStaleBookings(prisma);
    const actor = actorOf(req);
    if (global) {
      assertGlobalAccess(actor);
    } else {
      await loadOwnedVenue(venueId as string, actor);
    }
    const promos = await prisma.promoCode.findMany({
      where: global ? { venueId: null } : { venueId: venueId as string },
      orderBy: { createdAt: 'desc' },
    });
    const counts = await usedCounts(promos.map(promo => promo.id));
    return res.json({
      success: true,
      data: promos.map(promo => toPromoDto(promo, counts.get(promo.id) ?? 0)),
    });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to fetch promo codes');
  }
});

// POST /api/promo-codes
promoCodesRouter.post('/', requireAuth, requirePermission('events.edit'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return failZod(res, parsed.error);
  const { venueId, type, value } = parsed.data;
  const code = normalizePromoCode(parsed.data.code);
  const startsAt = parseInstant(parsed.data.startsAt) ?? null;
  const endsAt = parseInstant(parsed.data.endsAt) ?? null;

  try {
    assertPromoCodeFormat(code);
    assertDiscountValue(type, value);
    assertPromoWindow(startsAt, endsAt);
    const actor = actorOf(req);
    await assertCanManagePromo({ venueId }, actor);

    const promo = await prisma.promoCode.create({
      data: {
        venueId,
        code,
        type,
        value,
        maxUses: parsed.data.maxUses ?? null,
        active: parsed.data.active ?? true,
        startsAt,
        endsAt,
      },
    });
    await recordAudit({
      action: AuditActions.PROMO_CREATE,
      actor,
      req,
      resource: 'promo',
      resourceId: promo.id,
      metadata: { venueId, code, type, value },
    });
    return res.status(201).json({ success: true, data: toPromoDto(promo, 0) });
  } catch (err) {
    if (isPrismaErrorCode(err, 'P2002')) {
      return fail(res, 409, ErrorCodes.CONFLICT, duplicateMessage(venueId));
    }
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to create promo code');
  }
});

// PATCH /api/promo-codes/:id
promoCodesRouter.patch('/:id', requireAuth, requirePermission('events.edit'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return failZod(res, parsed.error);

  let scopeVenueId: string | null = null;
  try {
    const actor = actorOf(req);
    const existing = await loadOwnedPromo(req.params.id, actor);
    scopeVenueId = existing.venueId;
    const type = (parsed.data.type ?? existing.type) as PromoDiscountType;
    const value = parsed.data.value ?? existing.value;
    const code = parsed.data.code !== undefined ? normalizePromoCode(parsed.data.code) : existing.code;
    const startsAt = parsed.data.startsAt !== undefined ? parseInstant(parsed.data.startsAt) ?? null : existing.startsAt;
    const endsAt = parsed.data.endsAt !== undefined ? parseInstant(parsed.data.endsAt) ?? null : existing.endsAt;
    const maxUses = parsed.data.maxUses !== undefined ? parsed.data.maxUses : existing.maxUses;

    if (parsed.data.code !== undefined) assertPromoCodeFormat(code);
    if (parsed.data.type !== undefined || parsed.data.value !== undefined) assertDiscountValue(type, value);
    assertPromoWindow(startsAt, endsAt);
    if (maxUses != null) {
      const used = await countActiveRedemptions(prisma, existing.id);
      if (maxUses < used) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          `Лимит не может быть меньше уже использованных (${used})`,
          400,
        );
      }
    }

    const promo = await prisma.promoCode.update({
      where: { id: existing.id },
      data: {
        code,
        type,
        value,
        maxUses,
        active: parsed.data.active ?? existing.active,
        startsAt,
        endsAt,
      },
    });
    const used = await countActiveRedemptions(prisma, promo.id);
    await recordAudit({
      action: AuditActions.PROMO_UPDATE,
      actor,
      req,
      resource: 'promo',
      resourceId: promo.id,
      metadata: { code: promo.code, type: promo.type, value: promo.value, active: promo.active },
    });
    return res.json({ success: true, data: toPromoDto(promo, used) });
  } catch (err) {
    if (isPrismaErrorCode(err, 'P2002')) {
      return fail(res, 409, ErrorCodes.CONFLICT, duplicateMessage(scopeVenueId));
    }
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to update promo code');
  }
});

// DELETE /api/promo-codes/:id
promoCodesRouter.delete('/:id', requireAuth, requirePermission('events.delete'), async (req, res) => {
  try {
    const actor = actorOf(req);
    const promo = await loadOwnedPromo(req.params.id, actor);
    await prisma.promoCode.delete({ where: { id: promo.id } });
    await recordAudit({
      action: AuditActions.PROMO_DELETE,
      actor,
      req,
      resource: 'promo',
      resourceId: promo.id,
      metadata: { code: promo.code, venueId: promo.venueId },
    });
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    if (err instanceof AppError) return failApp(res, err);
    return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to delete promo code');
  }
});
