import { describe, expect, it } from 'vitest';
import { clampZoom, INITIAL_ZOOM, MAX_ZOOM, MIN_ZOOM, snapZoom, zoomIn, zoomOut } from './zoom';

describe('clampZoom', () => {
  it('keeps values inside the allowed range', () => {
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
  });
});

describe('snapZoom / zoomIn / zoomOut', () => {
  it('snaps to the zoom step', () => {
    expect(snapZoom(1.12)).toBe(1);
    expect(snapZoom(1.13)).toBe(1.25);
  });

  it('steps in and out without leaving the range', () => {
    expect(zoomIn(INITIAL_ZOOM)).toBe(1.25);
    expect(zoomOut(INITIAL_ZOOM)).toBe(0.75);
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
  });
});

describe('zoom bounds', () => {
  // The map opens at INITIAL_ZOOM, not at MIN_ZOOM. They used to be the same value, which
  // meant a phone opened on a plan squeezed to roughly 8px per cell.
  it('opens above the minimum so zooming out is what reveals the whole plan', () => {
    expect(MIN_ZOOM).toBeLessThan(INITIAL_ZOOM);
    expect(INITIAL_ZOOM).toBeLessThan(MAX_ZOOM);
  });

  it('zooms out far enough for a wide hall to fit a phone', () => {
    // 49 columns at the 28px touch floor against a ~350px canvas.
    expect(MIN_ZOOM).toBeLessThanOrEqual(350 / (49 * 28));
  });
});
