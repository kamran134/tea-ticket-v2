import { describe, it, expect } from 'vitest';
import { slugify, generateVenueSlug } from './slug';

describe('slugify', () => {
  it('transliterates Russian and lowercases', () => {
    expect(slugify('Чайная церемония')).toBe('chaynaya-tseremoniya');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Hello, World!!!')).toBe('hello-world');
  });

  it('trims leading/trailing dashes', () => {
    expect(slugify('--test--')).toBe('test');
  });

  it('truncates to 80 characters', () => {
    expect(slugify('a'.repeat(200)).length).toBe(80);
  });

  it('returns empty string for input with nothing sluggable', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('transliterates Azerbaijani-specific letters', () => {
    expect(slugify('Çay gecəsi')).toBe('chay-gecesi');
  });
});

describe('generateVenueSlug', () => {
  it('combines slugified name with the UTC date', () => {
    expect(generateVenueSlug('Летняя вечеринка', new Date('2026-08-15T18:00:00Z')))
      .toBe('letnyaya-vecherinka-2026-08-15');
  });

  it('falls back to just the date when the name has nothing sluggable', () => {
    expect(generateVenueSlug('!!!', new Date('2026-08-15T18:00:00Z'))).toBe('2026-08-15');
  });
});
