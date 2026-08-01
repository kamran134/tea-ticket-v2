import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { Venue, Zone, Seat } from '../types';
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
  currency: string;
  cartSeatIds: string[];
  cartQuantityByZone: Record<string, number>;
  onZoneAdd: (zone: Zone) => void;
  onSeatToggle: (zone: Zone, seat: Seat) => void;
}

export function VenueGridMap({
  venue, zones, currency, cartSeatIds, cartQuantityByZone, onZoneAdd, onSeatToggle,
}: Props) {
  const layout = venue.gridLayout;

  const zoneById = useMemo(() => new Map(zones.map((z, i) => [z.id, { zone: z, index: i }])), [zones]);

  // Seats for every SEATED zone painted on the grid — loaded eagerly so any
  // seat can be clicked directly, without a separate "pick zone first" step.
  const seatedZoneIds = useMemo(() => {
    if (!layout) return [] as string[];
    const ids = new Set<string>();
    for (const row of layout.cells) {
      for (const cell of row) {
        if (zoneById.get(cell)?.zone.type === 'SEATED') ids.add(cell);
      }
    }
    return [...ids];
  }, [layout, zoneById]);
  const seatedZoneKey = seatedZoneIds.join(',');

  const [seatsByZone, setSeatsByZone] = useState<Record<string, Seat[]>>({});
  const [loadingSeats, setLoadingSeats] = useState(false);

  useEffect(() => {
    if (seatedZoneIds.length === 0) { setSeatsByZone({}); return; }
    let cancelled = false;
    setLoadingSeats(true);
    Promise.all(seatedZoneIds.map(id => api.getSeats(id).then(seats => [id, seats] as const)))
      .then(entries => {
        if (cancelled) return;
        setSeatsByZone(Object.fromEntries(entries));
      })
      .finally(() => { if (!cancelled) setLoadingSeats(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatedZoneKey]);

  const seatByCell = useMemo(() => {
    const map = new Map<string, Seat>();
    for (const [zoneId, seats] of Object.entries(seatsByZone)) {
      for (const seat of seats) map.set(`${zoneId}|${seat.row}|${seat.posInSection}`, seat);
    }
    return map;
  }, [seatsByZone]);

  if (!layout) return null;

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
              const color = zoneColor(zone, index);

              if (zone.type === 'SEATED') {
                const seat = seatByCell.get(`${zone.id}|${r}|${c}`);
                if (!seat) {
                  return (
                    <div
                      key={`${r}-${c}`}
                      style={{ aspectRatio: '1', backgroundColor: `${color}55`, minWidth: 4, minHeight: 4 }}
                    />
                  );
                }
                const isSelected = cartSeatIds.includes(seat.id);
                const isOccupied = seat.occupied;
                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => !isOccupied && onSeatToggle(zone, seat)}
                    title={`${zone.name} · ${seat.label ?? `Место ${seat.number}`} · ${formatPrice(zone.price, currency)}${isOccupied ? ' · занято' : ''}`}
                    style={{
                      aspectRatio: '1',
                      backgroundColor: isOccupied ? '#e5e7eb' : isSelected ? color : `${color}55`,
                      outline: isSelected ? `2px solid ${color}` : 'none',
                      outlineOffset: -1,
                      cursor: isOccupied ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'clamp(6px, 1.6cqw, 11px)',
                      fontWeight: 700,
                      lineHeight: 1,
                      color: isOccupied ? '#9ca3af' : isSelected ? '#ffffff' : '#374151',
                      minWidth: 4,
                      minHeight: 4,
                    }}
                  >
                    {seat.label ?? seat.number}
                  </div>
                );
              }

              // GENERAL (no specific seats): the whole cell adds one to the cart
              const inCart = cartQuantityByZone[zone.id] ?? 0;
              const isEmpty = (zone.available ?? 0) <= inCart;
              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => !isEmpty && onZoneAdd(zone)}
                  title={`${zone.name} · ${formatPrice(zone.price, currency)}${isEmpty ? ' · мест нет' : ''}`}
                  style={{
                    aspectRatio: '1',
                    backgroundColor: isEmpty && inCart === 0 ? 'rgba(156,163,175,0.5)' : inCart > 0 ? color : `${color}99`,
                    outline: inCart > 0 ? `2px solid ${color}` : 'none',
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

      {loadingSeats && <p className="text-xs text-gray-400">Загрузка мест...</p>}

      {/* Zone legend — clickable for zones without specific seats, informational for seated ones */}
      <div className="flex flex-wrap gap-2">
        {usedZones.map(zone => {
          const index = zoneById.get(zone.id)!.index;
          const inCart = cartQuantityByZone[zone.id] ?? 0;
          const seatsInCart = zone.type === 'SEATED'
            ? (seatsByZone[zone.id] ?? []).filter(s => cartSeatIds.includes(s.id)).length
            : 0;
          const isEmpty = (zone.available ?? 0) <= inCart;
          const className = [
            'flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs transition-colors',
            inCart > 0 || seatsInCart > 0
              ? 'border-emerald-600 bg-emerald-50'
              : isEmpty
                ? 'border-gray-100 bg-gray-50 opacity-50'
                : 'border-gray-200',
          ].join(' ');
          const content = (
            <>
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zoneColor(zone, index) }} />
              <span className="font-medium text-gray-800">{zone.name}</span>
              <span className="text-gray-400">{formatPrice(zone.price, currency)}</span>
              {zone.available !== undefined && (
                <span className={isEmpty ? 'text-gray-400' : zone.available <= 5 ? 'text-amber-600' : 'text-gray-400'}>
                  · {isEmpty ? 'мест нет' : `${zone.available} мест`}
                </span>
              )}
              {(inCart > 0 || seatsInCart > 0) && (
                <span className="text-emerald-700 font-semibold">× {inCart || seatsInCart}</span>
              )}
            </>
          );
          return zone.type === 'GENERAL' ? (
            <button
              key={zone.id}
              type="button"
              disabled={isEmpty}
              onClick={() => onZoneAdd(zone)}
              className={`${className} ${!isEmpty ? 'hover:border-emerald-300' : ''}`}
            >
              {content}
            </button>
          ) : (
            <div key={zone.id} className={className}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
