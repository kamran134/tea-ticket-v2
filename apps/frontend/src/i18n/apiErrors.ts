import i18n from './index';

const API_ERROR_KEYS: Record<string, string> = {
  'Booking has expired': 'errors.bookingExpired',
  'Ticket is not available for payment': 'errors.ticketNotPayable',
  'Checkout is not in payable state': 'errors.checkoutNotPayable',
};

export function translateApiError(message: string, fallbackKey = 'common.unknownError'): string {
  const key = API_ERROR_KEYS[message];
  if (key) return i18n.t(key);
  return i18n.t(fallbackKey);
}
