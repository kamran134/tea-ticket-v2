import { useEffect, useState, type ReactNode } from 'react';
import { GRID_CELL_SIZE } from './gridGeometry';

interface Props {
  rows: number;
  cols: number;
  /** CSS length capping the canvas height before it starts scrolling. */
  maxHeight: string;
  /**
   * Desktop-only: number of columns that must fit within the container's
   * width without a horizontal scrollbar. When set, the cell shrinks below
   * GRID_CELL_SIZE as needed to fit min(cols, fitCols) columns; past
   * fitCols columns it stops shrinking and the canvas scrolls instead.
   * Omit to keep the cell fixed at GRID_CELL_SIZE regardless of column
   * count (used by the admin editor).
   */
  fitCols?: number;
  onMouseLeave?: () => void;
  children: ReactNode;
}

// Tailwind's `md` breakpoint — the same one the rest of the app treats as
// the desktop/mobile split (see Footer.tsx).
const DESKTOP_QUERY = '(min-width: 768px)';

// Tracks whether the desktop breakpoint currently matches, via the
// MediaQueryList's own 'change' event rather than window 'resize' so it
// doesn't fire on every mobile-viewport-resize-due-to-keyboard event. Reads
// the initial value synchronously to avoid a flash of the wrong layout.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

// The scrollable venue canvas, shared by the admin editor and the buyer's
// seat picker so the two cannot drift apart visually.
//
// Both tracks always use the same size, keeping cells square. On mobile — or
// on desktop when fitCols isn't passed (the admin editor) — that size is
// fixed at GRID_CELL_SIZE, so the canvas has one intrinsic size that never
// stretches to fill its container and never shrinks to fit it, and anything
// that doesn't fit is reached by scrolling (both axes). On desktop with
// fitCols passed, the cell shrinks (via a CSS calc(), not a DOM measurement)
// just enough that min(cols, fitCols) columns fit in the container's width
// without a horizontal scrollbar; past fitCols columns the cell stops
// shrinking — it stays at the size that fits exactly fitCols columns, so the
// picture doesn't jump between a 45- and a 46-column venue — and horizontal
// scrolling takes back over. Fixed rows additionally stop an
// overlay's own content — a long zone name, a table icon — from growing the
// row it sits in and shifting the whole grid.
//
// margin: 0 auto centres the canvas while it is narrower than the container;
// once it is wider, the auto margins collapse to zero and it simply overflows
// into the scroll area, so the left edge always stays reachable.
export function GridCanvas({ rows, cols, maxHeight, fitCols, onMouseLeave, children }: Props) {
  const isDesktop = useIsDesktop();
  // repeat(0, ...) is invalid CSS and would drop the whole declaration
  if (rows < 1 || cols < 1) return null;

  // cqw is the scroll container's own inline-size (via containerType:
  // 'inline-size' below), not the viewport's — unlike maxHeight, the
  // container's width isn't a value we already have as a CSS literal (it's
  // w-full inside a modal with padding), so container query units are what
  // let the calc() below reference it at all.
  //
  // -2px accounts for the scroll container's 1px left + 1px right border,
  // which calc() doesn't know about — without it, a grid sized to exactly
  // fill the container's width still overflows it by that border width and
  // scrolls.
  const trackSize = isDesktop && fitCols
    ? `min(${GRID_CELL_SIZE}px, calc((100cqw - 2px) / ${Math.min(cols, fitCols)}))`
    : `${GRID_CELL_SIZE}px`;

  return (
    <div
      className="w-full rounded-xl border border-gray-200 bg-gray-100 select-none overflow-auto"
      style={{ maxHeight, containerType: 'inline-size' }}
      onMouseLeave={onMouseLeave}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${trackSize})`,
          gridTemplateRows: `repeat(${rows}, ${trackSize})`,
          width: 'max-content',
          margin: '0 auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}
