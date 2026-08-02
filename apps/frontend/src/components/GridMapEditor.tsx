import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { api } from '../services/api';
import type { Venue, Zone, ZoneType, GridLayout, GridCellState, GridTemplateSummary, GridTemplateZoneSlot } from '../types';
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
    if (cell !== 'empty' && cell !== 'blocked' && cell !== 'stage') {
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  return counts;
}

function zoneColor(zone: Zone, index: number): string {
  return zone.color ?? ZONE_COLORS[index % ZONE_COLORS.length];
}

const GRID_LINE = '#e5e7eb';

// Cells painted with the same GENERAL zone should read as one filled area,
// not a grid — so the border between two such neighbours is hidden.
function sameZoneNeighbor(cells: GridCellState[][], r: number, c: number, zoneId: string): boolean {
  return cells[r]?.[c] === zoneId;
}

interface ZoneBox { minRow: number; maxRow: number; minCol: number; maxCol: number }

function zoneBoundingBoxes(cells: GridCellState[][], zoneIds: Set<string>): Map<string, ZoneBox> {
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

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
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
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>('block');
  const [locked, setLocked] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const [addingZone, setAddingZone] = useState(false);

  // Zone creation form
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZonePrice, setNewZonePrice] = useState('');
  const [newZoneColor, setNewZoneColor] = useState(ZONE_COLORS[0]);
  const [newZoneType, setNewZoneType] = useState<ZoneType>('SEATED');
  const [newZoneCapacity, setNewZoneCapacity] = useState('');
  const [newZoneTableChairs, setNewZoneTableChairs] = useState('');

  // Zone editing (name/price/capacity/color) — for any zone type, incl. tables
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [editZonePrice, setEditZonePrice] = useState('');
  const [editZoneCapacity, setEditZoneCapacity] = useState('');
  const [editZoneTableChairs, setEditZoneTableChairs] = useState('');
  const [editZoneColor, setEditZoneColor] = useState(ZONE_COLORS[0]);
  const [savingZoneEdit, setSavingZoneEdit] = useState(false);

  // Grid templates
  const [templates, setTemplates] = useState<GridTemplateSummary[]>([]);
  const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  // Large grids are cramped inline — always offer a fullscreen view
  const [expanded, setExpanded] = useState(false);

  // Drawing
  const isDrawing = useRef(false);
  const drawValue = useRef<GridCellState>('blocked');

  useEffect(() => {
    const stop = () => { isDrawing.current = false; };
    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  }, []);

  // Load real zones for this venue; drop any painted cell referencing a zone
  // that no longer exists (e.g. leftover ids from before this feature existed).
  const loadZones = useCallback(() => {
    let cancelled = false;
    setZonesLoading(true);
    setZonesError(false);
    api.getZones(venue.id)
      .then(zs => {
        if (cancelled) return;
        setZones(zs);
        const validIds = new Set(zs.map(z => z.id));
        setCells(prev =>
          prev.map(row => row.map(c => (c === 'empty' || c === 'blocked' || c === 'stage' || validIds.has(c) ? c : 'empty'))),
        );
      })
      .catch(err => {
        if (cancelled) return;
        setZonesError(true);
        toast.error(errMsg(err, 'Не удалось загрузить зоны'));
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false);
      });
    return () => { cancelled = true; };
  }, [venue.id]);

  useEffect(() => loadZones(), [loadZones]);

  useEffect(() => {
    api.getGridTemplates().then(setTemplates).catch(() => {});
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
        activeTool === 'block' ?
          (currentValue === 'blocked' ? 'empty' : 'blocked') :
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

  const resetZoneForm = () => {
    setNewZoneName('');
    setNewZonePrice('');
    setNewZoneType('SEATED');
    setNewZoneCapacity('');
    setNewZoneTableChairs('');
    setNewZoneColor(ZONE_COLORS[zones.length % ZONE_COLORS.length]);
  };

  const addZone = async () => {
    if (!newZoneName.trim() || !newZonePrice) return;
    if (newZoneType === 'GENERAL' && !newZoneCapacity) return;
    if (newZoneType === 'TABLE' && !newZoneTableChairs) return;

    setAddingZone(true);
    try {
      const zone = await api.createZone({
        venueId: venue.id,
        name: newZoneName.trim(),
        price: Number(newZonePrice),
        capacity: newZoneType === 'GENERAL' ? Number(newZoneCapacity) : 1,
        sortOrder: zones.length,
        type: newZoneType,
        color: newZoneColor,
        layoutData: null,
        tableChairs: newZoneType === 'TABLE' ? Number(newZoneTableChairs) : null,
      });
      setZones(prev => [...prev, zone]);
      setActiveTool(zone.id);
      setShowZoneForm(false);
      resetZoneForm();
      toast.success('Зона создана');
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось создать зону'));
    } finally {
      setAddingZone(false);
    }
  };

  const removeZone = useCallback(async (zone: Zone) => {
    try {
      await api.deleteZone(zone.id);
      setZones(prev => prev.filter(z => z.id !== zone.id));
      setCells(prev => prev.map(row => row.map(c => (c === zone.id ? 'empty' : c))));
      setActiveTool(t => (t === zone.id ? 'block' : t));
      toast.success('Зона удалена');
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось удалить зону — возможно, на неё уже есть билеты'));
    }
  }, []);

  const startEditZone = (zone: Zone) => {
    setEditingZoneId(zone.id);
    setEditZoneName(zone.name);
    setEditZonePrice(String(zone.price));
    setEditZoneCapacity(zone.type === 'GENERAL' ? String(zone.capacity) : '');
    setEditZoneTableChairs(zone.type === 'TABLE' ? String(zone.tableChairs ?? '') : '');
    setEditZoneColor(zone.color ?? ZONE_COLORS[0]);
  };

  const saveZoneEdit = async (zone: Zone) => {
    if (!editZoneName.trim() || !editZonePrice) return;
    setSavingZoneEdit(true);
    try {
      const updated = await api.updateZone(zone.id, {
        name: editZoneName.trim(),
        price: Number(editZonePrice),
        color: editZoneColor,
        ...(zone.type === 'GENERAL' && editZoneCapacity && { capacity: Number(editZoneCapacity) }),
        ...(zone.type === 'TABLE' && editZoneTableChairs && { tableChairs: Number(editZoneTableChairs) }),
      });
      setZones(prev => prev.map(z => (z.id === updated.id ? updated : z)));
      setEditingZoneId(null);
      toast.success('Зона обновлена');
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось сохранить зону'));
    } finally {
      setSavingZoneEdit(false);
    }
  };

  const clearAll = () => {
    setCells(buildCells(rows, cols));
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim() || zones.length === 0) return;
    setSavingTemplate(true);
    try {
      const slotMap = new Map(zones.map((z, i) => [z.id, `slot-${i}`]));
      const templateCells = cells.map(row => row.map(c => slotMap.get(c) ?? c));
      const templateZones: GridTemplateZoneSlot[] = zones.map((z, i) => ({
        slotId: `slot-${i}`,
        name: z.name,
        color: z.color,
        type: z.type,
        ...(z.type === 'GENERAL' && { capacity: z.capacity }),
        ...(z.type === 'TABLE' && { tableChairs: z.tableChairs ?? undefined }),
      }));
      const created = await api.saveGridTemplate({
        name: templateName.trim(), rows, cols, cells: templateCells, zones: templateZones,
      });
      setTemplates(prev => [
        { id: created.id, name: created.name, rows: created.rows, cols: created.cols, zoneCount: templateZones.length, createdAt: created.createdAt },
        ...prev,
      ]);
      setShowSaveTemplateForm(false);
      setTemplateName('');
      toast.success('Шаблон сохранён');
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось сохранить шаблон'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    if (!templateId) return;
    setApplyingTemplateId(templateId);
    try {
      const template = await api.getGridTemplate(templateId);
      const slotToRealId = new Map<string, string>();
      const createdZones: Zone[] = [];
      let sortOrder = zones.length;
      for (const slot of template.zones) {
        const zone = await api.createZone({
          venueId: venue.id,
          name: slot.name,
          price: 1, // placeholder — backend requires price > 0; admin must set the real price
          capacity: slot.type === 'GENERAL' ? (slot.capacity ?? 1) : 1,
          sortOrder: sortOrder++,
          type: slot.type as ZoneType,
          color: slot.color,
          layoutData: null,
          tableChairs: slot.type === 'TABLE' ? (slot.tableChairs ?? 4) : null,
        });
        slotToRealId.set(slot.slotId, zone.id);
        createdZones.push(zone);
      }
      setZones(prev => [...prev, ...createdZones]);
      setRows(template.rows);
      setCols(template.cols);
      setPendingRows(template.rows);
      setPendingCols(template.cols);
      setCells(template.cells.map(row =>
        row.map(c => (c === 'empty' || c === 'blocked' || c === 'stage' ? c : (slotToRealId.get(c) ?? 'empty'))),
      ));
      setLocked(false);
      toast.success('Шаблон применён — проставьте цены зон и сохраните сетку');
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось загрузить шаблон'));
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const generalZoneBoxes = useMemo(() => {
    const generalIds = new Set(zones.filter(z => z.type === 'GENERAL').map(z => z.id));
    return zoneBoundingBoxes(cells, generalIds);
  }, [cells, zones]);

  const stageBox = useMemo(() => zoneBoundingBoxes(cells, new Set(['stage'])).get('stage'), [cells]);

  const revenue = useMemo(() => {
    const flat = cells.flat();
    const countsByZone = countCellsByZone(flat);
    let total = 0;
    const details = zones.map(zone => {
      // GENERAL zones sell by declared capacity, not by painted cell count;
      // TABLE zones sell by chairs per table, not by number of painted tables
      const count =
        zone.type === 'GENERAL' ? zone.capacity :
        zone.type === 'TABLE' ? (countsByZone[zone.id] ?? 0) * (zone.tableChairs ?? 1) :
        (countsByZone[zone.id] ?? 0);
      const amount = count * zone.price;
      total += amount;
      return { zone, count, amount };
    });
    return { total, details };
  }, [cells, zones]);

  const save = async () => {
    setSaving(true);
    try {
      const layout: GridLayout = { rows, cols, cells };
      const { venue: updatedVenue, zones: updatedZones } = await api.saveGridLayout(venue.id, layout);
      onVenueUpdated(updatedVenue);
      setZones(updatedZones);
      setLocked(true);
      toast.success('Схема сохранена');
    } catch (err) {
      toast.error(errMsg(err, 'Ошибка сохранения'));
    } finally {
      setSaving(false);
    }
  };

  const zoneEditForm = (zone: Zone) => (
    <div className="bg-gray-50 rounded-xl p-3 flex flex-wrap items-end gap-3 border border-gray-200">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Название</label>
        <input
          type="text"
          value={editZoneName}
          onChange={e => setEditZoneName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Цена ({currency})</label>
        <input
          type="number"
          value={editZonePrice}
          onChange={e => setEditZonePrice(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
          min="0"
        />
      </div>
      {zone.type === 'GENERAL' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Вместимость</label>
          <input
            type="number"
            value={editZoneCapacity}
            onChange={e => setEditZoneCapacity(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
            min="1"
          />
        </div>
      )}
      {zone.type === 'TABLE' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Мест за столом</label>
          <input
            type="number"
            value={editZoneTableChairs}
            onChange={e => setEditZoneTableChairs(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
            min="1"
          />
        </div>
      )}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Цвет</label>
        <div className="flex gap-1 flex-wrap max-w-[160px]">
          {ZONE_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setEditZoneColor(c)}
              style={{ backgroundColor: c }}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                editZoneColor === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
              }`}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => saveZoneEdit(zone)}
          disabled={savingZoneEdit || !editZoneName.trim() || !editZonePrice}
          className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
        >
          {savingZoneEdit ? '...' : 'Сохранить'}
        </button>
        <button
          type="button"
          onClick={() => setEditingZoneId(null)}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );

  return (
    <div className={expanded ? 'fixed inset-0 z-50 bg-white overflow-auto p-4 space-y-4' : 'space-y-4'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-gray-800">Схема зала</h3>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {expanded ? 'Свернуть' : 'На весь экран'}
          </button>
          {!locked && (
            <button
              type="button"
              onClick={clearAll}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              Очистить
            </button>
          )}
          {!locked && (
            <>
              <button
                type="button"
                onClick={() => setShowSaveTemplateForm(s => !s)}
                disabled={zones.length === 0}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Сохранить как шаблон
              </button>
              <select
                value=""
                onChange={e => applyTemplate(e.target.value)}
                disabled={applyingTemplateId !== null || templates.length === 0}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-40"
              >
                <option value="">
                  {applyingTemplateId ? 'Применяю...' : templates.length === 0 ? 'Нет шаблонов' : 'Загрузить шаблон...'}
                </option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.rows}×{t.cols}, {t.zoneCount} зон)</option>
                ))}
              </select>
            </>
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

      {showSaveTemplateForm && (
        <div className="bg-gray-50 rounded-xl p-3 flex flex-wrap items-end gap-3 border border-gray-200">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Название шаблона</label>
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
              placeholder="Кирхе — основной зал"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveAsTemplate}
              disabled={savingTemplate || !templateName.trim()}
              className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              {savingTemplate ? '...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={() => { setShowSaveTemplateForm(false); setTemplateName(''); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Zones load status */}
      {zonesLoading && (
        <p className="text-sm text-gray-400">Загрузка зон...</p>
      )}
      {!zonesLoading && zonesError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <span>Не удалось загрузить зоны.</span>
          <button
            type="button"
            onClick={loadZones}
            className="underline hover:text-red-700"
          >
            Повторить
          </button>
        </div>
      )}

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

            {/* Stage tool — decorative only, not sellable */}
            <button
              type="button"
              onClick={() => setActiveTool('stage')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                activeTool === 'stage'
                  ? 'border-gray-700 bg-gray-700 text-white'
                  : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="w-3 h-3 rounded-sm bg-slate-800 shrink-0" />
              Сцена
            </button>

            {/* Divider */}
            {zones.length > 0 && <span className="w-px h-6 bg-gray-200" />}

            {/* Zone tools */}
            {zones.map((zone, i) => (
              editingZoneId === zone.id ? (
                <div key={zone.id} className="w-full">{zoneEditForm(zone)}</div>
              ) : (
                <div
                  key={zone.id}
                  className={`flex items-center rounded-lg border-2 transition-all overflow-hidden ${
                    activeTool === zone.id ? 'border-gray-800' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: `${zoneColor(zone, i)}18` }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTool(zone.id)}
                    className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 text-sm"
                  >
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zoneColor(zone, i) }} />
                    <span className="font-medium text-gray-800">{zone.name}</span>
                    <span className="text-gray-400 text-xs">{formatPrice(zone.price, currency)}</span>
                    {zone.type === 'GENERAL' && (
                      <span className="text-gray-400 text-xs">· без мест</span>
                    )}
                    {zone.type === 'TABLE' && (
                      <span className="text-gray-400 text-xs">· {zone.tableChairs} мест/стол</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditZone(zone)}
                    className="text-gray-300 hover:text-emerald-600 px-1 py-1.5 text-xs transition-colors"
                    title="Редактировать зону"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => removeZone(zone)}
                    className="text-gray-300 hover:text-red-400 pr-2 pl-0.5 py-1.5 text-xs transition-colors"
                    title="Удалить зону"
                  >
                    ✕
                  </button>
                </div>
              )
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
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  placeholder="VIP"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Цена ({currency})</label>
                <input
                  type="number"
                  value={newZonePrice}
                  onChange={e => setNewZonePrice(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  placeholder="5000"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Тип зоны</label>
                <select
                  value={newZoneType}
                  onChange={e => setNewZoneType(e.target.value as ZoneType)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                >
                  <option value="SEATED">Места на сетке</option>
                  <option value="GENERAL">Без конкретных мест</option>
                  <option value="TABLE">Столы</option>
                </select>
                {newZoneType === 'GENERAL' && (
                  <input
                    type="number"
                    value={newZoneCapacity}
                    onChange={e => setNewZoneCapacity(e.target.value)}
                    className="mt-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                    placeholder="Вместимость"
                    min="1"
                  />
                )}
                {newZoneType === 'TABLE' && (
                  <input
                    type="number"
                    value={newZoneTableChairs}
                    onChange={e => setNewZoneTableChairs(e.target.value)}
                    className="mt-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                    placeholder="Мест за столом"
                    min="1"
                  />
                )}
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
                  disabled={
                    addingZone || !newZoneName.trim() || !newZonePrice ||
                    (newZoneType === 'GENERAL' && !newZoneCapacity) ||
                    (newZoneType === 'TABLE' && !newZoneTableChairs)
                  }
                  className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
                >
                  {addingZone ? '...' : 'Добавить'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowZoneForm(false); resetZoneForm(); }}
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
        className={`relative w-full rounded-xl border border-gray-200 bg-gray-100 select-none ${
          expanded ? 'overflow-auto' : 'overflow-hidden'
        }`}
        onMouseLeave={() => { isDrawing.current = false; }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(${expanded ? '28px' : '0'}, 1fr))`,
          }}
        >
          {cells.map((row, r) =>
            row.map((cell, c) => {
              const isStage = cell === 'stage';
              const zoneIndex = cell !== 'empty' && cell !== 'blocked' && !isStage
                ? zones.findIndex(z => z.id === cell)
                : -1;
              const zone = zoneIndex >= 0 ? zones[zoneIndex] : null;
              const mergeFill = zone?.type === 'GENERAL' || isStage;
              const mergeId = isStage ? 'stage' : zone?.id;
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    aspectRatio: '1',
                    backgroundColor:
                      cell === 'blocked' ? '#9ca3af' :
                      isStage ? '#1e293b' :
                      zone ? zoneColor(zone, zoneIndex) + 'cc' : '#ffffff',
                    cursor: locked ? 'default' : 'crosshair',
                    minWidth: 4,
                    minHeight: 4,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderTopColor: mergeFill && sameZoneNeighbor(cells, r - 1, c, mergeId!) ? 'transparent' : GRID_LINE,
                    borderBottomColor: mergeFill && sameZoneNeighbor(cells, r + 1, c, mergeId!) ? 'transparent' : GRID_LINE,
                    borderLeftColor: mergeFill && sameZoneNeighbor(cells, r, c - 1, mergeId!) ? 'transparent' : GRID_LINE,
                    borderRightColor: mergeFill && sameZoneNeighbor(cells, r, c + 1, mergeId!) ? 'transparent' : GRID_LINE,
                  }}
                  onMouseDown={() => handleCellMouseDown(r, c)}
                  onMouseEnter={() => handleCellMouseEnter(r, c)}
                />
              );
            }),
          )}
        </div>

        {/* Zone name overlay for GENERAL areas — sits on top, clicks pass through to cells */}
        {[...generalZoneBoxes.entries()].map(([zoneId, box]) => {
          const zone = zones.find(z => z.id === zoneId);
          if (!zone) return null;
          return (
            <div
              key={zoneId}
              className="absolute flex items-center justify-center text-center font-semibold pointer-events-none px-1"
              style={{
                left: `${(box.minCol / cols) * 100}%`,
                top: `${(box.minRow / rows) * 100}%`,
                width: `${((box.maxCol - box.minCol + 1) / cols) * 100}%`,
                height: `${((box.maxRow - box.minRow + 1) / rows) * 100}%`,
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                fontSize: 'clamp(8px, 2.2cqw, 15px)',
                lineHeight: 1.2,
              }}
            >
              {zone.name}
            </div>
          );
        })}

        {/* Stage label overlay — decorative, not a real zone */}
        {stageBox && (
          <div
            className="absolute flex items-center justify-center text-center font-semibold uppercase tracking-wide pointer-events-none px-1"
            style={{
              left: `${(stageBox.minCol / cols) * 100}%`,
              top: `${(stageBox.minRow / rows) * 100}%`,
              width: `${((stageBox.maxCol - stageBox.minCol + 1) / cols) * 100}%`,
              height: `${((stageBox.maxRow - stageBox.minRow + 1) / rows) * 100}%`,
              color: '#ffffff',
              fontSize: 'clamp(8px, 2.2cqw, 15px)',
              lineHeight: 1.2,
            }}
          >
            Сцена
          </div>
        )}
      </div>

      {/* Legend when locked */}
      {locked && zones.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {zones.map((zone, i) => {
            const count = revenue.details.find(d => d.zone.id === zone.id)?.count ?? 0;
            return (
              <div key={zone.id} className="flex items-center gap-1.5 text-sm">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zoneColor(zone, i) }} />
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
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zone.color ?? '#9ca3af' }} />
                    <span className="text-gray-700 truncate">{zone.name}</span>
                    <span className="text-gray-400 text-xs shrink-0">
                      {count} × {formatPrice(zone.price, currency)}
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
