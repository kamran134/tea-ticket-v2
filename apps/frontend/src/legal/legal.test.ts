import { describe, expect, it } from 'vitest';
import { ABOUT_COPY } from './about';
import { parseLegalBlocks } from './LegalDocument';
import { LEGAL_DOCUMENT_IDS, LEGAL_TEXTS, legalPageByPath } from './pages';
import { resolveLegalText } from './resolve';

describe('resolveLegalText', () => {
  it('returns the requested language when present', () => {
    const result = resolveLegalText(
      { ru: 'RU', en: 'EN', az: 'AZ' },
      'en',
    );
    expect(result).toEqual({ text: 'EN', usedLang: 'en', usedFallback: false });
  });

  it('falls back instead of returning an empty document', () => {
    const result = resolveLegalText({ ru: 'RU' }, 'az');
    expect(result.usedFallback).toBe(true);
    expect(result.text).toBe('RU');
    expect(result.usedLang).toBe('ru');
  });
});

describe('parseLegalBlocks', () => {
  it('keeps title, numbered sections and semicolon lists', () => {
    const blocks = parseLegalBlocks(
      'TITLE\n\n1. SECTION\n\n1.1. Clause.\n\nItems:\nname;\nemail;\n',
    );
    expect(blocks[0]).toEqual({ type: 'h1', text: 'TITLE' });
    expect(blocks[1]).toEqual({ type: 'h2', text: '1. SECTION' });
    expect(blocks[2]).toEqual({ type: 'p', text: '1.1. Clause.' });
    expect(blocks[3]).toEqual({ type: 'p', text: 'Items:' });
    expect(blocks[4]).toEqual({ type: 'ul', items: ['name', 'email'] });
  });
});

describe('legalPageByPath', () => {
  it('maps the public legal URLs', () => {
    expect(legalPageByPath('/privacy-policy')?.id).toBe('privacy-policy');
    expect(legalPageByPath('/terms/')?.id).toBe('terms');
    expect(legalPageByPath('/refund-policy')?.id).toBe('refund-policy');
    expect(legalPageByPath('/about')?.id).toBe('about');
    expect(legalPageByPath('/')).toBeUndefined();
  });
});

describe('legal document texts', () => {
  it('has a StolitsArt Ticket version for every document and language', () => {
    for (const id of LEGAL_DOCUMENT_IDS) {
      for (const lang of ['ru', 'az', 'en'] as const) {
        const text = LEGAL_TEXTS[id][lang].trim();
        expect(text.length, `${id}.${lang}`).toBeGreaterThan(200);
        expect(text, `${id}.${lang}`).toMatch(/StolitsArt Ticket|tea-ticket\.com/i);
        expect(text, `${id}.${lang}`).not.toMatch(/Tea Ticket/i);
        expect(text, `${id}.${lang}`).not.toMatch(/Stolitsa Art|stolits\.art/i);
      }
    }
    expect(LEGAL_TEXTS['privacy-policy'].ru).toContain('Политика конфиденциальности');
    expect(LEGAL_TEXTS.terms.en).toContain('User Agreement');
    expect(LEGAL_TEXTS['refund-policy'].az).toContain('Biletlərin qaytarılması şərtləri');
  });
});

describe('about copy', () => {
  it('has StolitsArt description in every language', () => {
    for (const lang of ['ru', 'az', 'en'] as const) {
      const copy = ABOUT_COPY[lang];
      expect(copy.intro.join(' ')).toContain('StolitsArt');
      expect(copy.activities).toHaveLength(4);
      expect(copy.closing.join(' ')).toContain('StolitsArt Ticket');
    }
  });
});
