import { Prisma, PrismaClient, TicketStatus, ZoneTable } from '@prisma/client';
import { AppError, ErrorCodes } from '../errors';

const ACTIVE: TicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];

export type TableSeatTx = Prisma.TransactionClient | PrismaClient;

export function tableSeatCoords(
  table: Pick<ZoneTable, 'number' | 'row' | 'col'>,
  chairIndex: number,
) {
  return {
    number: table.number * 100 + chairIndex + 1,
    row: table.row ?? 0,
    sectionIndex: table.col != null ? table.col + 1 : 10_000 + table.number,
    posInSection: chairIndex,
  };
}

export function chairNumberFromSeat(seat: {
  tableId: string | null;
  number: number;
  posInSection: number;
}): number {
  return seat.tableId ? seat.posInSection + 1 : seat.number;
}

export function toSeatDto(seat: {
  id: string;
  zoneId: string;
  tableId: string | null;
  number: number;
  row: number;
  sectionIndex: number;
  posInSection: number;
  tickets?: { id: string }[];
}) {
  return {
    id: seat.id,
    zoneId: seat.zoneId,
    tableId: seat.tableId,
    number: chairNumberFromSeat(seat),
    row: seat.row,
    sectionIndex: seat.sectionIndex,
    posInSection: seat.posInSection,
    occupied: (seat.tickets?.length ?? 0) > 0,
  };
}

/** Create/remove/relabel Seat rows so a table has exactly chairCount chairs. */
export async function syncTableSeats(tx: TableSeatTx, table: ZoneTable): Promise<void> {
  const existing = await tx.seat.findMany({
    where: { tableId: table.id },
    include: {
      tickets: { where: { status: { in: ACTIVE } }, select: { id: true } },
    },
    orderBy: { posInSection: 'asc' },
  });
  const byIndex = new Map(existing.map(s => [s.posInSection, s]));

  const toRemove = existing.filter(s => s.posInSection >= table.chairCount);
  const blocked = toRemove.find(s => s.tickets.length > 0);
  if (blocked) {
    throw new AppError(
      ErrorCodes.TABLE_CAPACITY_EXCEEDED,
      `Table ${table.number} has an active ticket on chair ${blocked.posInSection + 1} and cannot be reduced to ${table.chairCount} chairs`,
      409,
    );
  }
  if (toRemove.length > 0) {
    await tx.seat.deleteMany({ where: { id: { in: toRemove.map(s => s.id) } } });
  }

  const toAdd = [];
  for (let i = 0; i < table.chairCount; i++) {
    if (byIndex.has(i)) continue;
    toAdd.push({
      zoneId: table.zoneId,
      tableId: table.id,
      ...tableSeatCoords(table, i),
    });
  }
  if (toAdd.length > 0) {
    await tx.seat.createMany({ data: toAdd });
  }

  const toKeep = existing.filter(s => s.posInSection < table.chairCount);
  for (const seat of toKeep) {
    const coords = tableSeatCoords(table, seat.posInSection);
    if (
      seat.number !== coords.number
      || seat.row !== coords.row
      || seat.sectionIndex !== coords.sectionIndex
      || seat.posInSection !== coords.posInSection
    ) {
      await tx.seat.update({ where: { id: seat.id }, data: coords });
    }
  }
}

export async function syncSeatsForZoneTables(tx: TableSeatTx, zoneId: string): Promise<void> {
  const tables = await tx.zoneTable.findMany({ where: { zoneId } });
  for (const table of tables) {
    await syncTableSeats(tx, table);
  }
}

export async function lockSeats(tx: TableSeatTx, seatIds: string[]): Promise<void> {
  if (seatIds.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "Seat" WHERE id IN (${Prisma.join(seatIds)}) FOR UPDATE`;
}

/** Pick N free chairs at a table. Caller must already hold the table row lock. */
export async function allocateFreeTableSeats(
  tx: TableSeatTx,
  tableId: string,
  quantity: number,
  alreadyClaimed: Set<string>,
): Promise<string[]> {
  const chairs = await tx.seat.findMany({
    where: { tableId },
    orderBy: { posInSection: 'asc' },
    select: { id: true },
  });
  if (chairs.length === 0) {
    throw new AppError(ErrorCodes.SEAT_NOT_FOUND, 'Table has no bookable seats', 404);
  }
  await lockSeats(tx, chairs.map(c => c.id));
  const occupied = await tx.ticket.findMany({
    where: { seatId: { in: chairs.map(c => c.id) }, status: { in: ACTIVE } },
    select: { seatId: true },
  });
  const taken = new Set([
    ...alreadyClaimed,
    ...occupied.map(t => t.seatId).filter((id): id is string => !!id),
  ]);
  const free = chairs.filter(c => !taken.has(c.id)).map(c => c.id);
  if (free.length < quantity) {
    throw new AppError(
      ErrorCodes.TABLE_CAPACITY_EXCEEDED,
      'Not enough chairs available at the selected table',
      409,
    );
  }
  return free.slice(0, quantity);
}
