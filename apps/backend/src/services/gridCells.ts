// Grid cell values that never refer to a real Zone (or a template slot id) —
// shared between venues.ts (real grid-layout) and grid-templates.ts (reusable
// blueprints), which both need to tell "this cell is a zone id" from "this
// cell is decoration/empty".
const NON_ZONE_CELLS = new Set(['empty', 'blocked', 'stage']);

export function isNonZoneCell(cell: string): boolean {
  return NON_ZONE_CELLS.has(cell);
}

export interface TableBlob { row: number; col: number; rows: number; cols: number }

// A table spans a rectangular footprint (drawn as a "stamp" by the frontend),
// not a single cell — group same-zone-id cells into their connected
// components (4-directional flood fill) and reject anything that isn't a
// solid rectangle, since row/col/rows/cols can only represent that.
export function findTableBlobs(cells: string[][], rows: number, cols: number, zoneId: string): TableBlob[] | null {
  const seen: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const blobs: TableBlob[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (seen[r][c] || cells[r][c] !== zoneId) continue;
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
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !seen[nr][nc] && cells[nr][nc] === zoneId) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      const footprintRows = maxRow - minRow + 1;
      const footprintCols = maxCol - minCol + 1;
      if (cellCount !== footprintRows * footprintCols) return null; // not a solid rectangle
      blobs.push({ row: minRow, col: minCol, rows: footprintRows, cols: footprintCols });
    }
  }
  return blobs;
}
