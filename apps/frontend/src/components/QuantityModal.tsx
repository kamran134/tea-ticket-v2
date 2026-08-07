import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPrice } from '../types';

interface Props {
  title: string;
  price: number;
  currency: string;
  quantity: number;
  max: number;
  onChange: (quantity: number) => void;
  onClose: () => void;
}

export function QuantityModal({ title, price, currency, quantity, max, onChange, onClose }: Props) {
  const { t } = useTranslation();

  // Every +/- click already commits straight to the cart, so there's nothing
  // to discard here — Escape just closes the popup, same as the backdrop
  // click and the "Done" button below.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-xs space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="font-semibold text-gray-800 text-lg">{title}</h3>
          <p className="text-sm text-gray-500">{t('quantityModal.perTicket', { price: formatPrice(price, currency) })}</p>
        </div>

        <div className="flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => onChange(Math.max(0, quantity - 1))}
            disabled={quantity <= 0}
            className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 text-2xl font-bold text-gray-700 disabled:opacity-40 transition-colors"
          >
            −
          </button>
          <span className="text-3xl font-bold text-gray-800 w-10 text-center">{quantity}</span>
          <button
            type="button"
            onClick={() => onChange(Math.min(max, quantity + 1))}
            disabled={quantity >= max}
            className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 text-2xl font-bold text-gray-700 disabled:opacity-40 transition-colors"
          >
            +
          </button>
        </div>

        <p className="text-center text-xs text-gray-400">
          {max === 0
            ? t('quantityModal.noSeats')
            : quantity >= max
              ? t('quantityModal.maxAvailable', { max })
              : t('quantityModal.available', { max })}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
        >
          {t('common.done')}
        </button>
      </div>
    </div>
  );
}
