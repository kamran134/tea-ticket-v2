import { describe, expect, it } from 'vitest';
import { quoteListPrices } from './promo-pricing';

describe('quoteListPrices', () => {
  it('applies a percent discount evenly', () => {
    const quote = quoteListPrices([10, 10, 10], 'PERCENT', 10);
    expect(quote.subtotal).toBe(30);
    expect(quote.discount).toBe(3);
    expect(quote.total).toBe(27);
    expect(quote.priced.map(row => row.price)).toEqual([9, 9, 9]);
  });

  it('splits a fixed discount so the payable sum matches the quote', () => {
    const quote = quoteListPrices([10, 5], 'FIXED', 7);
    expect(quote.subtotal).toBe(15);
    expect(quote.discount).toBe(7);
    expect(quote.total).toBe(8);
    const payable = quote.priced.reduce((sum, row) => sum + row.price, 0);
    const discount = quote.priced.reduce((sum, row) => sum + row.discountAmount, 0);
    expect(payable).toBe(8);
    expect(discount).toBe(7);
    expect(quote.priced.every(row => row.price >= 0)).toBe(true);
  });

  it('caps a fixed discount at the cart total', () => {
    const quote = quoteListPrices([25], 'FIXED', 100);
    expect(quote.discount).toBe(25);
    expect(quote.total).toBe(0);
    expect(quote.priced[0].price).toBe(0);
  });

  it('gives a 100% code a zero total', () => {
    const quote = quoteListPrices([40, 10], 'PERCENT', 100);
    expect(quote.total).toBe(0);
    expect(quote.priced.map(row => row.price)).toEqual([0, 0]);
  });

  it('keeps cent rounding consistent across unequal prices', () => {
    const quote = quoteListPrices([33.33, 33.33, 33.33], 'PERCENT', 10);
    expect(quote.subtotal).toBe(99.99);
    expect(quote.discount).toBe(10);
    expect(quote.total).toBe(89.99);
    const payable = quote.priced.reduce((sum, row) => sum + row.price, 0);
    expect(Math.round(payable * 100)).toBe(8999);
  });
});
