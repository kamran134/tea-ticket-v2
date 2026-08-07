// Pure geometry helpers shared between GridMapEditor (admin) and VenueGridMap
// (buyer) — both render the same venue-wide cell grid and used to keep two
// verbatim-identical copies of these functions.

export const GRID_LINE = '#e5e7eb';

// Default/maximum pixel size of one grid cell. On mobile — and on desktop
// when GridCanvas isn't given a fitCols target — both track dimensions are
// fixed at this size, so the canvas has a single intrinsic size that never
// stretches to fill its container and never shrinks to fit it, and whatever
// doesn't fit is reached by scrolling. On desktop with fitCols set, the cell
// shrinks below this size so that many columns fit without horizontal
// scrolling (see GridCanvas).
export const GRID_CELL_SIZE = 40;

export interface ZoneBox { minRow: number; maxRow: number; minCol: number; maxCol: number }

// Cells painted with the same zone/stage id should read as one filled area,
// not a grid — so the border between two such neighbours is hidden.
export function sameZoneNeighbor(cells: string[][], r: number, c: number, zoneId: string): boolean {
  return cells[r]?.[c] === zoneId;
}

export function zoneBoundingBoxes(cells: string[][], zoneIds: Set<string>): Map<string, ZoneBox> {
  const boxes = new Map<string, ZoneBox>();
  cells.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!zoneIds.has(cell)) return;
      const box = boxes.get(cell);
      if (!box) {
        boxes.set(cell, { minRow: r, maxRow: r, minCol: c, maxCol: c });
      } else {
        box.minRow = Math.min(box.minRow, r);
        box.maxRow = Math.max(box.maxRow, r);
        box.minCol = Math.min(box.minCol, c);
        box.maxCol = Math.max(box.maxCol, c);
      }
    });
  });
  return boxes;
}

// Tables occupy a rectangular footprint (not a single cell) — grouping
// same-zone-id cells into 4-directional connected components finds each
// physical table painted on the grid, one component per table.
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export interface ConnectedComponent { zoneId: string; box: ZoneBox; cellCount: number }

export function connectedComponents(cells: string[][], matches: Set<string>): ConnectedComponent[] {
  const rowsLen = cells.length;
  const colsLen = cells[0]?.length ?? 0;
  const seen: boolean[][] = Array.from({ length: rowsLen }, () => Array(colsLen).fill(false));
  const result: ConnectedComponent[] = [];
  for (let r = 0; r < rowsLen; r++) {
    for (let c = 0; c < colsLen; c++) {
      if (seen[r][c] || !matches.has(cells[r][c])) continue;
      const target = cells[r][c];
      let minRow = r, maxRow = r, minCol = c, maxCol = c, cellCount = 0;
      const stack: [number, number][] = [[r, c]];
      seen[r][c] = true;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        cellCount++;
        minRow = Math.min(minRow, cr);
        maxRow = Math.max(maxRow, cr);
        minCol = Math.min(minCol, cc);
        maxCol = Math.max(maxCol, cc);
        for (const [dr, dc] of NEIGHBORS) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < rowsLen && nc >= 0 && nc < colsLen && !seen[nr][nc] && cells[nr][nc] === target) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      result.push({ zoneId: target, box: { minRow, maxRow, minCol, maxCol }, cellCount });
    }
  }
  return result;
}

// Places an overlay (zone name, stage label, table icon) via native CSS Grid
// placement instead of percentage left/top/width/height. Percentages are
// computed against the containing block's own box, which stops matching the
// grid's actual rendered size the moment the grid overflows its container
// (e.g. on a narrow mobile screen with many columns, where the container
// scrolls horizontally) — grid-column/grid-row track placement has no such
// failure mode: it always lines up with the same cells the grid itself uses,
// regardless of actual pixel size, min/max caps, zoom, or overflow/scroll.
export function boxToGridArea(box: ZoneBox): { gridColumn: string; gridRow: string } {
  return {
    gridColumn: `${box.minCol + 1} / span ${box.maxCol - box.minCol + 1}`,
    gridRow: `${box.minRow + 1} / span ${box.maxRow - box.minRow + 1}`,
  };
}

export function footprintToGridArea(row: number, col: number, rows: number, cols: number): { gridColumn: string; gridRow: string } {
  return {
    gridColumn: `${col + 1} / span ${cols}`,
    gridRow: `${row + 1} / span ${rows}`,
  };
}

// Every single cell is placed explicitly too, exactly like the overlays drawn
// on top of it. This is load-bearing, not cosmetic: CSS Grid positions
// explicitly-placed items first, then makes auto-placed ones *skip* the cells
// those already occupy (css-grid-2 §8.5, step 4). Leaving the cells
// auto-placed therefore let a single overlay — a zone name, the stage label,
// a table icon — push every following cell one slot along, cascading the rest
// of the grid out of alignment: the venue rendered scrambled, and clicks
// landed on a different cell than the one drawn under the cursor. With every
// item explicitly placed nothing is auto-placed, so overlays and cells simply
// overlap, painted in DOM order.
export function cellToGridArea(row: number, col: number): { gridColumn: number; gridRow: number } {
  return { gridColumn: col + 1, gridRow: row + 1 };
}

// Mirrors the backend's findTableBlobs solidity check (venues.ts) — a table's
// painted footprint must be a solid rectangle, since row/col/rows/cols can
// only represent that. The current editor UI only ever creates tables via a
// whole-footprint "stamp" and only ever removes a whole connected blob at
// once, so this should never actually fail today — it's here so a future
// change to the drawing interaction (e.g. freehand table painting) fails
// with an immediate, clear message instead of a confusing 400 at save time.
export function isSolidRectangle(component: ConnectedComponent): boolean {
  const width = component.box.maxCol - component.box.minCol + 1;
  const height = component.box.maxRow - component.box.minRow + 1;
  return component.cellCount === width * height;
}
