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
        className="w-3 h-3 rounded-sm shrink-0 ring-1 ring-black/10 dark:ring-white/20"
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
        className="inline-flex items-center gap-1.5 text-[11px] seat-map-muted hover:text-[color:var(--map-fg)] transition-colors"
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
          className="inline-flex items-center gap-1.5 text-[11px] seat-map-muted hover:text-[color:var(--map-fg)] transition-colors"
        >
          <span aria-hidden="true">▾</span>
          {t('gridMap.legend')}
        </button>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {states.map(item => (
          <span key={item.key} className="inline-flex items-center gap-1.5 text-[11px] seat-map-muted">
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
                ? ''
                : item.disabled
                  ? 'opacity-40'
                  : '',
            ].join(' ');
            const style = item.active
              ? {
                  borderColor: 'var(--map-chip-border)',
                  background: 'var(--map-chip-bg)',
                  color: 'var(--map-chip-fg)',
                }
              : {
                  borderColor: 'var(--map-border)',
                  background: 'transparent',
                  color: 'var(--map-fg)',
                };
            const body = (
              <>
                <Swatch item={item} />
                <span className="font-medium">{item.label}</span>
                {item.hint && <span className="seat-map-muted">{item.hint}</span>}
              </>
            );
            return item.onClick ? (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onClick={item.onClick}
                className={`${className} ${item.disabled ? 'cursor-not-allowed' : ''}`}
                style={style}
              >
                {body}
              </button>
            ) : (
              <div key={item.key} className={className} style={style}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
