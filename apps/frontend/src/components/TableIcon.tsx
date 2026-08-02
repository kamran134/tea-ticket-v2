import type { TableShape } from '../types';

export interface Footprint {
  rows: number;
  cols: number;
}

// How much grid real-estate a table needs to visually fit its shape + chairs
// around it. Chair dots/blocks are capped for readability; beyond that the
// footprint just grows instead of cramming more marks in.
export function tableFootprint(shape: TableShape, chairs: number): Footprint {
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

const MAX_DRAWN_CHAIRS = 10;

// Realistic furniture tones instead of the zone's accent color — a wood
// tabletop, darker wood chairs, brown upholstery for the sofa.
const PALETTE = {
  table: { fill: '#d4a76a', stroke: '#7c5230' },
  chair: { fill: '#9c6b3f', stroke: '#5c3d21' },
  sofa: { fill: '#7a4a30', stroke: '#4a2e1c' },
  mutedFill: '#d1d5db',
  mutedStroke: '#9ca3af',
};

interface ShapeProps {
  rows: number;
  cols: number;
  chairs: number;
  label?: string;
  muted?: boolean;
}

function RoundShape({ rows, cols, chairs, label, muted }: ShapeProps) {
  const cx = cols / 2;
  const cy = rows / 2;
  const unit = Math.min(rows, cols);
  const tableR = unit * 0.28;
  const chairR = unit * 0.09;
  const orbit = unit * 0.42;
  const drawCount = Math.min(chairs, MAX_DRAWN_CHAIRS);
  const tableFill = muted ? PALETTE.mutedFill : PALETTE.table.fill;
  const tableStroke = muted ? PALETTE.mutedStroke : PALETTE.table.stroke;
  const chairFill = muted ? PALETTE.mutedFill : PALETTE.chair.fill;
  const chairStroke = muted ? PALETTE.mutedStroke : PALETTE.chair.stroke;
  return (
    <>
      {Array.from({ length: drawCount }, (_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / drawCount;
        return (
          <circle
            key={i}
            cx={cx + orbit * Math.cos(angle)}
            cy={cy + orbit * Math.sin(angle)}
            r={chairR}
            fill={chairFill}
            stroke={chairStroke}
            strokeWidth={0.03}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={tableR} fill={tableFill} stroke={tableStroke} strokeWidth={0.05} />
      {label && (
        <text x={cx} y={cy + tableR * 0.35} fontSize={tableR * 0.85} textAnchor="middle" fill={tableStroke} fontWeight={700}>
          {label}
        </text>
      )}
    </>
  );
}

function RectShape({ rows, cols, chairs, label, muted }: ShapeProps) {
  const tableX = cols * 0.15;
  const tableY = rows * 0.3;
  const tableW = cols * 0.7;
  const tableH = rows * 0.4;
  const drawCount = Math.min(chairs, MAX_DRAWN_CHAIRS + 2);
  const topCount = Math.ceil(drawCount / 2);
  const bottomCount = drawCount - topCount;
  const chairSize = Math.min(rows, cols) * 0.16;
  const tableFill = muted ? PALETTE.mutedFill : PALETTE.table.fill;
  const tableStroke = muted ? PALETTE.mutedStroke : PALETTE.table.stroke;
  const chairFill = muted ? PALETTE.mutedFill : PALETTE.chair.fill;
  const chairStroke = muted ? PALETTE.mutedStroke : PALETTE.chair.stroke;

  const row = (count: number, y: number) =>
    Array.from({ length: count }, (_, i) => {
      const x = cols * 0.2 + ((i + 0.5) / count) * (cols * 0.6);
      return (
        <rect
          key={`${y}-${i}`}
          x={x - chairSize / 2}
          y={y - chairSize / 2}
          width={chairSize}
          height={chairSize}
          rx={chairSize * 0.25}
          fill={chairFill}
          stroke={chairStroke}
          strokeWidth={0.03}
        />
      );
    });

  return (
    <>
      {row(topCount, rows * 0.12)}
      {bottomCount > 0 && row(bottomCount, rows * 0.88)}
      <rect x={tableX} y={tableY} width={tableW} height={tableH} rx={0.12} fill={tableFill} stroke={tableStroke} strokeWidth={0.05} />
      {label && (
        <text x={cols / 2} y={rows / 2 + 0.15} fontSize={0.5} textAnchor="middle" fill={tableStroke} fontWeight={700}>
          {label}
        </text>
      )}
    </>
  );
}

function SofaShape({ rows, cols, chairs, label, muted }: ShapeProps) {
  const benchH = rows * 0.4;
  const tableSize = Math.min(rows, cols) * 0.42;
  const tableX = cols / 2 - tableSize / 2;
  const tableY = rows - tableSize - rows * 0.08;
  const sofaFill = muted ? PALETTE.mutedFill : PALETTE.sofa.fill;
  const sofaStroke = muted ? PALETTE.mutedStroke : PALETTE.sofa.stroke;
  const tableFill = muted ? PALETTE.mutedFill : PALETTE.table.fill;
  const tableStroke = muted ? PALETTE.mutedStroke : PALETTE.table.stroke;
  return (
    <>
      <rect x={cols * 0.05} y={rows * 0.05} width={cols * 0.9} height={benchH} rx={benchH * 0.3} fill={sofaFill} stroke={sofaStroke} strokeWidth={0.05} />
      <text x={cols / 2} y={rows * 0.05 + benchH / 2 + 0.15} fontSize={0.42} textAnchor="middle" fill="#ffffff" fontWeight={700}>
        × {chairs}
      </text>
      <rect x={tableX} y={tableY} width={tableSize} height={tableSize} rx={tableSize * 0.2} fill={tableFill} stroke={tableStroke} strokeWidth={0.05} />
      {label && (
        <text x={cols / 2} y={tableY + tableSize / 2 + 0.15} fontSize={0.35} textAnchor="middle" fill={tableStroke} fontWeight={700}>
          {label}
        </text>
      )}
    </>
  );
}

interface TableIconProps {
  shape: TableShape;
  chairs: number;
  footprint: Footprint;
  label?: string;
  muted?: boolean;
}

export function TableIcon({ shape, chairs, footprint, label, muted }: TableIconProps) {
  const { rows, cols } = footprint;
  const shapeProps: ShapeProps = { rows, cols, chairs, label, muted };

  return (
    <svg viewBox={`0 0 ${cols} ${rows}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {shape === 'SOFA' ? <SofaShape {...shapeProps} /> : shape === 'RECT' ? <RectShape {...shapeProps} /> : <RoundShape {...shapeProps} />}
    </svg>
  );
}
