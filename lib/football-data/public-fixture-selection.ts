import type { TouchlineFixture } from "./types";

const LIVE_STATUS_PATTERN = /(?:live|in[ -]?play|in progress|1st|2nd|half[ -]?time|extra time|penalties)/i;
const TERMINAL_STATUS_PATTERN = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties|cancelled|canceled|abandoned|awarded|walkover)/i;
const STARTED_MATCH_GRACE_MS = 4 * 60 * 60 * 1_000;

function fixtureStartTimestamp(fixture: TouchlineFixture) {
  const timestamp = fixture.startsAt ? Date.parse(fixture.startsAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function fixturePriority(fixture: TouchlineFixture, now: number) {
  const status = fixture.status?.trim() ?? "";
  if (TERMINAL_STATUS_PATTERN.test(status)) return null;
  if (LIVE_STATUS_PATTERN.test(status)) return { group: 0, time: fixtureStartTimestamp(fixture) ?? now };

  const startsAt = fixtureStartTimestamp(fixture);
  if (startsAt === null || startsAt < now - STARTED_MATCH_GRACE_MS) return null;
  return { group: 1, time: startsAt };
}

/**
 * Picks only a live or credible upcoming fixture from already-cached data.
 * Historical/stale rows are deliberately ignored instead of being presented as
 * a club's next match.
 */
export function selectPublicClubFixture(
  fixtures: TouchlineFixture[],
  belongsToClub: (fixture: TouchlineFixture) => boolean,
  now = Date.now(),
) {
  return fixtures
    .filter(belongsToClub)
    .map((fixture) => ({ fixture, priority: fixturePriority(fixture, now) }))
    .filter((entry): entry is { fixture: TouchlineFixture; priority: { group: number; time: number } } => Boolean(entry.priority))
    .sort((first, second) => first.priority.group - second.priority.group || first.priority.time - second.priority.time)[0]?.fixture;
}
