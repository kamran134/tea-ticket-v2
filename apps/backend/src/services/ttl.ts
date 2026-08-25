function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

const DEFAULT_TTL_SECONDS = 900;

function legacyHoldSeconds(): number | undefined {
  const seconds = parsePositiveInt(process.env.PAYMENT_HOLD_SECONDS);
  if (seconds) return seconds;
  const minutes = parsePositiveInt(process.env.PAYMENT_HOLD_MINUTES);
  if (minutes) return minutes * 60;
  return undefined;
}

/** How long a BOOKED ticket is held before expiry. Default 900s (15 min). */
export function getBookingTtlSeconds(): number {
  return parsePositiveInt(process.env.BOOKING_TTL_SECONDS)
    ?? legacyHoldSeconds()
    ?? DEFAULT_TTL_SECONDS;
}

/** How long a CREATED/PROCESSING payment session lives. Default 900s. */
export function getPaymentTtlSeconds(): number {
  return parsePositiveInt(process.env.PAYMENT_TTL_SECONDS)
    ?? legacyHoldSeconds()
    ?? DEFAULT_TTL_SECONDS;
}

export function getBookingHoldMs(): number {
  return getBookingTtlSeconds() * 1000;
}

export function getPaymentHoldMs(): number {
  return getPaymentTtlSeconds() * 1000;
}
