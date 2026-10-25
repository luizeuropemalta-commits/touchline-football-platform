import type { TouchlineFantasyFixtureFeed, TouchlineFantasyFormation, TouchlineFixture } from "@/lib/football-data/types";
import type { PersistedFantasyFixtureFeedReadResult } from "@/lib/football-data/public-fantasy-snapshot";

export type ClubHubFixtureQuery =
  | { state: "absent" }
  | { state: "invalid" }
  | { state: "requested"; fixtureId: string };

export function parseClubHubFixtureQuery(value: unknown): ClubHubFixtureQuery {
  if (value === undefined) return { state: "absent" };
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value)
    ? { state: "requested", fixtureId: value }
    : { state: "invalid" };
}

/** Historical links require one unambiguous formation for this exact club/game.
 * A matching display name is not evidence of team or fixture identity. */
export function selectClubHubRequestedFormation(
  formations: readonly TouchlineFantasyFormation[], fixtureId: string, teamId: string,
): string | null {
  if (parseClubHubFixtureQuery(fixtureId).state !== "requested" || !teamId.trim()) return null;
  const matches = formations.filter(item => item.fixtureId === fixtureId && item.teamId === teamId);
  if (matches.length !== 1) return null;
  const selected = matches[0];
  return selected.provider === "sportmonks" && typeof selected.formation === "string"
    && /^[0-9]+(?:-[0-9]+){1,4}$/.test(selected.formation) ? selected.formation : null;
}

/** Exact persisted reads only; never substitute a recent fixture for an explicit link. */
export async function readClubHubRequestedFixture(
  fixtureId: string,
  belongsToClub: (fixture: TouchlineFixture) => boolean,
  readers: {
    readFeed: (fixtureId: string) => Promise<PersistedFantasyFixtureFeedReadResult>;
    readFixture: (fixtureId: string) => Promise<TouchlineFixture | null>;
  },
): Promise<{ persistedFeeds: TouchlineFantasyFixtureFeed[]; scheduledFixtures: TouchlineFixture[] }> {
  const empty = { persistedFeeds: [], scheduledFixtures: [] };
  if (parseClubHubFixtureQuery(fixtureId).state !== "requested") return empty;
  const [feedResult, fixture] = await Promise.all([
    readers.readFeed(fixtureId), readers.readFixture(fixtureId),
  ]);
  const isTarget = (candidate: TouchlineFixture) => candidate.provider === "sportmonks"
    && candidate.providerId === fixtureId && belongsToClub(candidate);
  const feed = feedResult.status === "available" ? feedResult.snapshot.feed : null;
  const targetFeed = feed && isTarget(feed.fixture) ? feed : null;
  const targetFixture = fixture && isTarget(fixture) ? fixture : null;
  if (targetFeed && targetFixture) {
    const feedHome = targetFeed.fixture.homeTeam?.providerId;
    const feedAway = targetFeed.fixture.awayTeam?.providerId;
    const scheduledHome = targetFixture.homeTeam?.providerId;
    const scheduledAway = targetFixture.awayTeam?.providerId;
    // Match facts can be newer in either store, but opposing teams and their
    // home/away roles cannot disagree for one explicitly requested identity.
    if (![feedHome, feedAway, scheduledHome, scheduledAway].every(id => typeof id === "string" && id.trim().length > 0)
      || feedHome === feedAway || feedHome !== scheduledHome || feedAway !== scheduledAway) return empty;
  }
  return {
    persistedFeeds: targetFeed ? [targetFeed] : [],
    scheduledFixtures: targetFixture ? [targetFixture] : [],
  };
}
