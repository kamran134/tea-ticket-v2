import type { Zone, Venue } from '../types';
import { formatPrice } from '../types';

interface Props {
  venue: Venue;
  zones: Zone[];
  selectedZoneId: string | null;
  currency: string;
  onZoneClick: (zone: Zone) => void;
}

const ZONE_TYPE_LABEL: Record<string, string> = {
  SEATED: 'Места',
  TABLE: 'Столы',
};

const FALLBACK_COLORS = [
  '#059669', '#0284c7', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
];

function getZoneColor(zone: Zone, index: number): string {
  return (zone.layoutData?.color as string | undefined) ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function VenueMap({ venue, zones, selectedZoneId, currency, onZoneClick }: Props) {
  const mappedZones = zones.filter(z => z.layoutData !== null);
  const unmappedZones = zones.filter(z => z.layoutData === null);

  if (mappedZones.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Map canvas */}
      <div
        className="relative w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-100"
        style={{ paddingBottom: '56.25%' /* 16:9 */ }}
      >
        {/* Floor plan image */}
        {venue.floorPlanImage && (
          <img
            src={venue.floorPlanImage}
            alt="Floor plan"
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}

        {/* Zone overlays */}
        {mappedZones.map((zone, i) => {
          const ld = zone.layoutData!;
          const isSelected = zone.id === selectedZoneId;
          const isEmpty = (zone.available ?? 0) <= 0;
          const color = getZoneColor(zone, i);
          const typeLabel = ZONE_TYPE_LABEL[zone.type];

          return (
            <button
              key={zone.id}
              type="button"
              disabled={isEmpty}
              onClick={() => onZoneClick(zone)}
              style={{
                position: 'absolute',
                left: `${ld.x}%`,
                top: `${ld.y}%`,
                width: `${ld.w}%`,
                height: `${ld.h}%`,
                backgroundColor: isEmpty
                  ? 'rgba(156,163,175,0.5)'
                  : isSelected
                    ? color
                    : `${color}99`,
                borderColor: isSelected ? color : `${color}cc`,
                borderWidth: isSelected ? 2 : 1,
                borderStyle: 'solid',
                borderRadius: 8,
                transition: 'all 0.15s ease',
                cursor: isEmpty ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                minWidth: 0,
              }}
              title={zone.name}
            >
              <span
                className="font-semibold text-white drop-shadow leading-tight text-center"
                style={{ fontSize: 'clamp(9px, 1.5cqw, 13px)', lineHeight: 1.2 }}
              >
                {zone.name}
              </span>
              {typeLabel && (
                <span
                  className="text-white/80 drop-shadow text-center"
                  style={{ fontSize: 'clamp(7px, 1.1cqw, 10px)' }}
                >
                  {typeLabel}
                </span>
              )}
              <span
                className="text-white font-bold drop-shadow"
                style={{ fontSize: 'clamp(8px, 1.3cqw, 11px)' }}
              >
                {formatPrice(zone.price, currency)}
              </span>
              {zone.available !== undefined && (
                <span
                  className={[
                    'drop-shadow',
                    isEmpty ? 'text-white/60' : zone.available <= 5 ? 'text-yellow-200' : 'text-white/80',
                  ].join(' ')}
                  style={{ fontSize: 'clamp(7px, 1cqw, 10px)' }}
                >
                  {isEmpty ? 'Мест нет' : `${zone.available} мест`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend for mapped zones */}
      <div className="flex flex-wrap gap-2">
        {mappedZones.map((zone, i) => (
          <div key={zone.id} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: getZoneColor(zone, i) }}
            />
            {zone.name}
          </div>
        ))}
      </div>

      {/* Fallback cards for unmapped zones */}
      {unmappedZones.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-400">Остальные зоны:</p>
          {unmappedZones.map(zone => {
            const isSelected = zone.id === selectedZoneId;
            const isEmpty = (zone.available ?? 0) <= 0;
            return (
              <button
                key={zone.id}
                type="button"
                disabled={isEmpty}
                onClick={() => onZoneClick(zone)}
                className={[
                  'w-full flex justify-between items-center rounded-xl border-2 px-4 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50'
                    : isEmpty
                      ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-emerald-300',
                ].join(' ')}
              >
                <div>
                  <span className="font-medium text-gray-800 text-sm">{zone.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{formatPrice(zone.price, currency)}</span>
                </div>
                {zone.available !== undefined && (
                  <span className={`text-xs ${zone.available <= 5 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {zone.available} мест
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
