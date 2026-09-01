import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import type { Venue, Zone, Seat, ZoneTable } from '../types';
import { formatPrice } from '../types';
import { TableIcon, type ChairVisualState, type Footprint } from './TableIcon';
import { tableChairLayout } from './tableChairLayout';
import { GRID_LINE, sameZoneNeighbor, connectedComponents, boxToGridArea, footprintToGridArea, cellToGridArea } from './grid/gridGeometry';
import { GridCanvas } from './grid/GridCanvas';
import { zoneColor } from './grid/zoneColors';
import { ConfirmDialog } from './ConfirmDialog';

// On desktop, shrink cells so up to this many columns fit in the canvas
// without a horizontal scrollbar; beyond it cells stay at GRID_CELL_SIZE.
const DESKTOP_FIT_COLS = 45;

interface Props {
  venue: Venue;
  zones: Zone[];
  currency: string;
  cartSeatIds: string[];
  cartQuantityByZone: Record<string, number>;
  cartQuantityByTable: Record<string, number>;
  onZoneOpen: (zone: Zone) => void;
  onSeatToggle: (zone: Zone, seat: Seat, table?: ZoneTable) => void;
  onTableOpen: (zone: Zone, table: ZoneTable) => void;
  /** Proceed: keep the current selection and close (top "Buy" / bottom "Done"). */
  onClose: () => void;
  /** Cancel: confirmed via the dialog below, discards the selection made since the map was opened. */
  onCancel: () => void;
  /** True while a QuantityModal (the +/- counter for a table or a seatless zone) is open on top of this map — Escape should close that first. */
  /** Called after inventory loads so the parent can drop stale selected seats. */
  onOccupiedSeatIds?: (ids: string[]) => void;
  quantityModalOpen: boolean;
}

export function VenueGridMap({
  venue, zones, currency, cartSeatIds, cartQuantityByZone, cartQuantityByTable,
  onZoneOpen, onSeatToggle,   onTableOpen, onClose, onCancel, quantityModalOpen, onOccupiedSeatIds,
}: Props) {
  const { t } = useTranslation();
  const layout = venue.gridLayout;

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const hasSelection = cartSeatIds.length > 0
    || Object.values(cartQuantityByZone).some(q => q > 0)
    || Object.values(cartQuantityByTable).some(q => q > 0);

  // Close (X / Escape) is a cancel, not a proceed — warn before throwing away
  // a selection; an empty selection has nothing to lose, so skip the dialog.
  const requestClose = useCallback(() => {
    if (hasSelection) setConfirmingCancel(true);
    else onCancel();
  }, [hasSelection, onCancel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A QuantityModal layered on top handles its own Escape; let that
      // happen first and only close this map once it's gone.
      if (e.key !== 'Escape' || quantityModalOpen) return;
      requestClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [quantityModalOpen, requestClose]);

  const zoneById = useMemo(() => new Map(zones.map((z, i) => [z.id, { zone: z, index: i }])), [zones]);

  const [seatsByZone, setSeatsByZone] = useState<Record<string, Seat[]>>({});
  const [tablesByZone, setTablesByZone] = useState<Record<string, ZoneTable[]>>({});
  const [loadingGrid, setLoadingGrid] = useState(false);

  const occupiedCb = useRef(onOccupiedSeatIds);
  occupiedCb.current = onOccupiedSeatIds;

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
        const occupiedIds = [
          ...seats.filter(s => s.occupied).map(s => s.id),
          ...tables.flatMap(t => (t.seats ?? []).filter(s => s.occupied).map(s => s.id)),
        ];
        occupiedCb.current?.(occupiedIds);
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
    <GridCanvas rows={layout.rows} cols={layout.cols} maxHeight="min(55dvh, 100%)" fitCols={DESKTOP_FIT_COLS} cellSize={48}>
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
            const seatStatus = isOccupied ? 'occupied' : isSelected ? 'selected' : 'available';
            return (
              <div
                key={`${r}-${c}`}
                onClick={() => !isOccupied && onSeatToggle(zone, seat)}
                data-testid={`seat-${seat.id}`}
                data-seat-id={seat.id}
                data-seat-status={seatStatus}
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
            const inCartAtTable = (table.seats ?? []).filter(s => cartSeatIds.includes(s.id)).length;
            const remaining = (table.seats ?? []).filter(s => !s.occupied && !cartSeatIds.includes(s.id)).length;
            const isFull = remaining <= 0 && inCartAtTable === 0;
            const sameTable = (nr: number, nc: number) => tableByCell.get(`${zone.id}|${nr}|${nc}`) === table;
            return (
              <div
                key={`${r}-${c}`}
                data-table-id={table.id}
                data-table-status={isFull ? 'occupied' : inCartAtTable > 0 ? 'selected' : 'available'}
                data-table-capacity={table.chairCount}
                data-table-available={remaining}
                style={{
                  ...place,
                  backgroundColor: isFull ? '#e5e7eb' : inCartAtTable > 0 ? '#d1fae5' : '#ffffff',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderTopColor: sameTable(r - 1, c) ? 'transparent' : GRID_LINE,
                  borderBottomColor: sameTable(r + 1, c) ? 'transparent' : GRID_LINE,
                  borderLeftColor: sameTable(r, c - 1) ? 'transparent' : GRID_LINE,
                  borderRightColor: sameTable(r, c + 1) ? 'transparent' : GRID_LINE,
                  pointerEvents: 'none',
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

      {tableFootprints.map(({ zone, table }) => {
        const seats = [...(table.seats ?? [])].sort((a, b) => a.posInSection - b.posInSection);
        const inCartAtTable = seats.filter(s => cartSeatIds.includes(s.id)).length;
        const remaining = seats.filter(s => !s.occupied && !cartSeatIds.includes(s.id)).length;
        const isFull = remaining <= 0 && inCartAtTable === 0;
        const footprint: Footprint = { rows: table.rows!, cols: table.cols! };
        const markers = tableChairLayout(table.shape, seats.length || table.chairCount, footprint);
        const chairStates: ChairVisualState[] = markers.map(marker => {
          const seat = seats[marker.index];
          if (!seat) return 'available';
          if (seat.occupied) return 'sold';
          if (cartSeatIds.includes(seat.id)) return 'selected';
          return 'available';
        });
        return (
          <div
            key={table.id}
            className="relative p-0.5"
            style={{ ...footprintToGridArea(table.row!, table.col!, table.rows!, table.cols!), overflow: 'visible' }}
          >
            <div className="pointer-events-none w-full h-full">
              <TableIcon
                shape={table.shape}
                chairs={seats.length || table.chairCount}
                footprint={footprint}
                label={String(table.number)}
                muted={isFull}
                chairStates={chairStates}
              />
            </div>
            {markers.map(marker => {
              const seat = seats[marker.index];
              if (!seat) return null;
              const isSelected = cartSeatIds.includes(seat.id);
              const isOccupied = seat.occupied;
              const status = isOccupied ? 'occupied' : isSelected ? 'selected' : 'available';
              return (
                <button
                  key={seat.id}
                  type="button"
                  disabled={isOccupied}
                  onClick={e => {
                    e.stopPropagation();
                    if (!isOccupied) onSeatToggle(zone, seat, table);
                  }}
                  data-testid={`seat-${seat.id}`}
                  data-seat-id={seat.id}
                  data-seat-status={status}
                  title={t('gridMap.tableSeatTooltip', {
                    zone: zone.name,
                    table: table.number,
                    seat: seat.number,
                    price: formatPrice(zone.price, currency),
                    occupied: isOccupied ? ` · ${t('gridMap.occupied')}` : '',
                  })}
                  className="absolute z-10 rounded-full border-2 font-bold leading-none flex items-center justify-center pointer-events-auto"
                  style={{
                    left: `${(marker.x / footprint.cols) * 100}%`,
                    top: `${(marker.y / footprint.rows) * 100}%`,
                    width: `max(32px, ${(Math.max(marker.width, marker.height) / footprint.cols) * 100}%)`,
                    height: `max(32px, ${(Math.max(marker.width, marker.height) / footprint.rows) * 100}%)`,
                    transform: 'translate(-50%, -50%)',
                    fontSize: 11,
                    backgroundColor: isOccupied ? '#e5e7eb' : isSelected ? '#059669' : '#ffffff',
                    borderColor: isOccupied ? '#d1d5db' : isSelected ? '#047857' : '#7c5230',
                    color: isOccupied ? '#9ca3af' : isSelected ? '#ffffff' : '#374151',
                    cursor: isOccupied ? 'not-allowed' : 'pointer',
                  }}
                >
                  {seat.number}
                </button>
              );
            })}
            <button
              type="button"
              data-testid={`table-${table.id}`}
              data-table-id={table.id}
              data-table-status={isFull ? 'occupied' : inCartAtTable > 0 ? 'selected' : 'available'}
              data-table-capacity={table.chairCount}
              data-table-available={remaining}
              aria-label={t('gridMap.openTableSeats', { number: table.number })}
              title={t('gridMap.tableTooltip', {
                zone: zone.name,
                number: table.number,
                remaining,
                total: table.chairCount,
                price: formatPrice(zone.price, currency),
              })}
              onClick={() => onTableOpen(zone, table)}
              className="absolute z-[5] pointer-events-auto rounded-full bg-transparent"
              style={{
                left: '32%',
                top: table.shape === 'SOFA' ? '55%' : '32%',
                width: '36%',
                height: '36%',
              }}
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
          ? (tablesByZone[zone.id] ?? []).reduce(
            (s, tbl) => s + (tbl.seats ?? []).filter(seat => cartSeatIds.includes(seat.id)).length,
            0,
          )
          : 0;
        const picked = inCart + seatsInCart + tablesInCart;
        const isEmpty = picked === 0 && (zone.available ?? 0) <= 0;
        const className = [
          'flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-xs transition-colors',
          picked > 0
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

  const selectedSummary: { id: string; label: string; price: number }[] = [];
  for (const zone of zones) {
    for (const seat of seatsByZone[zone.id] ?? []) {
      if (!cartSeatIds.includes(seat.id)) continue;
      selectedSummary.push({
        id: seat.id,
        label: t('register.seatLine', { number: seat.number }),
        price: zone.price,
      });
    }
    for (const table of tablesByZone[zone.id] ?? []) {
      for (const seat of table.seats ?? []) {
        if (!cartSeatIds.includes(seat.id)) continue;
        selectedSummary.push({
          id: seat.id,
          label: `${t('register.tableLine', { number: table.number })} · ${t('register.seatLine', { number: seat.number })}`,
          price: zone.price,
        });
      }
    }
  }
  for (const zone of zones) {
    const qty = cartQuantityByZone[zone.id] ?? 0;
    if (qty > 0) {
      selectedSummary.push({ id: `general:${zone.id}`, label: `${zone.name} × ${qty}`, price: zone.price * qty });
    }
  }

  const selectedTotal = selectedSummary.reduce((s, i) => s + i.price, 0);

  const stateLegend = (
    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
      <span className="flex items-center gap-1.5">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-[#7c5230] bg-white inline-block" />
        {t('seatPicker.free')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-emerald-700 bg-emerald-600 inline-block" />
        {t('seatPicker.inCart')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 bg-gray-200 inline-block" />
        {t('seatPicker.occupied')}
      </span>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex justify-between items-center shrink-0 bg-white px-4 pt-4 pb-2 border-b border-gray-100">
          <span className="font-semibold text-gray-800">{t('gridMap.title')}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              {t('gridMap.buy')}
            </button>
            <button
              type="button"
              onClick={requestClose}
              title={t('common.closeEsc')}
              aria-label={t('common.close')}
              className="h-9 w-9 shrink-0 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-4 py-3 space-y-3">
          {grid}
          {loadingGrid && <p className="text-xs text-gray-400">{t('gridMap.loadingSeats')}</p>}
          {stateLegend}
          {legend}
        </div>
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 space-y-2">
          {selectedSummary.length > 0 && (
            <div data-testid="map-selection" className="flex flex-wrap gap-1.5 max-h-20 overflow-auto">
              {selectedSummary.map(item => (
                <span key={item.id} className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full px-2 py-0.5">
                  {item.label}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
          >
            {selectedSummary.length > 0
              ? `${t('common.done')} · ${formatPrice(selectedTotal, currency)}`
              : t('common.done')}
          </button>
        </div>
      </div>

      {confirmingCancel && (
        <ConfirmDialog
          title={t('gridMap.cancelSelectionTitle')}
          message={t('gridMap.cancelSelectionMessage')}
          confirmLabel={t('gridMap.cancelSelectionConfirm')}
          cancelLabel={t('gridMap.cancelSelectionKeep')}
          onConfirm={onCancel}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </>
  );
}
