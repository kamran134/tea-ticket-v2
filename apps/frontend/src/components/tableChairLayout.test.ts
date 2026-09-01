import { describe, expect, it } from 'vitest';
import { tableChairLayout } from './tableChairLayout';

describe('tableChairLayout', () => {
  it('emits one marker per chair on a round table', () => {
    const markers = tableChairLayout('ROUND', 8, { rows: 4, cols: 4 });
    expect(markers).toHaveLength(8);
    expect(markers.map(m => m.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(markers.map(m => `${m.x.toFixed(3)},${m.y.toFixed(3)}`)).size).toBe(8);
  });

  it('places rect chairs on two sides', () => {
    const markers = tableChairLayout('RECT', 6, { rows: 2, cols: 4 });
    expect(markers).toHaveLength(6);
    const ys = [...new Set(markers.map(m => m.y))];
    expect(ys).toHaveLength(2);
  });

  it('places sofa chairs in a single row', () => {
    const markers = tableChairLayout('SOFA', 4, { rows: 2, cols: 4 });
    expect(markers).toHaveLength(4);
    expect(new Set(markers.map(m => m.y)).size).toBe(1);
  });

  it('returns no markers for empty tables', () => {
    expect(tableChairLayout('ROUND', 0, { rows: 3, cols: 3 })).toEqual([]);
  });
});
