export function TicketMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden
    >
      <g
        transform="rotate(-38 32 32)"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M11.5 23.5 H52.5 V29.1 A3.9 3.9 0 0 0 52.5 36.9 V42.5 H11.5 V36.9 A3.9 3.9 0 0 0 11.5 29.1 Z" />
        <path d="M15.4 27 H48.6 V29.5 A3.3 3.3 0 0 0 48.6 36.5 V39 H15.4 V36.5 A3.3 3.3 0 0 0 15.4 29.5 Z" />
        <path d="M13.2 26.6h2.4M13.2 28.6h2.4M13.2 39.4h2.4" />
        <path d="M48.4 26.6h2.4M48.4 28.6h2.4M48.4 39.4h2.4" />
        <text
          x="32"
          y="34.15"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="6.1"
          fontWeight="700"
          letterSpacing="0.7"
        >
          TICKET
        </text>
      </g>
    </svg>
  );
}
