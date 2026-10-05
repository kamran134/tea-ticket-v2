import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { api } from '../services/api';
import type { Venue, Zone, ZoneTable, ZoneType, TableShape, GridLayout, GridCellState, GridTemplateSummary, GridTemplateZoneSlot } from '../types';
import { formatPrice } from '../types';
import { toast } from '../services/toast';
import { useAdminAuth } from '../lib/adminAuth';
import { TableIcon, tableFootprint, type Footprint } from './TableIcon';
import { ConfirmDialog } from './ConfirmDialog';
import { ZONE_COLORS, zoneColor } from './grid/zoneColors';
import { GRID_LINE, sameZoneNeighbor, connectedComponents, isSolidRectangle, boxToGridArea, cellToGridArea } from './grid/gridGeometry';
import { GridCanvas } from './grid/GridCanvas';
import {
  MAX_TABLE_NUMBER,
  MIN_TABLE_NUMBER,
  reconcileTableNumbers,
  sameTableNumberDraft,
  tableNumberKey,
  type TableNumberDraft,
} from './grid/tableNumbers';

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

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function draftFromTables(tables: ZoneTable[]): { draft: TableNumberDraft; reserved: Record<string, number[]> } {
  const numbers: Record<string, number> = {};
  const floor: Record<string, number> = {};
  const reserved: Record<string, number[]> = {};
  for (const table of tables) {
    if (table.row == null || table.col == null) {
      (reserved[table.zoneId] ??= []).push(table.number);
    } else {
      numbers[tableNumberKey(table.zoneId, table.row, table.col)] = table.number;
    }
    floor[table.zoneId] = Math.max(floor[table.zoneId] ?? 0, table.number);
  }
  return { draft: { numbers, floor }, reserved };
}

// Tables occupy a rectangular footprint (not a single cell) — placing/removing
// one is a discrete "stamp" operation, grouped by 4-directional connectivity.
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function tryPlaceFootprint(
  cells: GridCellState[][], totalRows: number, totalCols: number,
  anchorRow: number, anchorCol: number, size: Footprint, zoneId: string,
): GridCellState[][] | null {
  if (anchorRow + size.rows > totalRows || anchorCol + size.cols > totalCols) return null;
  for (let r = anchorRow; r < anchorRow + size.rows; r++) {
    for (let c = anchorCol; c < anchorCol + size.cols; c++) {
      if (cells[r][c] !== 'empty') return null;
    }
  }
  const next = cells.map(row => [...row]);
  for (let r = anchorRow; r < anchorRow + size.rows; r++) {
    for (let c = anchorCol; c < anchorCol + size.cols; c++) {
      next[r][c] = zoneId;
    }
  }
  return next;
}

function removeConnectedBlob(cells: GridCellState[][], totalRows: number, totalCols: number, row: number, col: number): GridCellState[][] {
  const target = cells[row][col];
  const next = cells.map(r => [...r]);
  const stack: [number, number][] = [[row, col]];
  const seen = new Set<string>([`${row}-${col}`]);
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    next[r][c] = 'empty';
    for (const [dr, dc] of NEIGHBORS) {
      const nr = r + dr, nc = c + dc, key = `${nr}-${nc}`;
      if (nr >= 0 && nr < totalRows && nc >= 0 && nc < totalCols && !seen.has(key) && cells[nr][nc] === target) {
        seen.add(key);
        stack.push([nr, nc]);
      }
    }
  }
  return next;
}

function TableNumberControl({
  number,
  locked,
  editing,
  draft,
  onDraft,
  onStart,
  onCommit,
  onCancel,
}: {
  number: number;
  locked: boolean;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  if (locked) return null;
  if (editing) {
    return (
      <input
        autoFocus
        inputMode="numeric"
        aria-label="Номер стола"
        value={draft}
        onChange={e => onDraft(e.target.value)}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCommit}
        className="absolute left-1/2 top-1/2 z-10 w-12 -translate-x-1/2 -translate-y-1/2 pointer-events-auto rounded-md border border-amber-800 bg-white text-center text-sm font-bold text-amber-950 shadow outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Номер стола ${number}. Нажмите, чтобы изменить`}
      title="Изменить номер стола"
      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
      onClick={e => { e.stopPropagation(); onStart(); }}
      className="absolute left-1/2 top-1/2 z-10 flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 pointer-events-auto items-center justify-center rounded-md border border-amber-900/30 bg-white/95 px-1 text-xs font-bold text-amber-950 shadow-sm hover:ring-2 hover:ring-amber-800/50"
    >
      {number}
    </button>
  );
}

interface Props {
  venue: Venue;
  onVenueUpdated: (venue: Venue) => void;
}

export function GridMapEditor({ venue, onVenueUpdated }: Props) {
  const auth = useAdminAuth();
  const canDeleteTemplates = auth.can('events.delete');
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
  const [newZoneTableShape, setNewZoneTableShape] = useState<TableShape>('ROUND');

  // Zone editing (name/price/capacity/color) — for any zone type, incl. tables
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [editZonePrice, setEditZonePrice] = useState('');
  const [editZoneCapacity, setEditZoneCapacity] = useState('');
  const [editZoneTableChairs, setEditZoneTableChairs] = useState('');
  const [editZoneTableShape, setEditZoneTableShape] = useState<TableShape>('ROUND');
  const [editZoneColor, setEditZoneColor] = useState(ZONE_COLORS[0]);
  const [savingZoneEdit, setSavingZoneEdit] = useState(false);

  // Grid templates
  const [templates, setTemplates] = useState<GridTemplateSummary[]>([]);
  const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<GridTemplateSummary | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  // Large grids are cramped inline — always offer a fullscreen view
  const [expanded, setExpanded] = useState(false);

  // O(1) zone lookup by id — the per-cell render loop below used to do a
  // linear zones.findIndex() on every one of rows×cols cells, on every
  // render (including every mouseenter while drag-painting).
  const zoneById = useMemo(() => new Map(zones.map((z, i) => [z.id, { zone: z, index: i }])), [zones]);

  // Table numbers are the venue's own numbering. `floor` is the highest
  // number issued in a zone and only grows, so deleting a table does not
  // hand its number to the next one painted.
  const [numberDraft, setNumberDraft] = useState<TableNumberDraft>({ numbers: {}, floor: {} });
  const [reservedNumbers, setReservedNumbers] = useState<Record<string, number[]>>({});
  const [numbersReady, setNumbersReady] = useState(false);
  const [numbersError, setNumbersError] = useState(false);
  const [editingTableKey, setEditingTableKey] = useState<string | null>(null);
  const [editingTableValue, setEditingTableValue] = useState('');
  const ignoreNumberBlur = useRef(false);
  const numberDraftRef = useRef(numberDraft);
  numberDraftRef.current = numberDraft;

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

  const loadTableNumbers = useCallback(() => {
    let cancelled = false;
    setNumbersReady(false);
    setNumbersError(false);
    setEditingTableKey(null);
    api.getGridData(venue.id)
      .then(({ tables }) => {
        if (cancelled) return;
        const { draft, reserved } = draftFromTables(tables);
        setReservedNumbers(reserved);
        setNumberDraft(draft);
        numberDraftRef.current = draft;
        setNumbersReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setNumbersError(true);
        toast.error('Не удалось загрузить номера столов');
      });
    return () => { cancelled = true; };
  }, [venue.id]);

  useEffect(() => loadTableNumbers(), [loadTableNumbers]);

  useEffect(() => {
    api.getGridTemplates().then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    if (!templateMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!templateMenuRef.current?.contains(e.target as Node)) setTemplateMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [templateMenuOpen]);

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

    const currentValue = cells[row][col];
    const currentZone = currentValue !== 'empty' && currentValue !== 'blocked' && currentValue !== 'stage'
      ? zoneById.get(currentValue)?.zone
      : undefined;
    const activeZone = zoneById.get(activeTool)?.zone;

    // A table footprint must stay a solid rectangle — clearing any part of it
    // always clears the whole table, regardless of which tool triggered it.
    if (currentZone?.type === 'TABLE') {
      if (activeTool === 'erase' || activeTool === currentValue) {
        setCells(prev => removeConnectedBlob(prev, rows, cols, row, col));
      } else {
        toast.error('Сначала уберите стол инструментом «Стереть»');
      }
      return;
    }

    if (activeZone?.type === 'TABLE') {
      if (currentValue !== 'empty') {
        toast.error('Здесь уже занято');
        return;
      }
      const size = tableFootprint(activeZone.tableShape ?? 'ROUND', activeZone.tableChairs ?? 1);
      const placed = tryPlaceFootprint(cells, rows, cols, row, col, size, activeTool);
      if (!placed) {
        toast.error('Недостаточно места для стола здесь');
        return;
      }
      setCells(placed);
      return;
    }

    isDrawing.current = true;
    setCells(prev => {
      const cv = prev[row][col];
      const paintValue: GridCellState =
        activeTool === 'erase' ? 'empty' :
        activeTool === 'block' ?
          (cv === 'blocked' ? 'empty' : 'blocked') :
        cv === activeTool ? 'empty' : activeTool;
      drawValue.current = paintValue;
      const next = [...prev];
      next[row] = [...prev[row]];
      next[row][col] = paintValue;
      return next;
    });
  }, [locked, activeTool, zoneById, cells, rows, cols]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (!isDrawing.current || locked) return;
    setCells(prev => {
      if (prev[row][col] === drawValue.current) return prev;
      const cellZone = zoneById.get(prev[row][col])?.zone;
      if (cellZone?.type === 'TABLE') return prev; // never drag-overwrite a table footprint
      const next = [...prev];
      next[row] = [...prev[row]];
      next[row][col] = drawValue.current;
      return next;
    });
  }, [locked, zoneById]);

  const resetZoneForm = () => {
    setNewZoneName('');
    setNewZonePrice('');
    setNewZoneType('SEATED');
    setNewZoneCapacity('');
    setNewZoneTableChairs('');
    setNewZoneTableShape('ROUND');
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
        tableChairs: newZoneType === 'TABLE' ? Number(newZoneTableChairs) : null,
        tableShape: newZoneType === 'TABLE' ? newZoneTableShape : null,
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
    setEditZoneTableShape(zone.tableShape ?? 'ROUND');
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
        ...(zone.type === 'TABLE' && { tableShape: editZoneTableShape }),
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
        price: z.price,
        ...(z.type === 'GENERAL' && { capacity: z.capacity }),
        ...(z.type === 'TABLE' && { tableChairs: z.tableChairs ?? undefined, tableShape: z.tableShape ?? undefined }),
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
      const missingPrice = template.zones.some(slot => !(typeof slot.price === 'number' && slot.price > 0));
      for (const slot of template.zones) {
        const zone = await api.createZone({
          venueId: venue.id,
          name: slot.name,
          price: typeof slot.price === 'number' && slot.price > 0 ? slot.price : 1,
          capacity: slot.type === 'GENERAL' ? (slot.capacity ?? 1) : 1,
          sortOrder: sortOrder++,
          type: slot.type as ZoneType,
          color: slot.color,
          tableChairs: slot.type === 'TABLE' ? (slot.tableChairs ?? 4) : null,
          tableShape: slot.type === 'TABLE' ? (slot.tableShape ?? 'ROUND') : null,
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
      setTemplateMenuOpen(false);
      toast.success(missingPrice
        ? 'Шаблон применён — в нём нет цен, проставьте их и сохраните сетку'
        : 'Шаблон применён — сохраните сетку');
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось загрузить шаблон'));
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const removeTemplate = async () => {
    if (!templateToDelete || deletingTemplateId) return;
    const id = templateToDelete.id;
    setDeletingTemplateId(id);
    try {
      await api.deleteGridTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (templates.length <= 1) setTemplateMenuOpen(false);
      setTemplateToDelete(null);
      toast.success('Шаблон удалён');
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось удалить шаблон'));
    } finally {
      setDeletingTemplateId(null);
    }
  };

  // A single zone (or the stage) can be painted in more than one disconnected
  // area — a plain min/max bounding box would span the whole gap between
  // them, and with grid-column/grid-row placement that forces CSS to
  // generate a pile of extra empty implicit rows to fit it (this is exactly
  // what broke the buyer-facing grid for a real venue). connectedComponents
  // gives one correctly-sized box per physically separate area, same as tables.
  const generalZoneComponents = useMemo(() => {
    const generalIds = new Set(zones.filter(z => z.type === 'GENERAL').map(z => z.id));
    return connectedComponents(cells, generalIds);
  }, [cells, zones]);

  const stageComponents = useMemo(() => connectedComponents(cells, new Set(['stage'])), [cells]);

  // Each table now spans multiple cells, so "how many tables are painted"
  // requires grouping same-zone-id cells into connected components — one
  // component per physical table — instead of just counting raw cells.
  const tableZoneIdSet = useMemo(() => new Set(zones.filter(z => z.type === 'TABLE').map(z => z.id)), [zones]);
  const tableBoxes = useMemo(() => connectedComponents(cells, tableZoneIdSet), [cells, tableZoneIdSet]);
  const tableCountByZone = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { zoneId } of tableBoxes) counts[zoneId] = (counts[zoneId] ?? 0) + 1;
    return counts;
  }, [tableBoxes]);

  // Wait until zones are known: before that every painted table looks missing
  // and reconcile would replace saved numbers with fresh ones.
  useEffect(() => {
    if (!numbersReady || zonesLoading || zonesError) return;
    const anchors = tableBoxes.map(({ zoneId, box }) => ({
      zoneId,
      row: box.minRow,
      col: box.minCol,
    }));
    setNumberDraft(prev => {
      const next = reconcileTableNumbers(anchors, prev, reservedNumbers);
      const resolved = sameTableNumberDraft(prev, next) ? prev : next;
      numberDraftRef.current = resolved;
      return resolved;
    });
  }, [tableBoxes, numbersReady, zonesLoading, zonesError, reservedNumbers]);

  // Mirrors the backend's own solidity check (see gridGeometry.ts) — the
  // current stamp/erase-whole-blob interaction never actually produces a
  // non-rectangular table, so this should never fire today. It's here so a
  // future change to that interaction fails immediately and clearly instead
  // of only surfacing as a confusing 400 when the layout is saved.
  const nonSolidTableZoneNames = useMemo(() => {
    const bad = tableBoxes.filter(c => !isSolidRectangle(c));
    return [...new Set(bad.map(c => zoneById.get(c.zoneId)?.zone.name ?? c.zoneId))];
  }, [tableBoxes, zoneById]);

  const revenue = useMemo(() => {
    const flat = cells.flat();
    const countsByZone = countCellsByZone(flat);
    let total = 0;
    const details = zones.map(zone => {
      // GENERAL zones sell by declared capacity, not by painted cell count;
      // TABLE zones sell by chairs × number of tables, not by painted cells
      const count =
        zone.type === 'GENERAL' ? zone.capacity :
        zone.type === 'TABLE' ? (tableCountByZone[zone.id] ?? 0) * (zone.tableChairs ?? 1) :
        (countsByZone[zone.id] ?? 0);
      const amount = count * zone.price;
      total += amount;
      return { zone, count, amount };
    });
    return { total, details };
  }, [cells, zones, tableCountByZone]);

  const startTableNumberEdit = (key: string, number: number) => {
    if (locked || !numbersReady) return;
    ignoreNumberBlur.current = false;
    setEditingTableKey(key);
    setEditingTableValue(String(number));
  };

  const cancelTableNumberEdit = () => {
    ignoreNumberBlur.current = true;
    setEditingTableKey(null);
  };

  const commitTableNumber = (key: string, zoneId: string) => {
    if (ignoreNumberBlur.current) {
      ignoreNumberBlur.current = false;
      return;
    }
    const current = numberDraft.numbers[key];
    if (current == null) {
      ignoreNumberBlur.current = true;
      setEditingTableKey(null);
      return;
    }
    const raw = editingTableValue.trim();
    ignoreNumberBlur.current = true;
    setEditingTableKey(null);
    if (raw === String(current)) return;
    if (!/^\d+$/.test(raw)) {
      toast.error(`Номер стола — целое число от ${MIN_TABLE_NUMBER} до ${MAX_TABLE_NUMBER}`);
      return;
    }

    const number = Number(raw);
    if (!Number.isInteger(number) || number < MIN_TABLE_NUMBER || number > MAX_TABLE_NUMBER) {
      toast.error(`Номер стола — целое число от ${MIN_TABLE_NUMBER} до ${MAX_TABLE_NUMBER}`);
      return;
    }
    const takenInZone = Object.entries(numberDraft.numbers).some(
      ([otherKey, value]) => otherKey !== key && otherKey.startsWith(`${zoneId}:`) && value === number,
    );
    const takenOffGrid = (reservedNumbers[zoneId] ?? []).includes(number);
    if (takenInZone || takenOffGrid) {
      toast.error(`Номер ${number} уже занят в этой зоне`);
      return;
    }
    setNumberDraft(prev => {
      const next = {
        numbers: { ...prev.numbers, [key]: number },
        floor: { ...prev.floor, [zoneId]: Math.max(prev.floor[zoneId] ?? 0, number) },
      };
      numberDraftRef.current = next;
      return next;
    });
  };

  const save = async () => {
    if (nonSolidTableZoneNames.length > 0) {
      toast.error(`Стол должен быть сплошным прямоугольником: ${nonSolidTableZoneNames.join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const layout: GridLayout & {
        tableNumbers?: { zoneId: string; row: number; col: number; number: number }[];
      } = { rows, cols, cells };
      if (numbersReady) {
        const draft = numberDraftRef.current;
        layout.tableNumbers = tableBoxes.flatMap(({ zoneId, box }) => {
          const number = draft.numbers[tableNumberKey(zoneId, box.minRow, box.minCol)];
          if (number == null) return [];
          return [{ zoneId, row: box.minRow, col: box.minCol, number }];
        });
      }
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
        <>
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">Форма</label>
            <select
              value={editZoneTableShape}
              onChange={e => setEditZoneTableShape(e.target.value as TableShape)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
            >
              <option value="ROUND">Круглый</option>
              <option value="RECT">Прямоугольный</option>
              <option value="SOFA">Диван</option>
            </select>
          </div>
        </>
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
    <>
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
              <div className="relative" ref={templateMenuRef}>
                <button
                  type="button"
                  onClick={() => setTemplateMenuOpen(open => !open)}
                  disabled={applyingTemplateId !== null || templates.length === 0}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  {applyingTemplateId ? 'Применяю...' : templates.length === 0 ? 'Нет шаблонов' : 'Загрузить шаблон...'}
                </button>
                {templateMenuOpen && templates.length > 0 && (
                  <div className="absolute right-0 z-30 mt-1 w-80 max-h-72 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                    {templates.map(t => (
                      <div key={t.id} className="flex items-center gap-1 px-1.5">
                        <button
                          type="button"
                          onClick={() => applyTemplate(t.id)}
                          className="flex-1 min-w-0 text-left text-sm px-2 py-1.5 rounded-md hover:bg-gray-50 truncate"
                        >
                          {t.name} ({t.rows}×{t.cols}, {t.zoneCount} зон)
                        </button>
                        {canDeleteTemplates && (
                          <button
                            type="button"
                            title="Удалить шаблон"
                            onClick={() => setTemplateToDelete(t)}
                            className="shrink-0 px-2 py-1 text-xs text-red-600 hover:text-red-700"
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      type="number"
                      value={newZoneTableChairs}
                      onChange={e => setNewZoneTableChairs(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                      placeholder="Мест за столом"
                      min="1"
                    />
                    <select
                      value={newZoneTableShape}
                      onChange={e => setNewZoneTableShape(e.target.value as TableShape)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                    >
                      <option value="ROUND">Круглый</option>
                      <option value="RECT">Прямоугольный</option>
                      <option value="SOFA">Диван</option>
                    </select>
                  </div>
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

      {/* Grid canvas — same fixed-size, scrollable canvas the buyer sees, so
          the admin is always editing exactly the picture that gets sold */}
      {tableBoxes.length > 0 && (
        <p className="text-sm text-gray-500">
          {locked
            ? 'Номера на столах совпадают с заведением. Разблокируйте схему, чтобы изменить их.'
            : 'Нажмите на номер стола, чтобы указать его как в заведении. Гости увидят этот номер на схеме и в билете.'}
          {numbersError && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => { loadTableNumbers(); }}
                className="underline hover:text-gray-700"
              >
                Повторить загрузку номеров
              </button>
            </>
          )}
        </p>
      )}
      <GridCanvas
        // Taken from cells, not the rows/cols inputs, so the track count can
        // never disagree with the cells actually rendered into it
        rows={cells.length}
        cols={cells[0]?.length ?? 0}
        maxHeight={expanded ? '78vh' : '55vh'}
        onMouseLeave={() => { isDrawing.current = false; }}
      >
        {cells.map((row, r) =>
          row.map((cell, c) => {
            const isStage = cell === 'stage';
            const entry = cell !== 'empty' && cell !== 'blocked' && !isStage ? zoneById.get(cell) : undefined;
            const zone = entry?.zone ?? null;
            const zoneIndex = entry?.index ?? -1;
            const mergeFill = zone?.type === 'GENERAL' || zone?.type === 'TABLE' || isStage;
            const mergeId = isStage ? 'stage' : zone?.id;
            return (
              <div
                key={`${r}-${c}`}
                style={{
                  // Explicit placement — see cellToGridArea
                  ...cellToGridArea(r, c),
                  backgroundColor:
                    cell === 'blocked' ? '#9ca3af' :
                    isStage ? '#1e293b' :
                    zone?.type === 'TABLE' ? '#ffffff' :
                    zone ? zoneColor(zone, zoneIndex) + 'cc' : '#ffffff',
                  cursor: locked ? 'default' : 'crosshair',
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

        {/* Zone name overlay for GENERAL areas — one per physically separate
            painted region (see generalZoneComponents), drawn over the same
            cells and clipped to them, clicks pass through to the cells below */}
        {generalZoneComponents.map(({ zoneId, box }, i) => {
          const zone = zones.find(z => z.id === zoneId);
          if (!zone) return null;
          return (
            <div
              key={`${zoneId}-${i}`}
              className="flex items-center justify-center text-center font-semibold pointer-events-none px-1"
              style={{
                ...boxToGridArea(box),
                overflow: 'hidden',
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                fontSize: 14,
                lineHeight: 1.2,
              }}
            >
              {zone.name}
            </div>
          );
        })}

        {/* Stage label overlay — decorative, not a real zone, one per separate area */}
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
            Сцена
          </div>
        ))}

        {/* Table icons — one per connected footprint, not per cell.
            The number is the venue's own table number, editable in place. */}
        {tableBoxes.map(({ zoneId, box }) => {
          const zone = zones.find(z => z.id === zoneId);
          if (!zone) return null;
          const footprint: Footprint = { rows: box.maxRow - box.minRow + 1, cols: box.maxCol - box.minCol + 1 };
          const key = tableNumberKey(zoneId, box.minRow, box.minCol);
          const number = numberDraft.numbers[key];
          const editing = editingTableKey === key;
          return (
            <div
              key={key}
              className="relative pointer-events-none p-0.5"
              style={{ ...boxToGridArea(box), overflow: 'hidden' }}
            >
              <TableIcon
                shape={zone.tableShape ?? 'ROUND'}
                chairs={zone.tableChairs ?? 1}
                footprint={footprint}
                label={locked && number != null ? String(number) : undefined}
              />
              {number != null && (
                <TableNumberControl
                  number={number}
                  locked={locked || !numbersReady}
                  editing={editing}
                  draft={editingTableValue}
                  onDraft={setEditingTableValue}
                  onStart={() => startTableNumberEdit(key, number)}
                  onCommit={() => commitTableNumber(key, zoneId)}
                  onCancel={cancelTableNumberEdit}
                />
              )}
            </div>
          );
        })}
      </GridCanvas>

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
    {templateToDelete && (
      <ConfirmDialog
        title="Удалить шаблон"
        message={`Шаблон «${templateToDelete.name}» будет удалён. Схемы уже созданных мероприятий не изменятся.`}
        confirmLabel={deletingTemplateId ? 'Удаление...' : 'Удалить'}
        onConfirm={removeTemplate}
        onCancel={() => { if (!deletingTemplateId) setTemplateToDelete(null); }}
      />
    )}
    </>
  );
}
