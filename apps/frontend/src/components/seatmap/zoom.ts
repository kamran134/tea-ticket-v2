/**
 * Zoomed far enough out that a hall wider than the screen still fits, for orientation.
 * The map does not open here — see INITIAL_ZOOM.
 */
export const MIN_ZOOM = 0.25;
/**
 * Where the map opens: cells at their own size, already big enough to tap. Used to be
 * MIN_ZOOM, which on a phone meant opening on a plan squeezed to roughly 8px per cell.
 */
export const INITIAL_ZOOM = 1;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 0.25;

export function clampZoom(value: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function snapZoom(value: number, step = ZOOM_STEP): number {
  return clampZoom(Math.round(value / step) * step);
}

export function zoomIn(current: number, step = ZOOM_STEP): number {
  return snapZoom(current + step);
}

export function zoomOut(current: number, step = ZOOM_STEP): number {
  return snapZoom(current - step);
}
