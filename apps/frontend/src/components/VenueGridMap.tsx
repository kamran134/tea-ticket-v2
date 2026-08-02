import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { Venue, Zone, Seat, ZoneTable } from '../types';
import { formatPrice } from '../types';

const FALLBACK_COLORS = [
  '#059669', '#0284c7', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
];

const GRID_LINE = '#e5e7eb';

function zoneColor(zone: Zone, index: number): string {
  return zone.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// Cells painted with the same GENERAL zone should read as one filled area,
// not a grid — so the border between two such neighbours is hidden.
function sameZoneNeighbor(cells: string[][], r: number, c: number, zoneId: string): boolean {
  return cells[r]?.[c] === zoneId;
}

interface ZoneBox { minRow: number; maxRow: number; minCol: number; maxCol: number }

function zoneBoundingBoxes(cells: string[][], zoneIds: Set<string>): Map<string, ZoneBox> {
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

interface Props {
  venue: Venue;
  zones: Zone[];
  currency: string;
  cartSeatIds: string[];
  cartQuantityByZone: Record<string, number>;
  cartQuantityByTable: Record<string, number>;
  onZoneOpen: (zone: Zone) => void;
  onSeatToggle: (zone: Zone, seat: Seat) => void;
  onTableAdd: (zone: Zone, table: ZoneTable) => void;
  onClose: () => void;
}

export function VenueGridMap({
  venue, zones, currency, cartSeatIds, cartQuantityByZone, cartQuantityByTable,
  onZoneOpen, onSeatToggle, onTableAdd, onClose,
}: Props) {
  const layout = venue.gridLayout;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  // Tables for every TABLE zone painted on the grid — same eager-load pattern as seats.
  const tableZoneIds = useMemo(() => {
    if (!layout) return [] as string[];
    const ids = new Set<string>();
    for (const row of layout.cells) {
      for (const cell of row) {
        if (zoneById.get(cell)?.zone.type === 'TABLE') ids.add(cell);
      }
    }
    return [...ids];
  }, [layout, zoneById]);
  const tableZoneKey = tableZoneIds.join(',');

  const [tablesByZone, setTablesByZone] = useState<Record<string, ZoneTable[]>>({});
  const [loadingTables, setLoadingTables] = useState(false);

  useEffect(() => {
    if (tableZoneIds.length === 0) { setTablesByZone({}); return; }
    let cancelled = false;
    setLoadingTables(true);
    Promise.all(tableZoneIds.map(id => api.getTables(id).then(tables => [id, tables] as const)))
      .then(entries => {
        if (cancelled) return;
        setTablesByZone(Object.fromEntries(entries));
      })
      .finally(() => { if (!cancelled) setLoadingTables(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableZoneKey]);

  const tableByCell = useMemo(() => {
    const map = new Map<string, ZoneTable>();
    for (const [zoneId, tables] of Object.entries(tablesByZone)) {
      for (const table of tables) {
        if (table.row !== null && table.col !== null) map.set(`${zoneId}|${table.row}|${table.col}`, table);
      }
    }
    return map;
  }, [tablesByZone]);

  const generalZoneBoxes = useMemo(() => {
    if (!layout) return new Map<string, ZoneBox>();
    const generalIds = new Set(
      zones.filter(z => z.type === 'GENERAL' && layout.cells.some(row => row.includes(z.id))).map(z => z.id),
    );
    return zoneBoundingBoxes(layout.cells, generalIds);
  }, [layout, zones]);

  const stageBox = useMemo(
    () => (layout ? zoneBoundingBoxes(layout.cells, new Set(['stage'])).get('stage') : undefined),
    [layout],
  );

  if (!layout) return null;

  const usedZones = zones.filter(z => layout.cells.some(row => row.includes(z.id)));
  if (usedZones.length === 0) return null;

  const grid = (
    <div className="relative w-full rounded-xl border border-gray-200 bg-gray-100 select-none overflow-auto">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.cols}, minmax(28px, 1fr))`,
        }}
      >
        {layout.cells.map((row, r) =>
          row.map((cell, c) => {
            if (cell === 'stage') {
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    aspectRatio: '1',
                    backgroundColor: '#1e293b',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderTopColor: sameZoneNeighbor(layout.cells, r - 1, c, 'stage') ? 'transparent' : GRID_LINE,
                    borderBottomColor: sameZoneNeighbor(layout.cells, r + 1, c, 'stage') ? 'transparent' : GRID_LINE,
                    borderLeftColor: sameZoneNeighbor(layout.cells, r, c - 1, 'stage') ? 'transparent' : GRID_LINE,
                    borderRightColor: sameZoneNeighbor(layout.cells, r, c + 1, 'stage') ? 'transparent' : GRID_LINE,
                    minWidth: 4,
                    minHeight: 4,
                  }}
                />
              );
            }
            const entry = cell !== 'empty' && cell !== 'blocked' ? zoneById.get(cell) : undefined;
            if (!entry) {
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    aspectRatio: '1',
                    backgroundColor: cell === 'blocked' ? '#9ca3af' : '#ffffff',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: GRID_LINE,
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
                    style={{
                      aspectRatio: '1', backgroundColor: `${color}55`,
                      borderWidth: 1, borderStyle: 'solid', borderColor: GRID_LINE,
                      minWidth: 4, minHeight: 4,
                    }}
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
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: isSelected ? color : GRID_LINE,
                    cursor: isOccupied ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'clamp(6px, 1.6cqw, 12px)',
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

            if (zone.type === 'TABLE') {
              const table = tableByCell.get(`${zone.id}|${r}|${c}`);
              if (!table) {
                return (
                  <div
                    key={`${r}-${c}`}
                    style={{
                      aspectRatio: '1', backgroundColor: `${color}55`,
                      borderWidth: 1, borderStyle: 'solid', borderColor: GRID_LINE,
                      minWidth: 4, minHeight: 4,
                    }}
                  />
                );
              }
              const inCartAtTable = cartQuantityByTable[table.id] ?? 0;
              const remaining = table.available - inCartAtTable;
              const isFull = remaining <= 0;
              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => !isFull && onTableAdd(zone, table)}
                  title={`${zone.name} · Стол ${table.number} · ${remaining}/${table.chairCount} своб. · ${formatPrice(zone.price, currency)}`}
                  style={{
                    aspectRatio: '1',
                    backgroundColor: isFull ? '#e5e7eb' : inCartAtTable > 0 ? color : `${color}55`,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: inCartAtTable > 0 ? color : GRID_LINE,
                    cursor: isFull ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'clamp(6px, 1.6cqw, 12px)',
                    fontWeight: 700,
                    lineHeight: 1,
                    color: isFull ? '#9ca3af' : inCartAtTable > 0 ? '#ffffff' : '#374151',
                    minWidth: 4,
                    minHeight: 4,
                  }}
                >
                  {table.number}
                </div>
              );
            }

            // GENERAL (no specific seats): filled area, click opens the quantity picker
            const inCart = cartQuantityByZone[zone.id] ?? 0;
            const isEmpty = inCart === 0 && (zone.available ?? 0) <= 0;
            return (
              <div
                key={`${r}-${c}`}
                onClick={() => !isEmpty && onZoneOpen(zone)}
                title={`${zone.name} · ${formatPrice(zone.price, currency)}${isEmpty ? ' · мест нет' : ''}`}
                style={{
                  aspectRatio: '1',
                  backgroundColor: inCart > 0 ? color : `${color}99`,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderTopColor: sameZoneNeighbor(layout.cells, r - 1, c, zone.id) ? 'transparent' : GRID_LINE,
                  borderBottomColor: sameZoneNeighbor(layout.cells, r + 1, c, zone.id) ? 'transparent' : GRID_LINE,
                  borderLeftColor: sameZoneNeighbor(layout.cells, r, c - 1, zone.id) ? 'transparent' : GRID_LINE,
                  borderRightColor: sameZoneNeighbor(layout.cells, r, c + 1, zone.id) ? 'transparent' : GRID_LINE,
                  cursor: isEmpty ? 'not-allowed' : 'pointer',
                  opacity: isEmpty ? 0.5 : 1,
                  minWidth: 4,
                  minHeight: 4,
                }}
              />
            );
          }),
        )}
      </div>

      {/* Zone name overlay for GENERAL areas — sits on top, clicks pass through to cells */}
      {[...generalZoneBoxes.entries()].map(([zoneId, box]) => {
        const zone = zones.find(z => z.id === zoneId);
        if (!zone) return null;
        const inCart = cartQuantityByZone[zone.id] ?? 0;
        const isEmpty = inCart === 0 && (zone.available ?? 0) <= 0;
        return (
          <div
            key={zoneId}
            className="absolute flex flex-col items-center justify-center text-center font-semibold pointer-events-none px-1"
            style={{
              left: `${(box.minCol / layout.cols) * 100}%`,
              top: `${(box.minRow / layout.rows) * 100}%`,
              width: `${((box.maxCol - box.minCol + 1) / layout.cols) * 100}%`,
              height: `${((box.maxRow - box.minRow + 1) / layout.rows) * 100}%`,
              color: '#ffffff',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
              fontSize: 'clamp(8px, 2.2cqw, 15px)',
              lineHeight: 1.2,
            }}
          >
            <span>{zone.name}</span>
            {zone.available !== undefined && (
              <span style={{ fontSize: 'clamp(7px, 1.8cqw, 12px)', fontWeight: 500 }}>
                {isEmpty ? 'мест нет' : `осталось: ${zone.available}`}
              </span>
            )}
          </div>
        );
      })}

      {/* Stage label overlay — decorative, not sellable */}
      {stageBox && (
        <div
          className="absolute flex items-center justify-center text-center font-semibold uppercase tracking-wide pointer-events-none px-1"
          style={{
            left: `${(stageBox.minCol / layout.cols) * 100}%`,
            top: `${(stageBox.minRow / layout.rows) * 100}%`,
            width: `${((stageBox.maxCol - stageBox.minCol + 1) / layout.cols) * 100}%`,
            height: `${((stageBox.maxRow - stageBox.minRow + 1) / layout.rows) * 100}%`,
            color: '#ffffff',
            fontSize: 'clamp(8px, 2.2cqw, 15px)',
            lineHeight: 1.2,
          }}
        >
          Сцена
        </div>
      )}
    </div>
  );

  const legend = (
    <div className="flex flex-wrap gap-2">
      {usedZones.map(zone => {
        const index = zoneById.get(zone.id)!.index;
        const inCart = cartQuantityByZone[zone.id] ?? 0;
        const seatsInCart = zone.type === 'SEATED'
          ? (seatsByZone[zone.id] ?? []).filter(s => cartSeatIds.includes(s.id)).length
          : 0;
        const tablesInCart = zone.type === 'TABLE'
          ? (tablesByZone[zone.id] ?? []).reduce((s, t) => s + (cartQuantityByTable[t.id] ?? 0), 0)
          : 0;
        const isEmpty = inCart === 0 && tablesInCart === 0 && (zone.available ?? 0) <= 0;
        const className = [
          'flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs transition-colors',
          inCart > 0 || seatsInCart > 0 || tablesInCart > 0
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
            {(inCart > 0 || seatsInCart > 0 || tablesInCart > 0) && (
              <span className="text-emerald-700 font-semibold">× {inCart || seatsInCart || tablesInCart}</span>
            )}
          </>
        );
        return zone.type === 'GENERAL' ? (
          <button
            key={zone.id}
            type="button"
            disabled={isEmpty}
            onClick={() => onZoneOpen(zone)}
            className={`${className} ${isEmpty ? 'cursor-not-allowed' : 'hover:border-emerald-300'}`}
          >
            {content}
          </button>
        ) : (
          <div key={zone.id} className={className}>{content}</div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-white p-4 overflow-auto space-y-3">
      <div className="flex justify-between items-center sticky top-0 bg-white pb-1">
        <span className="font-semibold text-gray-800">Выбор мест</span>
        <button
          type="button"
          onClick={onClose}
          title="Закрыть (Esc)"
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Закрыть ✕
        </button>
      </div>
      {grid}
      {(loadingSeats || loadingTables) && <p className="text-xs text-gray-400">Загрузка мест...</p>}
      {legend}
      <button
        type="button"
        onClick={onClose}
        className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
      >
        Готово
      </button>
    </div>
  );
}
