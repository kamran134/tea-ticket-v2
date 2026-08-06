import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import type { Venue, Zone, Seat, ZoneTable } from '../types';
import { formatPrice } from '../types';
import { TableIcon, type Footprint } from './TableIcon';
import { GRID_LINE, sameZoneNeighbor, connectedComponents, boxToGridArea, footprintToGridArea, cellToGridArea } from './grid/gridGeometry';
import { GridCanvas } from './grid/GridCanvas';
import { zoneColor } from './grid/zoneColors';

interface Props {
  venue: Venue;
  zones: Zone[];
  currency: string;
  cartSeatIds: string[];
  cartQuantityByZone: Record<string, number>;
  cartQuantityByTable: Record<string, number>;
  onZoneOpen: (zone: Zone) => void;
  onSeatToggle: (zone: Zone, seat: Seat) => void;
  onTableOpen: (zone: Zone, table: ZoneTable) => void;
  onClose: () => void;
}

export function VenueGridMap({
  venue, zones, currency, cartSeatIds, cartQuantityByZone, cartQuantityByTable,
  onZoneOpen, onSeatToggle, onTableOpen, onClose,
}: Props) {
  const { t } = useTranslation();
  const layout = venue.gridLayout;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const zoneById = useMemo(() => new Map(zones.map((z, i) => [z.id, { zone: z, index: i }])), [zones]);

  const [seatsByZone, setSeatsByZone] = useState<Record<string, Seat[]>>({});
  const [tablesByZone, setTablesByZone] = useState<Record<string, ZoneTable[]>>({});
  const [loadingGrid, setLoadingGrid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingGrid(true);
    api.getGridData(venue.id)
      .then(({ seats, tables }) => {
        if (cancelled) return;
        const seatsGrouped: Record<string, Seat[]> = {};
        for (const seat of seats) (seatsGrouped[seat.zoneId] ??= []).push(seat);
        const tablesGrouped: Record<string, ZoneTable[]> = {};
        for (const table of tables) (tablesGrouped[table.zoneId] ??= []).push(table);
        setSeatsByZone(seatsGrouped);
        setTablesByZone(tablesGrouped);
      })
      .finally(() => { if (!cancelled) setLoadingGrid(false); });
    return () => { cancelled = true; };
  }, [venue.id]);

  const seatByCell = useMemo(() => {
    const map = new Map<string, Seat>();
    for (const [zoneId, seats] of Object.entries(seatsByZone)) {
      for (const seat of seats) map.set(`${zoneId}|${seat.row}|${seat.posInSection}`, seat);
    }
    return map;
  }, [seatsByZone]);

  const tableByCell = useMemo(() => {
    const map = new Map<string, ZoneTable>();
    for (const [zoneId, tables] of Object.entries(tablesByZone)) {
      for (const table of tables) {
        if (table.row === null || table.col === null || table.rows === null || table.cols === null) continue;
        for (let r = table.row; r < table.row + table.rows; r++) {
          for (let c = table.col; c < table.col + table.cols; c++) {
            map.set(`${zoneId}|${r}|${c}`, table);
          }
        }
      }
    }
    return map;
  }, [tablesByZone]);

  const tableFootprints = useMemo(() => {
    const list: { zone: Zone; table: ZoneTable }[] = [];
    for (const zone of zones) {
      if (zone.type !== 'TABLE') continue;
      for (const table of tablesByZone[zone.id] ?? []) {
        if (table.row !== null && table.col !== null && table.rows !== null && table.cols !== null) {
          list.push({ zone, table });
        }
      }
    }
    return list;
  }, [zones, tablesByZone]);

  const generalZoneComponents = useMemo(() => {
    if (!layout) return [];
    const generalIds = new Set(zones.filter(z => z.type === 'GENERAL').map(z => z.id));
    return connectedComponents(layout.cells, generalIds);
  }, [layout, zones]);

  const stageComponents = useMemo(
    () => (layout ? connectedComponents(layout.cells, new Set(['stage'])) : []),
    [layout],
  );

  if (!layout) return null;

  const usedZones = zones.filter(z => layout.cells.some(row => row.includes(z.id)));
  if (usedZones.length === 0) return null;

  const grid = (
    <GridCanvas rows={layout.rows} cols={layout.cols} maxHeight="65vh">
      {layout.cells.map((row, r) =>
        row.map((cell, c) => {
          const place = cellToGridArea(r, c);

          if (cell === 'stage') {
            return (
              <div
                key={`${r}-${c}`}
                style={{
                  ...place,
                  backgroundColor: '#1e293b',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderTopColor: sameZoneNeighbor(layout.cells, r - 1, c, 'stage') ? 'transparent' : GRID_LINE,
                  borderBottomColor: sameZoneNeighbor(layout.cells, r + 1, c, 'stage') ? 'transparent' : GRID_LINE,
                  borderLeftColor: sameZoneNeighbor(layout.cells, r, c - 1, 'stage') ? 'transparent' : GRID_LINE,
                  borderRightColor: sameZoneNeighbor(layout.cells, r, c + 1, 'stage') ? 'transparent' : GRID_LINE,
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
                  ...place,
                  backgroundColor: cell === 'blocked' ? '#9ca3af' : '#ffffff',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: GRID_LINE,
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
                    ...place,
                    backgroundColor: `${color}55`,
                    borderWidth: 1, borderStyle: 'solid', borderColor: GRID_LINE,
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
                title={t('gridMap.seatTooltip', {
                  zone: zone.name,
                  number: seat.number,
                  price: formatPrice(zone.price, currency),
                  occupied: isOccupied ? ` · ${t('gridMap.occupied')}` : '',
                })}
                style={{
                  ...place,
                  backgroundColor: isOccupied ? '#e5e7eb' : isSelected ? color : `${color}55`,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: isSelected ? color : GRID_LINE,
                  cursor: isOccupied ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: isOccupied ? '#9ca3af' : isSelected ? '#ffffff' : '#374151',
                }}
              >
                {seat.number}
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
                    ...place,
                    backgroundColor: '#ffffff',
                    borderWidth: 1, borderStyle: 'solid', borderColor: GRID_LINE,
                  }}
                />
              );
            }
            const inCartAtTable = cartQuantityByTable[table.id] ?? 0;
            const remaining = table.available - inCartAtTable;
            const isFull = remaining <= 0;
            const sameTable = (nr: number, nc: number) => tableByCell.get(`${zone.id}|${nr}|${nc}`) === table;
            return (
              <div
                key={`${r}-${c}`}
                onClick={() => !isFull && onTableOpen(zone, table)}
                title={t('gridMap.tableTooltip', {
                  zone: zone.name,
                  number: table.number,
                  remaining,
                  total: table.chairCount,
                  price: formatPrice(zone.price, currency),
                })}
                style={{
                  ...place,
                  backgroundColor: isFull ? '#e5e7eb' : inCartAtTable > 0 ? '#d1fae5' : '#ffffff',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderTopColor: sameTable(r - 1, c) ? 'transparent' : GRID_LINE,
                  borderBottomColor: sameTable(r + 1, c) ? 'transparent' : GRID_LINE,
                  borderLeftColor: sameTable(r, c - 1) ? 'transparent' : GRID_LINE,
                  borderRightColor: sameTable(r, c + 1) ? 'transparent' : GRID_LINE,
                  cursor: isFull ? 'not-allowed' : 'pointer',
                }}
              />
            );
          }

          const inCart = cartQuantityByZone[zone.id] ?? 0;
          const isEmpty = inCart === 0 && (zone.available ?? 0) <= 0;
          return (
            <div
              key={`${r}-${c}`}
              onClick={() => !isEmpty && onZoneOpen(zone)}
              title={t('gridMap.zoneTooltip', {
                zone: zone.name,
                price: formatPrice(zone.price, currency),
                empty: isEmpty ? ` · ${t('gridMap.noSeats')}` : '',
              })}
              style={{
                ...place,
                backgroundColor: inCart > 0 ? color : `${color}99`,
                borderWidth: 1,
                borderStyle: 'solid',
                borderTopColor: sameZoneNeighbor(layout.cells, r - 1, c, zone.id) ? 'transparent' : GRID_LINE,
                borderBottomColor: sameZoneNeighbor(layout.cells, r + 1, c, zone.id) ? 'transparent' : GRID_LINE,
                borderLeftColor: sameZoneNeighbor(layout.cells, r, c - 1, zone.id) ? 'transparent' : GRID_LINE,
                borderRightColor: sameZoneNeighbor(layout.cells, r, c + 1, zone.id) ? 'transparent' : GRID_LINE,
                cursor: isEmpty ? 'not-allowed' : 'pointer',
                opacity: isEmpty ? 0.5 : 1,
              }}
            />
          );
        }),
      )}

      {generalZoneComponents.map(({ zoneId, box }, i) => {
        const zone = zones.find(z => z.id === zoneId);
        if (!zone) return null;
        const inCart = cartQuantityByZone[zone.id] ?? 0;
        const isEmpty = inCart === 0 && (zone.available ?? 0) <= 0;
        return (
          <div
            key={`${zoneId}-${i}`}
            className="flex flex-col items-center justify-center text-center font-semibold pointer-events-none px-1"
            style={{
              ...boxToGridArea(box),
              overflow: 'hidden',
              color: '#ffffff',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
              fontSize: 14,
              lineHeight: 1.2,
            }}
          >
            <span>{zone.name}</span>
            {zone.available !== undefined && (
              <span style={{ fontSize: 11, fontWeight: 500 }}>
                {isEmpty ? t('gridMap.noSeats') : t('gridMap.remaining', { count: zone.available })}
              </span>
            )}
          </div>
        );
      })}

      {stageComponents.map(({ box }, i) => (
        <div
          key={i}
          className="flex items-center justify-center text-center font-semibold uppercase tracking-wide pointer-events-none px-1"
          style={{
            ...boxToGridArea(box),
            overflow: 'hidden',
            color: '#ffffff',
            fontSize: 14,
            lineHeight: 1.2,
          }}
        >
          {t('gridMap.stage')}
        </div>
      ))}

      {tableFootprints.map(({ table }) => {
        const inCartAtTable = cartQuantityByTable[table.id] ?? 0;
        const isFull = table.available - inCartAtTable <= 0;
        const footprint: Footprint = { rows: table.rows!, cols: table.cols! };
        return (
          <div
            key={table.id}
            className="pointer-events-none p-0.5"
            style={{ ...footprintToGridArea(table.row!, table.col!, table.rows!, table.cols!), overflow: 'hidden' }}
          >
            <TableIcon
              shape={table.shape}
              chairs={table.chairCount}
              footprint={footprint}
              label={String(table.number)}
              muted={isFull}
            />
          </div>
        );
      })}
    </GridCanvas>
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
          ? (tablesByZone[zone.id] ?? []).reduce((s, tbl) => s + (cartQuantityByTable[tbl.id] ?? 0), 0)
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
                · {isEmpty ? t('gridMap.noSeats') : t('gridMap.seatsAvailable', { count: zone.available })}
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
        <span className="font-semibold text-gray-800">{t('gridMap.title')}</span>
        <button
          type="button"
          onClick={onClose}
          title={t('common.closeEsc')}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {t('common.close')} ✕
        </button>
      </div>
      {grid}
      {loadingGrid && <p className="text-xs text-gray-400">{t('gridMap.loadingSeats')}</p>}
      {legend}
      <button
        type="button"
        onClick={onClose}
        className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
      >
        {t('common.done')}
      </button>
    </div>
  );
}
