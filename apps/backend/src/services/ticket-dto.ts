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

/**
 * The event a ticket belongs to, as the public ticket page needs it: the page used to show
 * only the buyer, zone and seat, so it never said which event the ticket was for and had no
 * link back to it. Both public routes already load the venue for its currency, so this costs
 * no extra query. Null only if the venue row is missing, which the client renders around.
 */
export function eventSummary(
  venue: { name: string; slug: string; date: Date } | null,
): { name: string; slug: string; date: string } | null {
  if (!venue) return null;
  return { name: venue.name, slug: venue.slug, date: venue.date.toISOString() };
}

export function withPlace<T extends { seat?: PlaceSeat | null; table?: PlaceTable | null }>(
  ticket: T,
): Omit<T, 'seat' | 'table'> & { seatNumber: number | null; tableNumber: number | null } {
  const { seat, table, ...rest } = ticket;
  return { ...rest, ...placeFields({ seat, table }) };
}
