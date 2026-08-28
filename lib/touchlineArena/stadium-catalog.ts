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
 * Verified QA stadium presentation catalog.
 *
 * Provider venue IDs are server-only lookup keys. The browser receives only
 * the TouchLine stadium identity and presentation facts. Resolution requires
 * both the venue and its verified home club, so a neutral-site fixture cannot
 * silently inherit a club stadium. The aerial artwork is presentation-only
 * and never replaces the provider venue fact. Interior artwork is opt-in per
 * verified home ground and otherwise leaves the neutral Live hero unchanged.
 */
export const TOUCHLINE_STADIUM_CATALOG: readonly TouchlineStadiumCatalogEntry[] = Object.freeze([
  {
    id: "emirates-stadium",
    providerVenueId: "204",
    homeTeamProviderId: "19",
    name: "Emirates Stadium",
    homeClubName: "Arsenal",
    imageUrl: "/touchlineArena/stadiums/aerial/01-arsenal-emirates-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/01-arsenal-emirates-stadium-live.webp",
  },
  {
    id: "villa-park",
    providerVenueId: "5",
    homeTeamProviderId: "15",
    name: "Villa Park",
    homeClubName: "Aston Villa",
    imageUrl: "/touchlineArena/stadiums/aerial/02-aston-villa-villa-park.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/02-aston-villa-villa-park-live.webp",
  },
  {
    id: "vitality-stadium",
    providerVenueId: "146",
    homeTeamProviderId: "52",
    name: "Vitality Stadium",
    homeClubName: "AFC Bournemouth",
    imageUrl: "/touchlineArena/stadiums/aerial/03-bournemouth-vitality-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/03-bournemouth-vitality-stadium-live.webp",
  },
  {
    id: "gtech-community-stadium",
    providerVenueId: "338817",
    homeTeamProviderId: "236",
    name: "Gtech Community Stadium",
    homeClubName: "Brentford",
    imageUrl: "/touchlineArena/stadiums/aerial/04-brentford-gtech-community-stadium.webp",
  },
  {
    id: "american-express-stadium",
    providerVenueId: "480",
    homeTeamProviderId: "78",
    name: "American Express Stadium",
    homeClubName: "Brighton & Hove Albion",
    imageUrl: "/touchlineArena/stadiums/aerial/05-brighton-american-express-stadium.webp",
  },
  {
    id: "stamford-bridge",
    providerVenueId: "321614",
    homeTeamProviderId: "18",
    name: "Stamford Bridge",
    homeClubName: "Chelsea",
    imageUrl: "/touchlineArena/stadiums/aerial/06-chelsea-stamford-bridge.webp",
  },
  {
    id: "coventry-building-society-arena",
    providerVenueId: "270",
    homeTeamProviderId: "117",
    name: "Coventry Building Society Arena",
    homeClubName: "Coventry City",
    imageUrl: "/touchlineArena/stadiums/aerial/07-coventry-coventry-building-society-arena.webp",
  },
  {
    id: "selhurst-park",
    providerVenueId: "201",
    homeTeamProviderId: "51",
    name: "Selhurst Park",
    capacity: 25_486,
    homeClubName: "Crystal Palace",
    imageUrl: "/touchlineArena/stadiums/aerial/08-crystal-palace-selhurst-park.webp",
  },
  {
    id: "hill-dickinson-stadium",
    providerVenueId: "343762",
    homeTeamProviderId: "13",
    name: "Hill Dickinson Stadium",
    homeClubName: "Everton",
    imageUrl: "/touchlineArena/stadiums/aerial/09-everton-hill-dickinson-stadium.webp",
  },
  {
    id: "craven-cottage",
    providerVenueId: "485",
    homeTeamProviderId: "11",
    name: "Craven Cottage",
    homeClubName: "Fulham",
    imageUrl: "/touchlineArena/stadiums/aerial/10-fulham-craven-cottage.webp",
  },
  {
    id: "mkm-stadium",
    providerVenueId: "199",
    homeTeamProviderId: "22",
    name: "MKM Stadium",
    homeClubName: "Hull City",
    imageUrl: "/touchlineArena/stadiums/aerial/11-hull-city-mkm-stadium.webp",
  },
  {
    id: "portman-road",
    providerVenueId: "504",
    homeTeamProviderId: "116",
    name: "Portman Road",
    homeClubName: "Ipswich Town",
    imageUrl: "/touchlineArena/stadiums/aerial/12-ipswich-town-portman-road.webp",
  },
  {
    id: "elland-road",
    providerVenueId: "488",
    homeTeamProviderId: "71",
    name: "Elland Road",
    homeClubName: "Leeds United",
    imageUrl: "/touchlineArena/stadiums/aerial/13-leeds-united-elland-road.webp",
  },
  {
    id: "anfield",
    providerVenueId: "230",
    homeTeamProviderId: "8",
    name: "Anfield",
    homeClubName: "Liverpool",
    imageUrl: "/touchlineArena/stadiums/aerial/14-liverpool-anfield.webp",
  },
  {
    id: "etihad-stadium",
    providerVenueId: "151",
    homeTeamProviderId: "9",
    name: "Etihad Stadium",
    homeClubName: "Manchester City",
    imageUrl: "/touchlineArena/stadiums/aerial/15-manchester-city-etihad-stadium.webp",
  },
  {
    id: "old-trafford",
    providerVenueId: "206",
    homeTeamProviderId: "14",
    name: "Old Trafford",
    homeClubName: "Manchester United",
    imageUrl: "/touchlineArena/stadiums/aerial/16-manchester-united-old-trafford.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/16-manchester-united-old-trafford-interior.webp",
  },
  {
    id: "st-james-park",
    providerVenueId: "449",
    homeTeamProviderId: "20",
    name: "St James' Park",
    homeClubName: "Newcastle United",
    imageUrl: "/touchlineArena/stadiums/aerial/17-newcastle-united-st-james-park.webp",
  },
  {
    id: "city-ground",
    providerVenueId: "542",
    homeTeamProviderId: "63",
    name: "City Ground",
    homeClubName: "Nottingham Forest",
    imageUrl: "/touchlineArena/stadiums/aerial/18-nottingham-forest-city-ground.webp",
  },
  {
    id: "stadium-of-light",
    providerVenueId: "212",
    homeTeamProviderId: "3",
    name: "Stadium of Light",
    homeClubName: "Sunderland",
    imageUrl: "/touchlineArena/stadiums/aerial/19-sunderland-stadium-of-light.webp",
  },
  {
    id: "tottenham-hotspur-stadium",
    providerVenueId: "281313",
    homeTeamProviderId: "6",
    name: "Tottenham Hotspur Stadium",
    homeClubName: "Tottenham Hotspur",
    imageUrl: "/touchlineArena/stadiums/aerial/20-tottenham-hotspur-stadium.webp",
  },
]);

const stadiumByVenueId = new Map(
  TOUCHLINE_STADIUM_CATALOG.map((stadium) => [stadium.providerVenueId, stadium]),
);
const stadiumByHomeTeamId = new Map(
  TOUCHLINE_STADIUM_CATALOG.map((stadium) => [stadium.homeTeamProviderId, stadium]),
);

if (
  stadiumByVenueId.size !== TOUCHLINE_STADIUM_CATALOG.length
  || stadiumByHomeTeamId.size !== TOUCHLINE_STADIUM_CATALOG.length
) {
  throw new Error("TouchLine stadium catalog contains a duplicate venue or home-team identity.");
}

function publicVenue(stadium: TouchlineStadiumCatalogEntry): TouchlinePublicVenue {
  return {
    id: stadium.id,
    name: stadium.name,
    ...(stadium.capacity === undefined ? {} : { capacity: stadium.capacity }),
    homeClubName: stadium.homeClubName,
    imageUrl: stadium.imageUrl,
    ...(stadium.interiorImageUrl === undefined ? {} : { interiorImageUrl: stadium.interiorImageUrl }),
    ...(stadium.photoCredit === undefined ? {} : { photoCredit: { ...stadium.photoCredit } }),
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
