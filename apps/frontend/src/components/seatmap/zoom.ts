export const MIN_ZOOM = 1;
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
