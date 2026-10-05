import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { resolveZoneTableNumbers } from './tableNumbers';

const zone = 'Зал';

function resolve(overrides: Partial<Parameters<typeof resolveZoneTableNumbers>[0]> = {}) {
  return resolveZoneTableNumbers({
    zoneName: zone,
    chairCount: 4,
    blobs: [],
    keptNumberByAnchor: new Map(),
    reserved: [],
    assignments: [],
    ...overrides,
  });
}

describe('resolveZoneTableNumbers', () => {
  it('keeps the number of a table that stays on the same anchor', () => {
    const numbers = resolve({
      blobs: [{ row: 0, col: 0 }],
      keptNumberByAnchor: new Map([['0-0', 12]]),
    });
    expect(numbers.get('0-0')).toBe(12);
  });

  it('assigns max+1 to a new table and does not fill gaps', () => {
    const numbers = resolve({
      blobs: [{ row: 0, col: 0 }, { row: 0, col: 4 }],
      keptNumberByAnchor: new Map([['0-0', 1]]),
    });
    expect(numbers.get('0-0')).toBe(1);
    expect(numbers.get('0-4')).toBe(2);
  });

  it('uses an explicit number and leaves the old gap unused', () => {
    const numbers = resolve({
      blobs: [{ row: 1, col: 2 }],
      assignments: [{ row: 1, col: 2, number: 15 }],
    });
    expect(numbers.get('1-2')).toBe(15);
  });

  it('swaps two explicit numbers', () => {
    const numbers = resolve({
      blobs: [{ row: 0, col: 0 }, { row: 0, col: 4 }],
      keptNumberByAnchor: new Map([['0-0', 1], ['0-4', 2]]),
      assignments: [
        { row: 0, col: 0, number: 2 },
        { row: 0, col: 4, number: 1 },
      ],
    });
    expect(numbers.get('0-0')).toBe(2);
    expect(numbers.get('0-4')).toBe(1);
  });

  it('rejects a number already used in the zone', () => {
    expect(() => resolve({
      blobs: [{ row: 0, col: 0 }, { row: 0, col: 4 }],
      assignments: [
        { row: 0, col: 0, number: 5 },
        { row: 0, col: 4, number: 5 },
      ],
    })).toThrow(AppError);
  });

  it('rejects a number reserved by an off-grid table', () => {
    expect(() => resolve({
      blobs: [{ row: 0, col: 0 }],
      reserved: [{ number: 4, chairCount: 4 }],
      assignments: [{ row: 0, col: 0, number: 4 }],
    })).toThrow(/уже используется/);
  });

  it('skips reserved numbers when auto-assigning', () => {
    const numbers = resolve({
      blobs: [{ row: 0, col: 0 }],
      reserved: [{ number: 10, chairCount: 4 }],
    });
    expect(numbers.get('0-0')).toBe(11);
  });

  it('does not recycle a removed table number unless the admin asks for it', () => {
    expect(resolve({
      blobs: [{ row: 0, col: 0 }],
      numberFloor: [12],
    }).get('0-0')).toBe(13);

    expect(resolve({
      blobs: [{ row: 0, col: 0 }],
      numberFloor: [12],
      assignments: [{ row: 0, col: 0, number: 12 }],
    }).get('0-0')).toBe(12);
  });

  it('rejects an assignment that does not match a painted table', () => {
    expect(() => resolve({
      blobs: [{ row: 0, col: 0 }],
      assignments: [{ row: 2, col: 2, number: 3 }],
    })).toThrow(/не совпадает/);
  });

  it('rejects table numbers whose chair ranges would collide', () => {
    expect(() => resolve({
      chairCount: 150,
      blobs: [{ row: 0, col: 0 }, { row: 0, col: 4 }],
      assignments: [
        { row: 0, col: 0, number: 1 },
        { row: 0, col: 4, number: 2 },
      ],
    })).toThrow(/пересекаются/);
  });
});
