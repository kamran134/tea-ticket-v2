import { useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import type { Zone, Venue, ZoneLayoutData } from '../types';
import { toast } from '../services/toast';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  venue: Venue;
  zones: Zone[];
  onVenueUpdated: (venue: Venue) => void;
  onZoneUpdated: (zone: Zone) => void;
}

const FALLBACK_COLORS = [
  '#059669', '#0284c7', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
];

const COLOR_PALETTE = [
  '#059669', '#0284c7', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
  '#374151', '#b45309',
];

const DEFAULT_LAYOUT: ZoneLayoutData = { x: 5, y: 5, w: 20, h: 15, color: '#059669' };

export function ZoneMapEditor({ venue, zones, onVenueUpdated, onZoneUpdated }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localLayouts, setLocalLayouts] = useState<Record<string, ZoneLayoutData>>(() =>
    Object.fromEntries(zones.filter(z => z.layoutData).map(z => [z.id, z.layoutData!])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [aspectPercent, setAspectPercent] = useState(56.25);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0) {
      setAspectPercent((img.naturalHeight / img.naturalWidth) * 100);
    }
  };

  const saveLayout = useCallback(async (zoneId: string, layout: ZoneLayoutData) => {
    setSaving(zoneId);
    try {
      const updated = await api.updateZoneLayout(zoneId, layout);
      onZoneUpdated(updated);
    } catch {
      toast.error('Не удалось сохранить позицию');
    } finally {
      setSaving(null);
    }
  }, [onZoneUpdated]);

  const addToMap = async (zone: Zone) => {
    const layout: ZoneLayoutData = { ...DEFAULT_LAYOUT, color: FALLBACK_COLORS[zones.indexOf(zone) % FALLBACK_COLORS.length] };
    setLocalLayouts(l => ({ ...l, [zone.id]: layout }));
    await saveLayout(zone.id, layout);
  };

  const removeFromMap = async (zone: Zone) => {
    setLocalLayouts(l => { const n = { ...l }; delete n[zone.id]; return n; });
    try {
      const updated = await api.updateZoneLayout(zone.id, null);
      onZoneUpdated(updated);
    } catch {
      toast.error('Не удалось убрать зону');
    }
  };

  const handleDragStart = useCallback((
    e: React.MouseEvent,
    zoneId: string,
    mode: 'move' | 'resize',
    sectionIndex?: number,
  ) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const layout = localLayouts[zoneId] ?? DEFAULT_LAYOUT;

    if (sectionIndex !== undefined && layout.sections) {
      const startSec = layout.sections[sectionIndex];
      if (!startSec) return;

      const onMove = (ev: MouseEvent) => {
        const dx = ((ev.clientX - startClientX) / rect.width) * 100;
        const dy = ((ev.clientY - startClientY) / rect.height) * 100;
        setLocalLayouts(l => {
          const z = l[zoneId];
          if (!z?.sections) return l;
          const sections = z.sections.map(s =>
            s.sectionIndex !== sectionIndex ? s : mode === 'move'
              ? { ...startSec, x: Math.max(0, Math.min(100 - startSec.w, startSec.x + dx)), y: Math.max(0, Math.min(100 - startSec.h, startSec.y + dy)) }
              : { ...startSec, w: Math.max(5, Math.min(100 - startSec.x, startSec.w + dx)), h: Math.max(5, Math.min(100 - startSec.y, startSec.h + dy)) },
          );
          return { ...l, [zoneId]: { ...z, sections } };
        });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setLocalLayouts(current => {
          const updated = current[zoneId];
          if (updated) void saveLayout(zoneId, updated);
          return current;
        });
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return;
    }

    // Single-block drag
    const sx = layout.x ?? 5;
    const sy = layout.y ?? 5;
    const sw = layout.w ?? 20;
    const sh = layout.h ?? 15;

    const onMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - startClientX) / rect.width) * 100;
      const dy = ((ev.clientY - startClientY) / rect.height) * 100;
      setLocalLayouts(l => ({
        ...l,
        [zoneId]: mode === 'move'
          ? { ...layout, x: Math.max(0, Math.min(100 - sw, sx + dx)), y: Math.max(0, Math.min(100 - sh, sy + dy)) }
          : { ...layout, w: Math.max(5, Math.min(100 - sx, sw + dx)), h: Math.max(5, Math.min(100 - sy, sh + dy)) },
      }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setLocalLayouts(current => {
        const updated = current[zoneId];
        if (updated) void saveLayout(zoneId, updated);
        return current;
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [localLayouts, saveLayout]);

  const handleColorChange = async (zone: Zone, color: string) => {
    const layout = localLayouts[zone.id] ?? zone.layoutData;
    if (!layout) return;
    const updated = { ...layout, color };
    setLocalLayouts(l => ({ ...l, [zone.id]: updated }));
    await saveLayout(zone.id, updated);
  };

  const handleFloorPlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const updated = await api.uploadFloorPlan(venue.id, file);
      onVenueUpdated(updated);
      toast.success('Схема зала загружена');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearFloorPlan = async () => {
    try {
      const updated = await api.clearFloorPlan(venue.id);
      onVenueUpdated(updated);
      toast.success('Схема удалена');
    } catch {
      toast.error('Ошибка');
    }
  };

  const mappedZoneIds = new Set(Object.keys(localLayouts).filter(id => localLayouts[id]));
  const unmappedZones = zones.filter(z => !mappedZoneIds.has(z.id));

  return (
    <div className="space-y-4">
      {/* Floor plan controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFloorPlanUpload}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Загрузка...' : venue.floorPlanImage ? 'Заменить схему зала' : 'Загрузить схему зала'}
        </button>
        {venue.floorPlanImage && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="text-sm text-red-500 hover:underline"
          >
            Убрать схему
          </button>
        )}
        <span className="text-xs text-gray-400">JPG/PNG/WebP · до 10 МБ</span>
      </div>

      {/* Map canvas */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden border-2 border-dashed border-gray-300 bg-gray-50 select-none"
        style={{ paddingBottom: `${aspectPercent}%` }}
      >
        {venue.floorPlanImage ? (
          <img
            src={venue.floorPlanImage}
            alt="Floor plan"
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
            onLoad={handleImageLoad}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Загрузите схему зала или расположите зоны на пустом холсте
          </div>
        )}

        {/* Draggable zone boxes */}
        {zones.flatMap((zone, i) => {
          const layout = localLayouts[zone.id];
          if (!layout) return [];
          const color = layout.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
          const isSaving = saving === zone.id;

          const removeBtn = (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); void removeFromMap(zone); }}
              title={`Убрать "${zone.name}" со схемы`}
              style={{
                position: 'absolute', top: 2, right: 2, width: 16, height: 16,
                background: 'rgba(0,0,0,0.4)', color: 'white', border: 'none',
                borderRadius: 3, cursor: 'pointer', fontSize: 10,
                lineHeight: '16px', textAlign: 'center', padding: 0,
              }}
            >✕</button>
          );

          const resizeHandle = (onDown: (e: React.MouseEvent) => void) => (
            <div
              style={{
                position: 'absolute', bottom: 2, right: 2, width: 10, height: 10,
                background: 'white', border: `1px solid ${color}`, borderRadius: 2, cursor: 'se-resize',
              }}
              onMouseDown={e => { e.stopPropagation(); onDown(e); }}
            />
          );

          // Section-based rendering (SEATED zones with multiple sections)
          if (layout.sections && layout.sections.length > 0) {
            return layout.sections.map(sec => (
              <div
                key={`${zone.id}-sec-${sec.sectionIndex}`}
                style={{
                  position: 'absolute',
                  left: `${sec.x}%`, top: `${sec.y}%`,
                  width: `${sec.w}%`, height: `${sec.h}%`,
                  backgroundColor: `${color}cc`,
                  border: `2px solid ${color}`,
                  borderRadius: 6, cursor: 'move', userSelect: 'none',
                }}
                onMouseDown={e => handleDragStart(e, zone.id, 'move', sec.sectionIndex)}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center p-1 pointer-events-none">
                  <span className="text-white font-semibold text-center leading-tight drop-shadow"
                    style={{ fontSize: 'clamp(7px, 1.2cqw, 11px)' }}>
                    {zone.name}
                  </span>
                  <span className="text-white/80 text-center drop-shadow"
                    style={{ fontSize: 'clamp(6px, 1cqw, 10px)' }}>
                    {sec.label}
                  </span>
                  {isSaving && sec.sectionIndex === 0 && (
                    <span className="text-white/60 text-center" style={{ fontSize: 'clamp(6px, 0.9cqw, 9px)' }}>
                      сохранение...
                    </span>
                  )}
                </div>
                {resizeHandle(e => handleDragStart(e, zone.id, 'resize', sec.sectionIndex))}
                {removeBtn}
              </div>
            ));
          }

          // Single-block rendering (GENERAL, TABLE, single-section SEATED)
          const x = layout.x ?? 5;
          const y = layout.y ?? 5;
          const w = layout.w ?? 20;
          const h = layout.h ?? 15;

          return [(
            <div
              key={zone.id}
              style={{
                position: 'absolute',
                left: `${x}%`, top: `${y}%`,
                width: `${w}%`, height: `${h}%`,
                backgroundColor: `${color}cc`,
                border: `2px solid ${color}`,
                borderRadius: 6, cursor: 'move', userSelect: 'none',
              }}
              onMouseDown={e => handleDragStart(e, zone.id, 'move')}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center p-1 pointer-events-none">
                <span className="text-white font-semibold text-center leading-tight drop-shadow"
                  style={{ fontSize: 'clamp(8px, 1.4cqw, 12px)' }}>
                  {zone.name}
                </span>
                {isSaving && (
                  <span className="text-white/70 text-center" style={{ fontSize: 'clamp(7px, 1cqw, 9px)' }}>
                    сохранение...
                  </span>
                )}
              </div>
              {resizeHandle(e => handleDragStart(e, zone.id, 'resize'))}
              {removeBtn}
            </div>
          )];
        })}
      </div>

      {/* Color pickers for mapped zones */}
      {zones.filter(z => localLayouts[z.id]).length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-600">Цвет зон:</span>
          <div className="flex flex-wrap gap-3">
            {zones.filter(z => localLayouts[z.id]).map((zone, i) => {
              const current = (localLayouts[zone.id]?.color) ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
              return (
                <div key={zone.id} className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600">{zone.name}</span>
                  <div className="flex gap-1">
                    {COLOR_PALETTE.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => void handleColorChange(zone, c)}
                        style={{ backgroundColor: c }}
                        className={`w-4 h-4 rounded-full border-2 transition-transform ${
                          current === c ? 'border-gray-800 scale-125' : 'border-transparent hover:scale-110'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unmapped zones — click to add */}
      {unmappedZones.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-gray-600">Зоны не на схеме:</span>
          <div className="flex flex-wrap gap-2">
            {unmappedZones.map(zone => (
              <button
                key={zone.id}
                type="button"
                onClick={() => void addToMap(zone)}
                className="px-3 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 text-gray-600 transition-colors"
              >
                + {zone.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Убрать схему зала?"
          message="Фотография зала будет удалена. Позиции зон останутся."
          confirmLabel="Убрать"
          onConfirm={() => { setConfirmClear(false); void handleClearFloorPlan(); }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
