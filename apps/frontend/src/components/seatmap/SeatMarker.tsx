import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';

export type SeatVisualStatus = 'available' | 'selected' | 'occupied';
export type SeatMarkerShape = 'circle' | 'rect';
export type SeatMarkerPlacement = 'cell' | 'overlay';

interface Props {
  seatId: string;
  number: number;
  status: SeatVisualStatus;
  accentColor: string;
  ariaLabel: string;
  title?: string;
  shape?: SeatMarkerShape;
  placement?: SeatMarkerPlacement;
  style?: CSSProperties;
  onToggle: () => void;
  onInspect?: (el: HTMLElement, open: boolean) => void;
}

function SeatMarkerInner({
  seatId,
  number,
  status,
  accentColor,
  ariaLabel,
  title,
  shape = 'circle',
  placement = 'cell',
  style,
  onToggle,
  onInspect,
}: Props) {
  const occupied = status === 'occupied';

  const inspect = (el: HTMLElement, open: boolean) => {
    onInspect?.(el, open);
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    inspect(e.currentTarget, true);
    if (!occupied) onToggle();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (occupied) {
      e.preventDefault();
      inspect(e.currentTarget, true);
    }
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={status === 'selected'}
      aria-disabled={occupied}
      tabIndex={occupied ? -1 : 0}
      title={title}
      data-testid={`seat-${seatId}`}
      data-seat-id={seatId}
      data-seat-status={status}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={e => inspect(e.currentTarget, true)}
      onMouseLeave={e => inspect(e.currentTarget, false)}
      onFocus={e => inspect(e.currentTarget, true)}
      onBlur={e => inspect(e.currentTarget, false)}
      className={`seat-marker seat-marker--${placement} ${shape === 'rect' ? 'seat-marker--rect' : ''}`}
      style={{
        ...style,
        ['--seat-accent' as string]: accentColor,
      }}
    >
      <span className="seat-marker-disc" data-state={status}>
        <span className="seat-marker-number">{number}</span>
      </span>
    </button>
  );
}

export const SeatMarker = memo(SeatMarkerInner);
