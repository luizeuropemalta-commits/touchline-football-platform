import type { TouchlinePublicFixture } from "../football-data/public-fixture.ts";
import type { TouchLineClubVisual } from "./demo-data.ts";

/** Navigation to a selected fixture is independent of whether its XI has
 * arrived. The destination owns confirmed/pending presentation; this link
 * never promotes a partial teamsheet to an official XI. */
export function touchlineLiveClubLineupLinks(
  fixture: TouchlinePublicFixture | null,
  clubs: readonly Pick<TouchLineClubVisual, "teamId" | "slug" | "name">[],
  locale: string,
) {
  if (!fixture || !/^\d+$/.test(fixture.providerId)) return [null, null] as const;
  return [fixture.homeTeam, fixture.awayTeam].map((team) => {
    // A matching display name cannot authorize a club/fixture destination.
    const club = team && clubs.find((candidate) => candidate.teamId === team.providerId);
    if (!club) return null;
    return {
      teamId: club.teamId,
      name: team.name || club.name,
      href: `/touchline-clubs/${club.slug}?lang=${encodeURIComponent(locale)}&fixtureId=${encodeURIComponent(fixture.providerId)}#touchline-club-lineup`,
    };
  });
}
