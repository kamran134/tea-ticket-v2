export type TicketStatus = 'BOOKED' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';

export type Currency = '₸' | '₼' | '$' | '₽';

export function formatPrice(amount: number, currency: Currency | string): string {
  const formatted = amount.toLocaleString('ru-RU');
  if (currency === '$') return `$${formatted}`;
  return `${formatted} ${currency}`;
}

export type GridCellState = 'empty' | 'blocked' | 'stage' | string;

export interface GridLayout {
  rows: number;
  cols: number;
  cells: GridCellState[][];
}

export interface GridTemplateZoneSlot {
  slotId: string;
  name: string;
  color: string | null;
  type: ZoneType;
  capacity?: number;
  tableChairs?: number;
}

export interface GridTemplateSummary {
  id: string;
  name: string;
  rows: number;
  cols: number;
  zoneCount: number;
  createdAt: string;
}

export interface GridTemplate extends GridTemplateSummary {
  cells: GridCellState[][];
  zones: GridTemplateZoneSlot[];
}

export interface Venue {
  id: string;
  name: string;
  slug: string;
  date: string;
  active: boolean;
  currency: Currency;
  floorPlanImage: string | null;
  posterImage: string | null;
  gridLayout: GridLayout | null;
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
  capacity: number;
  sortOrder: number;
  type: ZoneType;
  color: string | null;
  layoutData: ZoneLayoutData | null;
  tableChairs: number | null;
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
  row: number | null;
  col: number | null;
  occupied: number;
  available: number;
}

export interface Ticket {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  venueId: string;
  zoneId: string;
  zoneName: string;
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

export interface CartItem {
  zoneId: string;
  seatIds?: string[];
  tableId?: string;
  quantity?: number;
}

export interface RegisterResult {
  id: string;
  groupId: string | null;
  totalPrice: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
