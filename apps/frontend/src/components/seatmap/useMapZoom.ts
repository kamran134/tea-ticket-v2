import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { clampZoom, INITIAL_ZOOM, MAX_ZOOM, MIN_ZOOM, zoomIn as stepIn, zoomOut as stepOut } from './zoom';

interface PinchOrigin {
  x: number;
  y: number;
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(a: Touch, b: Touch): PinchOrigin {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

export function useMapZoom(scrollRef: RefObject<HTMLElement | null>) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const applyZoom = useCallback((next: number, origin?: PinchOrigin) => {
    const prev = zoomRef.current;
    const clamped = clampZoom(next);
    if (Math.abs(clamped - prev) < 0.001) return;

    const el = scrollRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const ox = origin ? origin.x - rect.left : rect.width / 2;
      const oy = origin ? origin.y - rect.top : rect.height / 2;
      const ratio = clamped / prev;
      pendingScroll.current = {
        left: (el.scrollLeft + ox) * ratio - ox,
        top: (el.scrollTop + oy) * ratio - oy,
      };
    }
    setZoom(clamped);
  }, [scrollRef]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const pending = pendingScroll.current;
    if (!el || !pending) return;
    el.scrollLeft = pending.left;
    el.scrollTop = pending.top;
    pendingScroll.current = null;
  }, [zoom, scrollRef]);

  const zoomIn = useCallback(() => applyZoom(stepIn(zoomRef.current)), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(stepOut(zoomRef.current)), [applyZoom]);
  const resetZoom = useCallback(() => {
    pendingScroll.current = { left: 0, top: 0 };
    setZoom(INITIAL_ZOOM);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinchRef.current = {
        distance: touchDistance(e.touches[0], e.touches[1]),
        zoom: zoomRef.current,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const distance = touchDistance(e.touches[0], e.touches[1]);
      if (pinchRef.current.distance < 8) return;
      applyZoom(
        pinchRef.current.zoom * (distance / pinchRef.current.distance),
        touchMidpoint(e.touches[0], e.touches[1]),
      );
    };

    const onTouchEnd = () => {
      pinchRef.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      applyZoom(zoomRef.current + delta, { x: e.clientX, y: e.clientY });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [applyZoom, scrollRef]);

  return {
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    canZoomIn: zoom < MAX_ZOOM - 0.001,
    canZoomOut: zoom > MIN_ZOOM + 0.001,
    canReset: zoom !== INITIAL_ZOOM,
  };
}
