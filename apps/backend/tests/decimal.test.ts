import { describe, expect, it } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import {
  amountsEqual,
  assertAmountFormat,
  assertCurrency,
  formatAmount,
  sumAmounts,
} from '../src/services/payments/decimal';

describe('decimal utilities', () => {
  it('formats amounts with 4 decimal places', () => {
    expect(formatAmount(12.3)).toBe('12.3000');
    expect(formatAmount('0.1')).toBe('0.1000');
    expect(formatAmount(new Decimal('99.9999'))).toBe('99.9999');
  });

  it('sums amounts without floating-point drift', () => {
    expect(sumAmounts(['0.1000', '0.2000'])).toBe('0.3000');
    expect(sumAmounts([0.1, 0.2])).toBe('0.3000');
    expect(sumAmounts([10, 15.5, 4.25])).toBe('29.7500');
  });

  it('compares amounts exactly', () => {
    expect(amountsEqual('12.3400', '12.3400')).toBe(true);
    expect(amountsEqual('12.3400', '12.3401')).toBe(false);
  });

  it('validates amount format N.NNNN', () => {
    expect(() => assertAmountFormat('10.0000')).not.toThrow();
    expect(() => assertAmountFormat('10.00')).toThrow();
    expect(() => assertAmountFormat('abc')).toThrow();
  });

  it('accepts only AZN currency', () => {
    expect(() => assertCurrency('AZN')).not.toThrow();
    expect(() => assertCurrency('USD')).toThrow(/AZN/);
    expect(() => assertCurrency('EUR')).toThrow(/AZN/);
  });
});
