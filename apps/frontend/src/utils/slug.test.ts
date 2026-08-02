import { describe, it, expect } from 'vitest';
import { slugify, generateVenueSlug } from './slug';

describe('slugify', () => {
  it('transliterates Russian and lowercases', () => {
    expect(slugify('Чайная церемония')).toBe('chaynaya-tseremoniya');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Hello, World!!!')).toBe('hello-world');
  });

  it('transliterates Azerbaijani-specific letters', () => {
    expect(slugify('Çay gecəsi')).toBe('chay-gecesi');
  });
});

describe('generateVenueSlug', () => {
  it('combines slugified name with the date part of the datetime-local value', () => {
    expect(generateVenueSlug('Летняя вечеринка', '2026-08-15T18:00')).toBe('letnyaya-vecherinka-2026-08-15');
  });

  it('falls back to just the name when there is no date yet', () => {
    expect(generateVenueSlug('Летняя вечеринка', '')).toBe('letnyaya-vecherinka');
  });
});
