import { describe, expect, it } from 'vitest';
import { tableFootprint } from './tableFootprint';

describe('tableFootprint', () => {
  it('matches the frontend chair-count tiers', () => {
    expect(tableFootprint('ROUND', 4)).toEqual({ rows: 3, cols: 3 });
    expect(tableFootprint('ROUND', 8)).toEqual({ rows: 4, cols: 4 });
    expect(tableFootprint('RECT', 8)).toEqual({ rows: 2, cols: 5 });
    expect(tableFootprint('SOFA', 6)).toEqual({ rows: 2, cols: 5 });
  });
});
