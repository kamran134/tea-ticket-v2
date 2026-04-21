export type TicketStatus = 'BOOKED' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';

export interface Venue {
  id: string;
  name: string;
  date: string;
  active: boolean;
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
