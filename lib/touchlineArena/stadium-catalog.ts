import {
  toPublicTouchlineFixture,
  type TouchlinePublicFixture,
  type TouchlinePublicVenue,
} from "../football-data/public-fixture.ts";
import type { TouchlineFixture } from "../football-data/types.ts";

type TouchlineStadiumCatalogEntry = TouchlinePublicVenue & {
  providerVenueId: string;
  homeTeamProviderId: string;
};

/**
 * Verified first-party stadium presentation catalog.
 *
 * Provider venue IDs are server-only lookup keys. The browser receives only
 * the TouchLine stadium identity and presentation facts. Resolution requires
 * both the venue and its verified home club, so a neutral-site fixture cannot
 * silently inherit a club stadium.
 */
export const TOUCHLINE_STADIUM_CATALOG: readonly TouchlineStadiumCatalogEntry[] = Object.freeze([
  {
    id: "selhurst-park",
    providerVenueId: "201",
    homeTeamProviderId: "51",
    name: "Selhurst Park",
    capacity: 25_486,
    homeClubName: "Crystal Palace",
    imageUrl: "/touchlineArena/stadiums/selhurst-park.webp",
    photoCredit: {
      label: "Ashley Martin",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Selhurst_Park_Stadium.jpg",
      licenseLabel: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    },
  },
  {
    id: "etihad-stadium",
    providerVenueId: "151",
    homeTeamProviderId: "9",
    name: "Etihad Stadium",
    homeClubName: "Manchester City",
    imageUrl: "/touchlineArena/stadiums/etihad-stadium.webp",
    photoCredit: {
      label: "Daniel Richardson",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Etihad_Stadium_(31322336477).jpg",
      licenseLabel: "CC BY 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    },
  },
]);

const stadiumByVenueId = new Map(
  TOUCHLINE_STADIUM_CATALOG.map((stadium) => [stadium.providerVenueId, stadium]),
);

if (stadiumByVenueId.size !== TOUCHLINE_STADIUM_CATALOG.length) {
  throw new Error("TouchLine stadium catalog contains a duplicate provider venue ID.");
}

function publicVenue(stadium: TouchlineStadiumCatalogEntry): TouchlinePublicVenue {
  return {
    id: stadium.id,
    name: stadium.name,
    ...(stadium.capacity === undefined ? {} : { capacity: stadium.capacity }),
    homeClubName: stadium.homeClubName,
    imageUrl: stadium.imageUrl,
    photoCredit: { ...stadium.photoCredit },
  };
}

export function resolveTouchlineFixtureVenue(
  fixture: Pick<TouchlineFixture, "homeTeam">,
): TouchlinePublicVenue | undefined {
  const venueId = fixture.homeTeam?.venueId?.trim();
  const homeTeamProviderId = fixture.homeTeam?.providerId?.trim();
  if (!venueId || !homeTeamProviderId) return undefined;

  const stadium = stadiumByVenueId.get(venueId);
  if (!stadium || stadium.homeTeamProviderId !== homeTeamProviderId) return undefined;
  return publicVenue(stadium);
}

export function toTouchlineLiveFixture(fixture: TouchlineFixture): TouchlinePublicFixture {
  const publicFixture = toPublicTouchlineFixture(fixture);
  const venue = resolveTouchlineFixtureVenue(fixture);
  return venue ? { ...publicFixture, venue } : publicFixture;
}

export function toTouchlineLiveFixtures(fixtures: TouchlineFixture[]) {
  return fixtures.map(toTouchlineLiveFixture);
}
