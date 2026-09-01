import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Seat, ZoneTable } from '../types';
import { formatPrice } from '../types';

interface Props {
  zoneName: string;
  table: ZoneTable;
  seats: Seat[];
  selectedSeatIds: string[];
  price: number;
  currency: string;
  onToggle: (seat: Seat) => void;
  onClose: () => void;
}

export function TableSeatPicker({
  zoneName, table, seats, selectedSeatIds, price, currency, onToggle, onClose,
}: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const ordered = [...seats].sort((a, b) => a.number - b.number || a.posInSection - b.posInSection);
  const selectedHere = ordered.filter(s => selectedSeatIds.includes(s.id)).length;
  const free = ordered.filter(s => !s.occupied).length;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
        data-testid={`table-picker-${table.id}`}
      >
        <div>
          <h3 className="font-semibold text-gray-800 text-lg">
            {t('register.tableTitle', { number: table.number })}
          </h3>
          <p className="text-sm text-gray-500">
            {zoneName} · {t('quantityModal.perTicket', { price: formatPrice(price, currency) })}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {t('gridMap.tableSeatHint', { selected: selectedHere, free, total: table.chairCount })}
          </p>
        </div>

        {ordered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{t('seatPicker.notConfigured')}</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {ordered.map(seat => {
              const isSelected = selectedSeatIds.includes(seat.id);
              const isOccupied = seat.occupied;
              return (
                <button
                  key={seat.id}
                  type="button"
                  disabled={isOccupied}
                  onClick={() => onToggle(seat)}
                  data-testid={`seat-${seat.id}`}
                  data-seat-id={seat.id}
                  data-seat-status={isOccupied ? 'occupied' : isSelected ? 'selected' : 'available'}
                  title={t('gridMap.tableSeatTooltip', {
                    zone: zoneName,
                    table: table.number,
                    seat: seat.number,
                    price: formatPrice(price, currency),
                    occupied: isOccupied ? ` · ${t('gridMap.occupied')}` : '',
                  })}
                  className={[
                    'min-h-[44px] rounded-xl text-sm font-bold border-2 transition-colors',
                    isSelected
                      ? 'bg-emerald-600 border-emerald-700 text-white'
                      : isOccupied
                        ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-emerald-50 hover:border-emerald-400',
                  ].join(' ')}
                >
                  {seat.number}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-gray-300 bg-white inline-block" />
            {t('seatPicker.free')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-emerald-700 bg-emerald-600 inline-block" />
            {t('seatPicker.inCart')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-gray-200 bg-gray-100 inline-block" />
            {t('seatPicker.occupied')}
          </span>
        </div>

        <button
          type="button"
          data-testid="table-picker-done"
          onClick={onClose}
          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
        >
          {t('common.done')}
        </button>
      </div>
    </div>
  );
}
