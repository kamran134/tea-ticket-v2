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
            <p className="text-sm seat-map-muted truncate">{emptyHint}</p>
          ) : (
            <>
              <p className="text-sm font-medium truncate">{countLabel}</p>
              <p className="text-xs seat-map-muted truncate">
                {items.map(i => i.label).join(' · ')}
              </p>
            </>
          )}
        </div>
        <div className="text-right shrink-0">
          {items.length > 0 && (
            <div className="text-sm font-semibold seat-map-kicker tabular-nums mb-1">
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
      <h2 className="text-xs font-semibold tracking-[0.18em] uppercase seat-map-kicker mb-3">
        {title}
      </h2>
      <div className="flex-1 min-h-0 overflow-auto space-y-1 pr-1">
        {items.length === 0 ? (
          <p className="text-sm seat-map-muted">{emptyHint}</p>
        ) : (
          <div data-testid="map-selection">
            {items.map(item => (
              <div key={item.id} className="flex items-start gap-2 py-1.5 border-b seat-map-hairline">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{item.label}</div>
                  {item.meta && <div className="text-xs seat-map-muted truncate">{item.meta}</div>}
                </div>
                <div className="text-xs seat-map-muted tabular-nums shrink-0 pt-0.5">
                  {formatPrice(item.price, currency)}
                </div>
                {item.onRemove && (
                  <button
                    type="button"
                    onClick={item.onRemove}
                    aria-label={item.removeLabel}
                    className="shrink-0 w-7 h-7 rounded-lg seat-map-muted hover:text-[color:var(--map-fg)] hover:bg-black/[0.06] dark:hover:bg-white/10 transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="pt-3 mt-2 border-t seat-map-hairline shrink-0">
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-sm seat-map-muted">{countLabel}</span>
          <span className="text-lg font-semibold tabular-nums">
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
