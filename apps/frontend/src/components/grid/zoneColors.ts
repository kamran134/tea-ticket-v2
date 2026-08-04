import type { Zone } from '../../types';

// Shared between GridMapEditor (admin) and VenueGridMap (buyer) — they used
// to keep two independent palettes of different lengths (12 vs 8 colors),
// so a venue with 9+ auto-colored zones could show different colors to the
// admin than to the buyer for the same zone. One canonical list fixes that.
export const ZONE_COLORS = [
  '#059669', '#0284c7', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
  '#374151', '#b45309', '#9333ea', '#0d9488',
];

export function zoneColor(zone: Zone, index: number): string {
  return zone.color ?? ZONE_COLORS[index % ZONE_COLORS.length];
}
