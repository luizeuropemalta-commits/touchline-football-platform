import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  parseMarketValueEur,
  touchlineArenaCompetitionTierForCard,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import {
  CLUB_OWNER_SQUAD_CARDS,
  type ClubOwnerSquadCard,
} from "./demo-data.ts";
import {
  arenaPersistenceKeys,
  type ArenaPersistencePrincipal,
} from "./arena-persistence-namespace.ts";

export const CLUB_OWNER_ROSTER_STORAGE_KEY = "touchline:club-owner:roster:v1";
export const CLUB_OWNER_ROSTER_COOKIE_KEY = "touchline_club_owner_roster_v1";
export const CLUB_OWNER_ROSTER_EVENT = "touchline:club-owner-roster-change";

type CompactRosterCardV1 = [
  id: string,
  name: string,
  shortName: string,
  role: string,
  position: string,
  clubName: string,
  shirtNumber: number | null,
  countryCode3: string,
  marketValue: string,
  touchlinePoints: number,
];

type CompactRosterCardV2 = [
  ...CompactRosterCardV1,
  marketValueSource: NonNullable<ClubOwnerSquadCard["marketValueSource"]> | null,
  cardTier: TouchlineCardTierKey | null,
  cardPriceVersion: string | null,
];

type CompactRosterCardV3 = [
  ...CompactRosterCardV2,
  inventoryId: string | null,
];

type ClubOwnerRosterDeltaV1 = {
  v: 1;
  r: string[];
  u: CompactRosterCardV1[];
};

type ClubOwnerRosterDeltaV2 = {
  v: 2;
  r: string[];
  u: CompactRosterCardV2[];
};

type ClubOwnerRosterDeltaV3 = {
  v: 3;
  r: string[];
  u: CompactRosterCardV2[];
  o: string[];
};

type ClubOwnerRosterDeltaV4 = {
  v: 4;
  r: string[];
  u: CompactRosterCardV3[];
  o: string[];
};

type ClubOwnerRosterDelta = ClubOwnerRosterDeltaV1 | ClubOwnerRosterDeltaV2 | ClubOwnerRosterDeltaV3 | ClubOwnerRosterDeltaV4;

type ClubOwnerRosterFallback = "demo" | "empty";

type BrowserClubOwnerRosterOptions = {
  principal?: ArenaPersistencePrincipal | null;
  fallback?: ClubOwnerRosterFallback;
};

/**
 * The ClubOwner screens all describe the same owned-card collection. Keep the
 * visual matchday split here so a new contract cannot disappear merely because
 * a page independently slices the roster differently.
 *
 * These are presentation capacities, not a change to the approved contract
 * limit or to the Arena substitution rules.
 */
export const TOUCHLINE_ROSTER_PRESENTATION_LIMITS = {
  startingXi: 11,
  matchdayBench: 9,
} as const;

export type TouchlineClubOwnerRosterSections = {
  allCards: ClubOwnerSquadCard[];
  startingXiCards: ClubOwnerSquadCard[];
  matchdayBenchCards: ClubOwnerSquadCard[];
  reserveVaultCards: ClubOwnerSquadCard[];
};

function normalizeRosterIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function defaultCardFor(card: Pick<ClubOwnerSquadCard, "id" | "name" | "clubName">) {
  const directMatch = CLUB_OWNER_SQUAD_CARDS.find((candidate) => candidate.id === card.id);
  if (directMatch) return directMatch;

  const name = normalizeRosterIdentity(card.name);
  const club = normalizeRosterIdentity(card.clubName);
  return CLUB_OWNER_SQUAD_CARDS.find((candidate) => (
    normalizeRosterIdentity(candidate.name) === name
    && normalizeRosterIdentity(candidate.clubName) === club
  )) ?? CLUB_OWNER_SQUAD_CARDS.find((candidate) => normalizeRosterIdentity(candidate.name) === name);
}

function compactCard(card: ClubOwnerSquadCard): CompactRosterCardV3 {
  return [
    card.id,
    card.name,
    card.shortName,
    card.role,
    card.position,
    card.clubName,
    card.shirtNumber,
    card.countryCode3,
    card.marketValue,
    card.touchlinePoints,
    card.marketValueSource ?? null,
    card.cardTier ?? null,
    card.cardPriceVersion ?? null,
    card.inventoryId ?? null,
  ];
}

function expandCard(card: CompactRosterCardV1 | CompactRosterCardV2 | CompactRosterCardV3): ClubOwnerSquadCard {
  return {
    id: card[0],
    name: card[1],
    shortName: card[2],
    role: card[3],
    position: card[4],
    clubName: card[5],
    shirtNumber: card[6],
    countryCode3: card[7],
    marketValue: card[8],
    touchlinePoints: card[9],
    marketValueSource: card.length >= 13 ? card[10] ?? undefined : undefined,
    cardTier: card.length >= 13 ? card[11] ?? undefined : undefined,
    cardPriceVersion: card.length >= 13 ? card[12] ?? undefined : undefined,
    inventoryId: card.length === 14 ? card[13] ?? undefined : undefined,
  };
}

function isCompactRosterCardV1(value: unknown): value is CompactRosterCardV1 {
  return Array.isArray(value)
    && value.length === 10
    && value.slice(0, 6).every((entry) => typeof entry === "string")
    && (typeof value[6] === "number" || value[6] === null)
    && value.slice(7, 9).every((entry) => typeof entry === "string")
    && typeof value[9] === "number";
}

function isCompactRosterCardV2(value: unknown): value is CompactRosterCardV2 {
  return Array.isArray(value)
    && value.length === 13
    && value.slice(0, 6).every((entry) => typeof entry === "string")
    && (typeof value[6] === "number" || value[6] === null)
    && value.slice(7, 9).every((entry) => typeof entry === "string")
    && typeof value[9] === "number"
    && (value[10] === null || ["provider", "verified-cache", "unavailable"].includes(String(value[10])))
    && (value[11] === null || typeof value[11] === "string")
    && (value[12] === null || typeof value[12] === "string");
}

function isCompactRosterCardV3(value: unknown): value is CompactRosterCardV3 {
  return Array.isArray(value)
    && value.length === 14
    && isCompactRosterCardV2(value.slice(0, 13))
    && (value[13] === null || typeof value[13] === "string");
}

function cardsMatch(first: ClubOwnerSquadCard, second: ClubOwnerSquadCard) {
  return JSON.stringify(compactCard(first)) === JSON.stringify(compactCard(second));
}

export function canonicalClubOwnerRosterCard(card: ClubOwnerSquadCard): ClubOwnerSquadCard {
  const defaultCard = defaultCardFor(card);
  const hasCardMarketValue = parseMarketValueEur(card.marketValue) > 0;
  const keepsSuppliedMarketValue = hasCardMarketValue && (
    card.marketValueSource === "provider"
    || card.marketValueSource === "verified-cache"
  );
  const canonicalMarketValue = card.marketValueSource === "unavailable"
    ? "Pending"
    : keepsSuppliedMarketValue
      ? card.marketValue
      : defaultCard?.marketValue ?? "Pending";
  const canonicalMarketValueSource = card.marketValueSource === "unavailable"
    ? "unavailable"
    : keepsSuppliedMarketValue
      ? card.marketValueSource
      : defaultCard?.marketValueSource ?? "unavailable";
  const cardTier = touchlineArenaCompetitionTierForCard(
    card.cardTier ?? defaultCard?.cardTier,
  ).key;

  return {
    ...card,
    id: defaultCard?.id ?? card.id,
    marketValue: canonicalMarketValue,
    marketValueSource: canonicalMarketValueSource,
    cardTier,
    cardPriceVersion:
      card.cardPriceVersion
      ?? defaultCard?.cardPriceVersion
      ?? TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  };
}

export function uniqueClubOwnerRosterCards(cards: ClubOwnerSquadCard[]) {
  const uniqueCards = new Map<string, ClubOwnerSquadCard>();
  for (const sourceCard of cards) {
    const card = canonicalClubOwnerRosterCard(sourceCard);
    uniqueCards.set(card.id, card);
  }
  return [...uniqueCards.values()];
}

export function partitionClubOwnerRoster(cards: ClubOwnerSquadCard[]): TouchlineClubOwnerRosterSections {
  const allCards = uniqueClubOwnerRosterCards(cards);
  const startingXiCards = allCards.slice(0, TOUCHLINE_ROSTER_PRESENTATION_LIMITS.startingXi);
  const matchdayBenchStart = startingXiCards.length;
  const matchdayBenchCards = allCards.slice(
    matchdayBenchStart,
    matchdayBenchStart + TOUCHLINE_ROSTER_PRESENTATION_LIMITS.matchdayBench,
  );

  return {
    allCards,
    startingXiCards,
    matchdayBenchCards,
    reserveVaultCards: allCards.slice(matchdayBenchStart + matchdayBenchCards.length),
  };
}

export function createClubOwnerRosterDelta(cards: ClubOwnerSquadCard[]): ClubOwnerRosterDeltaV4 {
  const currentCards = uniqueClubOwnerRosterCards(cards);
  const currentById = new Map(currentCards.map((card) => [card.id, card]));
  const defaultsById = new Map(CLUB_OWNER_SQUAD_CARDS.map((card) => [card.id, card]));

  return {
    v: 4,
    r: CLUB_OWNER_SQUAD_CARDS
      .filter((card) => !currentById.has(card.id))
      .map((card) => card.id),
    u: currentCards
      .filter((card) => {
        const defaultCard = defaultsById.get(card.id);
        return !defaultCard || !cardsMatch(card, defaultCard);
      })
      .map(compactCard),
    o: currentCards.map((card) => card.id),
  };
}

export function applyClubOwnerRosterDelta(delta?: ClubOwnerRosterDelta | null) {
  if (!delta) return CLUB_OWNER_SQUAD_CARDS.map((card) => ({ ...card }));

  const removedIds = new Set(delta.r);
  const upserts = new Map(delta.u.map((card) => {
    const expanded = expandCard(card);
    return [expanded.id, expanded] as const;
  }));
  const roster = CLUB_OWNER_SQUAD_CARDS
    .filter((card) => !removedIds.has(card.id))
    .map((card) => upserts.get(card.id) ?? { ...card });

  for (const [id, card] of upserts) {
    if (!CLUB_OWNER_SQUAD_CARDS.some((defaultCard) => defaultCard.id === id)) roster.push(card);
  }

  const uniqueRoster = uniqueClubOwnerRosterCards(roster);
  if (delta.v !== 3 && delta.v !== 4) return uniqueRoster;

  const cardsById = new Map(uniqueRoster.map((card) => [card.id, card]));
  const orderedCards = delta.o
    .map((id) => cardsById.get(id))
    .filter((card): card is ClubOwnerSquadCard => Boolean(card));
  const orderedIds = new Set(orderedCards.map((card) => card.id));

  return [
    ...orderedCards,
    ...uniqueRoster.filter((card) => !orderedIds.has(card.id)),
  ];
}

export function serializeClubOwnerRoster(cards: ClubOwnerSquadCard[]) {
  return encodeURIComponent(JSON.stringify(createClubOwnerRosterDelta(cards)));
}

function fallbackClubOwnerRoster(fallback: ClubOwnerRosterFallback) {
  return fallback === "empty" ? [] : applyClubOwnerRosterDelta();
}

export function parseClubOwnerRoster(
  value?: string | null,
  options: Pick<BrowserClubOwnerRosterOptions, "fallback"> = {},
) {
  const fallback = options.fallback ?? "demo";
  if (!value) return fallbackClubOwnerRoster(fallback);

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    const hasValidHeader = (parsed.v === 1 || parsed.v === 2 || parsed.v === 3 || parsed.v === 4)
      && Array.isArray(parsed.r)
      && parsed.r.every((id) => typeof id === "string")
      && Array.isArray(parsed.u)
      && ((parsed.v !== 3 && parsed.v !== 4) || (
        Array.isArray(parsed.o)
        && parsed.o.every((id) => typeof id === "string")
        && new Set(parsed.o).size === parsed.o.length
      ));
    const hasValidCards = parsed.v === 1
      ? (parsed.u as unknown[]).every(isCompactRosterCardV1)
      : parsed.v === 2 || parsed.v === 3
        ? (parsed.u as unknown[]).every(isCompactRosterCardV2)
        : parsed.v === 4
          ? (parsed.u as unknown[]).every(isCompactRosterCardV3)
        : false;

    if (!hasValidHeader || !hasValidCards) {
      return fallbackClubOwnerRoster(fallback);
    }
    return applyClubOwnerRosterDelta(parsed as unknown as ClubOwnerRosterDelta);
  } catch {
    return fallbackClubOwnerRoster(fallback);
  }
}

function rosterPersistenceKeys(principal?: ArenaPersistencePrincipal | null) {
  if (!principal) {
    return {
      storageKey: CLUB_OWNER_ROSTER_STORAGE_KEY,
      cookieName: CLUB_OWNER_ROSTER_COOKIE_KEY,
    };
  }
  return arenaPersistenceKeys(principal, "club-owner-roster");
}

export function readBrowserClubOwnerRoster(options: BrowserClubOwnerRosterOptions = {}) {
  const fallback = options.fallback ?? "demo";
  if (typeof window === "undefined") return fallbackClubOwnerRoster(fallback);
  const keys = rosterPersistenceKeys(options.principal);

  try {
    const storedRoster = window.localStorage.getItem(keys.storageKey);
    if (storedRoster) return parseClubOwnerRoster(storedRoster, { fallback });
  } catch {
    // Cookie fallback below keeps the roster available when localStorage is blocked.
  }

  const cookieValue = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${keys.cookieName}=`))
    ?.slice(keys.cookieName.length + 1);
  return parseClubOwnerRoster(cookieValue, { fallback });
}

export function writeBrowserClubOwnerRoster(
  cards: ClubOwnerSquadCard[],
  options: Pick<BrowserClubOwnerRosterOptions, "principal"> = {},
) {
  if (typeof window === "undefined") return;

  const keys = rosterPersistenceKeys(options.principal);
  const serializedRoster = serializeClubOwnerRoster(cards);
  try {
    window.localStorage.setItem(keys.storageKey, serializedRoster);
  } catch {
    // The authenticated server state remains authoritative when localStorage is blocked.
  }
  if (options.principal?.kind === "authenticated") {
    document.cookie = `${keys.cookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
  } else {
    document.cookie = `${keys.cookieName}=${serializedRoster}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  window.dispatchEvent(new CustomEvent(CLUB_OWNER_ROSTER_EVENT, { detail: uniqueClubOwnerRosterCards(cards) }));
}

export function clubOwnerRosterMarketValue(cards: ClubOwnerSquadCard[]) {
  return cards.reduce((sum, card) => (
    card.marketValueSource === "provider" || card.marketValueSource === "verified-cache"
      ? sum + parseMarketValueEur(card.marketValue)
      : sum
  ), 0);
}
