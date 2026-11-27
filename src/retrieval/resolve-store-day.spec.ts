import { resolveStoreDay } from './resolve-store-day.js';

describe('resolveStoreDay', () => {
  it('returns the day before the UTC day for a New York evening', () => {
    expect(
      resolveStoreDay(new Date('2026-11-27T03:30:00Z'), 'America/New_York'),
    ).toBe('2026-11-26');
  });

  it('returns the day after the UTC day for a Tokyo morning', () => {
    expect(
      resolveStoreDay(new Date('2026-11-27T22:30:00Z'), 'Asia/Tokyo'),
    ).toBe('2026-11-28');
  });

  it('returns the UTC day for a store in UTC', () => {
    expect(resolveStoreDay(new Date('2026-11-27T03:30:00Z'), 'UTC')).toBe(
      '2026-11-27',
    );
  });

  it('throws an error for a timezone that does not exist', () => {
    expect(() =>
      resolveStoreDay(new Date('2026-11-27T03:30:00Z'), 'Mars/Olympus'),
    ).toThrow(RangeError);
  });
});
