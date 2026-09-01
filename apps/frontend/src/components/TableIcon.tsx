import { useId } from 'react';
import type { TableShape } from '../types';
import { tableChairLayout } from './tableChairLayout';

export interface Footprint {
  rows: number;
  cols: number;
}

export { tableChairLayout } from './tableChairLayout';
export type { ChairMarker } from './tableChairLayout';

export type ChairVisualState = 'available' | 'selected' | 'sold';

// How much grid real-estate a table needs to visually fit its shape + chairs
// around it. Keep in sync with apps/backend/src/services/tableFootprint.ts.
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

const PALETTE = {
  table: { fill: '#d4a76a', stroke: '#7c5230' },
  chair: { fill: '#9c6b3f', stroke: '#5c3d21' },
  sofa: { fill: '#7a4a30', stroke: '#4a2e1c' },
  selected: { fill: '#059669', stroke: '#047857' },
  mutedFill: '#3f3f46',
  mutedStroke: '#71717a',
};

function chairPaint(state: ChairVisualState | undefined, muted: boolean) {
  if (muted || state === 'sold') return { fill: PALETTE.mutedFill, stroke: PALETTE.mutedStroke };
  if (state === 'selected') return PALETTE.selected;
  return PALETTE.chair;
}

interface ShapeProps {
  rows: number;
  cols: number;
  chairs: number;
  label?: string;
  muted?: boolean;
  chairStates?: ChairVisualState[];
  showChairs: boolean;
  fill: string;
  stroke: string;
}

function ChairMarks({
  shape, chairs, rows, cols, muted, chairStates,
}: ShapeProps & { shape: TableShape }) {
  const markers = tableChairLayout(shape, chairs, { rows, cols });
  return (
    <>
      {markers.map(marker => {
        const paint = chairPaint(chairStates?.[marker.index], !!muted);
        if (marker.shape === 'circle') {
          return (
            <circle
              key={marker.index}
              cx={marker.x}
              cy={marker.y}
              r={marker.width / 2}
              fill={paint.fill}
              stroke={paint.stroke}
              strokeWidth={0.03}
            />
          );
        }
        return (
          <rect
            key={marker.index}
            x={marker.x - marker.width / 2}
            y={marker.y - marker.height / 2}
            width={marker.width}
            height={marker.height}
            rx={Math.min(marker.width, marker.height) * 0.25}
            fill={paint.fill}
            stroke={paint.stroke}
            strokeWidth={0.03}
          />
        );
      })}
    </>
  );
}

function RoundShape({ rows, cols, chairs, label, showChairs, fill, stroke, ...rest }: ShapeProps) {
  const cx = cols / 2;
  const cy = rows / 2;
  const unit = Math.min(rows, cols);
  const tableR = unit * 0.28;
  return (
    <>
      {showChairs && <ChairMarks shape="ROUND" rows={rows} cols={cols} chairs={chairs} label={label} showChairs fill={fill} stroke={stroke} {...rest} />}
      <circle cx={cx} cy={cy} r={tableR} fill={fill} stroke={stroke} strokeWidth={0.05} />
      <circle cx={cx} cy={cy} r={tableR * 0.62} fill="none" stroke={stroke} strokeWidth={0.02} opacity={0.35} />
      {label && (
        <text x={cx} y={cy + tableR * 0.32} fontSize={tableR * 0.72} textAnchor="middle" fill={stroke} fontWeight={700}>
          {label}
        </text>
      )}
    </>
  );
}

function RectShape({ rows, cols, chairs, label, showChairs, fill, stroke, ...rest }: ShapeProps) {
  const tableX = cols * 0.16;
  const tableY = rows * 0.28;
  const tableW = cols * 0.68;
  const tableH = rows * 0.44;
  return (
    <>
      {showChairs && <ChairMarks shape="RECT" rows={rows} cols={cols} chairs={chairs} label={label} showChairs fill={fill} stroke={stroke} {...rest} />}
      <rect x={tableX} y={tableY} width={tableW} height={tableH} rx={0.16} fill={fill} stroke={stroke} strokeWidth={0.05} />
      <rect x={tableX + tableW * 0.08} y={tableY + tableH * 0.12} width={tableW * 0.84} height={tableH * 0.76} rx={0.1} fill="none" stroke={stroke} strokeWidth={0.02} opacity={0.3} />
      {label && (
        <text x={cols / 2} y={rows / 2 + 0.15} fontSize={0.46} textAnchor="middle" fill={stroke} fontWeight={700}>
          {label}
        </text>
      )}
    </>
  );
}

function SofaShape({ rows, cols, chairs, label, muted, showChairs, fill, stroke, ...rest }: ShapeProps) {
  const benchH = rows * 0.4;
  const tableSize = Math.min(rows, cols) * 0.42;
  const tableX = cols / 2 - tableSize / 2;
  const tableY = rows - tableSize - rows * 0.08;
  const sofaFill = muted ? PALETTE.mutedFill : PALETTE.sofa.fill;
  const sofaStroke = muted ? PALETTE.mutedStroke : PALETTE.sofa.stroke;
  return (
    <>
      <rect x={cols * 0.05} y={rows * 0.05} width={cols * 0.9} height={benchH} rx={benchH * 0.3} fill={sofaFill} stroke={sofaStroke} strokeWidth={0.05} />
      {showChairs && <ChairMarks shape="SOFA" rows={rows} cols={cols} chairs={chairs} label={label} muted={muted} showChairs fill={fill} stroke={stroke} {...rest} />}
      <rect x={tableX} y={tableY} width={tableSize} height={tableSize} rx={tableSize * 0.2} fill={fill} stroke={stroke} strokeWidth={0.05} />
      {label && (
        <text x={cols / 2} y={tableY + tableSize / 2 + 0.15} fontSize={0.35} textAnchor="middle" fill={stroke} fontWeight={700}>
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
  chairStates?: ChairVisualState[];
  /** Decorative SVG chairs. Turn off when interactive HTML chairs sit on top. */
  showChairs?: boolean;
}

export function TableIcon({
  shape, chairs, footprint, label, muted, chairStates, showChairs = true,
}: TableIconProps) {
  const { rows, cols } = footprint;
  const uid = useId();
  const fill = muted ? PALETTE.mutedFill : `url(#${uid}-table)`;
  const stroke = muted ? PALETTE.mutedStroke : PALETTE.table.stroke;
  const shapeProps: ShapeProps = {
    rows, cols, chairs, label, muted, chairStates, showChairs, fill, stroke,
  };

  return (
    <svg viewBox={`0 0 ${cols} ${rows}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id={`${uid}-table`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#e8c992" />
          <stop offset="55%" stopColor="#d4a76a" />
          <stop offset="100%" stopColor="#b07d42" />
        </radialGradient>
      </defs>
      {shape === 'SOFA' ? <SofaShape {...shapeProps} /> : shape === 'RECT' ? <RectShape {...shapeProps} /> : <RoundShape {...shapeProps} />}
    </svg>
  );
}
