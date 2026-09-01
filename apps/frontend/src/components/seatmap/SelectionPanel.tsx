import { formatPrice } from '../../types';

export interface SelectionItem {
  id: string;
  label: string;
  meta?: string;
  price: number;
  onRemove?: () => void;
  removeLabel?: string;
}

interface Props {
  id?: string;
  title: string;
  items: SelectionItem[];
  countLabel: string;
  total: number;
  currency: string;
  continueLabel: string;
  emptyHint: string;
  onContinue: () => void;
  compact?: boolean;
}

export function SelectionPanel({
  id,
  title,
  items,
  countLabel,
  total,
  currency,
  continueLabel,
  emptyHint,
  onContinue,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <div id={id} className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {items.length === 0 ? (
            <p className="text-sm text-white/50 truncate">{emptyHint}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-white truncate">{countLabel}</p>
              <p className="text-xs text-white/50 truncate">
                {items.map(i => i.label).join(' · ')}
              </p>
            </>
          )}
        </div>
        <div className="text-right shrink-0">
          {items.length > 0 && (
            <div className="text-sm font-semibold text-amber-200 tabular-nums mb-1">
              {formatPrice(total, currency)}
            </div>
          )}
          <button
            type="button"
            onClick={onContinue}
            className="h-11 px-4 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors"
          >
            {continueLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id={id} className="flex flex-col min-h-0 h-full">
      <h2 className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-200/80 mb-3">
        {title}
      </h2>
      <div className="flex-1 min-h-0 overflow-auto space-y-1 pr-1">
        {items.length === 0 ? (
          <p className="text-sm text-white/40">{emptyHint}</p>
        ) : (
          items.map(item => (
            <div key={item.id} className="flex items-start gap-2 py-1.5 border-b border-white/5">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white/90 truncate">{item.label}</div>
                {item.meta && <div className="text-xs text-white/40 truncate">{item.meta}</div>}
              </div>
              <div className="text-xs text-white/70 tabular-nums shrink-0 pt-0.5">
                {formatPrice(item.price, currency)}
              </div>
              {item.onRemove && (
                <button
                  type="button"
                  onClick={item.onRemove}
                  aria-label={item.removeLabel}
                  className="shrink-0 w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <div className="pt-3 mt-2 border-t border-white/10 shrink-0">
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-sm text-white/60">{countLabel}</span>
          <span className="text-lg font-semibold text-white tabular-nums">
            {formatPrice(total, currency)}
          </span>
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="w-full h-11 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}
