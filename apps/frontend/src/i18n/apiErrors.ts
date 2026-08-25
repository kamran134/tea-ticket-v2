import i18n from './index';
import { ApiError } from '../services/api';

const API_ERROR_KEYS: Record<string, string> = {
  EVENT_NOT_FOUND: 'errors.eventNotFound',
  EVENT_NOT_AVAILABLE: 'errors.eventNotAvailable',
  SEAT_ALREADY_BOOKED: 'errors.seatAlreadyBooked',
  TABLE_CAPACITY_EXCEEDED: 'errors.tableCapacityExceeded',
  ZONE_CAPACITY_EXCEEDED: 'errors.zoneCapacityExceeded',
  TICKET_NOT_CONFIRMED: 'errors.ticketNotConfirmed',
  TICKET_ALREADY_CHECKED_IN: 'errors.ticketAlreadyCheckedIn',
  PAYMENT_ALREADY_COMPLETED: 'errors.paymentAlreadyCompleted',
  'Booking has expired': 'errors.bookingExpired',
  'Ticket is not available for payment': 'errors.ticketNotPayable',
  'Checkout is not in payable state': 'errors.checkoutNotPayable',
};

export function translateApiError(err: unknown, fallbackKey = 'common.unknownError'): string {
  const code = err instanceof ApiError ? err.code : undefined;
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const key = (code && API_ERROR_KEYS[code]) || API_ERROR_KEYS[message];
  if (key) return i18n.t(key);
  return i18n.t(fallbackKey);
}
