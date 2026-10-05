export type PromoType = 'PERCENT' | 'FIXED';

const CENT_FACTOR = 100;

export interface PricedTicket {
  listPrice: number;
  discountAmount: number;
  price: number;
}

export interface PriceQuote {
  priced: PricedTicket[];
  subtotal: number;
  discount: number;
  total: number;
}

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * CENT_FACTOR);
}

export function fromCents(cents: number): number {
  return cents / CENT_FACTOR;
}

/** True when the number is an integer count of cents (at most two decimal places). */
export function hasAtMostTwoDecimals(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const cents = Math.round(value * CENT_FACTOR);
  return Math.abs(value * CENT_FACTOR - cents) < 1e-6;
}

export function discountCentsFor(subtotalCents: number, type: PromoType, value: number): number {
  if (subtotalCents <= 0 || !Number.isFinite(value) || value <= 0) return 0;
  if (type === 'PERCENT') {
    const percent = Math.min(value, 100);
    return Math.min(subtotalCents, Math.max(0, Math.round((subtotalCents * percent) / 100)));
  }
  return Math.min(subtotalCents, toCents(value));
}

/**
 * Splits a discount across tickets in whole cents. Shares follow each ticket's
 * share of the subtotal; the remainder goes to the largest fractional parts
 * so the payable sum matches the quoted total exactly.
 */
export function allocateDiscountCents(weights: number[], total: number): number[] {
  const shares = weights.map(() => 0);
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const remaining = Math.min(Math.max(total, 0), sum);
  if (remaining === 0 || sum === 0) return shares;

  const raw = weights.map(weight => (weight * remaining) / sum);
  for (let i = 0; i < weights.length; i++) {
    shares[i] = Math.min(weights[i], Math.floor(raw[i]));
  }
  let assigned = shares.reduce((acc, share) => acc + share, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of order) {
    if (assigned >= remaining) break;
    if (shares[index] < weights[index]) {
      shares[index] += 1;
      assigned += 1;
    }
  }
  if (assigned < remaining) {
    for (let i = 0; i < weights.length && assigned < remaining; i++) {
      const room = weights[i] - shares[i];
      if (room <= 0) continue;
      const add = Math.min(room, remaining - assigned);
      shares[i] += add;
      assigned += add;
    }
  }
  return shares;
}

export function priceTickets(listPrices: number[], discountCents: number): PricedTicket[] {
  const listCents = listPrices.map(toCents);
  const subtotal = listCents.reduce((sum, cents) => sum + cents, 0);
  const discount = Math.min(Math.max(0, discountCents), subtotal);
  const shares = allocateDiscountCents(listCents, discount);
  return listCents.map((list, index) => ({
    listPrice: fromCents(list),
    discountAmount: fromCents(shares[index]),
    price: fromCents(list - shares[index]),
  }));
}

export function quoteListPrices(listPrices: number[], type: PromoType, value: number): PriceQuote {
  const listCents = listPrices.map(toCents);
  const subtotalCents = listCents.reduce((sum, cents) => sum + cents, 0);
  const discountCents = discountCentsFor(subtotalCents, type, value);
  const priced = priceTickets(listPrices, discountCents);
  return {
    priced,
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    total: fromCents(subtotalCents - discountCents),
  };
}
