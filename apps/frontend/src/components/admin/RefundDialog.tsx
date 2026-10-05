import { useState } from 'react';
import { api, ApiError } from '../../services/api';
import { toast } from '../../services/toast';
import { formatPrice } from '../../types';
import type { Ticket } from '../../types';

interface RefundDialogProps {
  tickets: Ticket[];
  currency: string;
  onClose: () => void;
  onRefunded: () => void;
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : 'Не удалось оформить возврат';
}

export function RefundDialog({ tickets, currency, onClose, onRefunded }: RefundDialogProps) {
  const refundable = tickets.filter(t => t.status === 'CONFIRMED' && !t.checkedIn);
  const blocked = tickets.filter(t => t.status === 'CONFIRMED' && t.checkedIn);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(refundable.map(t => t.id)));
  const [submitting, setSubmitting] = useState(false);

  const chosen = refundable.filter(t => selected.has(t.id));
  const amount = chosen.reduce((sum, t) => sum + t.price, 0);
  const leavingSome = tickets.some(t => t.status === 'CONFIRMED' && !selected.has(t.id));

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (chosen.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const result = await api.refundTickets(tickets[0].id, chosen.map(t => t.id));
      const shown = formatPrice(Number(result.amount), currency);
      toast.success(
        result.partial
          ? `Возврат ${shown} отправлен в банк. Остальные билеты группы действительны.`
          : `Возврат ${shown} отправлен в банк. Билет больше не действует.`,
      );
      onRefunded();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Возврат денег</h3>
        <p className="text-sm text-gray-600">
          Сумма вернётся на карту, которой оплатили заказ.
          {refundable.length > 1 && ' Снимите отметку, чтобы вернуть только часть группы.'}
        </p>

        <div className="space-y-2">
          {refundable.map(t => (
            <label key={t.id} className="flex items-start gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(t.id)}
                onChange={() => toggle(t.id)}
                disabled={submitting || refundable.length === 1}
              />
              <span>
                <span className="font-medium">{t.name}</span>
                <span className="block text-xs text-gray-400">
                  {t.zoneName}
                  {t.seatNumber != null ? ` · ${t.seatNumber}` : ''}
                  {' · '}{formatPrice(t.price, currency)}
                </span>
              </span>
            </label>
          ))}
          {blocked.map(t => (
            <div key={t.id} className="text-sm text-gray-400">
              {t.name} — уже прошёл, возврат недоступен
            </div>
          ))}
        </div>

        <div className="text-sm font-semibold text-gray-800">
          К возврату: {formatPrice(amount, currency)}
          {leavingSome && <span className="font-normal text-gray-500"> · частичный</span>}
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => { void submit(); }}
            disabled={submitting || chosen.length === 0}
            className="px-4 py-2 text-sm text-white rounded-xl transition-colors font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Отправка…' : 'Вернуть'}
          </button>
        </div>
      </div>
    </div>
  );
}
