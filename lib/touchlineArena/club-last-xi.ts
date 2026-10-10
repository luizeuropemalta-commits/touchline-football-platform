import type { TouchlineFantasyFixtureFeed, TouchlineFantasyLineupMember } from "../football-data/types.ts";

export type TouchlineLastCompletedXi = Readonly<{
  fixtureId: string;
  startsAt: string;
  formation: string | null;
  starters: readonly TouchlineFantasyLineupMember[];
}>;

const COMPLETED_MATCH = /(?:^ft(?:_|$)|full[ -]?time|finished|after extra time|aet|after penalties)/i;

/** An actual XI from the club's most recent completed fixture, never an
 * expected XI for the next game. No provider request is made here. */
export function selectTouchlineLastCompletedXi(
  feeds: readonly TouchlineFantasyFixtureFeed[],
  clubTeamId: string,
  before: string | null | undefined,
  now = Date.now(),
): TouchlineLastCompletedXi | null {
  const beforeTime = before ? Date.parse(before) : now;
  if (!clubTeamId || !Number.isFinite(beforeTime) || !Number.isFinite(now)) return null;
  return feeds.flatMap((feed) => {
    const fixture = feed.fixture;
    const startsAt = fixture.startsAt;
    const startedAt = startsAt ? Date.parse(startsAt) : Number.NaN;
    if (fixture.provider !== "sportmonks" || !fixture.providerId
      || !COMPLETED_MATCH.test(fixture.status ?? "")
      || !Number.isFinite(startedAt) || startedAt >= beforeTime || startedAt > now
      || ![fixture.homeTeam?.providerId, fixture.awayTeam?.providerId].includes(clubTeamId)) return [];
    const starters = feed.lineups.filter((member) => member.provider === "sportmonks"
      && member.fixtureId === fixture.providerId && member.teamId === clubTeamId
      && member.isStarter === true && Boolean(member.playerId?.trim()));
    if (starters.length !== 11 || new Set(starters.map((member) => member.playerId)).size !== 11) return [];
    const formation = feed.formations.find((item) => item.provider === "sportmonks"
      && item.fixtureId === fixture.providerId && item.teamId === clubTeamId)?.formation?.trim() || null;
    return [{ fixtureId: fixture.providerId, startsAt: startsAt!, formation, starters }];
  }).sort((first, second) => Date.parse(second.startsAt) - Date.parse(first.startsAt))[0] ?? null;
}
