import { parseTouchlineFixtureTimestamp } from "./fixture-timestamp.ts";
import type { TouchlinePublicFixture } from "../football-data/public-fixture";
import type { TouchlinePresentationRead } from "./live-presentation-client-store";
import { touchlinePublicFixtureIdentity, touchlineFixtureState, type TouchlineLiveReadMetadata } from "./match-centre.ts";
import { selectCarouselFixtureRound } from "./carousel-fixture-round.ts";
import { TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS } from "./live-presentation-state.ts";

export type TouchlineLiveAdmissionScope = Readonly<{ competitionId: "8"; seasonId: string }>;

/** Public fixture facts only. Selected detail and private fantasy data are not replaced here. */
export function projectTouchlinePublishedLive(
  seed: TouchlinePublicFixture[],
  seedMetadata: TouchlineLiveReadMetadata | null,
  read: TouchlinePresentationRead | null,
  now: number,
  admissionScope: TouchlineLiveAdmissionScope | null = null,
  focusedProviderId: string | null = null,
  updateSameFixtureKickoff = false,
) {
  const publication = read?.sportsPublication;
  const freshness = read?.state.liveFreshness;
  if (!read || !publication || !freshness) return { fixtures: seed, metadata: seedMetadata };
  // Server-calculated age plus elapsed browser time avoids treating a recent
  // HTTP response as a recent Sportmonks update (including with a skewed clock).
  const degraded = freshness.degraded
    || freshness.ageMs + Math.max(0, now - read.receivedAt) > TOUCHLINE_LIVE_SNAPSHOT_STALE_AFTER_MS;
  // Current season is an explicit canonical server fact, independent of the
  // historical seed. Never infer admission from past results or an empty list.
  const scope = admissionScope?.competitionId === "8"
    && typeof admissionScope.seasonId === "string" && admissionScope.seasonId.trim()
    ? admissionScope : null;
  const matchesScope = (fixture: TouchlinePublicFixture) => Boolean(scope
    && fixture.competitionId === scope.competitionId && fixture.seasonId === scope.seasonId);
  const published = new Map(publication.live.fixtures.map(fixture => [touchlinePublicFixtureIdentity(fixture), fixture]));
  const retainedLiveFacts = new Set<string>();
  const fixtures = seed.map(fixture => {
    const next = published.get(touchlinePublicFixtureIdentity(fixture));
    if (!next || (scope && (next.competitionId !== fixture.competitionId || next.seasonId !== fixture.seasonId)) || !fixture.providerId || !fixture.homeTeam?.providerId || !fixture.awayTeam?.providerId
      || next.homeTeam?.providerId !== fixture.homeTeam?.providerId
      || next.awayTeam?.providerId !== fixture.awayTeam?.providerId) {
      if (fixture.homeScore !== undefined || fixture.awayScore !== undefined || fixture.liveMinute !== undefined) retainedLiveFacts.add(fixture.providerId);
      return fixture;
    }
    // The server owns which round/fixtures are on this page. A wider live
    // window must not introduce a new round, erase its stadium or move focus.
    // Explicit undefined clears withdrawn live facts instead of retaining them.
    // A next-match card may accept a rescheduled kickoff without opting into
    // carousel admission. Keep the fixture, teams, round and venue unchanged.
    const correctedKickoff = updateSameFixtureKickoff && fixture.competitionId && fixture.seasonId
      && next.competitionId === fixture.competitionId && next.seasonId === fixture.seasonId
      && parseTouchlineFixtureTimestamp(next.startsAt) !== null
      ? { startsAt: next.startsAt } : {};
    return { ...fixture, ...correctedKickoff, ...(scope ? { startsAt: next.startsAt ?? fixture.startsAt, roundId: next.roundId ?? fixture.roundId, roundName: next.roundName ?? fixture.roundName } : {}), status: next.status, homeScore: next.homeScore, awayScore: next.awayScore,
      providerStateId: next.providerStateId, liveMinute: next.liveMinute, liveSecond: next.liveSecond,
      livePeriod: next.livePeriod, eventsCount: next.eventsCount, providerUpdatedAt: next.providerUpdatedAt,
      verifiedAt: next.verifiedAt };
  });
  if (scope) {
    const known = new Set(fixtures.map(touchlinePublicFixtureIdentity));
    for (const next of published.values()) {
      const key = touchlinePublicFixtureIdentity(next);
      if (known.has(key) || !matchesScope(next) || !next.providerId
        || !next.homeTeam?.providerId || !next.awayTeam?.providerId
        || next.homeTeam.providerId === next.awayTeam.providerId
        || !Number.isFinite(Date.parse(next.startsAt ?? ""))
        || touchlineFixtureState(next, now) !== "live") continue;
      fixtures.push(next);
      known.add(key);
    }
  }
  // A wide live window is not a tombstone for omitted matches. Retain their
  // verified facts, but never label those older facts as freshly verified.
  const visible = scope ? selectCarouselFixtureRound(fixtures, now, scope, focusedProviderId) : fixtures;
  const hasRetainedVisibleFacts = scope
    ? !visible.length || visible.some(fixture => {
      const next = published.get(touchlinePublicFixtureIdentity(fixture));
      return !next || next.competitionId !== fixture.competitionId || next.seasonId !== fixture.seasonId
        || next.homeTeam?.providerId !== fixture.homeTeam?.providerId || next.awayTeam?.providerId !== fixture.awayTeam?.providerId
        || next.status !== fixture.status || next.homeScore !== fixture.homeScore
        || next.awayScore !== fixture.awayScore || next.liveMinute !== fixture.liveMinute;
    })
    : visible.some(fixture => retainedLiveFacts.has(fixture.providerId));
  const metadata: TouchlineLiveReadMetadata = hasRetainedVisibleFacts
    ? { state: "persisted-live-snapshot", degraded: true, fetchedAt: seedMetadata?.fetchedAt }
    : { state: "persisted-live-snapshot", degraded, fetchedAt: freshness.fetchedAt };
  return { fixtures, metadata };
}

/** The catalogue stays intact; only one canonical round is rendered.
 * Keep the whole focused round until blur instead of mixing a stale link in. */
export function selectTouchlinePublishedRailFixtures(
  fixtures: TouchlinePublicFixture[], now: number, focusedProviderId: string | null = null,
  admissionScope: TouchlineLiveAdmissionScope | null = null,
) {
  return selectCarouselFixtureRound(fixtures, now, admissionScope, focusedProviderId);
}
