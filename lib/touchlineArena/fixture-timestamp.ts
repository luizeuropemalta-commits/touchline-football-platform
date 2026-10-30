export function parseTouchlineFixtureTimestamp(value: string | undefined) {
  // Never interpret an unzoned kickoff in the server's local timezone.
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i);
  if (!match || !value) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const calendar = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  if (calendar.getUTCFullYear() !== +year || calendar.getUTCMonth() !== +month - 1
    || calendar.getUTCDate() !== +day || calendar.getUTCHours() !== +hour
    || calendar.getUTCMinutes() !== +minute || calendar.getUTCSeconds() !== +second) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
