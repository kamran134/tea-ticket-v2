export const MIN_TABLE_NUMBER = 1;
export const MAX_TABLE_NUMBER = 9999;

export interface TableAnchor {
  zoneId: string;
  row: number;
  col: number;
}

export function tableNumberKey(zoneId: string, row: number, col: number): string {
  return `${zoneId}:${row}:${col}`;
}

export interface TableNumberDraft {
  numbers: Record<string, number>;
  /** Highest number ever issued in the zone. Only grows, so deleted tables do not get their number recycled. */
  floor: Record<string, number>;
}

function zoneIdFromKey(key: string): string {
  return key.slice(0, key.indexOf(':'));
}

function raise(floor: Record<string, number>, zoneId: string, n: number): void {
  floor[zoneId] = Math.max(floor[zoneId] ?? 0, n);
}

/**
 * Keep a number only while the table stays on the same anchor. New tables
 * take one past the highest number the zone has ever had, so a gap the admin
 * left to match the venue is not filled in.
 */
export function reconcileTableNumbers(
  tables: TableAnchor[],
  prev: TableNumberDraft,
  reservedByZone: Readonly<Record<string, readonly number[]>> = {},
): TableNumberDraft {
  const floor: Record<string, number> = { ...prev.floor };
  for (const [zoneId, nums] of Object.entries(reservedByZone)) {
    for (const n of nums) raise(floor, zoneId, n);
  }
  for (const [key, n] of Object.entries(prev.numbers)) {
    raise(floor, zoneIdFromKey(key), n);
  }

  const numbers: Record<string, number> = {};
  const usedByZone = new Map<string, Set<number>>();
  const pending: TableAnchor[] = [];

  const usedFor = (zoneId: string): Set<number> => {
    let used = usedByZone.get(zoneId);
    if (!used) {
      used = new Set(reservedByZone[zoneId] ?? []);
      usedByZone.set(zoneId, used);
    }
    return used;
  };

  const ordered = [...tables].sort((a, b) => a.row - b.row || a.col - b.col || a.zoneId.localeCompare(b.zoneId));
  for (const table of ordered) {
    const key = tableNumberKey(table.zoneId, table.row, table.col);
    const existing = prev.numbers[key];
    const used = usedFor(table.zoneId);
    if (
      Number.isInteger(existing)
      && existing >= MIN_TABLE_NUMBER
      && existing <= MAX_TABLE_NUMBER
      && !used.has(existing)
    ) {
      used.add(existing);
      numbers[key] = existing;
      raise(floor, table.zoneId, existing);
    } else {
      pending.push(table);
    }
  }

  for (const table of pending) {
    const used = usedFor(table.zoneId);
    let number = (floor[table.zoneId] ?? 0) + 1;
    while (used.has(number)) number++;
    if (number > MAX_TABLE_NUMBER) continue;
    used.add(number);
    numbers[tableNumberKey(table.zoneId, table.row, table.col)] = number;
    raise(floor, table.zoneId, number);
  }

  return { numbers, floor };
}

export function sameTableNumberDraft(a: TableNumberDraft, b: TableNumberDraft): boolean {
  return sameNumberRecord(a.numbers, b.numbers) && sameNumberRecord(a.floor, b.floor);
}

function sameNumberRecord(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(key => a[key] === b[key]);
}
