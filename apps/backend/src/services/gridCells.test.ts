import { describe, it, expect } from 'vitest';
import { isNonZoneCell } from './gridCells';

describe('isNonZoneCell', () => {
  it.each(['empty', 'blocked', 'stage'])('treats %s as a non-zone cell', cell => {
    expect(isNonZoneCell(cell)).toBe(true);
  });

  it('treats a zone id as a zone cell', () => {
    expect(isNonZoneCell('clx1a2b3c4d5e6f7g8h9i0j1k')).toBe(false);
  });
});
