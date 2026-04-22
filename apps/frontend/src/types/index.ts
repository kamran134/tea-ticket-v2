export type TicketStatus = 'BOOKED' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';

export type Currency = '₸' | '₼' | '$' | '₽';

export const CURRENCIES: { value: Currency; label: string }[] = [
  { value: '₼', label: 'Манат (₼)' },
  { value: '₸', label: 'Тенге (₸)' },
  { value: '$', label: 'Доллар ($)' },
  { value: '₽', label: 'Рубль (₽)' },
];

export function formatPrice(amount: number, currency: Currency | string): string {
  const formatted = amount.toLocaleString('ru-RU');
  if (currency === '$') return `$${formatted}`;
  return `${formatted} ${currency}`;
}

export interface Venue {
  id: string;
  name: string;
  date: string;
  active: boolean;
  currency: Currency;
}

export interface Zone {
  id: string;
  venueId: string;
  name: string;
  price: number;
  cardNumber: string;
  capacity: number;
  sortOrder: number;
  available?: number;
}

export interface Ticket {
  id: string;
  name: string;
  phone: string;
  venueId: string;
  zoneId: string;
  zoneName: string;
  cardNumber: string;
  price: number;
  receiptLink: string | null;
  status: TicketStatus;
  checkedIn: boolean;
  createdAt: string;
  bookedAt: string;
  groupId: string | null;
}

export interface RegisterResult {
  id: string;
  groupId: string | null;
  totalPrice: number;
  cardNumber: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
