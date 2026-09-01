import { describe, expect, it } from 'vitest';
import {
  cartCount,
  cartSeatIds,
  cartTotal,
  pruneOccupiedSeats,
  toCheckoutItems,
  toggleSeatInCart,
  type CartLine,
} from '../lib/cart';

const zoneA = { id: 'zone-a', name: 'Hall', price: 15 };
const zoneB = { id: 'zone-b', name: 'Tables', price: 20 };
const table12 = { id: 'table-12', number: 12 };

function seat(id: string, number: number, occupied = false) {
  return { id, number, occupied };
}

describe('toggleSeatInCart', () => {
  it('adds a single available seat', () => {
    const next = toggleSeatInCart([], zoneA, seat('s1', 1));
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ seatId: 's1', seatLabel: '1', quantity: 1, price: 15 });
  });

  it('deselects the same seat', () => {
    const selected = toggleSeatInCart([], zoneA, seat('s1', 1));
    expect(toggleSeatInCart(selected, zoneA, seat('s1', 1))).toEqual([]);
  });

  it('adds two seats at the same table as separate lines', () => {
    const one = toggleSeatInCart([], zoneB, seat('a2', 2), table12);
    const two = toggleSeatInCart(one, zoneB, seat('a3', 3), table12);
    expect(two).toHaveLength(2);
    expect(cartSeatIds(two)).toEqual(['a2', 'a3']);
    expect(two.every(l => l.tableId === 'table-12' && l.tableNumber === 12)).toBe(true);
    expect(two.every(l => l.quantity === 1)).toBe(true);
  });

  it('adds seats at different tables independently', () => {
    const one = toggleSeatInCart([], zoneB, seat('t1s1', 1), { id: 't1', number: 1 });
    const two = toggleSeatInCart(one, zoneB, seat('t2s1', 1), { id: 't2', number: 2 });
    expect(two.map(l => l.tableNumber)).toEqual([1, 2]);
  });

  it('ignores occupied seats', () => {
    expect(toggleSeatInCart([], zoneA, seat('sold', 4, true))).toEqual([]);
  });

  it('does not duplicate an already selected seat', () => {
    const selected: CartLine[] = [{
      key: 'seat:s1', zoneId: zoneA.id, zoneName: zoneA.name, price: 15,
      quantity: 1, seatId: 's1', seatLabel: '1',
    }];
    const again = toggleSeatInCart(selected, zoneA, seat('s1', 1));
    expect(again).toHaveLength(0);
  });
});

describe('cart totals and checkout payload', () => {
  it('keeps identity and sums prices per seat', () => {
    const cart = toggleSeatInCart(
      toggleSeatInCart([], zoneB, seat('a2', 2), table12),
      zoneB,
      seat('a3', 3),
      table12,
    );
    expect(cartCount(cart)).toBe(2);
    expect(cartTotal(cart)).toBe(40);
    expect(toCheckoutItems(cart)).toEqual([
      { zoneId: 'zone-b', seatIds: ['a2', 'a3'] },
    ]);
  });

  it('does not collapse two seats into a table quantity', () => {
    const cart = toggleSeatInCart(
      toggleSeatInCart([], zoneB, seat('a2', 2), table12),
      zoneB,
      seat('a3', 3),
      table12,
    );
    const items = toCheckoutItems(cart);
    expect(items.some(i => i.quantity === 2)).toBe(false);
    expect(items[0].seatIds).toHaveLength(2);
  });

  it('drops seats that became occupied', () => {
    const cart = toggleSeatInCart(
      toggleSeatInCart([], zoneB, seat('a2', 2), table12),
      zoneB,
      seat('a3', 3),
      table12,
    );
    const pruned = pruneOccupiedSeats(cart, ['a2']);
    expect(cartSeatIds(pruned)).toEqual(['a3']);
    expect(cartTotal(pruned)).toBe(20);
  });
});
