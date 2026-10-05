import { describe, expect, it } from 'vitest';
import { reconcileTableNumbers, tableNumberKey, type TableNumberDraft } from './tableNumbers';

const zone = 'zone-a';
const empty: TableNumberDraft = { numbers: {}, floor: {} };

describe('reconcileTableNumbers', () => {
  it('keeps a number while the table stays on the same anchor', () => {
    const key = tableNumberKey(zone, 1, 2);
    const next = reconcileTableNumbers(
      [{ zoneId: zone, row: 1, col: 2 }],
      { numbers: { [key]: 12 }, floor: { [zone]: 12 } },
    );
    expect(next.numbers).toEqual({ [key]: 12 });
  });

  it('does not reuse a number after the table is removed', () => {
    const kept = tableNumberKey(zone, 0, 0);
    const removed = tableNumberKey(zone, 0, 4);
    const added = tableNumberKey(zone, 3, 0);
    const next = reconcileTableNumbers(
      [{ zoneId: zone, row: 0, col: 0 }, { zoneId: zone, row: 3, col: 0 }],
      { numbers: { [kept]: 1, [removed]: 8 }, floor: { [zone]: 8 } },
    );
    expect(next.numbers[kept]).toBe(1);
    expect(next.numbers[removed]).toBeUndefined();
    expect(next.numbers[added]).toBe(9);
    expect(next.floor[zone]).toBe(9);
  });

  it('remembers the high-water mark after a deleted number leaves the map', () => {
    const removed = tableNumberKey(zone, 0, 0);
    const cleared = reconcileTableNumbers([], { numbers: { [removed]: 12 }, floor: {} });
    expect(cleared.numbers).toEqual({});
    expect(cleared.floor[zone]).toBe(12);

    const added = tableNumberKey(zone, 1, 1);
    const next = reconcileTableNumbers(
      [{ zoneId: zone, row: 1, col: 1 }],
      cleared,
    );
    expect(next.numbers[added]).toBe(13);
  });

  it('starts a new zone at 1 and numbers further tables in reading order', () => {
    const next = reconcileTableNumbers(
      [
        { zoneId: zone, row: 2, col: 0 },
        { zoneId: zone, row: 0, col: 5 },
      ],
      empty,
    );
    expect(next.numbers[tableNumberKey(zone, 0, 5)]).toBe(1);
    expect(next.numbers[tableNumberKey(zone, 2, 0)]).toBe(2);
  });

  it('skips numbers reserved by off-grid tables', () => {
    const next = reconcileTableNumbers(
      [{ zoneId: zone, row: 0, col: 0 }],
      empty,
      { [zone]: [10] },
    );
    expect(next.numbers[tableNumberKey(zone, 0, 0)]).toBe(11);
  });

  it('numbers each zone independently', () => {
    const next = reconcileTableNumbers(
      [
        { zoneId: 'a', row: 0, col: 0 },
        { zoneId: 'b', row: 0, col: 0 },
      ],
      empty,
    );
    expect(next.numbers[tableNumberKey('a', 0, 0)]).toBe(1);
    expect(next.numbers[tableNumberKey('b', 0, 0)]).toBe(1);
  });
});
