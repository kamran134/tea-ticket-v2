import { describe, it, expect } from 'vitest';
import { tableFootprint } from './TableIcon';

describe('tableFootprint', () => {
  it('grows a ROUND table footprint with chair count', () => {
    expect(tableFootprint('ROUND', 4)).toEqual({ rows: 3, cols: 3 });
    expect(tableFootprint('ROUND', 8)).toEqual({ rows: 4, cols: 4 });
    expect(tableFootprint('ROUND', 12)).toEqual({ rows: 5, cols: 5 });
  });

  it('keeps a RECT table 2 rows deep and grows its width', () => {
    expect(tableFootprint('RECT', 4)).toEqual({ rows: 2, cols: 3 });
    expect(tableFootprint('RECT', 8)).toEqual({ rows: 2, cols: 5 });
  });

  it('keeps a SOFA table 2 rows deep and grows its width', () => {
    expect(tableFootprint('SOFA', 3)).toEqual({ rows: 2, cols: 3 });
    expect(tableFootprint('SOFA', 6)).toEqual({ rows: 2, cols: 5 });
  });
});
