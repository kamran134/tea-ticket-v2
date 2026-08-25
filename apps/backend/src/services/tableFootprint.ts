export type TableShape = 'ROUND' | 'RECT' | 'SOFA';

export interface TableFootprint {
  rows: number;
  cols: number;
}

// Keep in sync with apps/frontend/src/components/TableIcon.tsx — a shared
// package is a later PR. Chair-count tiers decide how many grid cells a
// table occupies so admin editor, DB, and buyer map stay aligned.
export function tableFootprint(shape: TableShape, chairs: number): TableFootprint {
  if (shape === 'SOFA') {
    const cols = chairs <= 3 ? 3 : chairs <= 5 ? 4 : 5;
    return { rows: 2, cols };
  }
  if (shape === 'RECT') {
    const cols = chairs <= 4 ? 3 : chairs <= 6 ? 4 : chairs <= 8 ? 5 : 6;
    return { rows: 2, cols };
  }
  const size = chairs <= 4 ? 3 : chairs <= 8 ? 4 : 5;
  return { rows: size, cols: size };
}
