import type { CartItem } from '../types';

export interface CartLine {
  key: string;
  zoneId: string;
  zoneName: string;
  price: number;
  quantity: number;
  seatId?: string;
  seatLabel?: string;
  tableId?: string;
  tableNumber?: number;
  tableAvailable?: number;
}

export function toggleSeatInCart(
  prev: CartLine[],
  zone: { id: string; name: string; price: number },
  seat: { id: string; number: number; occupied?: boolean },
  table?: { id: string; number: number },
): CartLine[] {
  if (seat.occupied) return prev;
  const key = `seat:${seat.id}`;
  if (prev.some(l => l.key === key || l.seatId === seat.id)) {
    return prev.filter(l => l.key !== key && l.seatId !== seat.id);
  }
  return [...prev, {
    key,
    zoneId: zone.id,
    zoneName: zone.name,
    price: zone.price,
    quantity: 1,
    seatId: seat.id,
    seatLabel: String(seat.number),
    tableId: table?.id,
    tableNumber: table?.number,
  }];
}

export function cartSeatIds(cart: CartLine[]): string[] {
  return cart.filter(l => l.seatId).map(l => l.seatId!);
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + l.quantity, 0);
}

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + l.price * l.quantity, 0);
}

export function pruneOccupiedSeats(cart: CartLine[], occupiedIds: Iterable<string>): CartLine[] {
  const occupied = occupiedIds instanceof Set ? occupiedIds : new Set(occupiedIds);
  if (occupied.size === 0) return cart;
  return cart.filter(l => !l.seatId || !occupied.has(l.seatId));
}

export function toCheckoutItems(cart: CartLine[]): CartItem[] {
  const items: CartItem[] = [];
  const seatsByZone = new Map<string, string[]>();

  for (const line of cart) {
    if (line.seatId) {
      const list = seatsByZone.get(line.zoneId) ?? [];
      list.push(line.seatId);
      seatsByZone.set(line.zoneId, list);
      continue;
    }
    if (line.tableId) {
      items.push({ zoneId: line.zoneId, tableId: line.tableId, quantity: line.quantity });
      continue;
    }
    items.push({ zoneId: line.zoneId, quantity: line.quantity });
  }

  for (const [zoneId, seatIds] of seatsByZone) {
    items.push({ zoneId, seatIds });
  }
  return items;
}
