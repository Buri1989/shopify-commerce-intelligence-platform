const ISO_DAY_LOCALE = 'en-CA';

export function resolveStoreDay(moment: Date, timezone: string): string {
  return new Intl.DateTimeFormat(ISO_DAY_LOCALE, {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment);
}
