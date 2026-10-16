/** Numeric, explicit-calendar timestamp avoids Node/WebKit CLDR differences
 * such as "Sept, 19" versus "Sep at 19" during hydration. */
export function verifiedTimestampLabel(value: string, timeZone: string): string {
  if (!Number.isFinite(Date.parse(value))) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    calendar: "gregory", numberingSystem: "latn", timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
