const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'DIV']);
const FORMATTED_RE = /<\/?(?:p|br|strong|b|em|i|u|div)\b/i;

export function isEmptyDescription(html: string): boolean {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .trim()
    .length === 0;
}

function unwrapDisallowed(root: ParentNode): void {
  const doc = root.ownerDocument;
  if (!doc) return;
  const walker = [...root.querySelectorAll('*')].reverse();
  for (const el of walker) {
    if (!el.parentNode) continue;
    if (ALLOWED_TAGS.has(el.tagName)) {
      for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
      if (el.tagName === 'DIV') {
        const p = doc.createElement('p');
        while (el.firstChild) p.appendChild(el.firstChild);
        el.replaceWith(p);
      }
      continue;
    }
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
}

/** Promote Word/Google-Docs paste styles to semantic tags, then drop the rest. */
export function sanitizeDescriptionHtml(dirty: string): string {
  if (!dirty) return '';
  const doc = new DOMParser().parseFromString(`<div id="root">${dirty}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return '';

  for (const el of [...root.querySelectorAll('[style]')]) {
    const style = el.getAttribute('style') ?? '';
    if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style) && el.tagName !== 'STRONG' && el.tagName !== 'B') {
      const wrap = doc.createElement('strong');
      while (el.firstChild) wrap.appendChild(el.firstChild);
      el.appendChild(wrap);
    }
    if (/font-style\s*:\s*italic/i.test(style) && el.tagName !== 'EM' && el.tagName !== 'I') {
      const wrap = doc.createElement('em');
      while (el.firstChild) wrap.appendChild(el.firstChild);
      el.appendChild(wrap);
    }
  }

  unwrapDisallowed(root);
  return root.innerHTML.trim();
}

export function descriptionToEditorHtml(value: string): string {
  if (!value) return '';
  if (FORMATTED_RE.test(value)) return sanitizeDescriptionHtml(value);
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

export function descriptionForApi(html: string): string | null {
  const clean = sanitizeDescriptionHtml(html);
  return isEmptyDescription(clean) ? null : clean;
}
