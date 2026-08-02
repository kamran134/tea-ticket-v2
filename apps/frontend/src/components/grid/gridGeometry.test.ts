import { describe, it, expect } from 'vitest';
import { zoneBoundingBoxes, sameZoneNeighbor, connectedComponents, isSolidRectangle, boxToGridArea, footprintToGridArea } from './gridGeometry';

const Z = 'zone1';
const E = 'empty';

describe('zoneBoundingBoxes', () => {
  it('computes the bounding box of a painted zone', () => {
    const cells = [
      [E, E, E],
      [E, Z, Z],
      [E, Z, Z],
    ];
    const boxes = zoneBoundingBoxes(cells, new Set([Z]));
    expect(boxes.get(Z)).toEqual({ minRow: 1, maxRow: 2, minCol: 1, maxCol: 2 });
  });
});

describe('sameZoneNeighbor', () => {
  it('is true only when the neighbor cell matches the given zone id', () => {
    const cells = [[Z, E]];
    expect(sameZoneNeighbor(cells, 0, 0, Z)).toBe(true);
    expect(sameZoneNeighbor(cells, 0, 1, Z)).toBe(false);
    expect(sameZoneNeighbor(cells, -1, 0, Z)).toBe(false); // out of bounds
  });
});

describe('connectedComponents + isSolidRectangle', () => {
  it('finds two separate components of the same zone', () => {
    const cells = [
      [Z, Z, E, Z, Z],
      [Z, Z, E, Z, Z],
    ];
    const components = connectedComponents(cells, new Set([Z]));
    expect(components).toHaveLength(2);
    expect(components.every(isSolidRectangle)).toBe(true);
  });

  it('flags an L-shaped component as not solid', () => {
    const cells = [
      [Z, E],
      [Z, Z],
    ];
    const [component] = connectedComponents(cells, new Set([Z]));
    expect(isSolidRectangle(component)).toBe(false);
  });
});

describe('boxToGridArea / footprintToGridArea', () => {
  it('converts a bounding box to 1-indexed CSS grid line/span syntax', () => {
    expect(boxToGridArea({ minRow: 1, maxRow: 2, minCol: 3, maxCol: 5 })).toEqual({
      gridColumn: '4 / span 3',
      gridRow: '2 / span 2',
    });
  });

  it('converts a stored table footprint the same way', () => {
    expect(footprintToGridArea(1, 3, 2, 3)).toEqual({
      gridColumn: '4 / span 3',
      gridRow: '2 / span 2',
    });
  });
});
