import { describe, expect, it } from 'vitest';
import { chairNumberFromSeat, tableSeatCoords } from './tableSeats';

describe('tableSeatCoords', () => {
  it('numbers chairs per table without colliding across tables', () => {
    const a = tableSeatCoords({ number: 1, row: 5, col: 0 }, 1);
    const b = tableSeatCoords({ number: 12, row: 5, col: 4 }, 1);
    expect(a.number).toBe(102);
    expect(b.number).toBe(1202);
    expect(a.sectionIndex).toBe(1);
    expect(b.sectionIndex).toBe(5);
    expect(a.posInSection).toBe(1);
  });

  it('uses a high sectionIndex for legacy tables without a grid cell', () => {
    const coords = tableSeatCoords({ number: 3, row: null, col: null }, 0);
    expect(coords.sectionIndex).toBe(10003);
    expect(coords.row).toBe(0);
  });
});

describe('chairNumberFromSeat', () => {
  it('shows 1-based chair index for table seats', () => {
    expect(chairNumberFromSeat({ tableId: 't1', number: 102, posInSection: 1 })).toBe(2);
  });

  it('keeps the seat number for seated-zone seats', () => {
    expect(chairNumberFromSeat({ tableId: null, number: 14, posInSection: 3 })).toBe(14);
  });
});
