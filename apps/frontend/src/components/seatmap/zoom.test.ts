import { describe, expect, it } from 'vitest';
import { clampZoom, MAX_ZOOM, MIN_ZOOM, snapZoom, zoomIn, zoomOut } from './zoom';

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
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(MIN_ZOOM);
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
  });
});
