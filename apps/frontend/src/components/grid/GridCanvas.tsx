import { forwardRef, type ReactNode } from 'react';
import { GRID_CELL_SIZE } from './gridGeometry';

interface Props {
  rows: number;
  cols: number;
  /** CSS length capping the canvas height before it starts scrolling. */
  maxHeight: string;
  /**
   * Number of columns that must fit within the container's width without a
   * horizontal scrollbar. When set, the cell shrinks below GRID_CELL_SIZE as
   * needed to fit min(cols, fitCols) columns; past fitCols columns it stops
   * shrinking and the canvas scrolls instead.
   * Omit to keep the cell fixed at GRID_CELL_SIZE (used by the admin editor).
   */
  fitCols?: number;
  /** Pixel size of one cell before fitCols shrinking. Default GRID_CELL_SIZE. */
  cellSize?: number;
  /** Visual scale on top of the fitted cell size. Pan remains native overflow. */
  zoom?: number;
  tone?: 'light' | 'dark';
  className?: string;
  onMouseLeave?: () => void;
  onScroll?: () => void;
  children: ReactNode;
}

// The scrollable venue canvas, shared by the admin editor and the buyer's
// seat picker so the two cannot drift apart geometrically.
//
// Both tracks always use the same size, keeping cells square. Without
// fitCols the cell is fixed at GRID_CELL_SIZE (admin painting). With fitCols
// the cell shrinks via a CSS calc() so min(cols, fitCols) columns fit in the
// container — including on mobile, so the buyer first sees the whole plan
// (stage as the landmark) and then zooms in. `zoom` scales that fitted grid
// with a CSS transform; a sizer wrapper keeps scrollWidth/Height in sync so
// pan is ordinary overflow. Fixed tracks stop overlay content from growing a
// row and shifting the whole grid.
export const GridCanvas = forwardRef<HTMLDivElement, Props>(function GridCanvas(
  {
    rows,
    cols,
    maxHeight,
    fitCols,
    cellSize = GRID_CELL_SIZE,
    zoom = 1,
    tone = 'light',
    className,
    onMouseLeave,
    onScroll,
    children,
  },
  ref,
) {
  if (rows < 1 || cols < 1) return null;

  const trackSize = fitCols
    ? `min(${cellSize}px, calc((100cqw - 2px) / ${Math.min(cols, fitCols)}))`
    : `${cellSize}px`;

  const scale = zoom > 0 && zoom !== 1 ? zoom : 1;

  return (
    <div
      ref={ref}
      className={[
        'w-full rounded-xl border select-none overflow-auto overscroll-contain',
        tone === 'dark' ? 'seat-map-canvas' : 'border-gray-200 bg-gray-100',
        className ?? '',
      ].join(' ')}
      style={{ maxHeight, containerType: 'inline-size' }}
      onMouseLeave={onMouseLeave}
      onScroll={onScroll}
    >
      <div
        style={
          scale === 1
            ? { width: 'max-content', margin: '0 auto' }
            : {
              width: `calc((${trackSize}) * ${cols} * ${scale})`,
              height: `calc((${trackSize}) * ${rows} * ${scale})`,
              margin: '0 auto',
            }
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${trackSize})`,
            gridTemplateRows: `repeat(${rows}, ${trackSize})`,
            width: 'max-content',
            transform: scale === 1 ? undefined : `scale(${scale})`,
            transformOrigin: '0 0',
            willChange: scale === 1 ? undefined : 'transform',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
});

GridCanvas.displayName = 'GridCanvas';

