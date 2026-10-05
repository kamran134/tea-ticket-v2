import { AppError, ErrorCodes } from '../errors';

/** Matches Seat.number = table.number * 100 + chairIndex + 1 in tableSeats.ts. */
const SEAT_NUMBER_STRIDE = 100;
const INT4_MAX = 2_147_483_647;

export const MIN_TABLE_NUMBER = 1;
export const MAX_TABLE_NUMBER = 9999;

export interface TableNumberAssignment {
  row: number;
  col: number;
  number: number;
}

export interface ReservedTableNumber {
  number: number;
  chairCount: number;
}

function anchorKey(row: number, col: number): string {
  return `${row}-${col}`;
}

function seatRange(tableNumber: number, chairCount: number): [number, number] {
  const start = tableNumber * SEAT_NUMBER_STRIDE + 1;
  const end = tableNumber * SEAT_NUMBER_STRIDE + chairCount;
  if (start > INT4_MAX || end > INT4_MAX || end < start) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Номер стола ${tableNumber} слишком большой для ${chairCount} мест`,
      400,
    );
  }
  return [start, end];
}

function assertNoSeatRangeOverlap(
  occupants: { number: number; chairCount: number }[],
  zoneName: string,
): void {
  const ranges = occupants.map(o => ({ number: o.number, range: seatRange(o.number, o.chairCount) }));
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (a.range[0] <= b.range[1] && b.range[0] <= a.range[1]) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          `В зоне «${zoneName}» номера ${a.number} и ${b.number} пересекаются по местам`,
          409,
        );
      }
    }
  }
}

/**
 * Decide the number of every grid table in one zone.
 * Explicit assignments win, tables that stay on the same anchor keep their
 * number, and brand-new tables take max+1 so gaps the admin left on purpose
 * (to match the venue) are not filled in automatically.
 */
export function resolveZoneTableNumbers(input: {
  zoneName: string;
  chairCount: number;
  blobs: { row: number; col: number }[];
  keptNumberByAnchor: Map<string, number>;
  reserved: ReservedTableNumber[];
  assignments: TableNumberAssignment[];
  /**
   * Numbers that must not be handed out automatically (tables removed in this
   * save, or any number already seen). An explicit assignment may still use one.
   */
  numberFloor?: number[];
}): Map<string, number> {
  const anchors = new Set(input.blobs.map(b => anchorKey(b.row, b.col)));
  const explicit = new Map<string, number>();

  for (const assignment of input.assignments) {
    const key = anchorKey(assignment.row, assignment.col);
    if (!anchors.has(key)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `В зоне «${input.zoneName}» номер ${assignment.number} не совпадает ни с одним столом на схеме`,
        400,
      );
    }
    if (explicit.has(key)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Для стола в зоне «${input.zoneName}» номер указан дважды`,
        400,
      );
    }
    if (
      !Number.isInteger(assignment.number)
      || assignment.number < MIN_TABLE_NUMBER
      || assignment.number > MAX_TABLE_NUMBER
    ) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Номер стола должен быть целым числом от ${MIN_TABLE_NUMBER} до ${MAX_TABLE_NUMBER}`,
        400,
      );
    }
    explicit.set(key, assignment.number);
  }

  const resolved = new Map<string, number>();
  const used = new Set(input.reserved.map(r => r.number));
  const needsAuto: string[] = [];

  const ordered = [...input.blobs].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const blob of ordered) {
    const key = anchorKey(blob.row, blob.col);
    const chosen = explicit.get(key) ?? input.keptNumberByAnchor.get(key);
    if (chosen == null) {
      needsAuto.push(key);
      continue;
    }
    if (used.has(chosen)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `В зоне «${input.zoneName}» номер ${chosen} уже используется`,
        409,
      );
    }
    used.add(chosen);
    resolved.set(key, chosen);
  }

  let high = 0;
  for (const n of input.numberFloor ?? []) if (n > high) high = n;
  for (const n of used) if (n > high) high = n;

  for (const key of needsAuto) {
    let number = high + 1;
    while (used.has(number)) number++;
    if (number > MAX_TABLE_NUMBER) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `В зоне «${input.zoneName}» закончились свободные номера столов`,
        409,
      );
    }
    used.add(number);
    high = number;
    resolved.set(key, number);
  }

  assertNoSeatRangeOverlap(
    [
      ...input.reserved,
      ...[...resolved.values()].map(number => ({ number, chairCount: input.chairCount })),
    ],
    input.zoneName,
  );

  return resolved;
}
