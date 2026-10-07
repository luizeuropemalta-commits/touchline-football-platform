import { normalizeTouchlineMatchCentreTimeZone } from "./match-centre.ts";
import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

export type TouchlineLocalKickoff = Readonly<{
  date: string;
  time: string;
  timeZone: string;
  zoneName: string;
}>;

const SHORT_MONTHS = {
  "en-GB": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  "pt-BR": ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
} as const;

function stableShortDate(kickoff: Date, timeZone: string, locale: string) {
  if (locale !== "en-GB" && locale !== "pt-BR") {
    return new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(kickoff);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    calendar: "gregory",
    day: "numeric",
    month: "numeric",
    timeZone,
  }).formatToParts(kickoff);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12) return null;

  const months = locale === "pt-BR" ? SHORT_MONTHS["pt-BR"] : SHORT_MONTHS["en-GB"];
  return `${day} ${months[month - 1]}`;
}

export function formatTouchlineLocalKickoff(
  startsAt: string,
  requestedTimeZone: string,
  locale = "en-GB",
  draftLocalesEnabled = false,
): TouchlineLocalKickoff | null {
  const timestamp = Date.parse(startsAt);
  if (!Number.isFinite(timestamp)) return null;

  const kickoff = new Date(timestamp);
  const timeZone = normalizeTouchlineMatchCentreTimeZone(requestedTimeZone);
  const resolvedLocale = resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled);
  const date = stableShortDate(kickoff, timeZone, resolvedLocale);
  if (!date) return null;
  const time = new Intl.DateTimeFormat(resolvedLocale, {
    calendar: "gregory",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).format(kickoff);
  const zoneName = new Intl.DateTimeFormat(resolvedLocale, {
    calendar: "gregory",
    hour: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).formatToParts(kickoff).find((part) => part.type === "timeZoneName")?.value ?? timeZone;

  return { date, time, timeZone, zoneName };
}
