import { describe, it, expect, beforeEach, vi } from 'vitest';
import i18n, { changeLanguage } from './index';
import { LANG_STORAGE_KEY, DEFAULT_LANG } from './types';
import { formatEventDate, formatPrice } from './format';
import { translateApiError } from './apiErrors';

describe('i18n initialization', () => {
  const storage = new Map<string, string>();

  beforeEach(async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    storage.clear();
    await changeLanguage(DEFAULT_LANG);
  });

  it('defaults to Russian', () => {
    expect(i18n.language).toBe('ru');
  });

  it('persists language choice in localStorage', async () => {
    await changeLanguage('az');
    expect(storage.get(LANG_STORAGE_KEY)).toBe('az');
  });
});

describe('pluralization via i18next', () => {
  beforeEach(async () => {
    await changeLanguage('ru');
  });

  it.each([
    [1, 'билет'], [21, 'билет'], [101, 'билет'],
  ])('uses Russian one form for %i', (n, expected) => {
    expect(i18n.t('register.tickets', { count: n })).toBe(expected);
  });

  it.each([
    [2, 'билета'], [3, 'билета'], [4, 'билета'], [22, 'билета'],
  ])('uses Russian few form for %i', (n, expected) => {
    expect(i18n.t('register.tickets', { count: n })).toBe(expected);
  });

  it.each([
    [0, 'билетов'], [5, 'билетов'], [11, 'билетов'], [100, 'билетов'],
  ])('uses Russian many form for %i', (n, expected) => {
    expect(i18n.t('register.tickets', { count: n })).toBe(expected);
  });

  it('uses English plural forms', async () => {
    await changeLanguage('en');
    expect(i18n.t('register.tickets', { count: 1 })).toBe('ticket');
    expect(i18n.t('register.tickets', { count: 2 })).toBe('tickets');
  });
});

describe('locale formatting', () => {
  beforeEach(async () => {
    await changeLanguage('ru');
  });

  it('formats price with Russian locale by default', () => {
    expect(formatPrice(1234.5, '₼')).toBe('1\u00a0234,5 ₼');
  });

  it('formats dates with locale matching current language', async () => {
    await changeLanguage('en');
    const formatted = formatEventDate('2026-08-06T18:00:00.000Z');
    expect(formatted).toMatch(/August 2026/);
  });
});

describe('translateApiError', () => {
  beforeEach(async () => {
    await changeLanguage('ru');
  });

  it('maps known API errors to localized messages', () => {
    expect(translateApiError('Booking has expired')).toBe(
      'Время брони истекло. Оформите новую бронь на афише.',
    );
  });

  it('returns localized fallback for unknown errors', () => {
    expect(translateApiError('Something weird', 'register.registerError')).toBe(
      'Ошибка при регистрации',
    );
  });
});
