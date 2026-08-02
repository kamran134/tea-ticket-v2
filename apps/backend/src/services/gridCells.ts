// Grid cell values that never refer to a real Zone (or a template slot id) —
// shared between venues.ts (real grid-layout) and grid-templates.ts (reusable
// blueprints), which both need to tell "this cell is a zone id" from "this
// cell is decoration/empty".
const NON_ZONE_CELLS = new Set(['empty', 'blocked', 'stage']);

export function isNonZoneCell(cell: string): boolean {
  return NON_ZONE_CELLS.has(cell);
}
