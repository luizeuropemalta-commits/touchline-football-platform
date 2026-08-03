import type { TouchlineFixture } from "@/lib/football-data/types";

export type TouchlineMatchState = "live" | "upcoming" | "finished" | "unknown";

const LIVE_STATUS = /(?:live|in[ -]?play|in progress|1st|2nd|half[ -]?time|extra time|penalt)/i;
const FINISHED_STATUS = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties|cancelled|canceled|abandoned|awarded|walkover)/i;

export function touchlineFixtureState(fixture: TouchlineFixture): TouchlineMatchState {
  const status = fixture.status?.trim() ?? "";
  if (LIVE_STATUS.test(status)) return "live";
  if (FINISHED_STATUS.test(status)) return "finished";
  if (fixture.startsAt && Number.isFinite(Date.parse(fixture.startsAt))) return "upcoming";
  return "unknown";
}

export function selectTouchlineMatchCentreFixture(fixtures: TouchlineFixture[], requestedFixtureId?: string | null) {
  const requested = requestedFixtureId ? fixtures.find((fixture) => fixture.id === requestedFixtureId || fixture.providerId === requestedFixtureId) : null;
  if (requested) return requested;

  const byDate = (first: TouchlineFixture, second: TouchlineFixture) =>
    (Date.parse(first.startsAt ?? "") || Number.POSITIVE_INFINITY) - (Date.parse(second.startsAt ?? "") || Number.POSITIVE_INFINITY);
  const latestFirst = (first: TouchlineFixture, second: TouchlineFixture) => -byDate(first, second);
  const live = fixtures.filter((fixture) => touchlineFixtureState(fixture) === "live").sort(byDate)[0];
  if (live) return live;
  const upcoming = fixtures.filter((fixture) => touchlineFixtureState(fixture) === "upcoming").sort(byDate)[0];
  if (upcoming) return upcoming;
  return fixtures.filter((fixture) => touchlineFixtureState(fixture) === "finished").sort(latestFirst)[0] ?? null;
}

export function touchlineMatchCentreHref(fixture: TouchlineFixture, locale?: string) {
  const params = new URLSearchParams({ fixture: fixture.id });
  if (locale) params.set("lang", locale);
  return `/live?${params.toString()}`;
}
