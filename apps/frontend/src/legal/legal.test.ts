import { describe, expect, it } from 'vitest';
import { parseLegalBlocks } from './LegalDocument';
import { LEGAL_PAGES, LEGAL_TEXTS, legalPageByPath } from './pages';
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
  it('maps the three public URLs', () => {
    expect(legalPageByPath('/privacy-policy')?.id).toBe('privacy-policy');
    expect(legalPageByPath('/terms/')?.id).toBe('terms');
    expect(legalPageByPath('/refund-policy')?.id).toBe('refund-policy');
    expect(legalPageByPath('/')).toBeUndefined();
  });
});

describe('legal document texts', () => {
  it('has a full version for every page and language', () => {
    for (const page of LEGAL_PAGES) {
      for (const lang of ['ru', 'az', 'en'] as const) {
        const text = LEGAL_TEXTS[page.id][lang].trim();
        expect(text.length, `${page.id}.${lang}`).toBeGreaterThan(200);
      }
    }
    expect(LEGAL_TEXTS['privacy-policy'].ru).toContain('ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ');
    expect(LEGAL_TEXTS.terms.en).toContain('USER AGREEMENT');
    expect(LEGAL_TEXTS['refund-policy'].az).toContain('BİLETLƏRİN QAYTARILMASI ŞƏRTLƏRİ');
  });
});
