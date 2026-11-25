import type { PrismaClient, TicketStatus, Zone } from '@prisma/client';

/** Ticket statuses that hold a place. */
export const ACTIVE_TICKET_STATUSES: TicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];

export type ZoneWithAvailability = Zone & {
  /** Places still free; negative if a zone was shrunk below what is already sold. */
  available: number;
  /** Places the zone sells in total, by zone type. */
  totalCapacity: number;
};

/**
 * Loads a venue's zones with their live capacity:
 * SEATED — one place per Seat, TABLE — sum of chairs, GENERAL — Zone.capacity.
 */
export async function loadZonesWithAvailability(
  prisma: PrismaClient,
  venueId: string,
): Promise<ZoneWithAvailability[]> {
  const zones = await prisma.zone.findMany({
    where: { venueId },
    orderBy: { sortOrder: 'asc' },
  });
  if (zones.length === 0) return [];

  const zoneIds = zones.map(z => z.id);
  const [ticketCounts, tableSums, seatCounts] = await Promise.all([
    prisma.ticket.groupBy({
      by: ['zoneId'],
      where: { venueId, status: { in: ACTIVE_TICKET_STATUSES } },
      _count: { _all: true },
    }),
    prisma.zoneTable.groupBy({
      by: ['zoneId'],
      where: { zoneId: { in: zoneIds } },
      _sum: { chairCount: true },
    }),
    prisma.seat.groupBy({
      by: ['zoneId'],
      where: { zoneId: { in: zoneIds } },
      _count: { id: true },
    }),
  ]);

  const occupiedByZone = new Map(ticketCounts.map(c => [c.zoneId, c._count._all]));
  const chairsByZone = new Map(tableSums.map(t => [t.zoneId, t._sum.chairCount ?? 0]));
  const seatsByZone = new Map(seatCounts.map(s => [s.zoneId, s._count.id]));

  return zones.map(zone => {
    const totalCapacity =
      zone.type === 'SEATED'
        ? seatsByZone.get(zone.id) ?? 0
        : zone.type === 'TABLE'
          ? chairsByZone.get(zone.id) ?? 0
          : zone.capacity;
    const occupied = occupiedByZone.get(zone.id) ?? 0;
    return { ...zone, totalCapacity, available: totalCapacity - occupied };
  });
}
