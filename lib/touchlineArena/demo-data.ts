import type { TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  touchlineArenaClubTemplateForCard,
  touchlineArenaCompetitionTierForCard,
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "./card-rules.ts";
import { resolveTouchlineContractedCommercialCardPrice } from "./commercial-card-pricing.ts";
import { touchlineClubOwnerBasePath } from "./club-owner-routes.ts";
import type { TouchlinePublicEditorialCardPresentation } from "./editorial-card-profile.ts";

export { TOUCHLINE_CARD_STUDIO_LAYOUT_KEY };

export type TouchLineClubVisual = {
  teamId: string;
  name: string;
  slug: string;
  shortCode: string;
  logoUrl?: string;
  accent: string;
  secondaryAccent: string;
  aliases: string[];
  shopUrl?: string;
  sponsorSlots: number;
  licenseStatus: "provider-cached" | "partner-approved" | "fallback";
};

export type ClubOwnerSquadCard = {
  id: string;
  /** Canonical TouchLine UUID when the persisted public roster has resolved it. */
  canonicalPlayerId?: string | null;
  name: string;
  shortName: string;
  role: string;
  position: string;
  clubName: string;
  shirtNumber: number | null;
  countryCode3: string;
  marketValue: string;
  marketValueSource?: "provider" | "verified-cache" | "unavailable";
  /** Server-owned public state; absence retains the existing legacy card path. */
  marketValueState?: "verified" | "pending" | "unavailable" | "error";
  classificationState?: "verified" | "pending" | "unavailable" | "error";
  cardTier?: TouchlineCardTierKey;
  cardPriceVersion?: string;
  /** Present only for a roster read from an active server-side card contract. */
  cardPriceAuthority?: "active-contract";
  /** Public-safe manual card profile. Internal editorial fields never enter this DTO. */
  editorialCard?: TouchlinePublicEditorialCardPresentation | null;
  inventoryId?: string | null;
  touchlinePoints: number;
};

export type TouchLineClubOwnerStanding = {
  id: string;
  rank: number;
  name: string;
  clubName: string;
  countryCode3: string;
  squadCount: number;
  touchlinePoints: number;
  squadValueTc: number;
  avatarUrl?: string;
  profileHref?: string;
};

export type TouchLineEnglandClubStanding = {
  club: TouchLineClubVisual;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  touchlinePoints: number;
  cardCount: number;
  clubValue: number;
};

export type TouchLineClubHonour = {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  tone: "gold" | "silver" | "blue" | "green";
  avatar: "european-cup" | "league-crown" | "fa-cup" | "league-cup" | "shield" | "world-crown";
  imageUrl?: string;
};

export const TOUCHLINE_ENGLAND_CLUBS: TouchLineClubVisual[] = [
  { teamId: "19", name: "Arsenal FC", slug: "arsenal", shortCode: "ARS", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png", accent: "#e30613", secondaryAccent: "#f6d45f", aliases: ["arsenal", "arsenal fc"], shopUrl: "https://arsenaldirect.arsenal.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "15", name: "Aston Villa", slug: "aston-villa", shortCode: "AVL", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/aston-villa.png", accent: "#670e36", secondaryAccent: "#95c9ef", aliases: ["aston villa", "villa"], shopUrl: "https://shop.avfc.co.uk/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "52", name: "AFC Bournemouth", slug: "bournemouth", shortCode: "BOU", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/bournemouth.png", accent: "#d71920", secondaryAccent: "#050505", aliases: ["bournemouth", "afc bournemouth"], shopUrl: "https://superstore.afcb.co.uk/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "236", name: "Brentford FC", slug: "brentford", shortCode: "BRE", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/brentford.png", accent: "#e30613", secondaryAccent: "#ffffff", aliases: ["brentford", "brentford fc"], shopUrl: "https://shop.brentfordfc.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "78", name: "Brighton & Hove Albion", slug: "brighton", shortCode: "BHA", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/brighton.png", accent: "#0057b8", secondaryAccent: "#ffffff", aliases: ["brighton", "brighton and hove albion", "brighton & hove albion"], shopUrl: "https://shop.brightonandhovealbion.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "18", name: "Chelsea FC", slug: "chelsea", shortCode: "CHE", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/chelsea.png", accent: "#034694", secondaryAccent: "#ffffff", aliases: ["chelsea", "chelsea fc"], shopUrl: "https://www.chelseamegastore.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "117", name: "Coventry City", slug: "coventry-city", shortCode: "COV", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/coventry-city.png", accent: "#74c7ee", secondaryAccent: "#ffffff", aliases: ["coventry", "coventry city"], shopUrl: "https://www.ccfcstore.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "51", name: "Crystal Palace", slug: "crystal-palace", shortCode: "CRY", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/crystal-palace.png", accent: "#1b458f", secondaryAccent: "#c4122e", aliases: ["crystal palace", "palace"], shopUrl: "https://shop.cpfc.co.uk/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "13", name: "Everton FC", slug: "everton", shortCode: "EVE", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/everton.png", accent: "#003399", secondaryAccent: "#ffffff", aliases: ["everton", "everton fc"], shopUrl: "https://evertondirect.evertonfc.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "11", name: "Fulham FC", slug: "fulham", shortCode: "FUL", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/fulham.png", accent: "#ffffff", secondaryAccent: "#0b0b0b", aliases: ["fulham", "fulham fc"], shopUrl: "https://shop.fulhamfc.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "22", name: "Hull City", slug: "hull-city", shortCode: "HUL", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/hull-city.png", accent: "#f28c00", secondaryAccent: "#111111", aliases: ["hull", "hull city"], shopUrl: "https://www.wearehullcity.co.uk/store/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "116", name: "Ipswich Town", slug: "ipswich-town", shortCode: "IPS", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/ipswich-town.png", accent: "#0057b8", secondaryAccent: "#ffffff", aliases: ["ipswich", "ipswich town"], shopUrl: "https://shop.itfc.co.uk/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "71", name: "Leeds United", slug: "leeds-united", shortCode: "LEE", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/leeds-united.png", accent: "#ffffff", secondaryAccent: "#1d5dbf", aliases: ["leeds", "leeds united"], shopUrl: "https://shop.leedsunited.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "8", name: "Liverpool FC", slug: "liverpool", shortCode: "LIV", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/liverpool.png", accent: "#c8102e", secondaryAccent: "#f6eb61", aliases: ["liverpool", "liverpool fc"], shopUrl: "https://store.liverpoolfc.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "9", name: "Manchester City", slug: "manchester-city", shortCode: "MCI", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-city.png", accent: "#6cabdd", secondaryAccent: "#1c2c5b", aliases: ["manchester city", "man city", "mancity"], shopUrl: "https://shop.mancity.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "14", name: "Manchester United", slug: "manchester-united", shortCode: "MUN", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-united.png", accent: "#da020e", secondaryAccent: "#fbe122", aliases: ["manchester united", "man united", "man utd", "manutd"], shopUrl: "https://store.manutd.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "20", name: "Newcastle United", slug: "newcastle-united", shortCode: "NEW", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/newcastle-united.png", accent: "#ffffff", secondaryAccent: "#111111", aliases: ["newcastle", "newcastle united"], shopUrl: "https://shop.newcastleunited.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "63", name: "Nottingham Forest", slug: "nottingham-forest", shortCode: "NFO", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/nottingham-forest.png", accent: "#dd0000", secondaryAccent: "#ffffff", aliases: ["nottingham forest", "forest"], shopUrl: "https://shop.nottinghamforest.co.uk/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "3", name: "Sunderland AFC", slug: "sunderland", shortCode: "SUN", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/sunderland.png", accent: "#e30613", secondaryAccent: "#ffffff", aliases: ["sunderland", "sunderland afc"], shopUrl: "https://www.safcstore.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
  { teamId: "6", name: "Tottenham Hotspur", slug: "tottenham-hotspur", shortCode: "TOT", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/tottenham-hotspur.png", accent: "#ffffff", secondaryAccent: "#132257", aliases: ["tottenham", "tottenham hotspur", "spurs"], shopUrl: "https://shop.tottenhamhotspur.com/", sponsorSlots: 3, licenseStatus: "provider-cached" },
];

export const TOUCHLINE_CLUB_RANK: Record<string, number> = {
  MCI: 1,
  ARS: 2,
  LIV: 3,
  CHE: 4,
  MUN: 5,
  TOT: 6,
  NEW: 7,
  AVL: 8,
  BHA: 9,
  BOU: 10,
  CRY: 11,
  EVE: 12,
  BRE: 13,
  FUL: 14,
  NFO: 15,
  LEE: 16,
  SUN: 17,
  IPS: 18,
  COV: 19,
  HUL: 20,
};

export const TOUCHLINE_ENGLAND_CLUBS_BY_RANK = [...TOUCHLINE_ENGLAND_CLUBS].sort(
  (a, b) => (TOUCHLINE_CLUB_RANK[a.shortCode] ?? 99) - (TOUCHLINE_CLUB_RANK[b.shortCode] ?? 99),
);

export const TOUCHLINE_CLUB_HONOURS: Record<string, TouchLineClubHonour[]> = {
  CHE: [
    { id: "ucl", label: "Champions League", shortLabel: "Europe", count: 2, tone: "silver", avatar: "european-cup", imageUrl: "/touchlineArena/trophies/club-honours/chelsea/champions-league-trophy.png" },
    { id: "eng", label: "English Champions", shortLabel: "England", count: 6, tone: "gold", avatar: "league-crown", imageUrl: "/touchlineArena/trophies/club-honours/chelsea/english-league-champions-trophy.png" },
    { id: "fac", label: "FA Cup", shortLabel: "FA Cup", count: 8, tone: "blue", avatar: "fa-cup", imageUrl: "/touchlineArena/trophies/club-honours/chelsea/fa-cup-trophy.png" },
    { id: "efl", label: "League Cup", shortLabel: "League Cup", count: 5, tone: "green", avatar: "league-cup", imageUrl: "/touchlineArena/trophies/club-honours/chelsea/english-league-cup-trophy.png" },
    { id: "uel", label: "Europa League", shortLabel: "Europa", count: 2, tone: "silver", avatar: "european-cup", imageUrl: "/touchlineArena/trophies/club-honours/chelsea/europa-league-trophy.png" },
    { id: "world", label: "Club World Champion", shortLabel: "World", count: 1, tone: "gold", avatar: "world-crown", imageUrl: "/touchlineArena/trophies/club-honours/chelsea/fifa-club-world-cup-trophy.png" },
  ],
  MCI: [
    { id: "ucl", label: "Champions League", shortLabel: "Europe", count: 1, tone: "silver", avatar: "european-cup", imageUrl: "/touchlineArena/trophies/club-honours/manchester-city/champions-league-trophy.png" },
    { id: "eng", label: "English Champions", shortLabel: "England", count: 10, tone: "gold", avatar: "league-crown", imageUrl: "/touchlineArena/trophies/club-honours/manchester-city/english-league-champions-trophy.png" },
    { id: "fac", label: "FA Cup", shortLabel: "FA Cup", count: 8, tone: "blue", avatar: "fa-cup", imageUrl: "/touchlineArena/trophies/club-honours/manchester-city/fa-cup-trophy.png" },
    { id: "efl", label: "League Cup", shortLabel: "League Cup", count: 9, tone: "green", avatar: "league-cup", imageUrl: "/touchlineArena/trophies/club-honours/manchester-city/english-league-cup-trophy.png" },
    { id: "shield", label: "Community Shield", shortLabel: "Shield", count: 7, tone: "silver", avatar: "shield", imageUrl: "/touchlineArena/trophies/club-honours/manchester-city/community-shield-trophy.png" },
    { id: "world", label: "Club World Champion", shortLabel: "World", count: 1, tone: "gold", avatar: "world-crown", imageUrl: "/touchlineArena/trophies/club-honours/manchester-city/fifa-club-world-cup-trophy.png" },
  ],
};

const CLUB_OWNER_SQUAD_IDENTITIES: Array<Omit<ClubOwnerSquadCard, "marketValue" | "marketValueSource">> = [
  { id: "haaland", name: "Erling Haaland", shortName: "Haaland", role: "forward", position: "ST", clubName: "Manchester City", shirtNumber: 9, countryCode3: "NOR", touchlinePoints: 0 },
  { id: "saka", name: "Bukayo Saka", shortName: "Saka", role: "forward", position: "RW", clubName: "Arsenal FC", shirtNumber: 7, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "rodri", name: "Rodri", shortName: "Rodri", role: "midfielder", position: "DM", clubName: "Manchester City", shirtNumber: 16, countryCode3: "ESP", touchlinePoints: 0 },
  { id: "palmer", name: "Cole Palmer", shortName: "Palmer", role: "midfielder", position: "AM", clubName: "Chelsea FC", shirtNumber: 10, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "rice", name: "Declan Rice", shortName: "Rice", role: "midfielder", position: "DM", clubName: "Arsenal FC", shirtNumber: 41, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "foden", name: "Phil Foden", shortName: "Foden", role: "midfielder", position: "AM", clubName: "Manchester City", shirtNumber: 47, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "isak", name: "Alexander Isak", shortName: "Isak", role: "forward", position: "ST", clubName: "Newcastle United", shirtNumber: 14, countryCode3: "SWE", touchlinePoints: 0 },
  { id: "saliba", name: "William Saliba", shortName: "Saliba", role: "defender", position: "CB", clubName: "Arsenal FC", shirtNumber: 2, countryCode3: "FRA", touchlinePoints: 0 },
  { id: "gabriel", name: "Gabriel Magalhaes", shortName: "Gabriel", role: "defender", position: "CB", clubName: "Arsenal FC", shirtNumber: 6, countryCode3: "BRA", touchlinePoints: 0 },
  { id: "gvardiol", name: "Josko Gvardiol", shortName: "Gvardiol", role: "defender", position: "LB", clubName: "Manchester City", shirtNumber: 24, countryCode3: "CRO", touchlinePoints: 0 },
  { id: "bruno-g", name: "Bruno Guimaraes", shortName: "Bruno G.", role: "midfielder", position: "CM", clubName: "Newcastle United", shirtNumber: 39, countryCode3: "BRA", touchlinePoints: 0 },
  { id: "trent", name: "Trent Alexander-Arnold", shortName: "Trent", role: "defender", position: "RB", clubName: "Liverpool FC", shirtNumber: 66, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "bruno-fernandes", name: "Bruno Fernandes", shortName: "B. Fernandes", role: "midfielder", position: "AM", clubName: "Manchester United", shirtNumber: 8, countryCode3: "POR", touchlinePoints: 0 },
  { id: "konate", name: "Ibrahima Konate", shortName: "Konate", role: "defender", position: "CB", clubName: "Liverpool FC", shirtNumber: 5, countryCode3: "FRA", touchlinePoints: 0 },
  { id: "gordon", name: "Anthony Gordon", shortName: "Gordon", role: "forward", position: "LW", clubName: "Newcastle United", shirtNumber: 10, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "eze", name: "Eberechi Eze", shortName: "Eze", role: "midfielder", position: "AM", clubName: "Crystal Palace", shirtNumber: 10, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "mainoo", name: "Kobbie Mainoo", shortName: "Mainoo", role: "midfielder", position: "CM", clubName: "Manchester United", shirtNumber: 37, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "salah", name: "Mohamed Salah", shortName: "Salah", role: "forward", position: "RW", clubName: "Liverpool FC", shirtNumber: 11, countryCode3: "EGY", touchlinePoints: 0 },
  { id: "watkins", name: "Ollie Watkins", shortName: "Watkins", role: "forward", position: "ST", clubName: "Aston Villa", shirtNumber: 11, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "mbeumo", name: "Bryan Mbeumo", shortName: "Mbeumo", role: "forward", position: "RW", clubName: "Brentford FC", shirtNumber: 19, countryCode3: "CMR", touchlinePoints: 0 },
  { id: "mitoma", name: "Kaoru Mitoma", shortName: "Mitoma", role: "forward", position: "LW", clubName: "Brighton & Hove Albion", shirtNumber: 22, countryCode3: "JPN", touchlinePoints: 0 },
  { id: "rogers", name: "Morgan Rogers", shortName: "Rogers", role: "midfielder", position: "AM", clubName: "Aston Villa", shirtNumber: 27, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "son", name: "Son Heung-min", shortName: "Son", role: "forward", position: "LW", clubName: "Tottenham Hotspur", shirtNumber: 7, countryCode3: "KOR", touchlinePoints: 0 },
  { id: "guehi", name: "Marc Guehi", shortName: "Guehi", role: "defender", position: "CB", clubName: "Crystal Palace", shirtNumber: 6, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "raya", name: "David Raya", shortName: "Raya", role: "goalkeeper", position: "GK", clubName: "Arsenal FC", shirtNumber: 22, countryCode3: "ESP", touchlinePoints: 0 },
  { id: "murillo", name: "Murillo", shortName: "Murillo", role: "defender", position: "CB", clubName: "Nottingham Forest", shirtNumber: 5, countryCode3: "BRA", touchlinePoints: 0 },
  { id: "reece-james", name: "Reece James", shortName: "R. James", role: "defender", position: "RB", clubName: "Chelsea FC", shirtNumber: 24, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "alisson", name: "Alisson Becker", shortName: "Alisson", role: "goalkeeper", position: "GK", clubName: "Liverpool FC", shirtNumber: 1, countryCode3: "BRA", touchlinePoints: 0 },
  { id: "ederson", name: "Ederson", shortName: "Ederson", role: "goalkeeper", position: "GK", clubName: "Manchester City", shirtNumber: 31, countryCode3: "BRA", touchlinePoints: 0 },
  { id: "van-dijk", name: "Virgil van Dijk", shortName: "Van Dijk", role: "defender", position: "CB", clubName: "Liverpool FC", shirtNumber: 4, countryCode3: "NED", touchlinePoints: 0 },
  { id: "botman", name: "Sven Botman", shortName: "Botman", role: "defender", position: "CB", clubName: "Newcastle United", shirtNumber: 4, countryCode3: "NED", touchlinePoints: 0 },
  { id: "robinson", name: "Antonee Robinson", shortName: "Robinson", role: "defender", position: "LB", clubName: "Fulham FC", shirtNumber: 33, countryCode3: "USA", touchlinePoints: 0 },
  { id: "adams", name: "Tyler Adams", shortName: "Adams", role: "midfielder", position: "DM", clubName: "AFC Bournemouth", shirtNumber: 12, countryCode3: "USA", touchlinePoints: 0 },
  { id: "archer", name: "Cameron Archer", shortName: "Archer", role: "forward", position: "ST", clubName: "Sunderland AFC", shirtNumber: 19, countryCode3: "ENG", touchlinePoints: 0 },
  { id: "caicedo", name: "Moises Caicedo", shortName: "Caicedo", role: "midfielder", position: "DM", clubName: "Chelsea FC", shirtNumber: 25, countryCode3: "ECU", touchlinePoints: 0 },
];

export const CLUB_OWNER_SQUAD_CARDS: ClubOwnerSquadCard[] = CLUB_OWNER_SQUAD_IDENTITIES.map((card) => ({
  ...card,
  // Compatibility-only legacy field. Public card surfaces never present it.
  marketValue: "",
  marketValueSource: "unavailable",
}));

export function normalizeTouchLineClubKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findTouchLineClub(value?: string | null) {
  const key = normalizeTouchLineClubKey(value);
  return TOUCHLINE_ENGLAND_CLUBS.find((club) => {
    if (club.slug === key || normalizeTouchLineClubKey(club.name) === key || normalizeTouchLineClubKey(club.shortCode) === key) return true;
    return club.aliases.some((alias) => normalizeTouchLineClubKey(alias) === key);
  });
}

export function cardsForTouchLineClub(club: TouchLineClubVisual) {
  return CLUB_OWNER_SQUAD_CARDS.filter((card) => {
    const cardClub = findTouchLineClub(card.clubName);
    return cardClub?.teamId === club.teamId;
  }).sort(rankClubOwnerCards);
}

export function honoursForTouchLineClub(club: TouchLineClubVisual) {
  return TOUCHLINE_CLUB_HONOURS[club.shortCode] ?? [];
}

export function rankClubOwnerCards(first: ClubOwnerSquadCard, second: ClubOwnerSquadCard) {
  const pointDiff = second.touchlinePoints - first.touchlinePoints;
  if (pointDiff) return pointDiff;
  return first.clubName.localeCompare(second.clubName) || first.name.localeCompare(second.name);
}

export function clubOwnerSquadMarketValue(_cards: ClubOwnerSquadCard[] = CLUB_OWNER_SQUAD_CARDS) {
  // Kept for callers still transitioning away from the legacy shape. Market
  // value is deliberately not estimated, imported, or aggregated.
  return 0;
}

export function clubOwnerSquadTcValue(cards: ClubOwnerSquadCard[] = CLUB_OWNER_SQUAD_CARDS) {
  return cards.reduce(
    (sum, card) => {
      if (card.cardPriceAuthority === "active-contract") {
        return sum + (resolveTouchlineContractedCommercialCardPrice({
          tierKey: card.cardTier,
          priceTableVersion: card.cardPriceVersion,
          competition: "england",
        })?.numericPrice ?? 0);
      }
      return sum;
    },
    0,
  );
}

export function clubOwnerSquadTouchLinePoints(cards: ClubOwnerSquadCard[] = CLUB_OWNER_SQUAD_CARDS) {
  return cards.reduce((sum, card) => sum + card.touchlinePoints, 0);
}

export function buildDemoClubOwnerStandings(ownerCards: ClubOwnerSquadCard[] = CLUB_OWNER_SQUAD_CARDS): TouchLineClubOwnerStanding[] {
  const ownerValueTc = clubOwnerSquadTcValue(ownerCards);
  const ownerPoints = clubOwnerSquadTouchLinePoints(ownerCards);
  const demoRows: TouchLineClubOwnerStanding[] = [
    {
      id: "luiz-lopez",
      rank: 1,
      name: "Luiz Lopez",
      clubName: "Lopez TouchLine FC",
      countryCode3: "BRA",
      squadCount: ownerCards.length,
      touchlinePoints: ownerPoints,
      squadValueTc: ownerValueTc,
      avatarUrl: "/touchlineArena/club-owner/avatars/luiz-lopez-owner-avatar-v1.png",
      profileHref: touchlineClubOwnerBasePath(),
    },
    { id: "north-stand", rank: 2, name: "North Stand Elite", clubName: "North Stand FC", countryCode3: "ENG", squadCount: 35, touchlinePoints: 0, squadValueTc: 35 },
    { id: "royal-touch", rank: 3, name: "Royal Touch XI", clubName: "Royal Touch XI", countryCode3: "ENG", squadCount: 35, touchlinePoints: 0, squadValueTc: 35 },
    { id: "blue-vault", rank: 4, name: "Blue Vault", clubName: "Blue Vault FC", countryCode3: "ENG", squadCount: 34, touchlinePoints: 0, squadValueTc: 34 },
    { id: "gold-line", rank: 5, name: "Gold Line", clubName: "Gold Line FC", countryCode3: "ESP", squadCount: 33, touchlinePoints: 0, squadValueTc: 33 },
  ];

  return demoRows.sort((first, second) => {
    const pointDiff = second.touchlinePoints - first.touchlinePoints;
    if (pointDiff) return pointDiff;
    const valueDiff = second.squadValueTc - first.squadValueTc;
    if (valueDiff) return valueDiff;
    return first.name.localeCompare(second.name);
  }).map((row, index) => ({ ...row, rank: index + 1 }));
}

export function buildTouchLineEnglandClubTable(): TouchLineEnglandClubStanding[] {
  return TOUCHLINE_ENGLAND_CLUBS_BY_RANK.map((club, index) => {
    const clubCards = cardsForTouchLineClub(club);
    const touchlinePoints = clubCards.reduce((sum, card) => sum + card.touchlinePoints, 0);
    // League rows never infer or publish a club valuation.
    const clubValue = 0;

    return {
      club,
      rank: index + 1,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalDifference: 0,
      touchlinePoints,
      cardCount: clubCards.length,
      clubValue,
    };
  });
}

export function formatCompactEuro(value: number) {
  if (value >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(value % 1_000_000_000 ? 1 : 0)}B`;
  return `€${Math.round(value / 1_000_000)}M`;
}

export function squadCardToExactPlayer(
  card: ClubOwnerSquadCard,
  _options?: { useSuppliedTier?: boolean },
): TouchlineEliteExactPlayer {
  const club = findTouchLineClub(card.clubName);
  // This bridge is imported by browser components, so it accepts an already
  // sanitised public editorial presentation only. The raw editorial catalogue
  // stays server-only and is never imported here.
  const editorialCard = card.editorialCard ?? null;
  const contractedTier = card.cardPriceAuthority === "active-contract"
    ? touchlineArenaTierForKey(card.cardTier)?.key ?? null
    : null;
  const cardTier = editorialCard?.tierKey ?? contractedTier;

  return {
    sportmonksPlayerId: card.id,
    formationPlayerId: card.id,
    overall: card.shirtNumber ?? "--",
    shirtNumber: card.shirtNumber,
    role: card.role,
    position: card.position,
    countryCode3: card.countryCode3,
    name: card.name,
    clubName: card.clubName,
    clubLogoUrl: club?.logoUrl ?? null,
    leagueName: "TouchLine England",
    // Public card presentation no longer consumes a player valuation. These
    // compatibility fields remain neutral while older consumers migrate to
    // the editorial profile.
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier,
    cardPriceVersion: card.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    cardPriceAuthority: card.cardPriceAuthority,
    updatedAt: "TouchLine Season 2026/27",
    age: "--",
    height: "--",
    foot: "--",
    contract: "ClubOwner contract",
    nationality: card.countryCode3,
    editorialCard,
    // Keep the pre-existing club artwork as a presentation fallback while an
    // editorial profile is still unpublished. `cardTier` and price remain
    // null in that state, so this asset cannot imply a commercial tier.
    cardTemplateUrl: touchlineArenaClubTemplateForCard(card.clubName, null, cardTier) || null,
    fantasyPoints: card.touchlinePoints,
  };
}
