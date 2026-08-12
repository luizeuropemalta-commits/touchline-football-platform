import type { TouchlineFixture, TouchlineTeam } from "./types";

const BRENTFORD_TEAM_ID = "236";
const TOTTENHAM_TEAM_ID = "6";
const BRENTFORD_TOTTENHAM_FIXTURE_ID = "2645196";

const BRENTFORD: TouchlineTeam = {
  id: `sportmonks:${BRENTFORD_TEAM_ID}`,
  providerId: BRENTFORD_TEAM_ID,
  provider: "sportmonks",
  name: "Brentford FC",
  shortCode: "BRE",
  logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/brentford.png",
  source: { provider: "sportmonks", providerId: BRENTFORD_TEAM_ID },
};

const TOTTENHAM: TouchlineTeam = {
  id: `sportmonks:${TOTTENHAM_TEAM_ID}`,
  providerId: TOTTENHAM_TEAM_ID,
  provider: "sportmonks",
  name: "Tottenham Hotspur",
  shortCode: "TOT",
  logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/tottenham-hotspur.png",
  source: { provider: "sportmonks", providerId: TOTTENHAM_TEAM_ID },
};

/**
 * One owner-verified completion for the published 2026/27 opening matchweek.
 *
 * The persisted schedule currently omits this official fixture. This is a
 * schedule-only projection: it carries neither a result nor a live score and
 * is deliberately ignored as soon as either club appears in the source round.
 */
const OWNER_VERIFIED_OPENING_FIXTURE: TouchlineFixture = {
  id: `sportmonks:${BRENTFORD_TOTTENHAM_FIXTURE_ID}`,
  providerId: BRENTFORD_TOTTENHAM_FIXTURE_ID,
  provider: "sportmonks",
  name: "Brentford FC vs Tottenham Hotspur",
  // Sat 22 Aug 2026, 18:30 Malta (CEST).
  startsAt: "2026-08-22T16:30:00.000Z",
  status: "Not Started",
  homeTeam: BRENTFORD,
  awayTeam: TOTTENHAM,
  source: {
    provider: "sportmonks",
    providerId: BRENTFORD_TOTTENHAM_FIXTURE_ID,
    externalUrl: "https://www.premierleague.com/en/match/2645196/brentford-vs-tottenham-hotspur/overview",
  },
};

function fixtureTeamIds(fixture: TouchlineFixture) {
  return [fixture.homeTeam?.providerId, fixture.awayTeam?.providerId]
    .filter((teamId): teamId is string => Boolean(teamId));
}

/**
 * Completes only the owner-verified gap in the opening round. It never
 * replaces source data, changes a score, or adds a second match for a club.
 */
export function completeTouchlineOfficialFixtureSchedule(
  fixtures: readonly TouchlineFixture[],
): TouchlineFixture[] {
  const knownFixtureIds = new Set(fixtures.map((fixture) => fixture.providerId));
  const knownTeamIds = new Set(fixtures.flatMap(fixtureTeamIds));
  if (
    knownFixtureIds.has(BRENTFORD_TOTTENHAM_FIXTURE_ID)
    || knownTeamIds.has(BRENTFORD_TEAM_ID)
    || knownTeamIds.has(TOTTENHAM_TEAM_ID)
  ) {
    return fixtures.slice();
  }
  return [...fixtures, OWNER_VERIFIED_OPENING_FIXTURE];
}
