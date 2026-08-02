import { describe, it, expect } from 'vitest';
import { findTableBlobs } from '../services/gridCells';

const Z = 'zone1';
const E = 'empty';

describe('findTableBlobs', () => {
  it('finds a single solid rectangle', () => {
    const cells = [
      [E, E, E],
      [E, Z, Z],
      [E, Z, Z],
    ];
    expect(findTableBlobs(cells, 3, 3, Z)).toEqual([{ row: 1, col: 1, rows: 2, cols: 2 }]);
  });

  it('finds two separate tables of the same zone as two blobs', () => {
    const cells = [
      [Z, Z, E, Z, Z],
      [Z, Z, E, Z, Z],
    ];
    const blobs = findTableBlobs(cells, 2, 5, Z);
    expect(blobs).toHaveLength(2);
    expect(blobs).toContainEqual({ row: 0, col: 0, rows: 2, cols: 2 });
    expect(blobs).toContainEqual({ row: 0, col: 3, rows: 2, cols: 2 });
  });

  it('rejects an L-shaped (non-solid) region', () => {
    const cells = [
      [Z, E],
      [Z, Z],
    ];
    expect(findTableBlobs(cells, 2, 2, Z)).toBeNull();
  });

  it('returns an empty array when the zone is not painted at all', () => {
    const cells = [[E, E], [E, E]];
    expect(findTableBlobs(cells, 2, 2, Z)).toEqual([]);
  });

  it('ignores cells belonging to other zones', () => {
    const cells = [
      ['zone2', Z],
      ['zone2', Z],
    ];
    expect(findTableBlobs(cells, 2, 2, Z)).toEqual([{ row: 0, col: 1, rows: 2, cols: 1 }]);
  });
});
