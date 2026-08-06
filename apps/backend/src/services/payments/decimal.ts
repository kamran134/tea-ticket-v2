import { Decimal } from '@prisma/client/runtime/library';

const AMOUNT_PATTERN = /^\d+\.\d{4}$/;

export function assertAmountFormat(amount: string): void {
  if (!AMOUNT_PATTERN.test(amount)) {
    throw new Error(`amount must match format N.NNNN, got "${amount}"`);
  }
}

export function formatAmount(value: number | string | Decimal): string {
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  return decimal.toFixed(4);
}

export function sumAmounts(values: Array<number | string | Decimal>): string {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.add(new Decimal(value));
  }
  return total.toFixed(4);
}

export function amountsEqual(a: string, b: string): boolean {
  return new Decimal(a).equals(new Decimal(b));
}

export function assertCurrency(currency: string): asserts currency is 'AZN' {
  if (currency !== 'AZN') {
    throw new Error(`currency must be AZN, got "${currency}"`);
  }
}
