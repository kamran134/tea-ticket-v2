import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import type { Venue, Zone, Seat, ZoneTable } from '../types';
import { formatPrice } from '../types';
import { TableIcon, type Footprint } from './TableIcon';
import { tableChairLayout } from './tableChairLayout';
import { sameZoneNeighbor, connectedComponents, boxToGridArea, footprintToGridArea, cellToGridArea } from './grid/gridGeometry';
import { GridCanvas } from './grid/GridCanvas';
import { zoneColor } from './grid/zoneColors';
import { ConfirmDialog } from './ConfirmDialog';
import { SeatMarker, type SeatVisualStatus } from './seatmap/SeatMarker';
import { StageBanner } from './seatmap/StageBanner';
import { MapLegend } from './seatmap/MapLegend';
import { SelectionPanel, type SelectionItem } from './seatmap/SelectionPanel';
import { SeatTooltip } from './seatmap/SeatTooltip';
import { useMapZoom } from './seatmap/useMapZoom';

const DESKTOP_FIT_COLS = 45;
const FLOOR_LINE = 'rgba(255,255,255,0.06)';

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
  onClearZone?: (zone: Zone) => void;
  onClose: () => void;
  onCancel: () => void;
  onOccupiedSeatIds?: (ids: string[]) => void;
  quantityModalOpen: boolean;
}

function neighborBorder(cells: string[][], r: number, c: number, id: string) {
  return {
    borderWidth: 1,
    borderStyle: 'solid' as const,
    borderTopColor: sameZoneNeighbor(cells, r - 1, c, id) ? 'transparent' : FLOOR_LINE,
    borderBottomColor: sameZoneNeighbor(cells, r + 1, c, id) ? 'transparent' : FLOOR_LINE,
    borderLeftColor: sameZoneNeighbor(cells, r, c - 1, id) ? 'transparent' : FLOOR_LINE,
    borderRightColor: sameZoneNeighbor(cells, r, c + 1, id) ? 'transparent' : FLOOR_LINE,
  };
}

export function VenueGridMap({
  venue, zones, currency, cartSeatIds, cartQuantityByZone, cartQuantityByTable,
  onZoneOpen, onSeatToggle, onTableOpen, onClearZone, onClose, onCancel,
  quantityModalOpen, onOccupiedSeatIds,
}: Props) {
  const { t } = useTranslation();
  const layout = venue.gridLayout;
  const scrollRef = useRef<HTMLDivElement>(null);
  const { zoom, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut, canReset } = useMapZoom(scrollRef);

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const hasSelection = cartSeatIds.length > 0
    || Object.values(cartQuantityByZone).some(q => q > 0)
    || Object.values(cartQuantityByTable).some(q => q > 0);

  const requestClose = useCallback(() => {
    if (hasSelection) setConfirmingCancel(true);
    else onCancel();
  }, [hasSelection, onCancel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (quantityModalOpen) return;
      if (e.key === 'Escape') {
        requestClose();
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [quantityModalOpen, requestClose, zoomIn, zoomOut, resetZoom]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const zoneById = useMemo(() => new Map(zones.map((z, i) => [z.id, { zone: z, index: i }])), [zones]);

  const [seatsByZone, setSeatsByZone] = useState<Record<string, Seat[]>>({});
  const [tablesByZone, setTablesByZone] = useState<Record<string, ZoneTable[]>>({});
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [occupiedNotice, setOccupiedNotice] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [mobileInspect, setMobileInspect] = useState<string | null>(null);

  const occupiedCb = useRef(onOccupiedSeatIds);
  occupiedCb.current = onOccupiedSeatIds;
  const cartSeatRef = useRef(cartSeatIds);
  cartSeatRef.current = cartSeatIds;

  useEffect(() => {
    let cancelled = false;
    setLoadingGrid(true);
    setLoadError(false);
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
        if (occupiedIds.some(id => cartSeatRef.current.includes(id))) {
          setOccupiedNotice(true);
        }
        occupiedCb.current?.(occupiedIds);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoadingGrid(false); });
    return () => { cancelled = true; };
  }, [venue.id, reloadKey]);

  const selectedSet = useMemo(() => new Set(cartSeatIds), [cartSeatIds]);

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

  const usedZones = useMemo(() => {
    if (!layout) return [];
    return zones.filter(z => layout.cells.some(row => row.includes(z.id)));
  }, [layout, zones]);

  const inspect = useCallback((el: HTMLElement, open: boolean, text: string) => {
    if (!open) {
      setTip(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTip({ text, x: rect.left + rect.width / 2, y: rect.top });
    setMobileInspect(text);
  }, []);

  const seatStatus = (seat: Seat): SeatVisualStatus => {
    if (seat.occupied) return 'occupied';
    if (selectedSet.has(seat.id)) return 'selected';
    return 'available';
  };

  const statusLabel = (status: SeatVisualStatus | 'empty') => {
    if (status === 'occupied') return t('gridMap.statusOccupied');
    if (status === 'selected') return t('gridMap.statusSelected');
    if (status === 'empty') return t('gridMap.statusEmpty');
    return t('gridMap.statusAvailable');
  };

  const selectionItems = useMemo(() => {
    const items: SelectionItem[] = [];
    for (const zone of zones) {
      for (const seat of seatsByZone[zone.id] ?? []) {
        if (!selectedSet.has(seat.id)) continue;
        const label = t('register.seatLine', { number: seat.number });
        items.push({
          id: seat.id,
          label,
          meta: zone.name,
          price: zone.price,
          removeLabel: t('gridMap.removeSeat', { label }),
          onRemove: () => onSeatToggle(zone, seat),
        });
      }
      for (const table of tablesByZone[zone.id] ?? []) {
        for (const seat of table.seats ?? []) {
          if (!selectedSet.has(seat.id)) continue;
          const label = t('register.placeLine', { table: table.number, seat: seat.number });
          items.push({
            id: seat.id,
            label,
            meta: zone.name,
            price: zone.price,
            removeLabel: t('gridMap.removeSeat', { label }),
            onRemove: () => onSeatToggle(zone, seat, table),
          });
        }
      }
      const qty = cartQuantityByZone[zone.id] ?? 0;
      if (qty > 0) {
        items.push({
          id: `general:${zone.id}`,
          label: `${zone.name} × ${qty}`,
          price: zone.price * qty,
          removeLabel: t('gridMap.removeSeat', { label: zone.name }),
          onRemove: () => (onClearZone ? onClearZone(zone) : onZoneOpen(zone)),
        });
      }
    }
    return items;
  }, [zones, seatsByZone, tablesByZone, selectedSet, cartQuantityByZone, onSeatToggle, onClearZone, onZoneOpen, t]);

  const selectedTotal = selectionItems.reduce((s, i) => s + i.price, 0);
  const selectedCount = cartSeatIds.length + Object.values(cartQuantityByZone).reduce((s, q) => s + q, 0);
  const countLabel = selectedCount > 0
    ? t('gridMap.selectedCount', { count: selectedCount })
    : t('gridMap.yourSelection');
  const continueLabel = selectedCount > 0
    ? `${t('gridMap.buy')} · ${formatPrice(selectedTotal, currency)}`
    : t('common.done');

  const hasSelectable = useMemo(() => {
    if (loadingGrid || loadError) return true;
    for (const zone of usedZones) {
      if (zone.type === 'GENERAL' && (zone.available ?? 0) > 0) return true;
      for (const seat of seatsByZone[zone.id] ?? []) {
        if (!seat.occupied) return true;
      }
      for (const table of tablesByZone[zone.id] ?? []) {
        if ((table.seats ?? []).some(s => !s.occupied)) return true;
      }
    }
    return usedZones.length === 0;
  }, [loadingGrid, loadError, usedZones, seatsByZone, tablesByZone]);

  if (!layout || usedZones.length === 0) return null;

  const grid = (
    <GridCanvas
      ref={scrollRef}
      rows={layout.rows}
      cols={layout.cols}
      maxHeight="100%"
      fitCols={DESKTOP_FIT_COLS}
      cellSize={48}
      zoom={zoom}
      tone="dark"
      onMouseLeave={() => setTip(null)}
      onScroll={() => setTip(null)}
    >
      {layout.cells.map((row, r) =>
        row.map((cell, c) => {
          const place = cellToGridArea(r, c);

          if (cell === 'stage') {
            return (
              <div
                key={`${r}-${c}`}
                style={{
                  ...place,
                  backgroundColor: '#1c1812',
                  ...neighborBorder(layout.cells, r, c, 'stage'),
                }}
              />
            );
          }

          if (cell === 'blocked') {
            return (
              <div
                key={`${r}-${c}`}
                className="seat-map-blocked"
                title={t('gridMap.blocked')}
                style={{ ...place, borderWidth: 1, borderStyle: 'solid', borderColor: FLOOR_LINE }}
              />
            );
          }

          if (cell === 'empty') {
            return (
              <div
                key={`${r}-${c}`}
                className="seat-map-floor"
                style={{ ...place, borderWidth: 1, borderStyle: 'solid', borderColor: FLOOR_LINE }}
              />
            );
          }

          const entry = zoneById.get(cell);
          if (!entry) {
            return (
              <div
                key={`${r}-${c}`}
                className="seat-map-floor"
                style={{ ...place, borderWidth: 1, borderStyle: 'solid', borderColor: FLOOR_LINE }}
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
                  className={loadingGrid ? 'animate-pulse' : undefined}
                  style={{
                    ...place,
                    backgroundColor: `${color}22`,
                    borderWidth: 1, borderStyle: 'solid', borderColor: FLOOR_LINE,
                  }}
                />
              );
            }
            const status = seatStatus(seat);
            const tooltip = t('gridMap.seatTooltip', {
              zone: zone.name,
              number: seat.number,
              price: formatPrice(zone.price, currency),
              occupied: status === 'occupied' ? ` · ${t('gridMap.occupied')}` : '',
            });
            return (
              <div
                key={`${r}-${c}`}
                style={{ ...place, backgroundColor: `${color}18`, borderWidth: 1, borderStyle: 'solid', borderColor: FLOOR_LINE }}
              >
                <SeatMarker
                  seatId={seat.id}
                  number={seat.number}
                  status={status}
                  accentColor={color}
                  ariaLabel={t('gridMap.seatAria', {
                    zone: zone.name,
                    number: seat.number,
                    price: formatPrice(zone.price, currency),
                    status: statusLabel(status),
                  })}
                  onToggle={() => onSeatToggle(zone, seat)}
                  onInspect={(el, open) => inspect(el, open, tooltip)}
                />
              </div>
            );
          }

          if (zone.type === 'TABLE') {
            const table = tableByCell.get(`${zone.id}|${r}|${c}`);
            if (!table) {
              return (
                <div
                  key={`${r}-${c}`}
                  className="seat-map-floor"
                  style={{ ...place, borderWidth: 1, borderStyle: 'solid', borderColor: FLOOR_LINE }}
                />
              );
            }
            const seats = table.seats ?? [];
            const inCartAtTable = seats.filter(s => selectedSet.has(s.id)).length;
            const remaining = seats.filter(s => !s.occupied && !selectedSet.has(s.id)).length;
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
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderTopColor: sameTable(r - 1, c) ? 'transparent' : FLOOR_LINE,
                  borderBottomColor: sameTable(r + 1, c) ? 'transparent' : FLOOR_LINE,
                  borderLeftColor: sameTable(r, c - 1) ? 'transparent' : FLOOR_LINE,
                  borderRightColor: sameTable(r, c + 1) ? 'transparent' : FLOOR_LINE,
                  pointerEvents: 'none',
                }}
              />
            );
          }

          const inCart = cartQuantityByZone[zone.id] ?? 0;
          const isEmpty = inCart === 0 && (zone.available ?? 0) <= 0;
          const tooltip = t('gridMap.zoneTooltip', {
            zone: zone.name,
            price: formatPrice(zone.price, currency),
            empty: isEmpty ? ` · ${t('gridMap.noSeats')}` : '',
          });
          return (
            <div
              key={`${r}-${c}`}
              onClick={() => !isEmpty && onZoneOpen(zone)}
              title={tooltip}
              aria-label={t('gridMap.zoneAria', {
                zone: zone.name,
                price: formatPrice(zone.price, currency),
                status: isEmpty ? t('gridMap.statusEmpty') : t('gridMap.statusAvailable'),
              })}
              style={{
                ...place,
                backgroundColor: inCart > 0 ? `${color}cc` : `${color}99`,
                ...neighborBorder(layout.cells, r, c, zone.id),
                cursor: isEmpty ? 'not-allowed' : 'pointer',
                opacity: isEmpty ? 0.45 : 1,
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
              textShadow: '0 1px 2px rgba(0,0,0,0.65)',
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
        <StageBanner
          key={i}
          label={t('gridMap.stage')}
          subtitle={venue.name}
          style={boxToGridArea(box)}
        />
      ))}

      {tableFootprints.map(({ zone, table }) => {
        const seats = [...(table.seats ?? [])].sort((a, b) => a.posInSection - b.posInSection);
        const inCartAtTable = seats.filter(s => selectedSet.has(s.id)).length;
        const remaining = seats.filter(s => !s.occupied && !selectedSet.has(s.id)).length;
        const isFull = remaining <= 0 && inCartAtTable === 0;
        const footprint: Footprint = { rows: table.rows!, cols: table.cols! };
        const markers = tableChairLayout(table.shape, seats.length || table.chairCount, footprint);
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
                showChairs={false}
              />
            </div>
            {markers.map(marker => {
              const seat = seats[marker.index];
              if (!seat) return null;
              const status = seatStatus(seat);
              const tooltip = t('gridMap.tableSeatTooltip', {
                zone: zone.name,
                table: table.number,
                seat: seat.number,
                price: formatPrice(zone.price, currency),
                occupied: status === 'occupied' ? ` · ${t('gridMap.occupied')}` : '',
              });
              const hit = Math.max(marker.width, marker.height);
              return (
                <SeatMarker
                  key={seat.id}
                  seatId={seat.id}
                  number={seat.number}
                  status={status}
                  accentColor={zoneColor(zone, zoneById.get(zone.id)?.index ?? 0)}
                  shape={marker.shape === 'rect' ? 'rect' : 'circle'}
                  placement="overlay"
                  style={{
                    left: `${(marker.x / footprint.cols) * 100}%`,
                    top: `${(marker.y / footprint.rows) * 100}%`,
                    width: `max(40px, ${(hit / footprint.cols) * 130}%)`,
                    height: `max(40px, ${(hit / footprint.rows) * 130}%)`,
                  }}
                  ariaLabel={t('gridMap.tableSeatAria', {
                    zone: zone.name,
                    table: table.number,
                    seat: seat.number,
                    price: formatPrice(zone.price, currency),
                    status: statusLabel(status),
                  })}
                  onToggle={() => onSeatToggle(zone, seat, table)}
                  onInspect={(el, open) => inspect(el, open, tooltip)}
                />
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

  const stateLegend = [
    { key: 'available', label: t('seatPicker.free'), swatch: 'available' as const },
    { key: 'selected', label: t('seatPicker.inCart'), swatch: 'selected' as const },
    { key: 'occupied', label: t('seatPicker.occupied'), swatch: 'occupied' as const },
    { key: 'blocked', label: t('gridMap.blocked'), swatch: 'blocked' as const },
  ];

  const zoneLegend = usedZones.map(zone => {
    const index = zoneById.get(zone.id)!.index;
    const inCart = cartQuantityByZone[zone.id] ?? 0;
    const seatsInCart = zone.type === 'SEATED'
      ? (seatsByZone[zone.id] ?? []).filter(s => selectedSet.has(s.id)).length
      : 0;
    const tablesInCart = zone.type === 'TABLE'
      ? (tablesByZone[zone.id] ?? []).reduce(
        (s, tbl) => s + (tbl.seats ?? []).filter(seat => selectedSet.has(seat.id)).length,
        0,
      )
      : 0;
    const picked = inCart + seatsInCart + tablesInCart;
    const isEmpty = picked === 0 && (zone.available ?? 0) <= 0;
    return {
      key: zone.id,
      label: zone.name,
      swatch: 'zone' as const,
      color: zoneColor(zone, index),
      hint: `${formatPrice(zone.price, currency)}${zone.available !== undefined ? ` · ${isEmpty ? t('gridMap.noSeats') : t('gridMap.seatsAvailable', { count: zone.available })}` : ''}${picked > 0 ? ` × ${picked}` : ''}`,
      active: picked > 0,
      disabled: isEmpty && zone.type === 'GENERAL',
      onClick: zone.type === 'GENERAL' && !isEmpty ? () => onZoneOpen(zone) : undefined,
    };
  });

  const selectionPanelProps = {
    title: t('gridMap.yourSelection'),
    items: selectionItems,
    countLabel,
    total: selectedTotal,
    currency,
    continueLabel,
    emptyHint: t('gridMap.emptyHint'),
    onContinue: onClose,
  };

  return (
    <>
      <div
        className="seat-map-overlay fixed inset-0 z-50 flex flex-col bg-[#0a0a0a] text-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seat-map-title"
      >
        <a
          href="#seat-map-summary"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:bg-black focus:px-3 focus:py-2 focus:rounded-lg"
        >
          {t('gridMap.skipToSelection')}
        </a>

        <header className="flex justify-between items-center shrink-0 px-4 pt-4 pb-2 border-b border-white/10 gap-3">
          <div id="seat-map-summary" className="min-w-0">
            <span id="seat-map-title" className="font-semibold tracking-wide">{t('gridMap.title')}</span>
            {selectionItems.length > 0 && (
              <div data-testid="map-selection" className="text-xs text-emerald-300/90 truncate">
                {selectionItems.map(item => item.label).join(' · ')}
              </div>
            )}
          </div>
          {/* The confirm action lives only in SelectionPanel — the sidebar from md up, the
              sticky bar below it — so it is never duplicated and always carries the total. */}
          <button
            type="button"
            onClick={requestClose}
            title={t('common.closeEsc')}
            aria-label={t('common.close')}
            className="h-9 w-9 shrink-0 flex items-center justify-center border border-white/15 rounded-lg hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </header>

        {occupiedNotice && (
          <div className="shrink-0 px-4 py-2 text-sm bg-amber-500/15 text-amber-100 border-b border-amber-500/20">
            {t('gridMap.occupiedNotice')}
          </div>
        )}

        {loadError && (
          <div className="shrink-0 px-4 py-3 text-sm bg-red-500/10 text-red-100 border-b border-red-500/20 flex items-center justify-between gap-3">
            <span>{t('gridMap.loadError')}</span>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="shrink-0 h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 font-medium"
            >
              {t('gridMap.retry')}
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 flex">
          <div className="relative flex-1 min-h-0 flex flex-col px-3 py-3 gap-3">
            {!hasSelectable && !loadingGrid && (
              <div className="shrink-0 text-center text-sm text-white/60 bg-white/5 rounded-xl py-2">
                {t('gridMap.allOccupied')}
              </div>
            )}
            <div className="relative flex-1 min-h-0">
              {grid}
              {loadingGrid && (
                <div className="absolute inset-0 pointer-events-none rounded-xl bg-[#121214]/40 flex items-end justify-start p-3">
                  <span className="text-xs text-white/50 bg-black/40 rounded-md px-2 py-1">
                    {t('gridMap.loadingSeats')}
                  </span>
                </div>
              )}
              <div className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
                <div className="seat-map-zoom">
                  <button type="button" onClick={zoomIn} disabled={!canZoomIn} aria-label={t('gridMap.zoomIn')}>+</button>
                  <button type="button" onClick={zoomOut} disabled={!canZoomOut} aria-label={t('gridMap.zoomOut')}>−</button>
                </div>
                <button
                  type="button"
                  onClick={resetZoom}
                  disabled={!canReset}
                  className="h-9 px-3 rounded-lg border border-white/12 bg-[#121214]/90 text-[11px] font-medium text-white/80 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  {t('gridMap.resetZoom')}
                </button>
              </div>
            </div>
            <div className="md:hidden">
              <MapLegend collapsible states={stateLegend} zones={zoneLegend} />
            </div>
            {mobileInspect && (
              <p className="md:hidden text-xs text-white/60 truncate">{mobileInspect}</p>
            )}
          </div>

          <aside className="hidden md:flex w-80 shrink-0 flex-col border-l border-white/10 px-4 py-4 gap-4 bg-[#0e0e10]">
            <MapLegend states={stateLegend} zones={zoneLegend} />
            <div className="flex-1 min-h-0">
              <SelectionPanel {...selectionPanelProps} />
            </div>
          </aside>
        </div>

        <div className="md:hidden shrink-0 border-t border-white/10 bg-[#0e0e10] px-4 py-3 space-y-2">
          {selectionItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-16 overflow-auto">
              {selectionItems.map(item => (
                <span key={item.id} className="text-xs bg-emerald-500/15 text-emerald-100 border border-emerald-400/30 rounded-full px-2 py-0.5">
                  {item.label}
                </span>
              ))}
            </div>
          )}
          <SelectionPanel compact {...selectionPanelProps} />
        </div>
      </div>

      {tip && <SeatTooltip text={tip.text} x={tip.x} y={tip.y} />}

      {confirmingCancel && (
        <div className="relative z-[80]">
          <ConfirmDialog
            title={t('gridMap.cancelSelectionTitle')}
            message={t('gridMap.cancelSelectionMessage')}
            confirmLabel={t('gridMap.cancelSelectionConfirm')}
            cancelLabel={t('gridMap.cancelSelectionKeep')}
            onConfirm={onCancel}
            onCancel={() => setConfirmingCancel(false)}
          />
        </div>
      )}
    </>
  );
}
