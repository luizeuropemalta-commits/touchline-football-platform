import { normalizeTouchlineMatchCentreTimeZone } from "./match-centre.ts";

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
  const parts = new Intl.DateTimeFormat("en-CA", {
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
): TouchlineLocalKickoff | null {
  const timestamp = Date.parse(startsAt);
  if (!Number.isFinite(timestamp)) return null;

  const kickoff = new Date(timestamp);
  const timeZone = normalizeTouchlineMatchCentreTimeZone(requestedTimeZone);
  const date = stableShortDate(kickoff, timeZone, locale);
  if (!date) return null;
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).format(kickoff);
  const zoneName = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).formatToParts(kickoff).find((part) => part.type === "timeZoneName")?.value ?? timeZone;

  return { date, time, timeZone, zoneName };
}
