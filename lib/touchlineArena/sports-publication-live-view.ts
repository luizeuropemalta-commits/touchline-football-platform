import type { TouchlinePublicFixture } from "../football-data/public-fixture";
import type { TouchlinePresentationRead } from "./live-presentation-client-store";
import { touchlinePublicFixtureIdentity, type TouchlineLiveReadMetadata } from "./match-centre.ts";
import { TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS } from "./live-presentation-state.ts";

/** Public fixture facts only. Selected detail and private fantasy data are not replaced here. */
export function projectTouchlinePublishedLive(
  seed: TouchlinePublicFixture[],
  seedMetadata: TouchlineLiveReadMetadata | null,
  read: TouchlinePresentationRead | null,
  now: number,
) {
  const publication = read?.sportsPublication;
  const freshness = read?.state.liveFreshness;
  if (!read || !publication || !freshness) return { fixtures: seed, metadata: seedMetadata };
  // Server-calculated age plus elapsed browser time avoids treating a recent
  // HTTP response as a recent Sportmonks update (including with a skewed clock).
  const degraded = freshness.degraded
    || freshness.ageMs + Math.max(0, now - read.receivedAt) > TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS;
  const published = new Map(publication.live.fixtures.map(fixture => [touchlinePublicFixtureIdentity(fixture), fixture]));
  let retainedLiveFacts = false;
  const fixtures = seed.map(fixture => {
    const next = published.get(touchlinePublicFixtureIdentity(fixture));
    if (!next || !fixture.providerId || !fixture.homeTeam?.providerId || !fixture.awayTeam?.providerId
      || next.homeTeam?.providerId !== fixture.homeTeam?.providerId
      || next.awayTeam?.providerId !== fixture.awayTeam?.providerId) {
      if (fixture.homeScore !== undefined || fixture.awayScore !== undefined || fixture.liveMinute !== undefined) retainedLiveFacts = true;
      return fixture;
    }
    // The server owns which round/fixtures are on this page. A wider live
    // window must not introduce a new round, erase its stadium or move focus.
    // Explicit undefined clears withdrawn live facts instead of retaining them.
    return { ...fixture, status: next.status, homeScore: next.homeScore, awayScore: next.awayScore,
      providerStateId: next.providerStateId, liveMinute: next.liveMinute, liveSecond: next.liveSecond,
      livePeriod: next.livePeriod, eventsCount: next.eventsCount, providerUpdatedAt: next.providerUpdatedAt,
      verifiedAt: next.verifiedAt };
  });
  // A wide live window is not a tombstone for omitted matches. Retain their
  // verified facts, but never label those older facts as freshly verified.
  const metadata: TouchlineLiveReadMetadata = retainedLiveFacts
    ? { state: "persisted-live-snapshot", degraded: true, fetchedAt: seedMetadata?.fetchedAt }
    : { state: "persisted-live-snapshot", degraded, fetchedAt: freshness.fetchedAt };
  return { fixtures, metadata };
}
