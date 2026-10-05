import { useTranslation } from 'react-i18next';
import { EMAIL } from '../lib/site';

interface Props {
  className?: string;
  /** Seat-map overlay uses its own palette and covers the site footer. */
  tone?: 'page' | 'map';
}

export function SupportContact({ className = '', tone = 'page' }: Props) {
  const { t } = useTranslation();
  const textClass = tone === 'map' ? 'text-xs seat-map-muted' : 'text-sm text-gray-500';
  const linkClass = tone === 'map'
    ? 'text-[var(--map-chip-fg)] underline underline-offset-2 break-all'
    : 'text-emerald-700 hover:underline break-all';

  return (
    <p className={`${textClass} ${className}`.trim()}>
      {t('common.contactHint')}{' '}
      <a href={`mailto:${EMAIL}`} className={linkClass}>
        {EMAIL}
      </a>
    </p>
  );
}
