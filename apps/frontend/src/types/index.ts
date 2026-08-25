export type TicketStatus = 'BOOKED' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';

export type Currency = '₼';

export { formatPrice } from '../i18n/format';

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
  tableShape?: TableShape;
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
export type TableShape = 'ROUND' | 'RECT' | 'SOFA';

export interface Zone {
  id: string;
  venueId: string;
  name: string;
  price: number;
  capacity: number;
  sortOrder: number;
  type: ZoneType;
  color: string | null;
  tableChairs: number | null;
  tableShape: TableShape | null;
  available?: number;
  totalCapacity?: number;
}

export interface Seat {
  id: string;
  zoneId: string;
  number: number;
  row: number;
  sectionIndex: number;
  posInSection: number;
  occupied: boolean;
}

export interface ZoneTable {
  id: string;
  zoneId: string;
  number: number;
  shape: TableShape;
  chairCount: number;
  row: number | null;
  col: number | null;
  rows: number | null;
  cols: number | null;
  occupied: number;
  available: number;
}

export type TicketEmailDeliveryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'FAILED';

export interface TicketEmailDelivery {
  status: TicketEmailDeliveryStatus;
  acceptedAt: string | null;
  deliveredAt: string | null;
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
  expiresAt: string | null;
  groupId: string | null;
  seatId: string | null;
  tableId: string | null;
  emailDelivery?: TicketEmailDelivery | null;
}

export interface CreatePaymentResult {
  paymentId: string;
  redirectUrl: string;
  status: string;
  amount: string;
  expiresAt: string | null;
  returnToken: string;
}

export interface PaymentStatusResult {
  paymentId: string;
  status: string;
  amount: string;
  paidAt: string | null;
  failureCode: string | null;
  ticketStatus: TicketStatus | null;
  ticketsConfirmed: boolean;
}

export interface RegisterResult {
  id: string;
  groupId: string | null;
  totalPrice: number;
  expiresAt?: string;
}

// What GET /api/tickets/:id and /group/:groupId actually return — phone/email
// are omitted on public ticket URLs (AUDIT S5). Admin list keeps contacts.
export type PublicTicket = Omit<Ticket, 'phone' | 'email'> & {
  phone?: string;
  email?: string | null;
};

export interface CartItem {
  zoneId: string;
  seatIds?: string[];
  tableId?: string;
  quantity?: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string | ApiErrorBody;
}
