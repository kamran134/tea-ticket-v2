import type { TableShape } from '../types';

export interface Footprint {
  rows: number;
  cols: number;
}

export type ChairMarkerShape = 'circle' | 'rect';

export interface ChairMarker {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: ChairMarkerShape;
}

export function tableChairLayout(
  shape: TableShape,
  chairs: number,
  footprint: Footprint,
): ChairMarker[] {
  const count = Math.max(0, Math.floor(chairs));
  if (count === 0) return [];
  if (shape === 'SOFA') return sofaChairs(count, footprint);
  if (shape === 'RECT') return rectChairs(count, footprint);
  return roundChairs(count, footprint);
}

function roundChairs(chairs: number, { rows, cols }: Footprint): ChairMarker[] {
  const cx = cols / 2;
  const cy = rows / 2;
  const unit = Math.min(rows, cols);
  const chairR = unit * 0.09;
  const orbit = unit * 0.42;
  const size = chairR * 2;
  return Array.from({ length: chairs }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / chairs;
    return {
      index: i,
      x: cx + orbit * Math.cos(angle),
      y: cy + orbit * Math.sin(angle),
      width: size,
      height: size,
      shape: 'circle' as const,
    };
  });
}

function rectChairs(chairs: number, { rows, cols }: Footprint): ChairMarker[] {
  const chairSize = Math.min(rows, cols) * 0.16;
  const topCount = Math.ceil(chairs / 2);
  const bottomCount = chairs - topCount;
  const place = (count: number, y: number, startIndex: number) =>
    Array.from({ length: count }, (_, i) => ({
      index: startIndex + i,
      x: cols * 0.2 + ((i + 0.5) / count) * (cols * 0.6),
      y,
      width: chairSize,
      height: chairSize,
      shape: 'rect' as const,
    }));
  return [
    ...place(topCount, rows * 0.12, 0),
    ...(bottomCount > 0 ? place(bottomCount, rows * 0.88, topCount) : []),
  ];
}

function sofaChairs(chairs: number, { rows, cols }: Footprint): ChairMarker[] {
  const benchH = rows * 0.4;
  const y = rows * 0.05 + benchH / 2;
  const x0 = cols * 0.05;
  const benchW = cols * 0.9;
  const width = (benchW / chairs) * 0.78;
  return Array.from({ length: chairs }, (_, i) => ({
    index: i,
    x: x0 + ((i + 0.5) / chairs) * benchW,
    y,
    width,
    height: benchH * 0.72,
    shape: 'rect' as const,
  }));
}
