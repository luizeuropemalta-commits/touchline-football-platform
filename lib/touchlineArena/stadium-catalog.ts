import {
  toPublicTouchlineFixture,
  type TouchlinePublicFixture,
  type TouchlinePublicVenue,
} from "../football-data/public-fixture.ts";
import type { TouchlineFixture } from "../football-data/types.ts";

export type TouchlineStadiumCatalogEntry = TouchlinePublicVenue & {
  providerVenueId: string;
  homeTeamProviderId: string;
  /**
   * Club-profile facts remain separate from the fixture venue contract. An
   * away fixture can name a different stadium while this stays the club's
   * permanent home ground. `homeClubLabel` is not a legal ownership claim.
   */
  clubProfile?: TouchlineClubStadiumProfile;
};

export type TouchlineClubStadiumSource = Readonly<{
  field: "stadiumName" | "homeClubLabel" | "address" | "capacity" | "openedYear";
  publisher: string;
  url: string;
  /** Human-readable scope of the cited page for this exact displayed field. */
  evidence: string;
  checkedAt: string;
}>;

export type TouchlineClubStadiumProfile = Readonly<{
  homeClubLabel: string;
  address: Readonly<{
    line1?: string;
    city: string;
    postalCode?: string;
    country: string;
  }>;
  capacity: number | null;
  openedYear: number | null;
  sources: readonly TouchlineClubStadiumSource[];
  verifiedAt: string;
}>;

const STADIUM_FACT_FIELDS = [
  "stadiumName",
  "homeClubLabel",
  "address",
  "capacity",
  "openedYear",
] as const satisfies readonly TouchlineClubStadiumSource["field"][];

/**
 * A source entry is retained for each displayed fact.  `evidence` deliberately
 * states the scope of the page for that field: a URL must never appear as an
 * unexplained generic citation for all five facts.
 */
const STADIUM_SOURCE_HOSTS = new Set([
  "www.arsenal.com",
  "www.premierleague.com",
  "www.avfc.co.uk",
  "www.afcb.co.uk",
  "www.brentfordfc.com",
  "events.brentfordfc.com",
  "www.coventrybuildingsocietyarena.co.uk",
  "www.cpfc.co.uk",
  "www.evertonfc.com",
  "www.leedsunited.com",
  "www.levelplayingfield.org.uk",
  "www.mancity.com",
  "www.manutd.com",
  "www.newcastleunited.com",
  "www.wearehullcity.co.uk",
  "stadiumtours.liverpoolfc.com",
  "www.liverpoolfc.com",
]);

/** Stable citation policy. Reject generic indexes, news roundups and unrelated club paths. */
export function isApprovedTouchlineStadiumSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !STADIUM_SOURCE_HOSTS.has(url.hostname)) return false;
    if (!url.pathname || url.pathname === "/") return false;
    if (url.hostname === "www.cpfc.co.uk" && !/^\/selhurst-park\/stadium\/?$/i.test(url.pathname)) return false;
    if (url.hostname === "www.premierleague.com") {
      return /^\/en\/clubs\/\d+\/[a-z0-9-]+\/stadium\/?$/i.test(url.pathname)
        || url.pathname === "/en/news/62757";
    }
    return !/\/(?:club)\/(?:stadium)\/?$/i.test(url.pathname)
      && !/\/(?:Manutd|West-Ham)\//i.test(url.pathname);
  } catch {
    return false;
  }
}

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
const STADIUM_CATALOG_ENTRIES: readonly TouchlineStadiumCatalogEntry[] = [
  {
    id: "emirates-stadium",
    providerVenueId: "204",
    homeTeamProviderId: "19",
    name: "Emirates Stadium",
    homeClubName: "Arsenal",
    // Fixture identity remains safe to show. The ClubHub detail panel is
    // deliberately unavailable until five field-specific primary sources
    // prove its name, home club, address, capacity and opening year.
    imageUrl: "/touchlineArena/stadiums/aerial/01-arsenal-emirates-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/01-arsenal-emirates-stadium-live.webp",
  },
  {
    id: "villa-park",
    providerVenueId: "5",
    homeTeamProviderId: "15",
    name: "Villa Park",
    homeClubName: "Aston Villa",
    // Same fail-closed rule as Arsenal: the fixture may name Villa Park, but
    // the ClubHub profile must not present unsafely sourced detail facts.
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
    clubProfile: {
      homeClubLabel: "Brentford",
      address: {
        line1: "Gtech Community Stadium, Lionel Road South",
        city: "Brentford",
        postalCode: "TW8 0RU",
        country: "England",
      },
      capacity: 17_250,
      openedYear: 2020,
      sources: [
        { field: "stadiumName", publisher: "Brentford FC Conference & Events", url: "https://events.brentfordfc.com/about-us/", evidence: "Brentford FC's venue site names Gtech Community Stadium.", checkedAt: "2026-09-10" },
        { field: "homeClubLabel", publisher: "Brentford FC Conference & Events", url: "https://events.brentfordfc.com/about-us/", evidence: "Brentford FC's venue site says Gtech Community Stadium has been home to Brentford FC since 2020.", checkedAt: "2026-09-10" },
        { field: "address", publisher: "Brentford FC", url: "https://www.brentfordfc.com/en/news/article/club-news-bike-to-brentford-v-manchester-united-28-04-2025", evidence: "Brentford FC gives Gtech Community Stadium's address as Lionel Road South, Brentford TW8 0RU.", checkedAt: "2026-09-10" },
        { field: "capacity", publisher: "Brentford FC Conference & Events", url: "https://events.brentfordfc.com/about-us/", evidence: "Brentford FC's venue site lists Gtech Community Stadium capacity as 17,250 fans.", checkedAt: "2026-09-10" },
        { field: "openedYear", publisher: "Brentford FC Conference & Events", url: "https://events.brentfordfc.com/about-us/", evidence: "Brentford FC's venue site records Gtech Community Stadium opening in summer 2020.", checkedAt: "2026-09-10" },
      ],
      verifiedAt: "2026-09-10",
    },
    imageUrl: "/touchlineArena/stadiums/aerial/04-brentford-gtech-community-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/04-brentford-gtech-community-stadium-live.webp",
  },
  {
    id: "american-express-stadium",
    providerVenueId: "480",
    homeTeamProviderId: "78",
    name: "American Express Stadium",
    homeClubName: "Brighton & Hove Albion",
    imageUrl: "/touchlineArena/stadiums/aerial/05-brighton-american-express-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/05-brighton-american-express-stadium-live.webp",
  },
  {
    id: "stamford-bridge",
    providerVenueId: "321614",
    homeTeamProviderId: "18",
    name: "Stamford Bridge",
    homeClubName: "Chelsea",
    imageUrl: "/touchlineArena/stadiums/aerial/06-chelsea-stamford-bridge.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/06-chelsea-stamford-bridge-live.webp",
  },
  {
    id: "coventry-building-society-arena",
    providerVenueId: "270",
    homeTeamProviderId: "117",
    name: "Coventry Building Society Arena",
    homeClubName: "Coventry City",
    imageUrl: "/touchlineArena/stadiums/aerial/07-coventry-coventry-building-society-arena.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/07-coventry-cbs-arena-live.webp",
  },
  {
    id: "selhurst-park",
    providerVenueId: "201",
    homeTeamProviderId: "51",
    name: "Selhurst Park",
    capacity: 25_486,
    homeClubName: "Crystal Palace",
    imageUrl: "/touchlineArena/stadiums/aerial/08-crystal-palace-selhurst-park.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/08-crystal-palace-selhurst-park-live.webp",
  },
  {
    id: "hill-dickinson-stadium",
    providerVenueId: "343762",
    homeTeamProviderId: "13",
    name: "Hill Dickinson Stadium",
    homeClubName: "Everton",
    imageUrl: "/touchlineArena/stadiums/aerial/09-everton-hill-dickinson-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/09-everton-hill-dickinson-stadium-live.webp",
  },
  {
    id: "craven-cottage",
    providerVenueId: "485",
    homeTeamProviderId: "11",
    name: "Craven Cottage",
    homeClubName: "Fulham",
    imageUrl: "/touchlineArena/stadiums/aerial/10-fulham-craven-cottage.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/10-fulham-craven-cottage-live.webp",
  },
  {
    id: "mkm-stadium",
    providerVenueId: "199",
    homeTeamProviderId: "22",
    name: "MKM Stadium",
    homeClubName: "Hull City",
    imageUrl: "/touchlineArena/stadiums/aerial/11-hull-city-mkm-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/11-hull-city-mkm-stadium-live.webp",
  },
  {
    id: "portman-road",
    providerVenueId: "504",
    homeTeamProviderId: "116",
    name: "Portman Road",
    homeClubName: "Ipswich Town",
    imageUrl: "/touchlineArena/stadiums/aerial/12-ipswich-town-portman-road.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/12-ipswich-town-portman-road-live.webp",
  },
  {
    id: "elland-road",
    providerVenueId: "488",
    homeTeamProviderId: "71",
    name: "Elland Road",
    homeClubName: "Leeds United",
    imageUrl: "/touchlineArena/stadiums/aerial/13-leeds-united-elland-road.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/13-leeds-united-elland-road-live.webp",
  },
  {
    id: "anfield",
    providerVenueId: "230",
    homeTeamProviderId: "8",
    name: "Anfield",
    homeClubName: "Liverpool",
    clubProfile: {
      homeClubLabel: "Liverpool FC",
      address: {
        line1: "Anfield Road",
        city: "Liverpool",
        postalCode: "L4 0TH",
        country: "England",
      },
      capacity: 61_276,
      openedYear: 1884,
      sources: [
        { field: "stadiumName", publisher: "Premier League", url: "https://www.premierleague.com/en/clubs/14/liverpool/stadium", evidence: "Premier League club stadium profile identifies Anfield as Liverpool FC's home ground.", checkedAt: "2026-09-10" },
        { field: "homeClubLabel", publisher: "Premier League", url: "https://www.premierleague.com/en/clubs/14/liverpool/stadium", evidence: "Premier League club stadium profile identifies Liverpool FC as the home club.", checkedAt: "2026-09-10" },
        { field: "address", publisher: "Liverpool FC", url: "https://stadiumtours.liverpoolfc.com/contactus", evidence: "Liverpool FC stadium tour contact record gives Anfield Road, Liverpool, L4 0TH, England.", checkedAt: "2026-09-10" },
        { field: "capacity", publisher: "Liverpool FC", url: "https://www.liverpoolfc.com/news/new-anfield-capacity-confirmed-ahead-2024-25", evidence: "Liverpool FC announcement confirms Anfield capacity of 61,276.", checkedAt: "2026-09-10" },
        { field: "openedYear", publisher: "Premier League", url: "https://www.premierleague.com/en/clubs/14/liverpool/stadium", evidence: "Premier League club stadium profile records Anfield opening year 1884.", checkedAt: "2026-09-10" },
      ],
      verifiedAt: "2026-09-10",
    },
    imageUrl: "/touchlineArena/stadiums/aerial/14-liverpool-anfield.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/14-liverpool-anfield-live.webp",
  },
  {
    id: "etihad-stadium",
    providerVenueId: "151",
    homeTeamProviderId: "9",
    name: "Etihad Stadium",
    homeClubName: "Manchester City",
    imageUrl: "/touchlineArena/stadiums/aerial/15-manchester-city-etihad-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/15-manchester-city-etihad-stadium-live.webp",
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
    interiorImageUrl: "/touchlineArena/stadiums/interiors/17-newcastle-united-st-james-park-live.webp",
  },
  {
    id: "city-ground",
    providerVenueId: "542",
    homeTeamProviderId: "63",
    name: "City Ground",
    homeClubName: "Nottingham Forest",
    imageUrl: "/touchlineArena/stadiums/aerial/18-nottingham-forest-city-ground.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/18-nottingham-forest-city-ground-live.webp",
  },
  {
    id: "stadium-of-light",
    providerVenueId: "212",
    homeTeamProviderId: "3",
    name: "Stadium of Light",
    homeClubName: "Sunderland",
    imageUrl: "/touchlineArena/stadiums/aerial/19-sunderland-stadium-of-light.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/19-sunderland-stadium-of-light-live.webp",
  },
  {
    id: "tottenham-hotspur-stadium",
    providerVenueId: "281313",
    homeTeamProviderId: "6",
    name: "Tottenham Hotspur Stadium",
    homeClubName: "Tottenham Hotspur",
    imageUrl: "/touchlineArena/stadiums/aerial/20-tottenham-hotspur-stadium.webp",
    interiorImageUrl: "/touchlineArena/stadiums/interiors/20-tottenham-hotspur-stadium-live.webp",
  },
];

export const TOUCHLINE_STADIUM_CATALOG: readonly TouchlineStadiumCatalogEntry[] = Object.freeze(STADIUM_CATALOG_ENTRIES);

/**
 * A citation must substantiate its specific displayed field, not merely name
 * a generally trusted publisher. This invariant keeps ClubHub from silently
 * turning a generic page into five unsupported claims.
 */
export function isFieldSpecificTouchlineStadiumSource(
  stadium: TouchlineStadiumCatalogEntry,
  source: TouchlineClubStadiumSource,
): boolean {
  const profile = stadium.clubProfile;
  if (!profile || !isApprovedTouchlineStadiumSourceUrl(source.url)) return false;
  const evidence = source.evidence.toLocaleLowerCase("en-GB");
  switch (source.field) {
    case "stadiumName":
      return evidence.includes(stadium.name.toLocaleLowerCase("en-GB"));
    case "homeClubLabel":
      return evidence.includes(profile.homeClubLabel.toLocaleLowerCase("en-GB"));
    case "address":
      return evidence.includes(profile.address.city.toLocaleLowerCase("en-GB"));
    case "capacity":
      return profile.capacity !== null
        && evidence.includes(profile.capacity.toLocaleString("en-GB").toLocaleLowerCase("en-GB"));
    case "openedYear":
      return profile.openedYear !== null && evidence.includes(String(profile.openedYear));
  }
}

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

for (const stadium of TOUCHLINE_STADIUM_CATALOG) {
  // Venue identity can be shown from the verified fixture catalogue. ClubHub
  // detail facts stay absent until every displayed fact has direct evidence.
  if (!stadium.clubProfile) continue;
  const sources = stadium.clubProfile?.sources ?? [];
  if (
    sources.length !== STADIUM_FACT_FIELDS.length
    || new Set(sources.map((source) => source.field)).size !== STADIUM_FACT_FIELDS.length
    || new Set(sources.map((source) => source.evidence.trim())).size !== STADIUM_FACT_FIELDS.length
    || new Set(sources.map((source) => source.url)).size < 2
  ) {
    throw new Error(`TouchLine stadium catalog must retain one non-cloned citation for every field: ${stadium.id}.`);
  }
  for (const source of sources) {
    if (!isFieldSpecificTouchlineStadiumSource(stadium, source) || source.evidence.trim().length < 24) {
      throw new Error(`TouchLine stadium catalog has an invalid or unexplained source for ${stadium.id}:${source.field}.`);
    }
  }
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

/** Resolves the ClubHub home ground, never a venue of a current away fixture. */
export function resolveTouchlineClubHomeStadium(homeTeamProviderId: string) {
  return stadiumByHomeTeamId.get(homeTeamProviderId) ?? null;
}

export function toTouchlineLiveFixture(fixture: TouchlineFixture): TouchlinePublicFixture {
  const publicFixture = toPublicTouchlineFixture(fixture);
  const venue = resolveTouchlineFixtureVenue(fixture);
  return venue ? { ...publicFixture, venue } : publicFixture;
}

export function toTouchlineLiveFixtures(fixtures: TouchlineFixture[]) {
  return fixtures.map(toTouchlineLiveFixture);
}
