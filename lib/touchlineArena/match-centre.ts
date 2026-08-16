import type { TouchlineFixture } from "@/lib/football-data/types";

export type TouchlineMatchState = "live" | "upcoming" | "finished" | "unknown";
export type TouchlineMatchCentreDisplayState = TouchlineMatchState | "stale";

export type TouchlineLiveReadState = "persisted-live-snapshot" | "partial-persisted-schedule";

/**
 * Browser-safe freshness metadata emitted by the persisted Live endpoint.
 * This is presentation information only: it never asks the browser to
 * estimate freshness from its own clock.
 */
export type TouchlineLiveReadMetadata = {
  state: TouchlineLiveReadState;
  degraded: boolean;
  fetchedAt?: string;
};

export const TOUCHLINE_MATCH_CENTRE_TIME_ZONE_FALLBACK = "UTC";

/**
 * Vercel supplies an IANA time-zone name for the current request. The value is
 * normalized on the server and serialized with the first render so SSR and the
 * browser cannot format the same fixture in different time zones.
 */
export function normalizeTouchlineMatchCentreTimeZone(value?: string | null) {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 100) return TOUCHLINE_MATCH_CENTRE_TIME_ZONE_FALLBACK;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return TOUCHLINE_MATCH_CENTRE_TIME_ZONE_FALLBACK;
  }
}

type TouchlineFixtureStateSource = Pick<TouchlineFixture, "startsAt" | "status">;
type TouchlineFixtureSelectionSource = TouchlineFixtureStateSource & Pick<TouchlineFixture, "id" | "providerId">;

const LIVE_STATUS = /(?:live|in[ -]?play|in progress|1st|2nd|half[ -]?time|extra time|penalt)/i;
const FINISHED_STATUS = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties|cancelled|canceled|abandoned|awarded|walkover)/i;

export function touchlineFixtureState(fixture: TouchlineFixtureStateSource, now = Date.now()): TouchlineMatchState {
  const status = fixture.status?.trim() ?? "";
  const startsAt = fixture.startsAt ? Date.parse(fixture.startsAt) : Number.NaN;
  // A provider/status snapshot cannot make a future kick-off look live. This
  // keeps representative or delayed records honest until their scheduled time.
  if (LIVE_STATUS.test(status)) return Number.isFinite(startsAt) && startsAt > now ? "upcoming" : "live";
  if (FINISHED_STATUS.test(status)) return "finished";
  if (Number.isFinite(startsAt)) return "upcoming";
  return "unknown";
}

export function isTouchlineLiveReadMetadata(value: unknown): value is TouchlineLiveReadMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.state === "persisted-live-snapshot" || candidate.state === "partial-persisted-schedule")
    && typeof candidate.degraded === "boolean"
    && (candidate.fetchedAt === undefined || typeof candidate.fetchedAt === "string")
  );
}

/**
 * A stale persisted live snapshot must never retain the visual "LIVE" state.
 * Completed and scheduled fixtures keep their normal classification; the
 * surrounding notice still explains that the shared data is being refreshed.
 */
export function touchlineMatchCentreDisplayState(
  fixture: TouchlineFixtureStateSource,
  metadata?: TouchlineLiveReadMetadata | null,
  now?: number,
): TouchlineMatchCentreDisplayState {
  const state = touchlineFixtureState(fixture, now);
  return metadata?.degraded && state === "live" ? "stale" : state;
}

export function selectTouchlineMatchCentreFixture<T extends TouchlineFixtureSelectionSource>(fixtures: T[], requestedFixtureId?: string | null, now = Date.now()): T | null {
  const requested = requestedFixtureId ? fixtures.find((fixture) => fixture.id === requestedFixtureId || fixture.providerId === requestedFixtureId) : null;
  if (requested) return requested;

  const byDate = (first: T, second: T) =>
    (Date.parse(first.startsAt ?? "") || Number.POSITIVE_INFINITY) - (Date.parse(second.startsAt ?? "") || Number.POSITIVE_INFINITY);
  const latestFirst = (first: T, second: T) => -byDate(first, second);
  const live = fixtures.filter((fixture) => touchlineFixtureState(fixture, now) === "live").sort(byDate)[0];
  if (live) return live;
  const upcoming = fixtures.filter((fixture) => touchlineFixtureState(fixture, now) === "upcoming").sort(byDate)[0];
  if (upcoming) return upcoming;
  return fixtures.filter((fixture) => touchlineFixtureState(fixture, now) === "finished").sort(latestFirst)[0] ?? null;
}

export function touchlineMatchCentreHref(fixture: TouchlineFixture, locale?: string) {
  const params = new URLSearchParams({ fixture: fixture.id });
  if (locale) params.set("lang", locale);
  return `/live?${params.toString()}`;
}
