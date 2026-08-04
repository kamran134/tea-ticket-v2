import type { ReactNode } from 'react';
import { GRID_CELL_SIZE } from './gridGeometry';

interface Props {
  rows: number;
  cols: number;
  /** CSS length capping the canvas height before it starts scrolling. */
  maxHeight: string;
  onMouseLeave?: () => void;
  children: ReactNode;
}

// The scrollable venue canvas, shared by the admin editor and the buyer's
// seat picker so the two cannot drift apart visually.
//
// Both track dimensions are fixed in pixels, which is the whole point: the
// canvas has one intrinsic size that never stretches to fill its container
// and never shrinks to fit it, so a phone and a desktop render an identical
// picture and anything that doesn't fit is reached by scrolling (both axes).
// Fixed rows additionally stop an overlay's own content — a long zone name, a
// table icon — from growing the row it sits in and shifting the whole grid.
//
// margin: 0 auto centres the canvas while it is narrower than the container;
// once it is wider, the auto margins collapse to zero and it simply overflows
// into the scroll area, so the left edge always stays reachable.
export function GridCanvas({ rows, cols, maxHeight, onMouseLeave, children }: Props) {
  // repeat(0, ...) is invalid CSS and would drop the whole declaration
  if (rows < 1 || cols < 1) return null;

  return (
    <div
      className="w-full rounded-xl border border-gray-200 bg-gray-100 select-none overflow-auto"
      style={{ maxHeight }}
      onMouseLeave={onMouseLeave}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${GRID_CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${rows}, ${GRID_CELL_SIZE}px)`,
          width: 'max-content',
          margin: '0 auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}
