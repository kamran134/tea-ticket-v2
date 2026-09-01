import { chairNumberFromSeat } from './tableSeats';

export const TICKET_PLACE_INCLUDE = {
  seat: { select: { number: true, posInSection: true, tableId: true } },
  table: { select: { number: true } },
} as const;

type PlaceSeat = { number: number; posInSection: number; tableId: string | null };
type PlaceTable = { number: number };

export function placeFields(ticket: {
  seat?: PlaceSeat | null;
  table?: PlaceTable | null;
}): { seatNumber: number | null; tableNumber: number | null } {
  return {
    seatNumber: ticket.seat ? chairNumberFromSeat(ticket.seat) : null,
    tableNumber: ticket.table?.number ?? null,
  };
}

export function withPlace<T extends { seat?: PlaceSeat | null; table?: PlaceTable | null }>(
  ticket: T,
): Omit<T, 'seat' | 'table'> & { seatNumber: number | null; tableNumber: number | null } {
  const { seat, table, ...rest } = ticket;
  return { ...rest, ...placeFields({ seat, table }) };
}
