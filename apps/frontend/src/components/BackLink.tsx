interface Props {
  href: string;
  label: string;
  className?: string;
}

/**
 * Subdued "up one level" link for the public pages. Header and Footer are commented out
 * everywhere they appear (they carry the other instance's branding), which left every page
 * below the poster list without a way back. Grey rather than emerald on purpose: this is
 * navigation chrome and must not compete with the buy button. Both the base and hover
 * colours already have dark-theme overrides under `.dark .app-bg` in main.css.
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
