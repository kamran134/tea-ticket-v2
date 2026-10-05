import i18n from './index';
import { ApiError } from '../services/api';

const API_ERROR_KEYS: Record<string, string> = {
  EVENT_NOT_FOUND: 'errors.eventNotFound',
  EVENT_NOT_AVAILABLE: 'errors.eventNotAvailable',
  ZONE_NOT_FOUND: 'errors.zoneNotFound',
  SEAT_NOT_FOUND: 'errors.seatNotFound',
  SEAT_ALREADY_BOOKED: 'errors.seatAlreadyBooked',
  TABLE_NOT_FOUND: 'errors.tableNotFound',
  TABLE_CAPACITY_EXCEEDED: 'errors.tableCapacityExceeded',
  ZONE_CAPACITY_EXCEEDED: 'errors.zoneCapacityExceeded',
  INVALID_QUANTITY: 'errors.invalidQuantity',
  VALIDATION_ERROR: 'errors.validationError',
  TICKET_NOT_FOUND: 'errors.ticketNotFound',
  TICKET_NOT_CONFIRMED: 'errors.ticketNotConfirmed',
  TICKET_ALREADY_CHECKED_IN: 'errors.ticketAlreadyCheckedIn',
  PAYMENT_ALREADY_COMPLETED: 'errors.paymentAlreadyCompleted',
  PROMO_INVALID: 'errors.promoInvalid',
  PROMO_EXPIRED: 'errors.promoExpired',
  PROMO_NOT_STARTED: 'errors.promoNotStarted',
  PROMO_EXHAUSTED: 'errors.promoExhausted',
  'Booking has expired': 'errors.bookingExpired',
  'Ticket is not available for payment': 'errors.ticketNotPayable',
  'Checkout is not in payable state': 'errors.checkoutNotPayable',
};

export function translateApiError(err: unknown, fallbackKey = 'common.unknownError'): string {
  const code = err instanceof ApiError ? err.code : undefined;
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  // A known English message is more specific than a generic code such as VALIDATION_ERROR.
  const key = API_ERROR_KEYS[message] || (code ? API_ERROR_KEYS[code] : undefined);
  if (key) return i18n.t(key);
  return i18n.t(fallbackKey);
}
