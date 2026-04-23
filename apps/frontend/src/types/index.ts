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
  floorPlanImage: string | null;
}

export type ZoneType = 'GENERAL' | 'SEATED' | 'TABLE';
export type TableShape = 'ROUND' | 'RECT';

export interface ZoneSectionLayout {
  sectionIndex: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ZoneLayoutData {
  color?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  sections?: ZoneSectionLayout[];
}

export interface Zone {
  id: string;
  venueId: string;
  name: string;
  price: number;
  cardNumber: string;
  capacity: number;
  sortOrder: number;
  type: ZoneType;
  layoutData: ZoneLayoutData | null;
  available?: number;
}

export interface Seat {
  id: string;
  zoneId: string;
  number: number;
  row: number;
  sectionIndex: number;
  posInSection: number;
  label: string | null;
  occupied: boolean;
}

export interface ZoneTable {
  id: string;
  zoneId: string;
  number: number;
  shape: TableShape;
  chairCount: number;
  layoutData: Record<string, unknown> | null;
  occupied: number;
  available: number;
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
  seatId: string | null;
  tableId: string | null;
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
