import type { ZoneTable } from '../types';

interface Props {
  tables: ZoneTable[];
  selectedTableId: string | null;
  guestCount: number;
  onSelect: (table: ZoneTable) => void;
}

export function TablePicker({ tables, selectedTableId, guestCount, onSelect }: Props) {
  const needed = 1 + guestCount;

  if (tables.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Столы не настроены</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {tables.map(table => {
        const isSelected = table.id === selectedTableId;
        const hasEnough = table.available >= needed;
        const isDisabled = !hasEnough;

        return (
          <button
            key={table.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(table)}
            className={[
              'relative flex flex-col items-center justify-center rounded-xl border-2 p-3 transition-colors',
              isSelected
                ? 'border-emerald-600 bg-emerald-50'
                : isDisabled
                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50',
            ].join(' ')}
          >
            {/* Table shape icon */}
            <div
              className={[
                'mb-1.5 flex items-center justify-center border-2',
                table.shape === 'ROUND' ? 'rounded-full w-8 h-8' : 'rounded w-10 h-7',
                isSelected ? 'border-emerald-600' : 'border-gray-300',
              ].join(' ')}
            >
              <span className="text-xs text-gray-500">{table.number}</span>
            </div>

            <span className="text-xs font-medium text-gray-700">Стол {table.number}</span>
            <span
              className={[
                'text-xs mt-0.5',
                table.available === 0
                  ? 'text-red-500'
                  : table.available <= 2
                    ? 'text-amber-600'
                    : 'text-gray-400',
              ].join(' ')}
            >
              {table.available}/{table.chairCount}
            </span>
          </button>
        );
      })}
    </div>
  );
}
