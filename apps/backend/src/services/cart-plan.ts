import { z } from 'zod';
import { AppError, ErrorCodes } from '../errors';

export const MAX_SLOTS_PER_ORDER = 50;

export const cartItemSchema = z.object({
  zoneId: z.string().min(1),
  seatIds: z.array(z.string().min(1)).max(50).optional(),
  tableId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(50).optional(),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

export interface CartZone {
  id: string;
  name: string;
  type: 'GENERAL' | 'SEATED' | 'TABLE';
  price: number;
}

export interface PlannedUnit {
  zoneId: string;
  seatId?: string;
  tableId?: string;
}

/**
 * Expands a checkout cart into one unit per person. Seat existence and
 * capacity are checked later, under locks; this only rejects a cart that
 * cannot be priced.
 */
export function planCartUnits<T extends CartZone>(
  items: CartItemInput[],
  zoneById: Map<string, T>,
): PlannedUnit[] {
  const slots: PlannedUnit[] = [];

  for (const item of items) {
    const zone = zoneById.get(item.zoneId);
    if (!zone) {
      throw new AppError(ErrorCodes.ZONE_NOT_FOUND, 'One or more zones not found', 404);
    }

    if (item.seatIds && item.seatIds.length > 0) {
      if (zone.type !== 'SEATED' && zone.type !== 'TABLE') {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, `Zone "${zone.name}" does not sell individual seats`, 400);
      }
      if (new Set(item.seatIds).size !== item.seatIds.length) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Duplicate seats selected', 400);
      }
      for (const seatId of item.seatIds) slots.push({ zoneId: zone.id, seatId });
    } else if (item.tableId) {
      if (zone.type !== 'TABLE') {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, `Zone "${zone.name}" is not a table zone`, 400);
      }
      const qty = item.quantity ?? 0;
      if (qty < 1) {
        throw new AppError(ErrorCodes.INVALID_QUANTITY, 'quantity is required for table items', 400);
      }
      for (let i = 0; i < qty; i++) slots.push({ zoneId: zone.id, tableId: item.tableId });
    } else if (item.quantity) {
      if (zone.type !== 'GENERAL') {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, `Zone "${zone.name}" requires seatIds or a tableId`, 400);
      }
      for (let i = 0; i < item.quantity; i++) slots.push({ zoneId: zone.id });
    } else {
      throw new AppError(ErrorCodes.INVALID_QUANTITY, 'Each item needs seatIds, tableId+quantity, or quantity', 400);
    }
  }

  if (slots.length === 0) {
    throw new AppError(ErrorCodes.INVALID_QUANTITY, 'Cart is empty', 400);
  }
  if (slots.length > MAX_SLOTS_PER_ORDER) {
    throw new AppError(
      ErrorCodes.INVALID_QUANTITY,
      `Cannot register more than ${MAX_SLOTS_PER_ORDER} tickets in one order`,
      400,
    );
  }

  const explicitSeatIds = slots.map(slot => slot.seatId).filter((id): id is string => !!id);
  if (new Set(explicitSeatIds).size !== explicitSeatIds.length) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Duplicate seats selected', 400);
  }

  return slots;
}
