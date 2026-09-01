interface Props {
  text: string;
  x: number;
  y: number;
}

export function SeatTooltip({ text, x, y }: Props) {
  return (
    <div
      role="tooltip"
      className="seat-tooltip"
      style={{ left: x, top: y }}
    >
      {text}
    </div>
  );
}
