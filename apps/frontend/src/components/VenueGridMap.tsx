import type { Venue, Zone } from '../types';
import { formatPrice } from '../types';

const FALLBACK_COLORS = [
  '#059669', '#0284c7', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
];

function zoneColor(zone: Zone, index: number): string {
  return zone.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

interface Props {
  venue: Venue;
  zones: Zone[];
  selectedZoneId: string | null;
  currency: string;
  onZoneClick: (zone: Zone) => void;
}

export function VenueGridMap({ venue, zones, selectedZoneId, currency, onZoneClick }: Props) {
  const layout = venue.gridLayout;
  if (!layout) return null;

  const zoneById = new Map(zones.map((z, i) => [z.id, { zone: z, index: i }]));
  const usedZones = zones.filter(z => layout.cells.some(row => row.includes(z.id)));

  if (usedZones.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Grid canvas */}
      <div className="w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-100 select-none">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
            gap: '1px',
          }}
        >
          {layout.cells.map((row, r) =>
            row.map((cell, c) => {
              const entry = cell !== 'empty' && cell !== 'blocked' ? zoneById.get(cell) : undefined;
              if (!entry) {
                return (
                  <div
                    key={`${r}-${c}`}
                    style={{
                      aspectRatio: '1',
                      backgroundColor: cell === 'blocked' ? '#9ca3af' : '#ffffff',
                      minWidth: 4,
                      minHeight: 4,
                    }}
                  />
                );
              }
              const { zone, index } = entry;
              const isSelected = zone.id === selectedZoneId;
              const isEmpty = (zone.available ?? 0) <= 0;
              const color = zoneColor(zone, index);
              return (
                <div
                  key={`${r}-${c}`}
                  title={`${zone.name} · ${formatPrice(zone.price, currency)}${isEmpty ? ' · мест нет' : ''}`}
                  onClick={() => !isEmpty && onZoneClick(zone)}
                  style={{
                    aspectRatio: '1',
                    backgroundColor: isEmpty ? 'rgba(156,163,175,0.5)' : isSelected ? color : `${color}99`,
                    outline: isSelected ? `2px solid ${color}` : 'none',
                    outlineOffset: -1,
                    cursor: isEmpty ? 'not-allowed' : 'pointer',
                    minWidth: 4,
                    minHeight: 4,
                  }}
                />
              );
            }),
          )}
        </div>
      </div>

      {/* Zone legend / alternate selector */}
      <div className="flex flex-wrap gap-2">
        {usedZones.map(zone => {
          const index = zoneById.get(zone.id)!.index;
          const isSelected = zone.id === selectedZoneId;
          const isEmpty = (zone.available ?? 0) <= 0;
          return (
            <button
              key={zone.id}
              type="button"
              disabled={isEmpty}
              onClick={() => onZoneClick(zone)}
              className={[
                'flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs transition-colors',
                isSelected
                  ? 'border-emerald-600 bg-emerald-50'
                  : isEmpty
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:border-emerald-300',
              ].join(' ')}
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zoneColor(zone, index) }} />
              <span className="font-medium text-gray-800">{zone.name}</span>
              <span className="text-gray-400">{formatPrice(zone.price, currency)}</span>
              {zone.available !== undefined && (
                <span className={isEmpty ? 'text-gray-400' : zone.available <= 5 ? 'text-amber-600' : 'text-gray-400'}>
                  · {isEmpty ? 'мест нет' : `${zone.available} мест`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
