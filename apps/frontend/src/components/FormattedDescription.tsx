import { useMemo } from 'react';
import { isEmptyDescription, sanitizeDescriptionHtml } from '../lib/descriptionHtml';

interface Props {
  html: string;
  className?: string;
}

export function FormattedDescription({ html, className = '' }: Props) {
  const clean = useMemo(() => sanitizeDescriptionHtml(html), [html]);
  if (isEmptyDescription(clean)) return null;

  return (
    <div
      className={`formatted-description ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
