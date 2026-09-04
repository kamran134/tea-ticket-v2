import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  /**
   * Render behind a toggle, closed by default. Used on phones, where the legend and the
   * zone list together took 185px of an 812px screen away from the map itself.
   */
  collapsible?: boolean;
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

export function MapLegend({ states, zones, collapsible = false }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="inline-flex items-center gap-1.5 text-[11px] text-white/55 hover:text-white/80 transition-colors"
      >
        <span aria-hidden="true">▸</span>
        {t('gridMap.legend')}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="inline-flex items-center gap-1.5 text-[11px] text-white/55 hover:text-white/80 transition-colors"
        >
          <span aria-hidden="true">▾</span>
          {t('gridMap.legend')}
        </button>
      )}
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
