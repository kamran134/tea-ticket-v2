const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'div']);
const BLOCK_TAGS = /<(script|style|iframe|object|embed|link|meta|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

export function isEmptyDescription(html: string): boolean {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .trim()
    .length === 0;
}

/** Keep bold/italic/line breaks; drop tags, attributes, and script blocks. */
export function sanitizeDescriptionHtml(input: string): string {
  let html = input.replace(/\u0000/g, '').replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(BLOCK_TAGS, '');
  html = html.replace(TAG_RE, (full, tag: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return '';
    if (name === 'br') return full.startsWith('</') ? '' : '<br>';
    const mapped = name === 'div' ? 'p' : name;
    return full.startsWith('</') ? `</${mapped}>` : `<${mapped}>`;
  });
  return html.trim();
}

export function normalizeDescription(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = sanitizeDescriptionHtml(value);
  return isEmptyDescription(cleaned) ? null : cleaned;
}
