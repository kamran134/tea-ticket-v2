interface LegendItem {
  key: string;
  label: string;
  swatch: 'available' | 'selected' | 'occupied' | 'blocked' | 'zone';
  color?: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

interface Props {
  states: LegendItem[];
  zones: LegendItem[];
}

function Swatch({ item }: { item: LegendItem }) {
  if (item.swatch === 'zone') {
    return (
      <span
        className="w-3 h-3 rounded-sm shrink-0 ring-1 ring-white/20"
        style={{ backgroundColor: item.color }}
      />
    );
  }
  return <span className={`seat-legend-swatch seat-legend-swatch--${item.swatch}`} />;
}

export function MapLegend({ states, zones }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {states.map(item => (
          <span key={item.key} className="inline-flex items-center gap-1.5 text-[11px] text-white/55">
            <Swatch item={item} />
            {item.label}
          </span>
        ))}
      </div>
      {zones.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {zones.map(item => {
            const className = [
              'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] border transition-colors',
              item.active
                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100'
                : item.disabled
                  ? 'border-white/5 bg-white/[0.03] text-white/30'
                  : 'border-white/10 bg-white/[0.04] text-white/70',
            ].join(' ');
            const body = (
              <>
                <Swatch item={item} />
                <span className="font-medium">{item.label}</span>
                {item.hint && <span className="text-white/40">{item.hint}</span>}
              </>
            );
            return item.onClick ? (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onClick={item.onClick}
                className={`${className} ${item.disabled ? 'cursor-not-allowed' : 'hover:border-white/30'}`}
              >
                {body}
              </button>
            ) : (
              <div key={item.key} className={className}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
