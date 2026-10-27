import type { TouchlineFixture } from "../football-data/types.ts";
import { isTouchLineSettledFixtureStatus } from "../football-data/fixture-settlement.ts";

export type TouchlineMatchState = "live" | "upcoming" | "finished" | "unknown";
export type TouchlineFixtureStateSource = Pick<TouchlineFixture, "startsAt" | "status">;

const LIVE_STATUS = /(?:live|in[ -]?play|in progress|1st|2nd|half[ -]?time|extra time|penalt)/i;
const FINISHED_STATUS = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties|cancelled|canceled|abandoned|awarded|walkover)/i;

/** Shared provider-status classification, without presentation or locale dependencies. */
export function touchlineFixtureState(fixture: TouchlineFixtureStateSource, now = Date.now()): TouchlineMatchState {
  const status = fixture.status?.trim() ?? "";
  // A settled provider result is authoritative even if its kickoff metadata is
  // missing or stale. Check before overlapping live words (extra time/penalties).
  if (isTouchLineSettledFixtureStatus(status)) return "finished";
  const startsAt = fixture.startsAt ? Date.parse(fixture.startsAt) : Number.NaN;
  // A provider/status snapshot cannot make a future kick-off look live. This
  // keeps representative or delayed records honest until their scheduled time.
  if (LIVE_STATUS.test(status)) return Number.isFinite(startsAt) && startsAt > now ? "upcoming" : "live";
  if (FINISHED_STATUS.test(status)) return "finished";
  if (Number.isFinite(startsAt)) return "upcoming";
  return "unknown";
}
