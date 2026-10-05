import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { toast } from '../../services/toast';
import { formatPrice } from '../../types';
import type { PromoCode, PromoCodeInput, PromoDiscountType, Venue } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';
import { PickerInput } from '../PickerInput';

interface Props {
  venues: Venue[];
  canEdit: boolean;
  canDelete: boolean;
  canManageGlobal: boolean;
}

const GLOBAL_SCOPE = 'global';

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500';

function localDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return localDateInput(date);
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/** Start of the local day, or the last millisecond of it so the code stays valid all day. */
function fromLocalDate(value: string, bound: 'start' | 'end'): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = bound === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

function discountLabel(promo: PromoCode, currency: string): string {
  if (promo.type === 'PERCENT') return `${promo.value}%`;
  return formatPrice(promo.value, currency);
}

const emptyForm = {
  code: '',
  type: 'PERCENT' as PromoDiscountType,
  value: '10',
  maxUses: '',
  active: true,
  startsAt: '',
  endsAt: '',
};

function freshForm() {
  return { ...emptyForm, startsAt: localDateInput(new Date()) };
}

export function PromosTab({ venues, canEdit, canDelete, canManageGlobal }: Props) {
  const [venueId, setVenueId] = useState('');
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(freshForm);
  const [pendingDelete, setPendingDelete] = useState<PromoCode | null>(null);

  const isGlobal = venueId === GLOBAL_SCOPE;
  const venue = venues.find(item => item.id === venueId);
  const currency = venue?.currency ?? '₼';

  const load = useCallback((id: string) => {
    if (!id) {
      setPromos([]);
      setLoadFailed(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    api.getPromoCodes(id === GLOBAL_SCOPE ? null : id)
      .then(rows => {
        setPromos(rows);
        setLoadFailed(false);
      })
      .catch(err => {
        setPromos([]);
        setLoadFailed(true);
        toast.error(errMsg(err, 'Не удалось загрузить промокоды'));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setEditingId(null);
    setForm(freshForm());
    load(venueId);
  }, [venueId, load]);

  const resetForm = () => {
    setEditingId(null);
    setForm(freshForm());
  };

  const startEdit = (promo: PromoCode) => {
    setEditingId(promo.id);
    setForm({
      code: promo.code,
      type: promo.type,
      value: String(promo.value),
      maxUses: promo.maxUses == null ? '' : String(promo.maxUses),
      active: promo.active,
      startsAt: toLocalDate(promo.startsAt),
      endsAt: toLocalDate(promo.endsAt),
    });
  };

  const buildPayload = (): PromoCodeInput | null => {
    const code = form.code.trim();
    const value = Number(form.value.replace(',', '.'));
    if (!venueId || !code || !Number.isFinite(value) || value <= 0) {
      toast.error('Укажите код и размер скидки');
      return null;
    }
    const maxUses = form.maxUses.trim() ? Number(form.maxUses) : null;
    if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      toast.error('Лимит использований — целое число от 1, или пусто');
      return null;
    }
    return {
      venueId: isGlobal ? null : venueId,
      code,
      type: form.type,
      value,
      maxUses,
      active: form.active,
      startsAt: fromLocalDate(form.startsAt, 'start'),
      endsAt: fromLocalDate(form.endsAt, 'end'),
    };
  };

  const save = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.updatePromoCode(editingId, {
          code: payload.code,
          type: payload.type,
          value: payload.value,
          maxUses: payload.maxUses,
          active: payload.active,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
        });
        toast.success('Промокод обновлён');
      } else {
        await api.createPromoCode(payload);
        toast.success('Промокод создан');
      }
      resetForm();
      load(venueId);
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось сохранить промокод'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (promo: PromoCode) => {
    try {
      await api.updatePromoCode(promo.id, { active: !promo.active });
      load(venueId);
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось изменить промокод'));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await api.deletePromoCode(id);
      if (editingId === id) resetForm();
      toast.success('Промокод удалён');
      load(venueId);
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось удалить промокод'));
    }
  };

  return (
    <div className="space-y-4">
      <label className="block min-w-0">
        <span className="text-xs text-gray-500 mb-1 block">Мероприятие</span>
        <select
          className={inputClass}
          value={venueId}
          onChange={e => setVenueId(e.target.value)}
        >
          <option value="">Выберите мероприятие</option>
          {canManageGlobal && <option value={GLOBAL_SCOPE}>Все мероприятия</option>}
          {venues.map(item => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>

      {!venueId && (
        <div className="text-center text-gray-400 py-10">
          {canManageGlobal ? 'Выберите мероприятие или общий код' : 'Выберите мероприятие'}
        </div>
      )}

      {venueId && canEdit && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <div className="text-sm font-medium text-gray-800">
            {editingId
              ? 'Изменить промокод'
              : isGlobal
                ? 'Новый общий промокод'
                : 'Новый промокод'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="text-xs text-gray-500 mb-1 block">Код</span>
              <input
                className={`${inputClass} uppercase`}
                value={form.code}
                onChange={e => setForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs text-gray-500 mb-1 block">Тип скидки</span>
              <select
                className={inputClass}
                value={form.type}
                onChange={e => setForm(prev => ({ ...prev, type: e.target.value as PromoDiscountType }))}
              >
                <option value="PERCENT">Процент</option>
                <option value="FIXED">Сумма ({currency})</option>
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-xs text-gray-500 mb-1 block">
                {form.type === 'PERCENT' ? 'Процент' : `Сумма (${currency})`}
              </span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={form.value}
                onChange={e => setForm(prev => ({ ...prev, value: e.target.value }))}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs text-gray-500 mb-1 block">Лимит использований</span>
              <input
                className={inputClass}
                inputMode="numeric"
                value={form.maxUses}
                onChange={e => setForm(prev => ({ ...prev, maxUses: e.target.value }))}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs text-gray-500 mb-1 block">Дата начала</span>
              <PickerInput
                className={inputClass}
                type="date"
                value={form.startsAt}
                onChange={e => setForm(prev => ({ ...prev, startsAt: e.target.value }))}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs text-gray-500 mb-1 block">Дата окончания</span>
              <PickerInput
                className={inputClass}
                type="date"
                value={form.endsAt}
                onChange={e => setForm(prev => ({ ...prev, endsAt: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))}
            />
            Активен
          </label>
          <p className="text-xs text-gray-400">
            {isGlobal
              ? 'Скидка действует на все мероприятия. Один код на заказ. Пустой лимит — без ограничения. Свой код мероприятия с тем же текстом важнее.'
              : 'Скидка считается от суммы корзины. Один код на заказ. Пустой лимит — без ограничения.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Создать'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm"
              >
                Отмена
              </button>
            )}
          </div>
        </div>
      )}

      {venueId && loading && (
        <div className="text-center text-gray-400 py-6">Загрузка...</div>
      )}

      {venueId && !loading && !loadFailed && promos.length === 0 && (
        <div className="text-center text-gray-400 py-6">
          {isGlobal ? 'Общих промокодов пока нет' : 'Промокодов пока нет'}
        </div>
      )}

      <div className="space-y-2">
        {promos.map(promo => (
          <div key={promo.id} className="bg-white rounded-xl shadow-sm p-4 space-y-1">
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="font-semibold text-gray-800">{promo.code}</div>
                <div className="text-sm text-gray-500">
                  {discountLabel(promo, currency)}
                  {' · '}
                  {promo.maxUses == null ? `${promo.usedCount} исп.` : `${promo.usedCount}/${promo.maxUses}`}
                  {!promo.active && ' · выключен'}
                </div>
                {(promo.startsAt || promo.endsAt) && (
                  <div className="text-xs text-gray-400">
                    {promo.startsAt ? formatDay(promo.startsAt) : '…'}
                    {' — '}
                    {promo.endsAt ? formatDay(promo.endsAt) : '…'}
                  </div>
                )}
              </div>
              <div className="flex gap-3 shrink-0 text-xs">
                {canEdit && (
                  <>
                    <button type="button" onClick={() => startEdit(promo)} className="text-emerald-700 hover:underline">
                      Изменить
                    </button>
                    <button type="button" onClick={() => toggleActive(promo)} className="text-gray-500 hover:underline">
                      {promo.active ? 'Выключить' : 'Включить'}
                    </button>
                  </>
                )}
                {canDelete && (
                  <button type="button" onClick={() => setPendingDelete(promo)} className="text-red-500 hover:underline">
                    Удалить
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Удалить промокод"
          message={`Код ${pendingDelete.code} перестанет приниматься. Уже оформленные билеты сохранят скидку.`}
          confirmLabel="Удалить"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
