import {
  TOUCHLINE_CARD_TIER_KEYS,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import type { TouchlineCompetitionCardOffer } from "./competition-card-offer.ts";
import {
  parseTouchlineLaunchTestCheckoutPolicy,
  type TouchlineLaunchTestCheckoutPolicy,
} from "./launch-test-season.ts";

export type TouchlineMarketInventoryCard = {
  inventoryId: string;
  playerId: string;
  providerPlayerId: string;
  tierKey: TouchlineCardTierKey;
  priceTableVersion: string;
  priceTc: number;
  marketValueEur: number | null;
  previousMarketValueEur: number | null;
  marketValueChangeEur: number | null;
  marketValueUpdatedAt: string | null;
  marketValueSource: string | null;
  supplyLimit: number;
  soldCopies: number;
  availableCopies: number;
  alreadyOwned: boolean;
  officialOffer?: TouchlineCompetitionCardOffer;
};

export type TouchlineMarketInventorySnapshot = {
  ok: true;
  source: "supabase";
  providerTeamId: string;
  walletBalanceTc: number;
  activeContractCount: number;
  openContractSlots: number;
  checkoutPolicy: TouchlineLaunchTestCheckoutPolicy | null;
  cards: TouchlineMarketInventoryCard[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEAM_ID_PATTERN = /^[0-9]{1,20}$/;
const CARD_TIERS = new Set<string>(TOUCHLINE_CARD_TIER_KEYS);

export function normalizeTouchlineMarketInventoryId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function nonNegativeNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableIsoDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function parseCard(value: unknown): TouchlineMarketInventoryCard | null {
  const card = recordOf(value);
  if (!card) return null;

  const inventoryId = normalizeTouchlineMarketInventoryId(card.inventoryId);
  const playerId = typeof card.playerId === "string" ? card.playerId.trim().toLowerCase() : "";
  const providerPlayerId = typeof card.providerPlayerId === "string" ? card.providerPlayerId.trim() : "";
  const tierKey = typeof card.tierKey === "string" && CARD_TIERS.has(card.tierKey)
    ? card.tierKey as TouchlineCardTierKey
    : null;
  const priceTableVersion = typeof card.priceTableVersion === "string" ? card.priceTableVersion.trim() : "";
  const priceTc = nonNegativeInteger(card.priceTc);
  const marketValueEur = nullableFiniteNumber(card.marketValueEur);
  const previousMarketValueEur = nullableFiniteNumber(card.previousMarketValueEur);
  const marketValueChangeEur = nullableFiniteNumber(card.marketValueChangeEur);
  const marketValueUpdatedAt = nullableIsoDate(card.marketValueUpdatedAt);
  const marketValueSource = typeof card.marketValueSource === "string" && card.marketValueSource.trim()
    ? card.marketValueSource.trim()
    : null;
  const supplyLimit = nonNegativeInteger(card.supplyLimit);
  const soldCopies = nonNegativeInteger(card.soldCopies);
  const availableCopies = nonNegativeInteger(card.availableCopies);
  const offerValue = recordOf(card.officialOffer);
  const officialOffer = offerValue
    && offerValue.subjectType === "player"
    && typeof offerValue.subjectId === "string"
    && typeof offerValue.displayPrice === "string"
    && typeof offerValue.currency === "string"
    && typeof offerValue.amountMinor === "number"
    && offerValue.tierKey === tierKey
    ? offerValue as unknown as TouchlineCompetitionCardOffer
    : undefined;

  if (
    !inventoryId
    || !UUID_PATTERN.test(playerId)
    || !providerPlayerId
    || !tierKey
    || !priceTableVersion
    || priceTc === null
    || (marketValueEur !== null && marketValueEur < 0)
    || (previousMarketValueEur !== null && previousMarketValueEur < 0)
    || supplyLimit === null
    || supplyLimit < 1
    || soldCopies === null
    || availableCopies === null
    || soldCopies + availableCopies !== supplyLimit
    || typeof card.alreadyOwned !== "boolean"
  ) return null;

  return {
    inventoryId,
    playerId,
    providerPlayerId,
    tierKey,
    priceTableVersion,
    priceTc,
    marketValueEur,
    previousMarketValueEur,
    marketValueChangeEur,
    marketValueUpdatedAt,
    marketValueSource,
    supplyLimit,
    soldCopies,
    availableCopies,
    alreadyOwned: card.alreadyOwned,
    officialOffer,
  };
}

export function parseTouchlineMarketInventorySnapshot(value: unknown): TouchlineMarketInventorySnapshot | null {
  const snapshot = recordOf(value);
  if (!snapshot || snapshot.ok !== true || snapshot.source !== "supabase") return null;

  const providerTeamId = typeof snapshot.providerTeamId === "string" ? snapshot.providerTeamId.trim() : "";
  const walletBalanceTc = nonNegativeNumber(snapshot.walletBalanceTc);
  const activeContractCount = nonNegativeInteger(snapshot.activeContractCount);
  const openContractSlots = nonNegativeInteger(snapshot.openContractSlots);
  const checkoutPolicy = parseTouchlineLaunchTestCheckoutPolicy(snapshot.checkoutPolicy);
  if (
    !TEAM_ID_PATTERN.test(providerTeamId)
    || walletBalanceTc === null
    || activeContractCount === null
    || openContractSlots === null
    || activeContractCount + openContractSlots !== 35
    || !Array.isArray(snapshot.cards)
  ) return null;

  const parsedCards = snapshot.cards
    .map(parseCard)
    .filter((card): card is TouchlineMarketInventoryCard => card !== null);
  const inventoryIds = new Set(parsedCards.map((card) => card.inventoryId));
  const providerPlayerIds = new Set(parsedCards.map((card) => card.providerPlayerId));
  if (inventoryIds.size !== parsedCards.length || providerPlayerIds.size !== parsedCards.length) return null;

  return {
    ok: true,
    source: "supabase",
    providerTeamId,
    walletBalanceTc,
    activeContractCount,
    openContractSlots,
    checkoutPolicy,
    cards: parsedCards,
  };
}

export function marketInventoryCardByProviderPlayerId(
  snapshot: TouchlineMarketInventorySnapshot | null,
  providerPlayerId?: string | null,
) {
  const normalizedId = String(providerPlayerId || "").trim();
  if (!snapshot || !normalizedId) return null;
  return snapshot.cards.find((card) => card.providerPlayerId === normalizedId) ?? null;
}
