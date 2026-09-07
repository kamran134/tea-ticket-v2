import { describe, it, expect } from 'vitest';
import { isEmptyDescription, normalizeDescription, sanitizeDescriptionHtml } from './sanitizeDescription';

describe('sanitizeDescriptionHtml', () => {
  it('keeps bold and italic', () => {
    expect(sanitizeDescriptionHtml('<p><strong>чай</strong> и <em>пирог</em></p>'))
      .toBe('<p><strong>чай</strong> и <em>пирог</em></p>');
  });

  it('strips attributes and scripts', () => {
    expect(sanitizeDescriptionHtml('<b onclick="alert(1)">x</b><script>alert(1)</script>'))
      .toBe('<b>x</b>');
  });

  it('keeps emoji', () => {
    expect(sanitizeDescriptionHtml('<p>🍵 вечер</p>')).toBe('<p>🍵 вечер</p>');
  });

  it('turns empty markup into empty content', () => {
    expect(isEmptyDescription('<p><br></p>')).toBe(true);
    expect(normalizeDescription('   ')).toBe(null);
    expect(normalizeDescription('<p></p>')).toBe(null);
  });
});
