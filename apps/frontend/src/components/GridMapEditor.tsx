import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { api } from '../services/api';
import type { Venue, GridLayout, GridZone, GridCellState } from '../types';
import { formatPrice } from '../types';
import { toast } from '../services/toast';

const ZONE_COLORS = [
  '#059669', '#0284c7', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
  '#374151', '#b45309', '#9333ea', '#0d9488',
];

type Tool = 'block' | 'erase' | string;

function buildCells(rows: number, cols: number, existing?: GridCellState[][]): GridCellState[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => existing?.[r]?.[c] ?? 'empty'),
  );
}

function countCellsByZone(cells: GridCellState[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cell of cells) {
    if (cell !== 'empty' && cell !== 'blocked') {
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  return counts;
}

interface Props {
  venue: Venue;
  onVenueUpdated: (venue: Venue) => void;
}

export function GridMapEditor({ venue, onVenueUpdated }: Props) {
  const initial = venue.gridLayout;
  const currency = venue.currency;

  const [rows, setRows] = useState(initial?.rows ?? 10);
  const [cols, setCols] = useState(initial?.cols ?? 15);
  const [pendingRows, setPendingRows] = useState(initial?.rows ?? 10);
  const [pendingCols, setPendingCols] = useState(initial?.cols ?? 15);
  const [cells, setCells] = useState<GridCellState[][]>(() =>
    buildCells(initial?.rows ?? 10, initial?.cols ?? 15, initial?.cells),
  );
  const [zones, setZones] = useState<GridZone[]>(initial?.zones ?? []);
  const [activeTool, setActiveTool] = useState<Tool>('block');
  const [locked, setLocked] = useState(!!initial);
  const [saving, setSaving] = useState(false);

  // Zone creation form
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZonePrice, setNewZonePrice] = useState('');
  const [newZoneColor, setNewZoneColor] = useState(ZONE_COLORS[0]);

  // Drawing
  const isDrawing = useRef(false);
  const drawValue = useRef<GridCellState>('blocked');

  useEffect(() => {
    const stop = () => { isDrawing.current = false; };
    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  }, []);

  const applyGridSize = () => {
    const r = Math.max(1, Math.min(100, pendingRows));
    const c = Math.max(1, Math.min(100, pendingCols));
    setRows(r);
    setCols(c);
    setPendingRows(r);
    setPendingCols(c);
    setCells(prev => buildCells(r, c, prev));
  };

  const handleCellMouseDown = useCallback((row: number, col: number) => {
    if (locked) return;
    isDrawing.current = true;
    setCells(prev => {
      const currentValue = prev[row][col];
      const paintValue: GridCellState =
        activeTool === 'erase' ? 'empty' :
        currentValue === activeTool ? 'empty' : activeTool;
      drawValue.current = paintValue;
      const next = [...prev];
      next[row] = [...prev[row]];
      next[row][col] = paintValue;
      return next;
    });
  }, [locked, activeTool]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (!isDrawing.current || locked) return;
    setCells(prev => {
      if (prev[row][col] === drawValue.current) return prev;
      const next = [...prev];
      next[row] = [...prev[row]];
      next[row][col] = drawValue.current;
      return next;
    });
  }, [locked]);

  const addZone = () => {
    if (!newZoneName.trim() || !newZonePrice) return;
    const zone: GridZone = {
      id: `z-${Date.now()}`,
      name: newZoneName.trim(),
      color: newZoneColor,
      pricePerSeat: Number(newZonePrice),
    };
    setZones(prev => [...prev, zone]);
    setActiveTool(zone.id);
    setShowZoneForm(false);
    setNewZoneName('');
    setNewZonePrice('');
    setNewZoneColor(ZONE_COLORS[(zones.length + 1) % ZONE_COLORS.length]);
  };

  const removeZone = useCallback((zoneId: string) => {
    setZones(prev => prev.filter(z => z.id !== zoneId));
    setCells(prev => prev.map(row => row.map(c => (c === zoneId ? 'empty' : c))));
    setActiveTool(t => (t === zoneId ? 'block' : t));
  }, []);

  const clearAll = () => {
    setCells(buildCells(rows, cols));
  };

  const revenue = useMemo(() => {
    const flat = cells.flat();
    const countsByZone = countCellsByZone(flat);
    let total = 0;
    const details = zones.map(zone => {
      const count = countsByZone[zone.id] ?? 0;
      const amount = count * zone.pricePerSeat;
      total += amount;
      return { zone, count, amount };
    });
    return { total, details };
  }, [cells, zones]);

  const save = async () => {
    setSaving(true);
    try {
      const layout: GridLayout = { rows, cols, cells, zones };
      const updated = await api.saveGridLayout(venue.id, layout);
      onVenueUpdated(updated);
      setLocked(true);
      toast.success('Схема сохранена');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-gray-800">Сетка зала</h3>
        <div className="flex gap-2 items-center">
          {!locked && (
            <button
              type="button"
              onClick={clearAll}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              Очистить
            </button>
          )}
          {locked ? (
            <button
              type="button"
              onClick={() => setLocked(false)}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Редактировать
            </button>
          ) : (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Сохранить и заблокировать'}
            </button>
          )}
        </div>
      </div>

      {/* Grid size controls */}
      {!locked && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">Размер:</span>
          <input
            type="number"
            min={1}
            max={100}
            value={pendingRows}
            onChange={e => setPendingRows(Number(e.target.value))}
            className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
          />
          <span className="text-gray-400 text-sm">строк ×</span>
          <input
            type="number"
            min={1}
            max={100}
            value={pendingCols}
            onChange={e => setPendingCols(Number(e.target.value))}
            className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
          />
          <span className="text-gray-400 text-sm">столбцов</span>
          <button
            type="button"
            onClick={applyGridSize}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Применить
          </button>
        </div>
      )}

      {/* Toolbar */}
      {!locked && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Block tool */}
            <button
              type="button"
              onClick={() => setActiveTool('block')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                activeTool === 'block'
                  ? 'border-gray-700 bg-gray-700 text-white'
                  : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="w-3 h-3 rounded-sm bg-gray-400 shrink-0" />
              Блок
            </button>

            {/* Erase tool */}
            <button
              type="button"
              onClick={() => setActiveTool('erase')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                activeTool === 'erase'
                  ? 'border-gray-700 bg-gray-700 text-white'
                  : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="w-3 h-3 rounded-sm border border-gray-400 shrink-0" />
              Стереть
            </button>

            {/* Divider */}
            {zones.length > 0 && <span className="w-px h-6 bg-gray-200" />}

            {/* Zone tools */}
            {zones.map(zone => (
              <div
                key={zone.id}
                className={`flex items-center rounded-lg border-2 transition-all overflow-hidden ${
                  activeTool === zone.id ? 'border-gray-800' : 'border-transparent'
                }`}
                style={{ backgroundColor: `${zone.color}18` }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTool(zone.id)}
                  className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 text-sm"
                >
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zone.color }} />
                  <span className="font-medium text-gray-800">{zone.name}</span>
                  <span className="text-gray-400 text-xs">{formatPrice(zone.pricePerSeat, currency)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeZone(zone.id)}
                  className="text-gray-300 hover:text-red-400 pr-2 pl-0.5 py-1.5 text-xs transition-colors"
                  title="Удалить зону"
                >
                  ✕
                </button>
              </div>
            ))}

            {/* Add zone button */}
            <button
              type="button"
              onClick={() => setShowZoneForm(s => !s)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-emerald-700 border-2 border-dashed border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              + Зона
            </button>
          </div>

          {/* Zone creation form */}
          {showZoneForm && (
            <div className="bg-gray-50 rounded-xl p-3 flex flex-wrap items-end gap-3 border border-gray-200">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Название</label>
                <input
                  type="text"
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addZone()}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  placeholder="VIP"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Цена за место ({currency})</label>
                <input
                  type="number"
                  value={newZonePrice}
                  onChange={e => setNewZonePrice(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addZone()}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  placeholder="5000"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Цвет</label>
                <div className="flex gap-1 flex-wrap max-w-[160px]">
                  {ZONE_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewZoneColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        newZoneColor === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addZone}
                  disabled={!newZoneName.trim() || !newZonePrice}
                  className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
                >
                  Добавить
                </button>
                <button
                  type="button"
                  onClick={() => setShowZoneForm(false)}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grid canvas */}
      <div
        className="w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-100 select-none"
        onMouseLeave={() => { isDrawing.current = false; }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: '1px',
          }}
        >
          {cells.map((row, r) =>
            row.map((cell, c) => {
              const zone = cell !== 'empty' && cell !== 'blocked'
                ? zones.find(z => z.id === cell)
                : null;
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    aspectRatio: '1',
                    backgroundColor:
                      cell === 'blocked' ? '#9ca3af' :
                      zone ? zone.color + 'cc' : '#ffffff',
                    cursor: locked ? 'default' : 'crosshair',
                    minWidth: 4,
                    minHeight: 4,
                  }}
                  onMouseDown={() => handleCellMouseDown(r, c)}
                  onMouseEnter={() => handleCellMouseEnter(r, c)}
                />
              );
            }),
          )}
        </div>
      </div>

      {/* Legend when locked */}
      {locked && zones.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {zones.map(zone => {
            const count = revenue.details.find(d => d.zone.id === zone.id)?.count ?? 0;
            return (
              <div key={zone.id} className="flex items-center gap-1.5 text-sm">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zone.color }} />
                <span className="text-gray-700">{zone.name}</span>
                <span className="text-gray-400">({count} мест)</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="w-3 h-3 rounded-sm shrink-0 bg-gray-400" />
            <span className="text-gray-400">Нет мест</span>
          </div>
        </div>
      )}

      {/* Revenue summary */}
      {zones.length > 0 && revenue.details.some(d => d.count > 0) && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-2.5 border border-gray-100">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ожидаемая выручка</span>
          <div className="space-y-1.5">
            {revenue.details
              .filter(d => d.count > 0)
              .map(({ zone, count, amount }) => (
                <div key={zone.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zone.color }} />
                    <span className="text-gray-700 truncate">{zone.name}</span>
                    <span className="text-gray-400 text-xs shrink-0">
                      {count} × {formatPrice(zone.pricePerSeat, currency)}
                    </span>
                  </div>
                  <span className="font-medium text-gray-800 ml-2 shrink-0">
                    {formatPrice(amount, currency)}
                  </span>
                </div>
              ))}
          </div>
          <div className="flex justify-between items-center border-t border-gray-100 pt-2">
            <span className="font-semibold text-gray-700">Итого</span>
            <span className="font-bold text-emerald-700 text-lg">{formatPrice(revenue.total, currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
