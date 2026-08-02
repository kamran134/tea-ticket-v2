import { describe, it, expect } from 'vitest';
import { pluralize } from './RegisterForm';

describe('pluralize (Russian noun forms)', () => {
  it.each([
    [1, 'билет'], [21, 'билет'], [101, 'билет'],
  ])('uses "one" form for %i', (n, expected) => {
    expect(pluralize(n, 'билет', 'билета', 'билетов')).toBe(expected);
  });

  it.each([
    [2, 'билета'], [3, 'билета'], [4, 'билета'], [22, 'билета'],
  ])('uses "few" form for %i', (n, expected) => {
    expect(pluralize(n, 'билет', 'билета', 'билетов')).toBe(expected);
  });

  it.each([
    [0, 'билетов'], [5, 'билетов'], [11, 'билетов'], [12, 'билетов'], [14, 'билетов'], [100, 'билетов'],
  ])('uses "many" form for %i', (n, expected) => {
    expect(pluralize(n, 'билет', 'билета', 'билетов')).toBe(expected);
  });
});
