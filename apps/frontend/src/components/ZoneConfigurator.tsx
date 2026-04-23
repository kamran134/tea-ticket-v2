import { useState } from 'react';
import { api } from '../services/api';
import type { Zone, ZoneType, ZoneSectionLayout } from '../types';
import { toast } from '../services/toast';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  zone: Zone;
  onUpdated: (zone: Zone) => void;
}

interface SeatSection {
  label: string;
  rows: number;
  seatsPerRow: number;
}

const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  GENERAL: 'Общая (без мест)',
  SEATED: 'С местами (ряды)',
  TABLE: 'Со столами',
};

export function ZoneConfigurator({ zone, onUpdated }: Props) {
  const [open, setOpen] = useState(false);

  const [sections, setSections] = useState<SeatSection[]>([
    { label: 'Секция 1', rows: 5, seatsPerRow: 10 },
  ]);
  const [numberingOrder, setNumberingOrder] = useState<'row-first' | 'section-first'>('row-first');
  const [startFrom, setStartFrom] = useState(1);

  const [tableCount, setTableCount] = useState(10);
  const [tableShape, setTableShape] = useState<'ROUND' | 'RECT'>('ROUND');
  const [chairCount, setChairCount] = useState(8);

  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totalSeats = sections.reduce((s, sec) => s + sec.rows * sec.seatsPerRow, 0);

  const addSection = () =>
    setSections(s => [...s, { label: `Секция ${s.length + 1}`, rows: 5, seatsPerRow: 10 }]);

  const removeSection = (i: number) => setSections(s => s.filter((_, idx) => idx !== i));

  const updateSection = (i: number, field: keyof SeatSection, value: string | number) =>
    setSections(s => s.map((sec, idx) => (idx === i ? { ...sec, [field]: value } : sec)));

  const handleGenerateSeats = async () => {
    setLoading(true);
    try {
      const result = await api.generateSeats(zone.id, { sections, numberingOrder, startFrom });
      toast.success(`Создано ${result.count} мест`);

      if (sections.length > 1) {
        const gap = 3;
        const usableW = 90 - gap * (sections.length - 1);
        const secW = usableW / sections.length;
        const sectionLayouts: ZoneSectionLayout[] = sections.map((sec, i) => ({
          sectionIndex: i,
          label: sec.label,
          x: 5 + i * (secW + gap),
          y: 5,
          w: secW,
          h: 30,
        }));
        await api.updateZoneLayout(zone.id, {
          ...(zone.layoutData?.color ? { color: zone.layoutData.color } : {}),
          sections: sectionLayouts,
        });
      }

      const updatedZones = await api.getZones(zone.venueId);
      const fresh = updatedZones.find(z => z.id === zone.id);
      if (fresh) onUpdated(fresh);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTables = async () => {
    setLoading(true);
    try {
      const result = await api.generateTables(zone.id, { count: tableCount, shape: tableShape, chairCount });
      toast.success(`Создано ${result.count} столов (${result.totalSeats} мест)`);
      const updated = await api.getZones(zone.venueId);
      const fresh = updated.find(z => z.id === zone.id);
      if (fresh) onUpdated(fresh);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSeats = async () => {
    setLoading(true);
    try {
      await api.deleteSeats(zone.id);
      toast.success('Места удалены');
      const updated = await api.getZones(zone.venueId);
      const fresh = updated.find(z => z.id === zone.id);
      if (fresh) onUpdated(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-sm text-blue-600 hover:underline"
      >
        {ZONE_TYPE_LABELS[zone.type]} ↓
      </button>

      {open && (
        <div className="mt-3 border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50">
          {/* Seats generator */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Места (ряды/секции)</span>
              <button
                type="button"
                onClick={addSection}
                className="text-xs text-emerald-700 hover:underline"
              >
                + Секция
              </button>
            </div>

            {sections.map((sec, i) => (
              <div key={i} className="grid grid-cols-[1fr_60px_60px_24px] gap-2 items-center">
                <input
                  type="text"
                  placeholder="Название"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  value={sec.label}
                  onChange={e => updateSection(i, 'label', e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Рядов"
                  title="Количество рядов"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  value={sec.rows}
                  onChange={e => updateSection(i, 'rows', Number(e.target.value))}
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Мест"
                  title="Мест в ряду"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  value={sec.seatsPerRow}
                  onChange={e => updateSection(i, 'seatsPerRow', Number(e.target.value))}
                />
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSection(i)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Нумерация</label>
                <select
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  value={numberingOrder}
                  onChange={e => setNumberingOrder(e.target.value as 'row-first' | 'section-first')}
                >
                  <option value="row-first">По рядам (1,2,3 → все секции)</option>
                  <option value="section-first">По секциям (сначала вся левая)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Начать с номера</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  value={startFrom}
                  onChange={e => setStartFrom(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Итого: {totalSeats} мест</span>
              <button
                type="button"
                onClick={handleGenerateSeats}
                disabled={loading || totalSeats === 0}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '...' : 'Сгенерировать места'}
              </button>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Tables generator */}
          <div className="space-y-3">
            <span className="text-sm font-semibold text-gray-700">Столы</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Кол-во столов</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  value={tableCount}
                  onChange={e => setTableCount(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Стульев за столом</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  value={chairCount}
                  onChange={e => setChairCount(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Форма</label>
                <select
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-300"
                  value={tableShape}
                  onChange={e => setTableShape(e.target.value as 'ROUND' | 'RECT')}
                >
                  <option value="ROUND">Круглый</option>
                  <option value="RECT">Прямоугольный</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Итого: {tableCount} столов · {tableCount * chairCount} мест
              </span>
              <button
                type="button"
                onClick={handleGenerateTables}
                disabled={loading}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '...' : 'Сгенерировать столы'}
              </button>
            </div>
          </div>

          {zone.type !== 'GENERAL' && (
            <>
              <hr className="border-gray-200" />
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                className="text-sm text-red-500 hover:underline disabled:opacity-50"
              >
                Сбросить конфигурацию мест
              </button>
            </>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Сбросить конфигурацию?"
          message="Все места будут удалены. Билеты с местами не удалятся."
          confirmLabel="Сбросить"
          onConfirm={() => { setConfirmDelete(false); handleDeleteSeats(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
