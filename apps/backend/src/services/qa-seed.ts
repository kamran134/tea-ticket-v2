import type { PrismaClient } from '@prisma/client';
import { tableFootprint } from './tableFootprint';
import { tableSeatCoords } from './tableSeats';

export const QA_SEED = {
  venueId: 'qatesteventvenue000001',
  venueSlug: 'qa-test-event',
  venueName: 'QA Test Event',
  seatedZoneId: 'qatestzoneseated000001',
  generalZoneId: 'qatestzonegeneral00001',
  tableZoneId: 'qatestzonetable0000001',
  tableId: 'TEST-TABLE-1',
  seatCount: 20,
  generalCapacity: 50,
  tableChairs: 8,
  prices: {
    seated: 15,
    general: 10,
    table: 20,
  },
  date: '2027-12-01T19:00:00.000Z',
} as const;

export function qaSeatId(n: number): string {
  return `TEST-SEAT-${n}`;
}

export function qaTableSeatId(n: number): string {
  return `TEST-TABLE-SEAT-${n}`;
}

const GRID_ROWS = 10;
const GRID_COLS = 12;

function buildQaGridLayout() {
  const cells: string[][] = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => 'empty'),
  );

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) cells[r][c] = QA_SEED.seatedZoneId;
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 6; c < 11; c++) cells[r][c] = QA_SEED.generalZoneId;
  }
  const tableFp = tableFootprint('ROUND', QA_SEED.tableChairs);
  for (let r = 5; r < 5 + tableFp.rows; r++) {
    for (let c = 0; c < tableFp.cols; c++) cells[r][c] = QA_SEED.tableZoneId;
  }
  for (let c = 4; c < 8; c++) cells[9][c] = 'stage';

  return { rows: GRID_ROWS, cols: GRID_COLS, cells };
}

/** Idempotent: upserts the QA event and rebuilds its inventory from the constants. */
export async function seedQaEvent(prisma: PrismaClient): Promise<{
  venueId: string;
  slug: string;
  seatedZoneId: string;
  generalZoneId: string;
  tableZoneId: string;
  tableId: string;
}> {
  const existingBySlug = await prisma.venue.findUnique({
    where: { slug: QA_SEED.venueSlug },
    select: { id: true },
  });
  const venueId = existingBySlug?.id ?? QA_SEED.venueId;
  const layout = buildQaGridLayout();
  const tableFp = tableFootprint('ROUND', QA_SEED.tableChairs);

  await prisma.venue.upsert({
    where: { id: venueId },
    create: {
      id: venueId,
      name: QA_SEED.venueName,
      slug: QA_SEED.venueSlug,
      date: new Date(QA_SEED.date),
      active: true,
      gridLayout: layout,
    },
    update: {
      name: QA_SEED.venueName,
      slug: QA_SEED.venueSlug,
      date: new Date(QA_SEED.date),
      active: true,
      gridLayout: layout,
    },
  });

  await prisma.zone.upsert({
    where: { id: QA_SEED.seatedZoneId },
    create: {
      id: QA_SEED.seatedZoneId,
      venueId,
      name: 'QA Seated',
      price: QA_SEED.prices.seated,
      capacity: QA_SEED.seatCount,
      sortOrder: 0,
      type: 'SEATED',
      color: '#059669',
    },
    update: {
      venueId,
      name: 'QA Seated',
      price: QA_SEED.prices.seated,
      capacity: QA_SEED.seatCount,
      type: 'SEATED',
      color: '#059669',
    },
  });

  await prisma.zone.upsert({
    where: { id: QA_SEED.generalZoneId },
    create: {
      id: QA_SEED.generalZoneId,
      venueId,
      name: 'QA General',
      price: QA_SEED.prices.general,
      capacity: QA_SEED.generalCapacity,
      sortOrder: 1,
      type: 'GENERAL',
      color: '#2563eb',
    },
    update: {
      venueId,
      name: 'QA General',
      price: QA_SEED.prices.general,
      capacity: QA_SEED.generalCapacity,
      type: 'GENERAL',
      color: '#2563eb',
    },
  });

  await prisma.zone.upsert({
    where: { id: QA_SEED.tableZoneId },
    create: {
      id: QA_SEED.tableZoneId,
      venueId,
      name: 'QA Table',
      price: QA_SEED.prices.table,
      capacity: QA_SEED.tableChairs,
      sortOrder: 2,
      type: 'TABLE',
      color: '#d97706',
      tableChairs: QA_SEED.tableChairs,
      tableShape: 'ROUND',
    },
    update: {
      venueId,
      name: 'QA Table',
      price: QA_SEED.prices.table,
      capacity: QA_SEED.tableChairs,
      type: 'TABLE',
      color: '#d97706',
      tableChairs: QA_SEED.tableChairs,
      tableShape: 'ROUND',
    },
  });

  const seatIds = Array.from({ length: QA_SEED.seatCount }, (_, i) => qaSeatId(i + 1));
  await prisma.seat.deleteMany({
    where: { zoneId: QA_SEED.seatedZoneId, id: { notIn: seatIds } },
  });
  for (let i = 0; i < QA_SEED.seatCount; i++) {
    const row = Math.floor(i / 5);
    const posInSection = i % 5;
    await prisma.seat.upsert({
      where: { id: seatIds[i] },
      create: {
        id: seatIds[i],
        zoneId: QA_SEED.seatedZoneId,
        number: i + 1,
        row,
        sectionIndex: 0,
        posInSection,
      },
      update: {
        zoneId: QA_SEED.seatedZoneId,
        number: i + 1,
        row,
        sectionIndex: 0,
        posInSection,
      },
    });
  }

  await prisma.zoneTable.deleteMany({
    where: { zoneId: QA_SEED.tableZoneId, id: { not: QA_SEED.tableId } },
  });
  await prisma.zoneTable.upsert({
    where: { id: QA_SEED.tableId },
    create: {
      id: QA_SEED.tableId,
      zoneId: QA_SEED.tableZoneId,
      number: 1,
      shape: 'ROUND',
      chairCount: QA_SEED.tableChairs,
      row: 5,
      col: 0,
      rows: tableFp.rows,
      cols: tableFp.cols,
    },
    update: {
      zoneId: QA_SEED.tableZoneId,
      number: 1,
      shape: 'ROUND',
      chairCount: QA_SEED.tableChairs,
      row: 5,
      col: 0,
      rows: tableFp.rows,
      cols: tableFp.cols,
    },
  });

  const tableSeatIds = Array.from({ length: QA_SEED.tableChairs }, (_, i) => qaTableSeatId(i + 1));
  await prisma.seat.deleteMany({
    where: { tableId: QA_SEED.tableId, id: { notIn: tableSeatIds } },
  });
  for (let i = 0; i < QA_SEED.tableChairs; i++) {
    const coords = tableSeatCoords({ number: 1, row: 5, col: 0 }, i);
    await prisma.seat.upsert({
      where: { id: tableSeatIds[i] },
      create: {
        id: tableSeatIds[i],
        zoneId: QA_SEED.tableZoneId,
        tableId: QA_SEED.tableId,
        ...coords,
      },
      update: {
        zoneId: QA_SEED.tableZoneId,
        tableId: QA_SEED.tableId,
        ...coords,
      },
    });
  }

  return {
    venueId,
    slug: QA_SEED.venueSlug,
    seatedZoneId: QA_SEED.seatedZoneId,
    generalZoneId: QA_SEED.generalZoneId,
    tableZoneId: QA_SEED.tableZoneId,
    tableId: QA_SEED.tableId,
  };
}

export async function resetTestData(prisma: PrismaClient): Promise<{
  venueId: string;
  slug: string;
  seatedZoneId: string;
  generalZoneId: string;
  tableZoneId: string;
  tableId: string;
}> {
  await prisma.emailWebhookEvent.deleteMany();
  await prisma.emailJob.deleteMany();
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.ticket.deleteMany();
  return seedQaEvent(prisma);
}
