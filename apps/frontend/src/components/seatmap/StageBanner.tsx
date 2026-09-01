import type { CSSProperties } from 'react';

interface Props {
  label: string;
  subtitle?: string;
  style: CSSProperties;
}

export function StageBanner({ label, subtitle, style }: Props) {
  return (
    <div className="seat-stage pointer-events-none" style={style}>
      <span className="seat-stage-glow" aria-hidden="true" />
      <span className="seat-stage-label">{label}</span>
      {subtitle && <span className="seat-stage-sub">{subtitle}</span>}
    </div>
  );
}
