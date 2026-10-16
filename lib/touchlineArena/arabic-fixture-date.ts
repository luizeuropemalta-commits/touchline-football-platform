import { verifiedTimestampLabel } from "./verified-timestamp-label.ts";

const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const digits = (value: string) => value.replace(/\d/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);

/** Stable Arabic Gregorian copy; ICU/CLDR short weekdays and punctuation
 * differ between Node and WebKit. The timezone still comes from Intl parts. */
export function arabicFixtureDate(value: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const stamp = verifiedTimestampLabel(value, timeZone);
  if (stamp === "—") return stamp;
  const [date, clock] = stamp.split(" ");
  const [year, month, day] = date.split("-");
  const [hour, minute] = clock.split(":");
  const weekday = weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const dateParts = [
    options.day ? digits(options.day === "2-digit" ? day : String(Number(day))) : "",
    options.month ? (options.month === "numeric" || options.month === "2-digit"
      ? digits(options.month === "2-digit" ? month : String(Number(month))) : months[Number(month) - 1]) : "",
    options.year ? digits(options.year === "2-digit" ? year.slice(-2) : year) : "",
  ].filter(Boolean).join(" ");
  const dateLabel = options.weekday ? `${weekday}${dateParts ? `، ${dateParts}` : ""}` : dateParts;
  if (!options.hour && !options.minute) return dateLabel;
  const twelveHour = options.hour12 === true || (options.hour12 === undefined && options.hourCycle !== "h23" && options.hourCycle !== "h24");
  const hourLabel = twelveHour ? String(Number(hour) % 12 || 12).padStart(options.hour === "2-digit" ? 2 : 1, "0") : hour;
  const timeLabel = `${digits(hourLabel)}${options.minute ? `:${digits(minute)}` : ""}${twelveHour ? Number(hour) < 12 ? " ص" : " م" : ""}`;
  return dateLabel ? `${dateLabel}${options.year ? " في " : "، "}${timeLabel}` : timeLabel;
}
