import { useTranslation } from 'react-i18next';
import type { ZoneTable } from '../types';

interface Props {
  tables: ZoneTable[];
  cartQuantityByTable: Record<string, number>;
  onAdd: (table: ZoneTable) => void;
}

export function TablePicker({ tables, cartQuantityByTable, onAdd }: Props) {
  const { t } = useTranslation();

  if (tables.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">{t('tablePicker.notConfigured')}</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {tables.map(table => {
        const inCart = cartQuantityByTable[table.id] ?? 0;
        const remaining = table.available - inCart;
        const isDisabled = remaining <= 0;

        return (
          <button
            key={table.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onAdd(table)}
            className={[
              'relative flex flex-col items-center justify-center rounded-xl border-2 p-3 transition-colors',
              inCart > 0
                ? 'border-emerald-600 bg-emerald-50'
                : isDisabled
                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50',
            ].join(' ')}
          >
            {inCart > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {inCart}
              </span>
            )}
            <div
              className={[
                'mb-1.5 flex items-center justify-center border-2',
                table.shape === 'ROUND' ? 'rounded-full w-8 h-8' : 'rounded w-10 h-7',
                inCart > 0 ? 'border-emerald-600' : 'border-gray-300',
              ].join(' ')}
            >
              <span className="text-xs text-gray-500">{table.number}</span>
            </div>

            <span className="text-xs font-medium text-gray-700">{t('tablePicker.table', { number: table.number })}</span>
            <span
              className={[
                'text-xs mt-0.5',
                remaining === 0
                  ? 'text-red-500'
                  : remaining <= 2
                    ? 'text-amber-600'
                    : 'text-gray-400',
              ].join(' ')}
            >
              {remaining}/{table.chairCount} {t('tablePicker.freeShort')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
