import {
  CLUB_OWNER_SQUAD_CARDS,
  findTouchLineClub,
  rankClubOwnerCards,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
} from "./demo-data.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "./card-rules.ts";
import { inferArenaRole } from "../football-data/arena-lineup.ts";
import { touchlineCountryCode3FromName } from "./country-flags.ts";
import { normalizeTouchLinePlayerKey } from "./player-links.ts";

export type TouchLinePlayerProfileSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type TouchLinePlayerCareerStop = {
  club: string;
  period: string;
  note: string;
};

export type TouchLineRealPlayerDetails = {
  displayPosition: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  height?: string;
  preferredFoot?: string;
  joinedClub?: string;
  contractUntil?: string;
  biography: string;
  career: TouchLinePlayerCareerStop[];
  sources: Array<{
    label: string;
    href: string;
  }>;
};

export type TouchLineResolvedPlayerProfile = {
  card: ClubOwnerSquadCard;
  exactPlayer: ReturnType<typeof squadCardToExactPlayer>;
  club: ReturnType<typeof findTouchLineClub>;
  cardRank: number | null;
  isLocalCard: boolean;
  real: TouchLineRealPlayerDetails;
};

/**
 * The minimal server-owned identity needed to render a public player profile.
 * This is intentionally separate from URL metadata and TouchLine card economy.
 */
export type TouchLineCanonicalPlayerIdentity = Readonly<{
  providerPlayerId: string;
  name: string;
  displayName: string;
  clubName: string | null;
  position: string | null;
  nationality: string | null;
  jerseyNumber: number | null;
}>;

function queryValue(
  searchParams: TouchLinePlayerProfileSearchParams,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseNumber(value: string | undefined, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function humanizeSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function findLocalCard(playerKey: string, searchParams: TouchLinePlayerProfileSearchParams) {
  const candidates = [
    playerKey,
    queryValue(searchParams, "playerId"),
    queryValue(searchParams, "name"),
  ]
    .map(normalizeTouchLinePlayerKey)
    .filter(Boolean);

  return CLUB_OWNER_SQUAD_CARDS.find((card) => {
    const cardKeys = [card.id, card.name, card.shortName]
      .map(normalizeTouchLinePlayerKey)
      .filter(Boolean);
    return candidates.some((candidate) => cardKeys.includes(candidate));
  });
}

function fallbackCard(
  playerKey: string,
  searchParams: TouchLinePlayerProfileSearchParams,
): ClubOwnerSquadCard {
  const name =
    queryValue(searchParams, "name")?.trim() ||
    humanizeSlug(normalizeTouchLinePlayerKey(playerKey)) ||
    "TouchLine player";
  const id =
    queryValue(searchParams, "playerId")?.trim() ||
    normalizeTouchLinePlayerKey(playerKey) ||
    normalizeTouchLinePlayerKey(name) ||
    "player";
  const clubName =
    queryValue(searchParams, "club")?.trim() || "TouchLine club";
  const position =
    queryValue(searchParams, "position")?.trim() || "Player";

  return {
    id,
    name,
    shortName: name,
    role: position.toLowerCase(),
    position,
    clubName,
    shirtNumber: parseNumber(queryValue(searchParams, "shirt"), 0) || null,
    countryCode3:
      queryValue(searchParams, "country")?.trim().toUpperCase() || "N/A",
    marketValue: "Pending",
    marketValueSource: "unavailable",
    cardTier: "ruby-red",
    cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    touchlinePoints: 0,
  };
}

function canonicalCard(identity: TouchLineCanonicalPlayerIdentity): ClubOwnerSquadCard {
  const position = identity.position ?? "Position unavailable";
  const countryCode3 = touchlineCountryCode3FromName(identity.nationality) ?? "N/A";
  const name = identity.displayName || identity.name;

  return {
    // Every value here is either canonical or an explicit unavailable state.
    // Never inherit a current club, shirt, tier or price from a URL or demo
    // card just because the public slug happens to match a legacy entry.
    id: identity.providerPlayerId,
    name,
    shortName: name,
    role: inferArenaRole(identity.position ?? undefined),
    position,
    clubName: identity.clubName ?? "Club unavailable",
    shirtNumber: identity.jerseyNumber,
    countryCode3,
    marketValue: "Pending",
    marketValueSource: "unavailable",
    marketValueState: "pending",
    classificationState: "pending",
    touchlinePoints: 0,
  };
}

export function resolveTouchLineUnavailableOfficialProfile(providerPlayerId: string): TouchLineResolvedPlayerProfile {
  const card: ClubOwnerSquadCard = {
    id: providerPlayerId,
    name: "TouchLine player",
    shortName: "TouchLine player",
    role: "player",
    position: "Player data unavailable",
    clubName: "Club unavailable",
    shirtNumber: null,
    countryCode3: "N/A",
    marketValue: "Pending",
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    touchlinePoints: 0,
  };
  const exactPlayer = squadCardToExactPlayer(card);
  exactPlayer.age = "--";
  exactPlayer.height = "--";
  exactPlayer.foot = "--";
  exactPlayer.contract = "Pending provider sync";
  exactPlayer.nationality = card.countryCode3;
  return {
    card,
    exactPlayer,
    club: undefined,
    cardRank: null,
    isLocalCard: false,
    real: genericRealDetails(card),
  };
}

function genericRealDetails(card: ClubOwnerSquadCard): TouchLineRealPlayerDetails {
  return {
    displayPosition: card.position || card.role || "Player",
    biography:
      "This profile is ready to receive the player's verified football history while keeping TouchLine performance and card data in the same environment.",
    career: [],
    sources: [],
  };
}

function uniqueRankedCards() {
  const seen = new Set<string>();
  return [...CLUB_OWNER_SQUAD_CARDS]
    .sort(rankClubOwnerCards)
    .filter((card) => {
      const key = normalizeTouchLinePlayerKey(card.id || card.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function resolveTouchLinePlayerProfile(
  playerKey: string,
  searchParams: TouchLinePlayerProfileSearchParams = {},
  canonicalIdentity?: TouchLineCanonicalPlayerIdentity | null,
): TouchLineResolvedPlayerProfile {
  const localCard = findLocalCard(playerKey, searchParams);
  const fallback = localCard ?? fallbackCard(playerKey, searchParams);
  const card = canonicalIdentity ? canonicalCard(canonicalIdentity) : fallback;
  const exactPlayer = squadCardToExactPlayer(card);
  const detailKey = normalizeTouchLinePlayerKey(card.id || card.name);
  const rankedCards = uniqueRankedCards();
  const rankIndex = rankedCards.findIndex(
    (candidate) =>
      normalizeTouchLinePlayerKey(candidate.id || candidate.name) === detailKey,
  );

  const real = genericRealDetails(card);
  exactPlayer.age = "--";
  exactPlayer.height = "--";
  exactPlayer.foot = "--";
  exactPlayer.contract = "Pending provider sync";
  exactPlayer.nationality = card.countryCode3;

  return {
    card,
    exactPlayer,
    club: findTouchLineClub(card.clubName),
    cardRank: rankIndex >= 0 ? rankIndex + 1 : null,
    // A resolved official provider ID makes this an external public profile,
    // even if its slug happens to overlap a legacy demo card.
    isLocalCard: Boolean(localCard) && !canonicalIdentity,
    real,
  };
}
