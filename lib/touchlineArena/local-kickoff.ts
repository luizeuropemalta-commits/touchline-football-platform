import { normalizeTouchlineMatchCentreTimeZone } from "./match-centre.ts";

export type TouchlineLocalKickoff = Readonly<{
  date: string;
  time: string;
  timeZone: string;
  zoneName: string;
}>;

export function formatTouchlineLocalKickoff(
  startsAt: string,
  requestedTimeZone: string,
  locale = "en-GB",
): TouchlineLocalKickoff | null {
  const timestamp = Date.parse(startsAt);
  if (!Number.isFinite(timestamp)) return null;

  const kickoff = new Date(timestamp);
  const timeZone = normalizeTouchlineMatchCentreTimeZone(requestedTimeZone);
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(kickoff);
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
