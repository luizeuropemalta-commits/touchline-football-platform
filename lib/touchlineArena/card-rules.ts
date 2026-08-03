import {
  PLAYER_MARKET_TIER_POLICY_VERSION,
  PLAYER_MARKET_TIERS,
  resolvePlayerMarketTier,
} from "./player-market-tiers.ts";

export const TOUCHLINE_CARD_TIER_KEYS = [
  "ruby-red",
  "sapphire-blue",
  "amethyst-purple",
  "radiant-gold",
  "emerald-green",
  "clear-diamond",
  "diamond-gold",
] as const;

export type TouchlineCardTierKey = (typeof TOUCHLINE_CARD_TIER_KEYS)[number];

export const TOUCHLINE_CARD_TIER_NAMES: Record<
  TouchlineCardTierKey,
  { en: string; pt: string }
> = {
  "ruby-red": { en: "Ruby Red", pt: "Rubi Vermelho" },
  "sapphire-blue": { en: "Sapphire Blue", pt: "Safira Azul" },
  "amethyst-purple": { en: "Amethyst Purple", pt: "Ametista Roxa" },
  "radiant-gold": { en: "Radiant Gold", pt: "Ouro Radiante" },
  "emerald-green": { en: "Emerald Green", pt: "Esmeralda Verde" },
  "clear-diamond": { en: "Clear Diamond", pt: "Diamante Cristalino" },
  "diamond-gold": { en: "Diamond Gold", pt: "Diamante Dourado" },
};

export function touchlineCardTierName(
  tier?: TouchlineCardTierKey | null,
  locale: "pt-BR" | "en" | string = "en",
) {
  const names = TOUCHLINE_CARD_TIER_NAMES[tier ?? TOUCHLINE_CARD_STARTING_TIER_KEY];
  return locale === "pt-BR" ? names.pt : names.en;
}

/** Canonical visual colors shared by every TouchLine card surface. */
export const TOUCHLINE_CARD_TIER_PALETTES: Record<
  TouchlineCardTierKey,
  { accent: string; secondary: string }
> = {
  "ruby-red": { accent: "#ff4d5e", secondary: "#7a111e" },
  "sapphire-blue": { accent: "#61c7ff", secondary: "#174b9b" },
  "amethyst-purple": { accent: "#c788ff", secondary: "#58208f" },
  "radiant-gold": { accent: "#ffd85e", secondary: "#91640b" },
  "emerald-green": { accent: "#5ff0a0", secondary: "#08764a" },
  "clear-diamond": { accent: "#dff8ff", secondary: "#71b7d4" },
  "diamond-gold": { accent: "#fff2a8", secondary: "#c58a15" },
};

export function touchlineCardTierPalette(tier?: TouchlineCardTierKey | null) {
  return TOUCHLINE_CARD_TIER_PALETTES[tier ?? TOUCHLINE_CARD_STARTING_TIER_KEY];
}

export type TouchlineCardCompetitionPhase = "preseason" | "ranked";

export const TOUCHLINE_CARD_COMPETITION_PHASE: TouchlineCardCompetitionPhase = "preseason";
export const TOUCHLINE_CARD_STARTING_TIER_KEY: TouchlineCardTierKey = "ruby-red";

export type TouchlineCardTier = {
  key: TouchlineCardTierKey;
  label: string;
  retailPriceTc: number;
  frameUrl: string;
  material: string;
};

/** @deprecated Use TouchlineCardTier. Kept temporarily for older imports. */
export type TouchlineMarketTier = TouchlineCardTier;

export const TOUCHLINE_CARD_PRICE_TABLE_VERSION = PLAYER_MARKET_TIER_POLICY_VERSION;

function approvedMarketPrice(tierKey: TouchlineCardTierKey) {
  const tier = PLAYER_MARKET_TIERS.find((candidate) => candidate.id === tierKey);
  if (!tier) throw new Error(`Missing approved market-value tier: ${tierKey}`);
  return tier.touchCreditPrice;
}

export const TOUCHLINE_ARENA_MARKET_TIERS: TouchlineCardTier[] = [
  {
    key: "diamond-gold",
    label: "Diamond Gold",
    retailPriceTc: approvedMarketPrice("diamond-gold"),
    frameUrl: "/touchlineArena/frames/market-tiers/diamond-gold.png",
    material: "gold diamond premium frame",
  },
  {
    key: "clear-diamond",
    label: "Clear Diamond",
    retailPriceTc: approvedMarketPrice("clear-diamond"),
    frameUrl: "/touchlineArena/frames/market-tiers/clear-diamond.png",
    material: "clear diamond frame",
  },
  {
    key: "emerald-green",
    label: "Emerald Green",
    retailPriceTc: approvedMarketPrice("emerald-green"),
    frameUrl: "/touchlineArena/frames/market-tiers/emerald-green.png",
    material: "emerald and gold frame",
  },
  {
    key: "radiant-gold",
    label: "Radiant Gold",
    retailPriceTc: approvedMarketPrice("radiant-gold"),
    frameUrl: "/touchlineArena/frames/market-tiers/radiant-gold.png",
    material: "radiant gold frame",
  },
  {
    key: "amethyst-purple",
    label: "Amethyst Purple",
    retailPriceTc: approvedMarketPrice("amethyst-purple"),
    frameUrl: "/touchlineArena/frames/market-tiers/amethyst-purple.png",
    material: "amethyst purple frame",
  },
  {
    key: "sapphire-blue",
    label: "Sapphire Blue",
    retailPriceTc: approvedMarketPrice("sapphire-blue"),
    frameUrl: "/touchlineArena/frames/market-tiers/sapphire-blue.png",
    material: "sapphire blue frame",
  },
  {
    key: "ruby-red",
    label: "Ruby Red",
    retailPriceTc: approvedMarketPrice("ruby-red"),
    frameUrl: "/touchlineArena/frames/market-tiers/ruby-red.png",
    material: "ruby red frame",
  },
];

export const TOUCHLINE_CARD_STUDIO_LAYOUT_KEY = "touchline-premier-shirt-back-card-layout-v6";
export const TOUCHLINE_CARD_STUDIO_RULES_KEY = "touchline-card-studio-rules-v1";
export const TOUCHLINE_PREMIER_MARKET_LIMIT_KEY = "touchline-premier-market-limit-v1";
export const TOUCHLINE_PREMIER_MARKET_CONTRACTED_KEY = "touchline-premier-market-contracted-v1";
export const TOUCHLINE_ARENA_LINEUP_STORAGE_KEY = "touchline-arena:field-lineup-v1";
export const TOUCHLINE_ARENA_EDITOR_LINEUP_STORAGE_KEY = "touchline:arena:editor:field-lineup:v1";

function encodePublicPathSegment(value: string) {
  return encodeURIComponent(value);
}

function marketTierTemplateUrls(clubFolderName: string, tiers: readonly TouchlineCardTierKey[] = TOUCHLINE_CARD_TIER_KEYS) {
  const encodedClubFolder = encodePublicPathSegment(clubFolderName);
  return Object.fromEntries(tiers.map((tier) => [tier, `/touchlineArena/cards/templates/clubs/${encodedClubFolder}/market-tiers/${tier}.png`])) as Record<string, string>;
}

const ARSENAL_FC_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Arsenal FC");
const ASTON_VILLA_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Aston Villa");
const BOURNEMOUTH_TIER_TEMPLATE_URLS = marketTierTemplateUrls("AFC Bournemouth");
const BRENTFORD_FC_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Brentford FC");
const BRIGHTON_HOVE_ALBION_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Brighton & Hove Albion");
const CHELSEA_FC_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Chelsea FC");
const COVENTRY_CITY_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Coventry City");
const CRYSTAL_PALACE_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Crystal Palace");
const EVERTON_FC_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Everton FC");
const FULHAM_FC_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Fulham FC");
const HULL_CITY_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Hull City");
const IPSWICH_TOWN_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Ipswich Town");
const LEEDS_UNITED_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Leeds United");
const LIVERPOOL_FC_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Liverpool FC");
const MANCHESTER_CITY_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Manchester City");
const MANCHESTER_UNITED_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Manchester United");
const NEWCASTLE_UNITED_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Newcastle United");
const NOTTINGHAM_FOREST_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Nottingham Forest");
const SUNDERLAND_AFC_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Sunderland AFC");
const TOTTENHAM_HOTSPUR_TIER_TEMPLATE_URLS = marketTierTemplateUrls("Tottenham Hotspur");

export function parseMarketValueEur(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value).trim().toUpperCase().replace(",", ".");
  const numberMatch = raw.match(/([\d.]+)/);
  if (!numberMatch) return 0;

  const amount = Number(numberMatch[1]);
  if (!Number.isFinite(amount)) return 0;

  if (raw.includes("B")) return Math.round(amount * 1_000_000_000);
  if (raw.includes("M")) return Math.round(amount * 1_000_000);
  if (raw.includes("K")) return Math.round(amount * 1_000);
  return Math.round(amount);
}

export function parseMarketValueEurOrNull(value?: number | string | null) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (!String(value).match(/[\d]/)) return null;
  const parsed = parseMarketValueEur(value);
  return parsed >= 0 ? parsed : null;
}

export type TouchlineMarketValueSource = "provider" | "verified-cache" | "unavailable";

/**
 * Fail-closed player economy resolver shared by every public card surface.
 * A visual tier alone is never evidence of price: only an authoritative
 * provider value (or its verified cache) may expose a tier or TC price.
 */
export function resolveTouchlineVerifiedPlayerEconomy(input: {
  marketValue: number | string | null | undefined;
  marketValueSource?: TouchlineMarketValueSource | null;
}) {
  const source = input.marketValueSource ?? "unavailable";
  if (source !== "provider" && source !== "verified-cache") {
    return {
      status: "unavailable" as const,
      marketValueEur: null,
      tier: null,
      tierKey: null,
      priceTc: null,
    };
  }

  const marketValueEur = parseMarketValueEurOrNull(input.marketValue);
  const resolution = resolvePlayerMarketTier(marketValueEur);
  if (resolution.status === "unavailable") {
    return {
      status: "unavailable" as const,
      marketValueEur: null,
      tier: null,
      tierKey: null,
      priceTc: null,
    };
  }

  return {
    status: "resolved" as const,
    marketValueEur: resolution.marketValueEur,
    tier: resolution.tier,
    tierKey: resolution.tier.id,
    priceTc: resolution.tier.touchCreditPrice,
  };
}

export function touchlineArenaTierForKey(key?: string | null) {
  return TOUCHLINE_ARENA_MARKET_TIERS.find((tier) => tier.key === key) || null;
}

/**
 * Compatibility resolver for older callers. Player-card color and price are
 * economic attributes supplied by the authoritative market-value inventory;
 * sporting rank and TL Points never change this tier.
 */
export function touchlineArenaCompetitionTierForCard(marketTierKey?: TouchlineCardTierKey | null) {
  return touchlineArenaTierForKey(marketTierKey)
    || touchlineArenaTierForKey(TOUCHLINE_CARD_STARTING_TIER_KEY)!;
}

const TOUCHLINE_CLUB_CARD_TEMPLATES: Array<{ match: string[]; tierTemplateUrls: Record<string, string> }> = [
  { match: ["arsenal fc", "arsenal"], tierTemplateUrls: ARSENAL_FC_TIER_TEMPLATE_URLS },
  { match: ["aston villa"], tierTemplateUrls: ASTON_VILLA_TIER_TEMPLATE_URLS },
  { match: ["afc bournemouth", "bournemouth"], tierTemplateUrls: BOURNEMOUTH_TIER_TEMPLATE_URLS },
  { match: ["brentford fc", "brentford"], tierTemplateUrls: BRENTFORD_FC_TIER_TEMPLATE_URLS },
  { match: ["brighton & hove albion", "brighton and hove albion", "brighton"], tierTemplateUrls: BRIGHTON_HOVE_ALBION_TIER_TEMPLATE_URLS },
  { match: ["chelsea fc", "chelsea"], tierTemplateUrls: CHELSEA_FC_TIER_TEMPLATE_URLS },
  { match: ["coventry city", "coventry"], tierTemplateUrls: COVENTRY_CITY_TIER_TEMPLATE_URLS },
  { match: ["crystal palace"], tierTemplateUrls: CRYSTAL_PALACE_TIER_TEMPLATE_URLS },
  { match: ["everton fc", "everton"], tierTemplateUrls: EVERTON_FC_TIER_TEMPLATE_URLS },
  { match: ["fulham fc", "fulham"], tierTemplateUrls: FULHAM_FC_TIER_TEMPLATE_URLS },
  { match: ["hull city"], tierTemplateUrls: HULL_CITY_TIER_TEMPLATE_URLS },
  { match: ["ipswich town", "ipswich"], tierTemplateUrls: IPSWICH_TOWN_TIER_TEMPLATE_URLS },
  { match: ["leeds united", "leeds"], tierTemplateUrls: LEEDS_UNITED_TIER_TEMPLATE_URLS },
  { match: ["liverpool fc", "liverpool"], tierTemplateUrls: LIVERPOOL_FC_TIER_TEMPLATE_URLS },
  { match: ["manchester city"], tierTemplateUrls: MANCHESTER_CITY_TIER_TEMPLATE_URLS },
  { match: ["manchester united", "manchester utd", "man united", "man utd"], tierTemplateUrls: MANCHESTER_UNITED_TIER_TEMPLATE_URLS },
  { match: ["newcastle united"], tierTemplateUrls: NEWCASTLE_UNITED_TIER_TEMPLATE_URLS },
  { match: ["nottingham forest"], tierTemplateUrls: NOTTINGHAM_FOREST_TIER_TEMPLATE_URLS },
  { match: ["sunderland afc", "sunderland"], tierTemplateUrls: SUNDERLAND_AFC_TIER_TEMPLATE_URLS },
  { match: ["tottenham hotspur", "tottenham", "spurs"], tierTemplateUrls: TOTTENHAM_HOTSPUR_TIER_TEMPLATE_URLS },
];

export function touchlineArenaClubTemplateForCard(
  clubName?: string | null,
  _value?: number | string | null,
  tierKey?: TouchlineCardTierKey | null,
) {
  const club = String(clubName || "").trim().toLowerCase();
  const clubTemplate = TOUCHLINE_CLUB_CARD_TEMPLATES.find((item) => item.match.some((name) => club.includes(name)));
  if (clubTemplate) {
    const resolvedTierKey = touchlineArenaCompetitionTierForCard(tierKey).key;
    return clubTemplate.tierTemplateUrls[resolvedTierKey] || null;
  }

  return null;
}

export function touchlineArenaClubTemplateForTierPreview(
  clubName?: string | null,
  tierKey?: TouchlineCardTierKey | null,
) {
  const club = String(clubName || "").trim().toLowerCase();
  const clubTemplate = TOUCHLINE_CLUB_CARD_TEMPLATES.find((item) => item.match.some((name) => club.includes(name)));
  const previewTier = touchlineArenaTierForKey(tierKey);
  if (!clubTemplate || !previewTier) return null;
  return clubTemplate.tierTemplateUrls[previewTier.key] || null;
}

export function touchlineArenaCardRetailPriceTc(
  tierKey?: TouchlineCardTierKey | null,
  _marketValue?: number | string | null,
) {
  return touchlineArenaCompetitionTierForCard(tierKey).retailPriceTc;
}

export function formatTouchlineCardPrice(priceTc: number) {
  const amount = new Intl.NumberFormat("en-IE", {
    maximumFractionDigits: 0,
  }).format(priceTc);
  return `${amount} TC`;
}

export function touchlineArenaCardPrice(
  value?: number | string | null,
  tierKey?: TouchlineCardTierKey | null,
) {
  return formatTouchlineCardPrice(touchlineArenaCardRetailPriceTc(tierKey, value));
}
