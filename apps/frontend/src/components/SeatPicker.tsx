import { useMemo } from 'react';
import type { Seat } from '../types';

interface Props {
  seats: Seat[];
  selectedSeatIds: string[];
  neededSeats: number;
  onToggle: (seat: Seat) => void;
}

export function SeatPicker({ seats, selectedSeatIds, neededSeats, onToggle }: Props) {
  const grid = useMemo(() => {
    const sections = [...new Set(seats.map(s => s.sectionIndex))].sort((a, b) => a - b);
    const rows = [...new Set(seats.map(s => s.row))].sort((a, b) => a - b);
    return rows.map(row => ({
      row,
      sections: sections.map(si => ({
        sectionIndex: si,
        seats: seats
          .filter(s => s.row === row && s.sectionIndex === si)
          .sort((a, b) => a.posInSection - b.posInSection),
      })),
    }));
  }, [seats]);

  const sections = [...new Set(seats.map(s => s.sectionIndex))].sort((a, b) => a - b);
  const filled = selectedSeatIds.length;
  const remaining = neededSeats - filled;

  if (seats.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Места не настроены</p>;
  }

  return (
    <div className="space-y-3">
      {/* Progress indicator */}
      <div className={`text-sm font-medium ${remaining === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
        {remaining === 0
          ? `Выбрано ${filled} из ${neededSeats} мест`
          : `Выберите ещё ${remaining} место${remaining > 1 ? (remaining < 5 ? 'а' : '') : ''}`}
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Section headers */}
          {sections.length > 1 && (
            <div
              className="grid gap-3 mb-2"
              style={{ gridTemplateColumns: `40px repeat(${sections.length}, 1fr)` }}
            >
              <div />
              {sections.map(si => (
                <div key={si} className="text-center text-xs font-medium text-gray-500">
                  Секция {si + 1}
                </div>
              ))}
            </div>
          )}

          {/* Seat grid */}
          <div className="space-y-1.5">
            {grid.map(({ row, sections: rowSections }) => (
              <div
                key={row}
                className="grid gap-3 items-center"
                style={{ gridTemplateColumns: `40px repeat(${sections.length}, 1fr)` }}
              >
                <span className="text-xs text-gray-400 text-right pr-1">Ряд {row}</span>
                {rowSections.map(({ sectionIndex, seats: seatList }) => (
                  <div key={sectionIndex} className="flex gap-1 justify-center flex-wrap">
                    {seatList.map(seat => {
                      const selIdx = selectedSeatIds.indexOf(seat.id);
                      const isSelected = selIdx !== -1;
                      const isOccupied = seat.occupied;
                      const canSelect = !isOccupied && (isSelected || filled < neededSeats);

                      return (
                        <button
                          key={seat.id}
                          type="button"
                          disabled={!canSelect}
                          onClick={() => onToggle(seat)}
                          title={seat.label ?? `Место ${seat.number}`}
                          className={[
                            'w-7 h-7 rounded text-xs font-bold transition-colors border relative',
                            isSelected
                              ? 'bg-emerald-600 border-emerald-700 text-white'
                              : isOccupied
                                ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                                : canSelect
                                  ? 'bg-white border-gray-300 text-gray-700 hover:bg-emerald-50 hover:border-emerald-400'
                                  : 'bg-white border-gray-200 text-gray-300 cursor-not-allowed',
                          ].join(' ')}
                        >
                          {isSelected ? selIdx + 1 : (seat.label ?? seat.number)}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-3 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded border border-gray-300 bg-white inline-block" />
              Свободно
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded border border-emerald-700 bg-emerald-600 inline-block" />
              Выбрано (№ персоны)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded border border-gray-200 bg-gray-100 inline-block" />
              Занято
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
