interface Props {
  href: string;
  label: string;
  className?: string;
}

/**
 * Subdued "up one level" link for public pages below the poster list.
 * Grey rather than emerald on purpose: this is navigation chrome and must not
 * compete with the buy button. Both the base and hover colours already have
 * dark-theme overrides under `.dark .app-bg` in main.css.
 */
export function BackLink({ href, label, className = '' }: Props) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors ${className}`}
    >
      <span aria-hidden="true">←</span>
      {label}
    </a>
  );
}
