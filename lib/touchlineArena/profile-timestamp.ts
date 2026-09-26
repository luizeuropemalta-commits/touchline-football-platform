/** Stable server/client presentation: never depend on the host's local zone.
 * Unknown or timezone-less fixture instants remain unavailable rather than
 * being interpreted as the server's own local time.
 */
export function formatTouchlineProfileTimestamp(value: string | null | undefined, locale: string): string | null {
  if (!value || !/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(locale === "pt-BR" ? "pt-BR" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZone: "UTC", timeZoneName: "short",
  }).format(new Date(value));
}
