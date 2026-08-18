"use client";

/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction, type SyntheticEvent } from "react";
import { ArrowUpDown, Check, ChevronDown, FastForward, Handshake, Menu, Radio, RotateCw, Search, UserRound, X } from "lucide-react";
import TouchlineEliteExactCard, { touchlineLiveCompactFrameUrl, type TouchlineEliteExactCardLabels, type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import { TouchlineCardZoomDetailsPanel, type TouchlineCardZoomDetails } from "@/components/touchline/cards/TouchlineCardZoom";
import TouchlineCoachCard, { touchlineLiveCompactCoachFrameUrl } from "@/components/touchline/cards/TouchlineCoachCard";
import TouchlineSubstitutionMark from "@/components/touchline/TouchlineSubstitutionMark";
import TouchlineArenaIntro from "@/components/touchline/arena/TouchlineArenaIntro";
import TouchlinePitchSurface from "@/components/touchline/pitch/TouchlinePitchSurface";
import { TouchlineCoinMark, TouchlineSelectedPlayersMark } from "@/components/touchline/market/TouchlineMarketMarks";
import TouchlineSquadBuilderStage from "@/components/touchline/market/TouchlineSquadBuilderStage";
import {
  buildArenaPlayersFromFantasyLineup,
  findApprovedArenaAsset,
  inferArenaRole,
  normalizeOfficialShirtNumber,
  type ArenaLineupPlayer,
} from "@/lib/football-data/arena-lineup";
import type { TouchlineFixture } from "@/lib/football-data/types";
import type {
  TouchlinePublicFantasyFixtureFeed,
  TouchlinePublicFantasyLineupMember,
} from "@/lib/football-data/public-fantasy-fixture";
import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  touchlineArenaClubTemplateForCard,
  touchlineArenaClubTemplateForTierPreview,
  touchlineArenaCompetitionTierForCard,
  touchlineArenaTierForKey,
  TOUCHLINE_CARD_TIER_KEYS,
  touchlineCardTierPalette,
  touchlineCardTierName,
  type TouchlineCardTierKey,
} from "@/lib/touchlineArena/card-rules";
import {
  formatTouchlineCommercialCardTotal,
  formatTouchlineContractedCommercialCardPrice,
} from "@/lib/touchlineArena/commercial-card-pricing";
import {
  CLUB_OWNER_SQUAD_CARDS,
  buildDemoClubOwnerStandings,
  clubOwnerSquadTcValue,
  findTouchLineClub,
  rankClubOwnerCards,
  squadCardToExactPlayer,
  type ClubOwnerSquadCard,
} from "@/lib/touchlineArena/demo-data";
import {
  canonicalClubOwnerRosterCard,
  readBrowserClubOwnerRoster,
  uniqueClubOwnerRosterCards,
  writeBrowserClubOwnerRoster,
} from "@/lib/touchlineArena/club-owner-roster";
import { orderTouchlineBenchByPosition } from "@/lib/touchlineArena/bench-presentation";
import { quoteTouchlineMarketCart, type TouchlineMarketCartErrorCode } from "@/lib/touchlineArena/market-cart";
import {
  normalizeTouchlineMarketInventoryId,
  parseTouchlineMarketInventorySnapshot,
  type TouchlineMarketInventorySnapshot,
} from "@/lib/touchlineArena/market-inventory";
import { resolveTouchlineMarketCardReadModel } from "@/lib/touchlineArena/market-read-model";
import {
  TOUCHLINE_DEFAULT_LOCALE,
  TOUCHLINE_LOCALE_STORAGE_KEY,
  TOUCHLINE_SUPPORTED_LOCALES,
  isTouchLineLocaleComplete,
  normalizeTouchLineLocale,
  touchLineT,
  type TouchLineLocale,
  type TouchLineTranslationKey,
} from "@/lib/touchlineArena/i18n";
import { touchLineAuthEntryHref } from "@/lib/touchlineArena/auth-i18n";
import { getTouchLineMarketCopy } from "@/lib/touchlineArena/market-i18n";
import { TOUCHLINE_SQUAD_RULES } from "@/lib/touchlineArena/squad-rules";
import { resolveTouchlineQuickSubstitutionReadiness } from "@/lib/touchlineArena/quick-substitution-readiness";
import {
  applyTouchlineQuickSubstitutionSession,
  createTouchlineQuickSubstitutionSession,
  restoreTouchlineQuickSubstitutionSession,
  type TouchlineQuickSubstitutionSessionState,
} from "@/lib/touchlineArena/quick-substitution-session";
import {
  TOUCHLINE_MARKET_POSITION_LIMITS,
  TOUCHLINE_MARKET_POSITION_SEQUENCE,
  touchlineMarketPositionBucket,
  touchlineMarketPositionBucketCount,
  touchlineMarketPositionBucketLabel,
  touchlineTwoStrikerFormationHint,
  type TouchlineMarketPositionBucket,
} from "@/lib/touchlineArena/position-eligibility";
import {
  normalizeTouchlineCountryCode3,
  touchlineCountryFlagUrl,
} from "@/lib/touchlineArena/country-flags";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { createTouchlineArenaCoachSlot, TOUCHLINE_DEMO_COACH } from "@/lib/touchlineArena/coach-card";
import { TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT } from "@/lib/touchlineArena/coach-card-layout";
import type { TouchlineCompetitionCardOffer } from "@/lib/touchlineArena/competition-card-offer";
import {
  TOUCHLINE_LIVE_COACHES,
  touchlineLiveCoachForProviderId,
  touchlineLiveCoachForTeam,
} from "@/lib/touchlineArena/live-coaches";
import { selectArenaFixtureRound } from "@/lib/touchlineArena/arena-fixture-round";
import {
  buildTouchlineLiveEleven,
  normalizeTouchlineLiveSquad,
  touchlineLivePlayerIdentity,
} from "@/lib/touchlineArena/live-lineups";
import {
  parseTouchlineArenaPanel,
  touchlineArenaContractHref,
  touchlineArenaPanelHref,
  touchlineArenaPanelUrl,
  touchlineClubHubHref,
  type TouchlineArenaPanelKey,
} from "@/lib/touchlineArena/arena-navigation";
import {
  touchlineClubOwnerProfileHref,
  touchlineClubOwnerSubstitutionHref,
} from "@/lib/touchlineArena/club-owner-routes";
import { touchlinePlayerIdentityMatches } from "@/lib/touchlineArena/player-identity";
import { TOUCHLINE_SHIRT_DIGIT_ASSETS } from "@/lib/touchlineArena/shirt-number-art";
import { touchlineDemoTierForPlayer } from "@/lib/touchlineArena/demo-card-tier";
import { buildTouchlinePlayerCardZoomDetails } from "@/lib/touchlineArena/card-zoom-details";
import {
  formatTouchlineEditorialCardPrice,
  parseTouchlinePublicEditorialCardPresentation,
  type TouchlinePublicEditorialCardPresentation,
} from "@/lib/touchlineArena/editorial-card-profile";
import { exitTouchlineFullscreen, requestTouchlineFullscreen, touchlineFullscreenElement } from "@/lib/touchlineArena/fullscreen";
import {
  arenaPersistenceKeys,
  type ArenaPersistencePrincipal,
} from "@/lib/touchlineArena/arena-persistence-namespace";
import {
  createResilientBrowserId,
  getOrCreateBrowserSessionId,
  readBrowserStorage,
  removeBrowserStorage,
  writeBrowserStorage,
} from "@/lib/touchlineArena/browser-storage";
import {
  canPersistArenaAccountState,
  mergeArenaLineupInventoryFromRoster,
  reconcileArenaLineupWithAuthoritativeRoster,
  resolveArenaAccountSync,
  type ArenaAccountSyncStatus,
} from "@/lib/touchlineArena/arena-account-sync";
import { parseAuthoritativeRosterResponse } from "@/lib/touchlineArena/authoritative-roster-client";
import {
  TOUCHLINE_ARENA_ENTRY_VIDEO,
  TOUCHLINE_ARENA_INTRO_QUERY_PARAM,
  TOUCHLINE_ARENA_INTRO_STORAGE_KEY,
  TOUCHLINE_ARENA_LOOP_VIDEO,
  TOUCHLINE_ARENA_SKIP_INTRO_QUERY_PARAM,
  TOUCHLINE_ARENA_VIDEO_POSTER,
  parseTouchlineArenaIntroIntent,
  resolveTouchlineArenaIntroLaunchMode,
  type TouchlineArenaIntroIntent,
  type TouchlineArenaIntroLaunchMode,
} from "@/lib/touchlineArena/arena-intro";
import {
  arena433VideoLoopIndexForPlayback,
  arenaVideoViewportForDimensions,
  resolveArena433VideoSlots,
  type Arena433VideoLoopId,
  type ArenaVideoViewport,
} from "@/lib/touchlineArena/arena-formation-video-layout";
import formationLockSeed from "@/data/touchline-arena-formation-locks.json";

const PUBLIC_DATA_SOURCE_LABEL = "TouchLine England";
const ARENA_LIVE_DOCK_VISIBILITY_STORAGE_KEY = "touchline:arena:live-dock-visible:v1";
const ARENA_LIVE_DOCK_FIXTURE_STORAGE_KEY = "touchline:arena:live-dock-fixture:v1";
const ARENA_LIVE_FIXTURE_SNAPSHOT_STORAGE_KEY = "touchline:arena:live-fixtures:v1";
const ARENA_LIVE_SQUAD_STORAGE_PREFIX = "touchline:arena:live-squad:v2";
const ARENA_LIVE_FIXTURE_CACHE_MAX_AGE_MS = 1000 * 60 * 5;
const ARENA_LIVE_SQUAD_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const ARENA_LIVE_SQUAD_REFRESH_DEDUP_MS = 1000 * 60 * 5;
const ARENA_LIVE_SQUAD_REQUEST_SETTLE_MS = 180;
// The score rail is part of the normal Arena entry. Safari can take longer
// than a sub-second to hydrate the persisted schedule after a cold load.
const ARENA_LIVE_SCHEDULE_REQUEST_TIMEOUT_MS = 3_500;
const ARENA_LIVE_SNAPSHOT_REQUEST_TIMEOUT_MS = 4_000;
const ARENA_LIVE_VISUAL_ASSET_VERSION = "2026-07-28-1";
const ARENA_ANONYMOUS_SESSION_STORAGE_KEY = "touchline:arena:anonymous-session:v1";
const LIVE_MATCH_SIMULATION_POSITIONS = [
  { x: 8, y: 50 },
  { x: 19, y: 17 },
  { x: 20, y: 39 },
  { x: 20, y: 61 },
  { x: 19, y: 83 },
  { x: 32, y: 24 },
  { x: 34, y: 50 },
  { x: 32, y: 76 },
  { x: 45, y: 22 },
  { x: 46, y: 50 },
  { x: 45, y: 78 },
] as const;
const ARENA_PERSISTENCE_RESOURCES = {
  lineup: "lineup",
  formation: "formation",
  formationLocks: "formation-locks",
  marketWallet: "market-wallet-tc",
  coach: "coach",
  marketFormation: "market-formation-confirmation",
  marketCart: "market-contract-draft",
} as const;

type ArenaCard = NonNullable<ArenaLineupPlayer["card"]> & {
  /** Public projection only; raw editorial notes never enter the Arena. */
  editorialCard?: TouchlinePublicEditorialCardPresentation | null;
};

type ArenaPlayer = Omit<ArenaLineupPlayer, "card"> & {
  card?: ArenaCard;
};
export type ArenaPanelKey = TouchlineArenaPanelKey;

type BenchOption = {
  id: string;
  name: string;
  shortName: string;
  role: ArenaPlayer["role"];
  club: string;
  position: string;
  shirtNumber: number | null;
  marketValue: string;
  marketValueSource?: "provider" | "verified-cache" | "unavailable" | null;
  marketValueState?: ClubOwnerSquadCard["marketValueState"];
  classificationState?: ClubOwnerSquadCard["classificationState"];
  cardTier?: TouchlineCardTierKey | null;
  cardPriceVersion?: string | null;
  cardPriceAuthority?: "active-contract" | null;
  editorialCard?: TouchlinePublicEditorialCardPresentation | null;
  inventoryId?: string | null;
  countryCode3: string;
  impact: string;
  status: "ready" | "hot" | "watch" | "risk";
};

type QuickSubPointerDragState = {
  pointerId: number;
  benchId: string;
  startX: number;
  startY: number;
  active: boolean;
  timerId: number | null;
};

type ArenaClubSymbol = {
  id: string;
  fixtureId: string;
  name: string;
  shortCode: string;
  logoUrl?: string;
  accent: string;
  secondaryAccent: string;
  status: string;
  matchup: string;
};

type ArenaClubMatch = {
  id: string;
  fixtureId: string;
  home: ArenaClubSymbol;
  away: ArenaClubSymbol;
  centerLabel: string;
  status: string;
  matchup: string;
};

type FixtureClubSource = {
  providerId?: string;
  name?: string;
  shortCode?: string;
  logoUrl?: string;
};

type PremierClubVisual = {
  teamId: string;
  name: string;
  shortCode: string;
  logoUrl?: string;
  accent: string;
  secondaryAccent: string;
  aliases: string[];
};

type TeamBuilderSquadPlayer = {
  id: string;
  providerId?: string | null;
  clubTeamId?: string | null;
  name: string;
  shortName: string;
  role: ArenaPlayer["role"];
  position?: string | null;
  shirtNumber?: string | number | null;
  clubName: string;
  clubShortCode: string;
  clubLogoUrl?: string | null;
  marketValue?: string | null;
  marketValueSource?: "provider" | "verified-cache" | "unavailable" | null;
  marketValueState?: ClubOwnerSquadCard["marketValueState"];
  classificationState?: ClubOwnerSquadCard["classificationState"];
  cardTier?: TouchlineCardTierKey | null;
  cardPriceVersion?: string | null;
  cardPriceAuthority?: "active-contract" | null;
  /** Public-only editorial tier/price received from the roster projection. */
  editorialCard?: TouchlinePublicEditorialCardPresentation | null;
  countryCode3?: string | null;
  flagUrl?: string | null;
  nationality?: string | null;
  source?: string | null;
  inventoryId?: string | null;
  inventoryPriceTc?: number | null;
  inventorySupplyLimit?: number | null;
  inventorySoldCopies?: number | null;
  inventoryAvailableCopies?: number | null;
  inventoryAlreadyOwned?: boolean | null;
  inventorySource?: "supabase" | null;
  officialOffer?: TouchlineCompetitionCardOffer | null;
  marketValueEur?: number | null;
  previousMarketValueEur?: number | null;
  marketValueChangeEur?: number | null;
  marketValueUpdatedAt?: string | null;
  authoritativeMarketValueSource?: string | null;
  /** Cumulative, published TouchLine score. Missing is pending, never zero. */
  touchlinePoints?: string | number | null;
  /** Current-fixture score. Kept separate from the cumulative balance. */
  matchFantasyPoints?: string | number | null;
  /** Cumulative official statistics when they have been verified. */
  seasonStats?: TouchlineEliteExactPlayer["seasonStats"];
  /** Current-fixture statistics when supplied by the live provider. */
  matchStats?: TouchlineEliteExactPlayer["matchStats"];
};

function parseStoredMarketDraftIds(value: string | null) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((entry): entry is string => typeof entry === "string" && entry.length <= 240))];
  } catch {
    return [];
  }
}

type MarketPositionReplacementCandidate = {
  id: string;
  name: string;
  shortName: string;
  position: string;
  role: ArenaPlayer["role"];
  inventoryId?: string | null;
  location: "field" | "reserve";
};

type LiveMatchSquadsState = {
  fixtureId: string;
  home: TeamBuilderSquadPlayer[];
  away: TeamBuilderSquadPlayer[];
  status: "loading" | "ready" | "unavailable";
};

type LiveSimulationCardProduct = {
  player: TeamBuilderSquadPlayer;
  side: "home" | "away";
  slotIndex: number;
  readinessId: string;
};

type LiveProductCoachSignature = {
  teamId: string;
  cardTier: TouchlineCardTierKey;
  coachId: string;
  countryCode3: string;
};

type StoredLiveSquad = {
  teamId: string;
  savedAt: number;
  players: TeamBuilderSquadPlayer[];
};

type StoredLiveFixtureSnapshot = {
  version: 1;
  savedAt: number;
  fetchedAt: string;
  fixtures: TouchlineFixture[];
};

type TouchlineMarketCheckoutResult = {
  ok: true;
  itemCount: number;
  totalTc: number;
  balanceAfterTc: number;
};

type TouchlineMarketContractReleaseResult = {
  ok: true;
  idempotentReplay: boolean;
  cardId: string;
  contractId: string;
  status: "ended";
  activeContractCount: number;
  openContractSlots: number;
  soldCopies: number;
  availableCopies: number;
  supplyLimit: number;
  refundTc: 0;
};

type TouchlineMarketInventoryMode = "checking" | "authoritative" | "demo" | "unavailable";
type TouchlineMarketPositionFilter = "all" | ArenaPlayer["role"];
type TouchlineMarketPositionBucketFilter = "all" | TouchlineMarketPositionBucket;
type TouchlineMarketSortMode = "recommended" | "price-asc" | "price-desc" | "tier-desc" | "name";

function parseTouchlineMarketCheckoutResult(value: unknown): TouchlineMarketCheckoutResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const itemCount = Number(result.itemCount);
  const totalTc = Number(result.totalTc);
  const balanceAfterTc = Number(result.balanceAfterTc);
  if (
    result.ok !== true
    || !Number.isInteger(itemCount)
    || itemCount < 1
    || !Number.isInteger(totalTc)
    || totalTc < 0
    || !Number.isFinite(balanceAfterTc)
    || balanceAfterTc < 0
  ) return null;
  return { ok: true, itemCount, totalTc, balanceAfterTc };
}

type TouchLineArenaRumourSignal = {
  id: string;
  type: "rumor" | "confirmed_lineup" | "predicted_lineup" | "injury" | "suspension" | "absence" | "live_event" | "news" | "transfer";
  status: "rumor" | "doubt" | "confirmed" | "official" | "live" | "unavailable";
  title: string;
  summary: string;
  club?: string;
  clubId?: string;
  player?: string;
  playerId?: string;
  fixture?: string;
  fixtureId?: string;
  minute?: number;
  confidence: number;
  happenedAt?: string;
  sourceLabel: typeof PUBLIC_DATA_SOURCE_LABEL;
  trace?: {
    fixtureId?: string;
    sourceType: string;
    fetchedAt: string;
  };
};

type RumourSortMode = "recent" | "relevance";

const DEFAULT_ARENA_PLAYERS: ArenaPlayer[] = [];
const DEMO_LINEUP_QUERY_PARAM = "demoLineup";
const PREMIER_COMPETITION_IDS = new Set(["8"]);

const PREMIER_CLUB_VISUALS: PremierClubVisual[] = [
  { teamId: "19", name: "Arsenal FC", shortCode: "ARS", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/arsenal.png", accent: "#e30613", secondaryAccent: "#f6d45f", aliases: ["arsenal", "arsenal fc"] },
  { teamId: "15", name: "Aston Villa", shortCode: "AVL", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/aston-villa.png", accent: "#670e36", secondaryAccent: "#95c9ef", aliases: ["aston villa", "villa"] },
  { teamId: "52", name: "AFC Bournemouth", shortCode: "BOU", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/bournemouth.png", accent: "#d71920", secondaryAccent: "#050505", aliases: ["bournemouth", "afc bournemouth"] },
  { teamId: "236", name: "Brentford FC", shortCode: "BRE", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/brentford.png", accent: "#e30613", secondaryAccent: "#ffffff", aliases: ["brentford", "brentford fc"] },
  { teamId: "78", name: "Brighton & Hove Albion", shortCode: "BHA", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/brighton.png", accent: "#0057b8", secondaryAccent: "#ffffff", aliases: ["brighton", "brighton and hove albion", "brighton & hove albion"] },
  { teamId: "18", name: "Chelsea FC", shortCode: "CHE", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/chelsea.png", accent: "#034694", secondaryAccent: "#ffffff", aliases: ["chelsea", "chelsea fc"] },
  { teamId: "117", name: "Coventry City", shortCode: "COV", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/coventry-city.png", accent: "#74c7ee", secondaryAccent: "#ffffff", aliases: ["coventry", "coventry city"] },
  { teamId: "51", name: "Crystal Palace", shortCode: "CRY", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/crystal-palace.png", accent: "#1b458f", secondaryAccent: "#c4122e", aliases: ["crystal palace", "palace"] },
  { teamId: "13", name: "Everton FC", shortCode: "EVE", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/everton.png", accent: "#003399", secondaryAccent: "#ffffff", aliases: ["everton", "everton fc"] },
  { teamId: "11", name: "Fulham FC", shortCode: "FUL", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/fulham.png", accent: "#ffffff", secondaryAccent: "#0b0b0b", aliases: ["fulham", "fulham fc"] },
  { teamId: "22", name: "Hull City", shortCode: "HUL", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/hull-city.png", accent: "#f28c00", secondaryAccent: "#111111", aliases: ["hull", "hull city"] },
  { teamId: "116", name: "Ipswich Town", shortCode: "IPS", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/ipswich-town.png", accent: "#0057b8", secondaryAccent: "#ffffff", aliases: ["ipswich", "ipswich town"] },
  { teamId: "71", name: "Leeds United", shortCode: "LEE", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/leeds-united.png", accent: "#ffffff", secondaryAccent: "#1d5dbf", aliases: ["leeds", "leeds united"] },
  { teamId: "8", name: "Liverpool FC", shortCode: "LIV", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/liverpool.png", accent: "#c8102e", secondaryAccent: "#f6eb61", aliases: ["liverpool", "liverpool fc"] },
  { teamId: "9", name: "Manchester City", shortCode: "MCI", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-city.png", accent: "#6cabdd", secondaryAccent: "#1c2c5b", aliases: ["manchester city", "man city", "mancity"] },
  { teamId: "14", name: "Manchester United", shortCode: "MUN", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/manchester-united.png", accent: "#da020e", secondaryAccent: "#fbe122", aliases: ["manchester united", "man united", "man utd", "manutd"] },
  { teamId: "20", name: "Newcastle United", shortCode: "NEW", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/newcastle-united.png", accent: "#ffffff", secondaryAccent: "#111111", aliases: ["newcastle", "newcastle united"] },
  { teamId: "63", name: "Nottingham Forest", shortCode: "NFO", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/nottingham-forest.png", accent: "#dd0000", secondaryAccent: "#ffffff", aliases: ["nottingham forest", "forest"] },
  { teamId: "3", name: "Sunderland AFC", shortCode: "SUN", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/sunderland.png", accent: "#e30613", secondaryAccent: "#ffffff", aliases: ["sunderland", "sunderland afc"] },
  { teamId: "6", name: "Tottenham Hotspur", shortCode: "TOT", logoUrl: "/touchlineArena/shared/club-logos/2026-27/ui-512/tottenham-hotspur.png", accent: "#ffffff", secondaryAccent: "#132257", aliases: ["tottenham", "tottenham hotspur", "spurs"] },
];

const TEAM_BUILDER_CLUB_RANK: Record<string, number> = {
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

const TEAM_BUILDER_CLUBS = [...PREMIER_CLUB_VISUALS].sort(
  (a, b) => (TEAM_BUILDER_CLUB_RANK[a.shortCode] ?? 99) - (TEAM_BUILDER_CLUB_RANK[b.shortCode] ?? 99),
);

const PREMIER_CLUB_LOOKUP = new Map(
  PREMIER_CLUB_VISUALS.flatMap((club) =>
    [club.name, club.shortCode, ...club.aliases].map((alias) => [normalizeClubKey(alias), club] as const),
  ),
);

type ArenaFormationKey = "3-4-3" | "3-5-2" | "4-3-3" | "4-4-2" | "4-5-1" | "5-2-3" | "5-3-2" | "5-4-1";

type ArenaFormationDefinition = {
  key: ArenaFormationKey;
  label: string;
  defenders: number;
  midfielders: number;
  forwards: number;
};

const DEFAULT_ARENA_FORMATION_KEY: ArenaFormationKey = "4-3-3";

const ARENA_FORMATIONS: ArenaFormationDefinition[] = [
  { key: "4-3-3", label: "4-3-3", defenders: 4, midfielders: 3, forwards: 3 },
  { key: "4-4-2", label: "4-4-2", defenders: 4, midfielders: 4, forwards: 2 },
  { key: "4-5-1", label: "4-5-1", defenders: 4, midfielders: 5, forwards: 1 },
  { key: "3-4-3", label: "3-4-3", defenders: 3, midfielders: 4, forwards: 3 },
  { key: "3-5-2", label: "3-5-2", defenders: 3, midfielders: 5, forwards: 2 },
  { key: "5-2-3", label: "5-2-3", defenders: 5, midfielders: 2, forwards: 3 },
  { key: "5-3-2", label: "5-3-2", defenders: 5, midfielders: 3, forwards: 2 },
  { key: "5-4-1", label: "5-4-1", defenders: 5, midfielders: 4, forwards: 1 },
];
// Product rules live in docs/touchline-arena/rules. Update those docs before changing Arena economy, squad, navigation, or substitution behavior.
const ARENA_FORMATION_POSITION_RULES: Record<ArenaFormationKey, string> = {
  "4-3-3": "1 GK, 2 CB, 2 FB, 3 MID, 2 WING, 1 ST",
  "4-4-2": "1 GK, 2 CB, 2 FB, 2 MID, 2 WIDE, 2 ST",
  "4-5-1": "1 GK, 2 CB, 2 FB, 3 MID, 2 WIDE, 1 ST",
  "3-4-3": "1 GK, 3 CB, 2 WING-BACK, 2 MID, 2 WING, 1 ST",
  "3-5-2": "1 GK, 3 CB, 2 WING-BACK, 3 MID, 2 ST",
  "5-2-3": "1 GK, 3 CB, 2 FB, 2 MID, 2 WING, 1 ST",
  "5-3-2": "1 GK, 3 CB, 2 FB, 3 MID, 2 ST",
  "5-4-1": "1 GK, 3 CB, 2 FB, 2 MID, 2 WIDE, 1 ST",
};
const TOUCHLINE_MARKET_CARD_SUPPLY_PER_PLAYER = 1000;
const TOUCHLINE_DEMO_PROMOTIONAL_BALANCE_TC = 60;
const ARENA_FORMATION_POSITION_CAPS: Record<ArenaFormationKey, Partial<Record<ArenaPositionGroup, number>>> = {
  "4-3-3": { goalkeeper: 1, "centre-back": 2, "full-back": 2, midfield: 3, winger: 2, striker: 1 },
  "4-4-2": { goalkeeper: 1, "centre-back": 2, "full-back": 2, midfield: 2, winger: 2, striker: 2 },
  "4-5-1": { goalkeeper: 1, "centre-back": 2, "full-back": 2, midfield: 3, winger: 2, striker: 1 },
  "3-4-3": { goalkeeper: 1, "centre-back": 3, "full-back": 2, midfield: 2, winger: 2, striker: 1 },
  "3-5-2": { goalkeeper: 1, "centre-back": 3, "full-back": 2, midfield: 3, striker: 2 },
  "5-2-3": { goalkeeper: 1, "centre-back": 3, "full-back": 2, midfield: 2, winger: 2, striker: 1 },
  "5-3-2": { goalkeeper: 1, "centre-back": 3, "full-back": 2, midfield: 3, striker: 2 },
  "5-4-1": { goalkeeper: 1, "centre-back": 3, "full-back": 2, midfield: 2, winger: 2, striker: 1 },
};
const FINALIZED_ARENA_FORMATION_KEYS = new Set<ArenaFormationKey>(["4-3-3", "4-4-2"]);

const ARENA_CARD_COMPACT_HEIGHT_VH = 14;
const ARENA_CARD_MIN_HEIGHT_VH = 8;
const ARENA_CARD_MAX_HEIGHT_VH = 20;

const ARENA_ROLE_VERTICAL_LIMITS: Record<ArenaPlayer["role"], { min: number; max: number }> = {
  goalkeeper: { min: 43, max: 61 },
  defender: { min: 32, max: 72 },
  midfielder: { min: 30, max: 74 },
  forward: { min: 32, max: 72 },
};

const ARENA_ROLE_HORIZONTAL_LIMITS: Record<ArenaPlayer["role"], { min: number; max: number }> = {
  goalkeeper: { min: 10, max: 22 },
  defender: { min: 20, max: 38 },
  midfielder: { min: 37, max: 58 },
  forward: { min: 57, max: 78 },
};

const ARENA_ROLE_LINE_X: Record<ArenaPlayer["role"], number> = {
  goalkeeper: 15,
  defender: 29,
  midfielder: 48,
  forward: 68,
};

type ArenaPositionLimit = { min: number; max: number };
type ArenaFormationRoleLayout = Partial<Record<ArenaPlayer["role"], Array<Pick<ArenaPlayer, "x" | "y" | "heightVh">>>>;
type ArenaFormationLockEntry = ArenaFormationRoleLayout & {
  cameras?: Record<string, ArenaFormationRoleLayout>;
};
type ArenaFormationLockedLayout = Partial<Record<ArenaFormationKey, ArenaFormationLockEntry>>;
type ArenaLoopCameraProfile = {
  id: Arena433VideoLoopId;
  roleLineX: Record<ArenaPlayer["role"], number>;
  roleIndexXOffsets?: Partial<Record<ArenaPlayer["role"], number[]>>;
  roleIndexYOffsets?: Partial<Record<ArenaPlayer["role"], number[]>>;
  cardHeightVh: number;
  xScale: number;
  yAnchor: number;
  yScale: number;
  yOffsetByRole: Record<ArenaPlayer["role"], number>;
  xLimits: Record<ArenaPlayer["role"], ArenaPositionLimit>;
  yLimits: Record<ArenaPlayer["role"], ArenaPositionLimit>;
};

const ARENA_LOOP_CAMERA_PROFILES: ArenaLoopCameraProfile[] = [
  {
    id: "wide-touchline",
    roleLineX: { goalkeeper: 16, defender: 33, midfielder: 51, forward: 69 },
    // In a short landscape viewport, WebKit projects two diagonal defensive
    // and forward slots a few pixels closer than Chromium. Reserve the same
    // visual breathing room in both engines at the camera layer.
    roleIndexXOffsets: {
      defender: [0, 0, -1.3, 0],
      forward: [0, 1.1, -1.1],
    },
    // Keep the fourth defensive card inside the tactical grass, above the
    // fixture carousel, while preserving a full-card gutter from its line.
    roleIndexYOffsets: { defender: [0, 0, -5.5, -3] },
    cardHeightVh: 11.2,
    xScale: 0.74,
    yAnchor: 69,
    // Field cards are physical objects, not dots: preserve the four tactical
    // lines through the full camera sweep. The former compressed projection
    // put adjacent defenders on top of one another in Safari/WebKit.
    yScale: 1.08,
    yOffsetByRole: { goalkeeper: 0, defender: 0, midfielder: 0, forward: -0.5 },
    xLimits: {
      goalkeeper: { min: 11, max: 21 },
      defender: { min: 24, max: 38 },
      midfielder: { min: 42, max: 57 },
      forward: { min: 59, max: 75 },
    },
    yLimits: {
      goalkeeper: { min: 56, max: 76 },
      defender: { min: 48, max: 94 },
      midfielder: { min: 47, max: 87 },
      forward: { min: 46, max: 88 },
    },
  },
  {
    id: "lower-stand",
    roleLineX: { goalkeeper: 18, defender: 36, midfielder: 54, forward: 72 },
    // The lower stand perspective compresses the third defender against the
    // preceding column in WebKit compact landscape. Keep the formation slot
    // distinct at the projection layer, without coupling it to player data.
    roleIndexXOffsets: { defender: [0, 0, 4.2, 0] },
    // The back fourth sits on the lower diagonal of this viewpoint. Preserve
    // a visible gutter from the third defender instead of letting the cards
    // touch at the camera's compressed edge.
    roleIndexYOffsets: { defender: [0, 0, -5.5, -3] },
    cardHeightVh: 12,
    xScale: 0.68,
    yAnchor: 69,
    // Do not compress the formation in the low-stand camera. A compact card
    // needs one card-height of vertical breathing room from the next player.
    yScale: 1.08,
    yOffsetByRole: { goalkeeper: 0.5, defender: 0, midfielder: -0.5, forward: -1 },
    xLimits: {
      goalkeeper: { min: 14, max: 24 },
      defender: { min: 28, max: 42 },
      midfielder: { min: 45, max: 59 },
      forward: { min: 61, max: 76 },
    },
    yLimits: {
      goalkeeper: { min: 56, max: 77 },
      defender: { min: 47, max: 94 },
      midfielder: { min: 46, max: 87 },
      forward: { min: 45, max: 88 },
    },
  },
  {
    id: "side-sweep",
    roleLineX: { goalkeeper: 20, defender: 38, midfielder: 57, forward: 75 },
    // The outer midfield slot becomes diagonally adjacent to the first slot
    // only on the shortest WebKit landscape height. Keep their card frames
    // separated without changing formation data or the official card art.
    roleIndexXOffsets: { midfielder: [0, 0, -2.2] },
    roleIndexYOffsets: { defender: [0, 0, -5.5, -3] },
    cardHeightVh: 12.4,
    xScale: 0.7,
    yAnchor: 68,
    // Keep the same formation spacing through the side sweep as the other
    // camera angles. This prevents the second and third lines touching.
    yScale: 1.08,
    yOffsetByRole: { goalkeeper: 0.5, defender: 0, midfielder: -0.5, forward: -1 },
    xLimits: {
      goalkeeper: { min: 15, max: 26 },
      defender: { min: 30, max: 44 },
      midfielder: { min: 47, max: 62 },
      forward: { min: 64, max: 80 },
    },
    yLimits: {
      goalkeeper: { min: 55, max: 77 },
      defender: { min: 46, max: 94 },
      midfielder: { min: 45, max: 87 },
      forward: { min: 44, max: 88 },
    },
  },
];

const TEAM_BUILDER_SLOTS = arenaSlotsForFormation(DEFAULT_ARENA_FORMATION_KEY);
const TEAM_BUILDER_GENERIC_SLOTS = [
  ...TEAM_BUILDER_SLOTS.forward,
  ...TEAM_BUILDER_SLOTS.midfielder,
  ...TEAM_BUILDER_SLOTS.defender,
  ...TEAM_BUILDER_SLOTS.goalkeeper,
];

const BENCH_OPTIONS: BenchOption[] = ([
  { id: "bench-haaland", name: "Erling Haaland", shortName: "Haaland", role: "forward", club: "Manchester City", position: "ST", shirtNumber: 9, countryCode3: "NOR", impact: "+ finisher", status: "hot" },
  { id: "bench-saka", name: "Bukayo Saka", shortName: "Saka", role: "forward", club: "Arsenal FC", position: "RW", shirtNumber: 7, countryCode3: "ENG", impact: "+ wide threat", status: "hot" },
  { id: "bench-palmer", name: "Cole Palmer", shortName: "Palmer", role: "midfielder", club: "Chelsea FC", position: "AM", shirtNumber: 10, countryCode3: "ENG", impact: "+ creator", status: "hot" },
  { id: "bench-rice", name: "Declan Rice", shortName: "Rice", role: "midfielder", club: "Arsenal FC", position: "DM", shirtNumber: 41, countryCode3: "ENG", impact: "+ control", status: "ready" },
  { id: "bench-foden", name: "Phil Foden", shortName: "Foden", role: "midfielder", club: "Manchester City", position: "AM", shirtNumber: 47, countryCode3: "ENG", impact: "+ between lines", status: "ready" },
  { id: "bench-rodri", name: "Rodri", shortName: "Rodri", role: "midfielder", club: "Manchester City", position: "DM", shirtNumber: 16, countryCode3: "ESP", impact: "+ tempo", status: "watch" },
  { id: "bench-bruno-fernandes", name: "Bruno Fernandes", shortName: "B. Fernandes", role: "midfielder", club: "Manchester United", position: "AM", shirtNumber: 8, countryCode3: "POR", impact: "+ chance creation", status: "ready" },
  { id: "bench-van-dijk", name: "Virgil van Dijk", shortName: "Van Dijk", role: "defender", club: "Liverpool FC", position: "CB", shirtNumber: 4, countryCode3: "NED", impact: "+ clean sheet", status: "ready" },
  { id: "bench-saliba", name: "William Saliba", shortName: "Saliba", role: "defender", club: "Arsenal FC", position: "CB", shirtNumber: 2, countryCode3: "FRA", impact: "+ duel win", status: "ready" },
  { id: "bench-gabriel", name: "Gabriel Magalhaes", shortName: "Gabriel", role: "defender", club: "Arsenal FC", position: "CB", shirtNumber: 6, countryCode3: "BRA", impact: "+ aerial power", status: "ready" },
  { id: "bench-trent", name: "Trent Alexander-Arnold", shortName: "Trent", role: "defender", club: "Liverpool FC", position: "RB", shirtNumber: 66, countryCode3: "ENG", impact: "+ passing", status: "watch" },
  { id: "bench-gvardiol", name: "Josko Gvardiol", shortName: "Gvardiol", role: "defender", club: "Manchester City", position: "LB", shirtNumber: 24, countryCode3: "CRO", impact: "+ build up", status: "ready" },
  { id: "bench-raya", name: "David Raya", shortName: "Raya", role: "goalkeeper", club: "Arsenal FC", position: "GK", shirtNumber: 22, countryCode3: "ESP", impact: "+ saves", status: "ready" },
  { id: "bench-ederson", name: "Ederson", shortName: "Ederson", role: "goalkeeper", club: "Manchester City", position: "GK", shirtNumber: 31, countryCode3: "BRA", impact: "+ distribution", status: "ready" },
  { id: "bench-guehi", name: "Marc Guehi", shortName: "Guehi", role: "defender", club: "Crystal Palace", position: "CB", shirtNumber: 6, countryCode3: "ENG", impact: "+ defensive cover", status: "ready" },
  { id: "bench-son", name: "Son Heung-min", shortName: "Son", role: "forward", club: "Tottenham Hotspur", position: "LW", shirtNumber: 7, countryCode3: "KOR", impact: "+ counter", status: "ready" },
  { id: "bench-mbeumo", name: "Bryan Mbeumo", shortName: "Mbeumo", role: "forward", club: "Brentford FC", position: "RW", shirtNumber: 19, countryCode3: "CMR", impact: "+ direct runs", status: "ready" },
  { id: "bench-eze", name: "Eberechi Eze", shortName: "Eze", role: "midfielder", club: "Crystal Palace", position: "AM", shirtNumber: 10, countryCode3: "ENG", impact: "+ flair", status: "hot" },
  { id: "bench-gordon", name: "Anthony Gordon", shortName: "Gordon", role: "forward", club: "Newcastle United", position: "LW", shirtNumber: 10, countryCode3: "ENG", impact: "+ pace", status: "ready" },
  { id: "bench-mainoo", name: "Kobbie Mainoo", shortName: "Mainoo", role: "midfielder", club: "Manchester United", position: "CM", shirtNumber: 37, countryCode3: "ENG", impact: "+ balance", status: "ready" },
  { id: "bench-mitoma", name: "Kaoru Mitoma", shortName: "Mitoma", role: "forward", club: "Brighton & Hove Albion", position: "LW", shirtNumber: 22, countryCode3: "JPN", impact: "+ 1v1", status: "ready" },
  { id: "bench-adams", name: "Tyler Adams", shortName: "Adams", role: "midfielder", club: "AFC Bournemouth", position: "DM", shirtNumber: 12, countryCode3: "USA", impact: "+ pressure", status: "risk" },
  { id: "bench-murillo", name: "Murillo", shortName: "Murillo", role: "defender", club: "Nottingham Forest", position: "CB", shirtNumber: 5, countryCode3: "BRA", impact: "+ recovery", status: "ready" },
  { id: "bench-archer", name: "Cameron Archer", shortName: "Archer", role: "forward", club: "Sunderland AFC", position: "ST", shirtNumber: 19, countryCode3: "ENG", impact: "+ late run", status: "watch" },
] satisfies Array<Omit<BenchOption, "marketValue" | "marketValueSource">>).map((bench) => ({
  ...bench,
  marketValue: "Pending",
  marketValueSource: "unavailable",
}));

function normalizeTextKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type ArenaPublicCardPresentation = Readonly<{
  editorialCard: TouchlinePublicEditorialCardPresentation | null;
  cardTier: TouchlineCardTierKey | null;
  cardPriceAuthority?: "active-contract";
  cardPriceVersion?: string | null;
}>;

/**
 * Browser-facing Arena cards may receive only the strict public editorial
 * projection, or an already-frozen active contract. This stays deliberately
 * separate from the market/checkout read models below: a valuation is never a
 * visual-card authority here.
 */
function resolveArenaPublicCardPresentation(input: Readonly<{
  editorialCard?: unknown;
  cardTier?: unknown;
  cardPriceAuthority?: unknown;
  cardPriceVersion?: unknown;
}>): ArenaPublicCardPresentation {
  const editorialCard = parseTouchlinePublicEditorialCardPresentation(input.editorialCard);
  if (editorialCard) {
    return Object.freeze({
      editorialCard,
      cardTier: editorialCard.tierKey,
    });
  }

  const contractedTier = input.cardPriceAuthority === "active-contract"
    && typeof input.cardTier === "string"
    ? touchlineArenaTierForKey(input.cardTier)
    : null;
  if (!contractedTier) {
    return Object.freeze({ editorialCard: null, cardTier: null });
  }

  return Object.freeze({
    editorialCard: null,
    cardTier: contractedTier.key,
    cardPriceAuthority: "active-contract",
    cardPriceVersion: typeof input.cardPriceVersion === "string" && input.cardPriceVersion.trim()
      ? input.cardPriceVersion
      : null,
  });
}

function arenaPublishedCardTemplateUrl(clubName: string, cardTier: TouchlineCardTierKey | null | undefined) {
  return cardTier
    ? touchlineArenaClubTemplateForTierPreview(clubName, cardTier) || ""
    : "";
}

function arenaShirtNumberLabel(value: unknown) {
  const shirtNumber = normalizeOfficialShirtNumber(value);
  return shirtNumber ? `#${shirtNumber}` : "--";
}

function normalizeArenaPlayerCard(player: Partial<ArenaPlayer>) {
  if (!player.card) return player.card;

  const card = { ...player.card } as typeof player.card & { cardPrice?: unknown };
  delete card.cardPrice;
  const presentation = resolveArenaPublicCardPresentation(player.card);
  const shirtNumber = normalizeOfficialShirtNumber(player.card.shirtNumber);

  return {
    ...card,
    templateUrl: arenaPublishedCardTemplateUrl(player.card.clubName, presentation.cardTier),
    shirtNumber,
    // Legacy data remains structurally compatible, but no public card reads
    // a valuation from this client-side persistence boundary.
    marketValue: "",
    marketValueSource: "unavailable" as const,
    cardTier: presentation.cardTier,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : null,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
  };
}

function hasUsableCountryCode(value?: string | null) {
  return Boolean(value && value.trim() && value.trim().toUpperCase() !== "N/A");
}

function hasArenaCardForHydration(player: ArenaPlayer) {
  return Boolean(player.card);
}

function clubForArenaPlayer(player: ArenaPlayer) {
  const cardClub = player.card?.clubName ? PREMIER_CLUB_LOOKUP.get(normalizeClubKey(player.card.clubName)) : null;
  if (cardClub) return cardClub;

  const idMatch = player.id.match(/^builder-([a-z]{3})-/i);
  if (idMatch) return PREMIER_CLUB_LOOKUP.get(normalizeClubKey(idMatch[1]));

  return null;
}

function matchesBuilderPlayer(player: ArenaPlayer, candidate: TeamBuilderSquadPlayer) {
  const playerProviderId = player.id.match(/(?:^|-)builder-[a-z]{3}-(\d+)$/i)?.[1];
  return touchlinePlayerIdentityMatches(
    {
      providerId: playerProviderId,
      name: player.card?.playerName || player.name,
      shortName: player.shortName,
      clubName: player.card?.clubName,
    },
    candidate,
  );
}

function matchesBuilderBenchPlayer(player: BenchOption, candidate: TeamBuilderSquadPlayer) {
  const playerProviderId = player.id.match(/(?:^|-)builder-[a-z]{3}-(\d+)$/i)?.[1];
  return touchlinePlayerIdentityMatches(
    {
      providerId: playerProviderId,
      name: player.name,
      shortName: player.shortName,
      clubName: player.club,
    },
    candidate,
  );
}

function hydrateArenaPlayerFromSquad(player: ArenaPlayer, squadPlayer: TeamBuilderSquadPlayer): ArenaPlayer {
  if (!player.card) return player;

  const card = { ...player.card } as typeof player.card & { cardPrice?: unknown };
  delete card.cardPrice;
  const currentPresentation = resolveArenaPublicCardPresentation(player.card);
  const squadPresentation = resolveArenaPublicCardPresentation(squadPlayer);
  // The current roster publication is authoritative for presentation. A
  // frozen saved contract is only a fail-closed fallback when the current
  // roster cannot provide a published editorial or active-contract profile.
  const presentation = squadPresentation.editorialCard || squadPresentation.cardPriceAuthority
    ? squadPresentation
    : currentPresentation;
  const clubName = player.card.clubName || squadPlayer.clubName;
  const countryCode3 = hasUsableCountryCode(player.card.countryCode3) ? player.card.countryCode3 : squadPlayer.countryCode3 || null;
  const shirtNumber = normalizeOfficialShirtNumber(player.card.shirtNumber, squadPlayer.shirtNumber);

  return {
    ...player,
    name: player.name || squadPlayer.name,
    shortName: player.shortName || squadPlayer.shortName,
    role: player.role || squadPlayer.role,
    card: {
      ...card,
      templateUrl: arenaPublishedCardTemplateUrl(clubName, presentation.cardTier),
      playerName: player.card.playerName || squadPlayer.name,
      shirtNumber,
      clubName,
      position: player.card.position || squadPlayer.position || roleLabel(squadPlayer.role),
      countryCode3,
      flagUrl: player.card.flagUrl || squadPlayer.flagUrl || null,
      fantasyPoints: player.card.fantasyPoints ?? "0.0",
      marketValue: "",
      marketValueSource: "unavailable" as const,
      marketValueState: squadPlayer.marketValueState ?? player.card.marketValueState,
      classificationState: squadPlayer.classificationState ?? player.card.classificationState,
      cardTier: presentation.cardTier,
      cardPriceVersion: presentation.cardPriceAuthority
        ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
        : null,
      cardPriceAuthority: presentation.cardPriceAuthority,
      editorialCard: presentation.editorialCard,
      inventoryId: player.card.inventoryId ?? squadPlayer.inventoryId ?? null,
      matchStats: player.card.matchStats ?? { goals: 0, assists: 0, defense: 0, cleanSheets: 0, cards: 0 },
    },
  };
}

function benchOptionToArenaPlayer(bench: BenchOption, target: ArenaPlayer): ArenaPlayer {
  const presentation = resolveArenaPublicCardPresentation(bench);

  return {
    id: `field-${bench.id}`,
    name: bench.name,
    shortName: bench.shortName,
    role: target.role,
    asset: findApprovedArenaAsset(bench.name),
    x: target.x,
    y: target.y,
    heightVh: target.heightVh,
    card: {
      templateUrl: arenaPublishedCardTemplateUrl(bench.club, presentation.cardTier),
      playerName: bench.name,
      shirtNumber: bench.shirtNumber,
      clubName: bench.club,
      position: bench.position,
      countryCode3: bench.countryCode3,
      flagUrl: null,
      fantasyPoints: "0.0",
      marketValue: "",
      marketValueSource: "unavailable",
      marketValueState: bench.marketValueState,
      classificationState: bench.classificationState,
      cardTier: presentation.cardTier,
      cardPriceVersion: presentation.cardPriceAuthority
        ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
        : null,
      cardPriceAuthority: presentation.cardPriceAuthority,
      editorialCard: presentation.editorialCard,
      inventoryId: bench.inventoryId ?? null,
      matchStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, cards: 0 },
    },
  };
}

function placeNewContractsInSquad(
  currentPlayers: ArenaPlayer[],
  currentBench: BenchOption[],
  newContracts: BenchOption[],
  formationKey: ArenaFormationKey,
) {
  let nextPlayers = [...currentPlayers];
  const nextBench = [...currentBench];

  for (const contract of newContracts) {
    const roleCapacity = maxArenaPlayersForRole(contract.role, formationKey);
    const roleCount = nextPlayers.filter((player) => player.role === contract.role).length;
    const hasStartingSlot = nextPlayers.length < TOUCHLINE_SQUAD_RULES.starters && roleCount < roleCapacity;

    if (!hasStartingSlot) {
      nextBench.push(contract);
      continue;
    }

    const emptyTarget: ArenaPlayer = {
      id: `empty-${contract.role}-${roleCount}`,
      name: contract.name,
      shortName: contract.shortName,
      role: contract.role,
      x: 50,
      y: 50,
      heightVh: ARENA_CARD_COMPACT_HEIGHT_VH,
    };
    nextPlayers = normalizeArenaPlayersForFormation(
      [...nextPlayers, benchOptionToArenaPlayer(contract, emptyTarget)],
      formationKey,
    );
  }

  return { players: nextPlayers, bench: nextBench };
}

function arenaPlayerToBenchOption(player: ArenaPlayer, replacedBench: BenchOption): BenchOption {
  const card = player.card;
  const presentation = resolveArenaPublicCardPresentation(card ?? {});
  return {
    id: `bench-${player.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    name: card?.playerName || player.name,
    shortName: player.shortName,
    role: player.role,
    club: card?.clubName || "TouchLine XI",
    position: card?.position || roleLabel(player.role),
    shirtNumber: normalizeOfficialShirtNumber(card?.shirtNumber),
    marketValue: "",
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier: presentation.cardTier,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : null,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
    inventoryId: card?.inventoryId ?? null,
    countryCode3: card?.countryCode3 || "ENG",
    impact: replacedBench.impact,
    status: "ready",
  };
}

function builderPlayerToBenchOption(player: TeamBuilderSquadPlayer): BenchOption {
  const presentation = resolveArenaPublicCardPresentation(player);
  return {
    id: builderPlayerSquadContractId(player),
    name: player.name,
    shortName: player.shortName,
    role: player.role,
    club: player.clubName,
    position: player.position || roleLabel(player.role),
    shirtNumber: normalizeOfficialShirtNumber(player.shirtNumber),
    marketValue: "",
    marketValueSource: "unavailable",
    marketValueState: player.marketValueState,
    classificationState: player.classificationState,
    cardTier: presentation.cardTier,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : null,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
    inventoryId: player.inventoryId ?? null,
    countryCode3: player.countryCode3 || "N/A",
    impact: "+ squad depth",
    status: "ready",
  };
}

function defaultClubOwnerCardByName(name: string) {
  const normalizedName = normalizeTextKey(name);
  return CLUB_OWNER_SQUAD_CARDS.find((card) => normalizeTextKey(card.name) === normalizedName);
}

function arenaPlayerToClubOwnerCard(player: ArenaPlayer): ClubOwnerSquadCard {
  const card = player.card;
  const presentation = resolveArenaPublicCardPresentation(card ?? {});
  const name = card?.playerName || player.name;
  const defaultCard = defaultClubOwnerCardByName(name);
  return canonicalClubOwnerRosterCard({
    ...(defaultCard ?? {}),
    id: defaultCard?.id ?? player.id,
    name,
    shortName: player.shortName || name.split(/\s+/).at(-1) || name,
    role: player.role,
    position: card?.position || roleLabel(player.role),
    clubName: card?.clubName || "TouchLine XI",
    shirtNumber: normalizeOfficialShirtNumber(card?.shirtNumber),
    countryCode3: card?.countryCode3 || "N/A",
    marketValue: "",
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier: presentation.cardTier ?? undefined,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : undefined,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
    inventoryId: card?.inventoryId ?? defaultCard?.inventoryId ?? null,
    touchlinePoints: Number.parseFloat(String(card?.fantasyPoints ?? "")) || defaultCard?.touchlinePoints || 0,
  });
}

function benchOptionToClubOwnerCard(bench: BenchOption): ClubOwnerSquadCard {
  const defaultCard = defaultClubOwnerCardByName(bench.name);
  const presentation = resolveArenaPublicCardPresentation(bench);
  return canonicalClubOwnerRosterCard({
    ...(defaultCard ?? {}),
    id: defaultCard?.id ?? bench.id,
    name: bench.name,
    shortName: bench.shortName,
    role: bench.role,
    position: bench.position,
    clubName: bench.club,
    shirtNumber: bench.shirtNumber,
    countryCode3: bench.countryCode3,
    marketValue: bench.marketValue,
    marketValueSource: bench.marketValueSource || "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier: presentation.cardTier ?? undefined,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : undefined,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
    inventoryId: bench.inventoryId ?? defaultCard?.inventoryId ?? null,
    touchlinePoints: defaultCard?.touchlinePoints || 0,
  });
}

function clubOwnerCardToBenchOption(card: ClubOwnerSquadCard): BenchOption {
  const defaultBenchOption = BENCH_OPTIONS.find((bench) => (
    defaultClubOwnerCardByName(bench.name)?.id === card.id
  ));
  if (defaultBenchOption) {
    return {
      ...defaultBenchOption,
      name: card.name,
      shortName: card.shortName,
      role: card.role as ArenaPlayer["role"],
      club: card.clubName,
      position: card.position,
      shirtNumber: card.shirtNumber,
      marketValue: card.marketValue,
      marketValueSource: card.marketValueSource || "unavailable",
      marketValueState: card.marketValueState,
      classificationState: card.classificationState,
      cardTier: card.cardTier,
      cardPriceVersion: card.cardPriceVersion,
      cardPriceAuthority: card.cardPriceAuthority,
      editorialCard: card.editorialCard ?? null,
      inventoryId: card.inventoryId ?? null,
      countryCode3: card.countryCode3,
    };
  }

  return {
    id: `bench-${card.id}`,
    name: card.name,
    shortName: card.shortName,
    role: card.role as ArenaPlayer["role"],
    club: card.clubName,
    position: card.position,
    shirtNumber: card.shirtNumber,
    marketValue: card.marketValue,
    marketValueSource: card.marketValueSource || "unavailable",
    marketValueState: card.marketValueState,
    classificationState: card.classificationState,
    cardTier: card.cardTier,
    cardPriceVersion: card.cardPriceVersion,
    cardPriceAuthority: card.cardPriceAuthority,
    editorialCard: card.editorialCard ?? null,
    inventoryId: card.inventoryId ?? null,
    countryCode3: card.countryCode3,
    impact: "+ squad depth",
    status: "ready",
  };
}

function arenaClubOwnerRoster(players: ArenaPlayer[], benchPlayers: BenchOption[]) {
  return uniqueClubOwnerRosterCards([
    ...players.map(arenaPlayerToClubOwnerCard),
    ...benchPlayers.map(benchOptionToClubOwnerCard),
  ]);
}

type ArenaTranslate = (key: TouchLineTranslationKey) => string;

function benchStatusLabel(status: BenchOption["status"], t: ArenaTranslate) {
  if (status === "hot") return t("hotStatus");
  if (status === "watch") return t("watchStatus");
  if (status === "risk") return t("riskStatus");
  return t("ready");
}

const BENCH_IMPACT_KEYS: Record<string, TouchLineTranslationKey> = {
  "+ finisher": "impactFinisher",
  "+ wide threat": "impactWideThreat",
  "+ creator": "impactCreator",
  "+ control": "impactControl",
  "+ between lines": "impactBetweenLines",
  "+ tempo": "impactTempo",
  "+ chance creation": "impactChanceCreation",
  "+ clean sheet": "impactCleanSheet",
  "+ duel win": "impactDuelWin",
  "+ aerial power": "impactAerialPower",
  "+ passing": "impactPassing",
  "+ build up": "impactBuildUp",
  "+ saves": "impactSaves",
  "+ distribution": "impactDistribution",
  "+ defensive cover": "impactDefensiveCover",
  "+ counter": "impactCounter",
  "+ direct runs": "impactDirectRuns",
  "+ flair": "impactFlair",
  "+ pace": "impactPace",
  "+ balance": "impactBalance",
  "+ pressure": "impactPressure",
  "+ recovery": "impactRecovery",
  "+ late run": "impactLateRun",
  "+ squad depth": "impactSquadDepth",
};

function benchImpactLabel(impact: string, t: ArenaTranslate) {
  const key = BENCH_IMPACT_KEYS[impact];
  return key ? `+ ${t(key)}` : impact;
}

function compareBenchByUsageAndPosition(first: BenchOption, second: BenchOption) {
  const usageRank: Record<BenchOption["status"], number> = { hot: 0, ready: 1, watch: 2, risk: 3 };
  const roleRank: Record<BenchOption["role"], number> = { goalkeeper: 0, defender: 1, midfielder: 2, forward: 3 };
  return usageRank[first.status] - usageRank[second.status]
    || roleRank[first.role] - roleRank[second.role]
    || first.position.localeCompare(second.position)
    || first.name.localeCompare(second.name);
}

function buildMatchdayBench(benchPlayers: BenchOption[]) {
  const ordered = [...benchPlayers].sort(compareBenchByUsageAndPosition);
  const firstGoalkeeper = ordered.find((bench) => bench.role === "goalkeeper");
  const outfield = ordered.filter((bench) => bench.role !== "goalkeeper");
  const matchdayBench = [...outfield.slice(0, firstGoalkeeper ? 8 : 9), firstGoalkeeper].filter((bench): bench is BenchOption => Boolean(bench));
  return orderTouchlineBenchByPosition(matchdayBench.slice(0, 9));
}

type QuickSubstitutionSessionSource = Readonly<{
  matchId: string;
  ownerId: string;
  rosterRevision: string;
  startingSlots: readonly Readonly<{ positionSlotId: string; inventoryId: string }>[];
  benchInventoryIds: readonly string[];
  playerByPositionSlotId: ReadonlyMap<string, ArenaPlayer>;
  playerByInventoryId: ReadonlyMap<string, ArenaPlayer>;
  benchByInventoryId: ReadonlyMap<string, BenchOption>;
  pitchSlotByPositionSlotId: ReadonlyMap<string, { x: number; y: number }>;
}>;

function quickSubstitutionDemoInventoryId(index: number) {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function quickSubstitutionInventoryId(value: unknown, demoIndex: number, allowDemoIdentity: boolean) {
  return normalizeTouchlineMarketInventoryId(value)
    ?? (allowDemoIdentity ? quickSubstitutionDemoInventoryId(demoIndex) : null);
}

function quickSubstitutionOwnerId(principal: ArenaPersistencePrincipal | null) {
  if (!principal) return null;
  if (principal.kind === "authenticated") return `owner:${principal.userId}`;
  if (principal.kind === "anonymous") return `session:${principal.sessionId}`;
  return `demo:${principal.demoId ?? "default"}`;
}

/**
 * Turns a complete owned 11 + 9 into a local match-session source. The source
 * has no roster persistence: it is only the identity/slot proof consumed by
 * the durable Quick Sub reducer while a protected match event store is absent.
 */
function buildQuickSubstitutionSessionSource(input: Readonly<{
  principal: ArenaPersistencePrincipal | null;
  players: readonly ArenaPlayer[];
  matchdayBench: readonly BenchOption[];
  allowDemoIdentity: boolean;
}>): QuickSubstitutionSessionSource | null {
  const ownerId = quickSubstitutionOwnerId(input.principal);
  if (!ownerId || input.players.length !== TOUCHLINE_SQUAD_RULES.starters || input.matchdayBench.length !== TOUCHLINE_SQUAD_RULES.bench) {
    return null;
  }

  const initialPitchSlots = trainingCenterPlayerSlots([...input.players]);
  const playerByPositionSlotId = new Map<string, ArenaPlayer>();
  const playerByInventoryId = new Map<string, ArenaPlayer>();
  const benchByInventoryId = new Map<string, BenchOption>();
  const pitchSlotByPositionSlotId = new Map<string, { x: number; y: number }>();
  const startingSlots = input.players.map((player, index) => {
    const inventoryId = quickSubstitutionInventoryId(
      player.card?.inventoryId,
      index,
      input.allowDemoIdentity,
    );
    if (!inventoryId) return null;
    const positionSlotId = `pitch-slot:${index + 1}`;
    playerByPositionSlotId.set(positionSlotId, player);
    playerByInventoryId.set(inventoryId, player);
    pitchSlotByPositionSlotId.set(positionSlotId, initialPitchSlots.get(player.id) ?? { x: 50, y: 50 });
    return Object.freeze({ positionSlotId, inventoryId });
  });
  const benchInventoryIds = input.matchdayBench.map((bench, index) => {
    const inventoryId = quickSubstitutionInventoryId(
      bench.inventoryId,
      input.players.length + index,
      input.allowDemoIdentity,
    );
    if (!inventoryId) return null;
    benchByInventoryId.set(inventoryId, bench);
    return inventoryId;
  });

  if (startingSlots.some((slot) => !slot)
    || benchInventoryIds.some((inventoryId) => !inventoryId)
    || playerByInventoryId.size !== input.players.length
    || benchByInventoryId.size !== input.matchdayBench.length) {
    return null;
  }

  const resolvedStartingSlots = startingSlots as readonly Readonly<{ positionSlotId: string; inventoryId: string }>[];
  const resolvedBenchInventoryIds = benchInventoryIds as readonly string[];
  const allInventoryIds = [
    ...resolvedStartingSlots.map((slot) => slot.inventoryId),
    ...resolvedBenchInventoryIds,
  ];
  if (new Set(allInventoryIds).size !== allInventoryIds.length) return null;

  const rosterRevision = `quick-sub-roster:${allInventoryIds.join("|")}`;
  return Object.freeze({
    matchId: `quick-sub-session:${ownerId}:${rosterRevision}`,
    ownerId,
    rosterRevision,
    startingSlots: Object.freeze([...resolvedStartingSlots]),
    benchInventoryIds: Object.freeze([...resolvedBenchInventoryIds]),
    playerByPositionSlotId,
    playerByInventoryId,
    benchByInventoryId,
    pitchSlotByPositionSlotId,
  });
}

function arenaPlayerToSubstitutedOutOption(player: ArenaPlayer): BenchOption {
  const card = player.card;
  const presentation = resolveArenaPublicCardPresentation(card ?? {});
  return {
    id: `substituted-out-${player.id}`,
    name: card?.playerName || player.name,
    shortName: player.shortName,
    role: player.role,
    club: card?.clubName || "TouchLine XI",
    position: card?.position || roleLabel(player.role),
    shirtNumber: normalizeOfficialShirtNumber(card?.shirtNumber),
    marketValue: "",
    marketValueSource: "unavailable",
    marketValueState: card?.marketValueState ?? undefined,
    classificationState: card?.classificationState ?? undefined,
    cardTier: presentation.cardTier,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : null,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
    inventoryId: card?.inventoryId ?? null,
    countryCode3: card?.countryCode3 || "N/A",
    impact: "substituted-out",
    status: "risk",
  };
}

type ArenaPositionGroup = "goalkeeper" | "centre-back" | "full-back" | "midfield" | "winger" | "striker" | "outfield";

function arenaPositionGroup(position?: string | null, role?: ArenaPlayer["role"]): ArenaPositionGroup {
  const value = normalizeTextKey(position || "");
  if (role === "goalkeeper" || /\bgk\b|goalkeeper/.test(value)) return "goalkeeper";
  if (/\b(cb|centre back|center back)\b/.test(value)) return "centre-back";
  if (/\b(lb|rb|lwb|rwb|full back|wing back)\b/.test(value)) return "full-back";
  if (/\b(lw|rw|winger|left wing|right wing)\b/.test(value)) return "winger";
  if (/\b(st|cf|striker|centre forward|center forward)\b/.test(value)) return "striker";
  if (role === "defender") return "centre-back";
  if (role === "forward") return "striker";
  if (role === "midfielder") return "midfield";
  return "outfield";
}

function positionGroupLabel(group: ArenaPositionGroup, t: ArenaTranslate) {
  if (group === "centre-back") return t("positionCentreBack");
  if (group === "full-back") return t("positionFullBack");
  if (group === "midfield") return t("positionMidfield");
  if (group === "winger") return t("positionWinger");
  if (group === "striker") return t("positionStriker");
  if (group === "goalkeeper") return t("positionGoalkeeper");
  return t("positionOutfield");
}

function canBenchReplaceTarget(bench: BenchOption, target: ArenaPlayer) {
  const targetGroup = arenaPositionGroup(target.card?.position, target.role);
  const benchGroup = arenaPositionGroup(bench.position, bench.role);
  if (targetGroup === "outfield") return benchGroup !== "goalkeeper";
  if (benchGroup === "outfield") return targetGroup !== "goalkeeper";
  return targetGroup === benchGroup;
}

function countArenaPositionGroups(players: ArenaPlayer[]) {
  return players.reduce<Partial<Record<ArenaPositionGroup, number>>>((counts, player) => {
    const group = arenaPositionGroup(player.card?.position, player.role);
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
}

function isBenchFormationLocked(bench: BenchOption, players: ArenaPlayer[], formationKey: ArenaFormationKey, replacementTarget?: ArenaPlayer | null) {
  // A full formation must not dim or disable the bench before the outgoing
  // starter is known. Every substitute can still replace a compatible player;
  // enforce the positional cap only after that replacement target is selected.
  if (!replacementTarget) return false;

  const group = arenaPositionGroup(bench.position, bench.role);
  const cap = ARENA_FORMATION_POSITION_CAPS[formationKey][group];
  if (!cap) return false;

  if (replacementTarget && arenaPositionGroup(replacementTarget.card?.position, replacementTarget.role) === group) return false;
  return (countArenaPositionGroups(players)[group] ?? 0) >= cap;
}

function formationsWithTwoStrikers() {
  return ARENA_FORMATIONS.filter((formation) => (ARENA_FORMATION_POSITION_CAPS[formation.key].striker ?? 0) >= 2).map((formation) => formation.label).join(", ");
}

function mergeSavedPlayers(
  savedPlayers: Partial<ArenaPlayer>[],
  formationKey: ArenaFormationKey,
  principal?: ArenaPersistencePrincipal | null,
) {
  const customPlayers = savedPlayers
    .filter((player) => player.id && player.card)
    .map((player): ArenaPlayer | null => {
      if (!player.id || !player.name || !player.shortName || !player.role || !player.card) return null;
      const role = inferArenaRole(player.card.position || player.role);

      return {
        id: player.id,
        name: player.name,
        shortName: player.shortName,
        role,
        asset: player.asset,
        card: normalizeArenaPlayerCard({ ...player, role }),
        x: typeof player.x === "number" ? player.x : 50,
        y: typeof player.y === "number" ? player.y : 60,
        heightVh: ARENA_CARD_COMPACT_HEIGHT_VH,
      };
    })
    .filter((player): player is ArenaPlayer => Boolean(player));

  return normalizeArenaPlayersForFormation(customPlayers, formationKey, principal);
}

function arenaStorageKey(
  principal: ArenaPersistencePrincipal,
  resource: (typeof ARENA_PERSISTENCE_RESOURCES)[keyof typeof ARENA_PERSISTENCE_RESOURCES],
) {
  return arenaPersistenceKeys(principal, resource).storageKey;
}

function queueResilientAsyncTask(task: () => Promise<void>, onError: () => void) {
  queueMicrotask(() => {
    void task().catch(onError);
  });
}

function browserAnonymousArenaPrincipal(): ArenaPersistencePrincipal {
  return {
    kind: "anonymous",
    sessionId: getOrCreateBrowserSessionId(
      ARENA_ANONYMOUS_SESSION_STORAGE_KEY,
      "touchline-arena-anonymous",
    ),
  };
}

function saveLineup(
  players: ArenaPlayer[],
  formationKey: ArenaFormationKey,
  principal: ArenaPersistencePrincipal,
) {
  const lockedPlayers = players.map(lockArenaPlayerSize);
  writeBrowserStorage(
    "localStorage",
    arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.formation),
    formationKey,
  );
  writeBrowserStorage(
    "localStorage",
    arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.lineup),
    JSON.stringify(
      lockedPlayers.map(({ id, name, shortName, role, asset, card, x, y, heightVh }) => ({
        id,
        name,
        shortName,
        role,
        asset,
        card,
        x,
        y,
        heightVh,
      })),
    ),
  );
}

function formatFixtureTime(startsAt?: string) {
  if (!startsAt) return "Next";
  const date = new Date(startsAt.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "Next";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function fixtureHasScore(fixture: TouchlineFixture) {
  return Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore);
}

function formatFixtureScore(fixture: TouchlineFixture) {
  if (fixtureHasScore(fixture)) return `${fixture.homeScore}-${fixture.awayScore}`;
  return "VS";
}

function displayFixtureStatus(status: string, nextLabel: string) {
  return status.toLowerCase() === "next" ? nextLabel : status;
}

function isFixtureActuallyLive(fixture: TouchlineFixture) {
  const status = normalizeTextKey(fixture.status ?? "");
  return /(?:live|in play|inplay|1st half|2nd half|half time|extra time|penalt)/.test(status);
}

function isFixtureFinished(fixture: TouchlineFixture) {
  const status = normalizeTextKey(fixture.status ?? "");
  return /(?:finished|full time|ft|after extra time|aet|penalties finished|cancelled|postponed)/.test(status);
}

function fixtureBoardScore(fixture: TouchlineFixture) {
  if (fixtureHasScore(fixture)) return formatFixtureScore(fixture).replace("-", " — ");
  return "VS";
}

function fixtureBoardClock(fixture: TouchlineFixture, locale: TouchLineLocale) {
  const status = String(fixture.status ?? "").trim();
  if (status && !/^next$/i.test(status)) return status;
  const time = formatFixtureTime(fixture.startsAt);
  if (time !== "Next") return time;
  return locale === "pt-BR" ? "Horário pendente" : "Kick-off pending";
}

function fixtureLabel(fixture: TouchlineFixture) {
  return fixture.name || [fixture.homeTeam?.name, fixture.awayTeam?.name].filter(Boolean).join(" vs ") || `Fixture ${fixture.providerId}`;
}

function parseFixtureClubNames(name?: string) {
  if (!name) return [];
  return name
    .split(/\s+(?:v|vs|versus)\.?\s+|\s+-\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function normalizeClubKey(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(?:fc|football club)\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function normalizeClubHubSlug(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function clubHubHref(club: PremierClubVisual, locale: TouchLineLocale) {
  return touchlineClubHubHref(locale, normalizeClubHubSlug(club.aliases[0] ?? club.name));
}

function findPremierClubByHubParam(value?: string | null) {
  const normalized = normalizeClubHubSlug(value ?? "");
  if (!normalized) return null;

  return PREMIER_CLUB_VISUALS.find((club) =>
    [club.teamId, club.shortCode, club.name, ...club.aliases]
      .map(normalizeClubHubSlug)
      .some((candidate) => candidate === normalized),
  ) ?? null;
}

function getPremierClubVisual(name?: string, shortCode?: string) {
  const normalizedName = normalizeClubKey(name);
  const normalizedCode = normalizeClubKey(shortCode);
  return PREMIER_CLUB_LOOKUP.get(normalizedName) ?? PREMIER_CLUB_LOOKUP.get(normalizedCode);
}

function liveOptimizedClubLogoUrl(logoUrl?: string | null) {
  if (!logoUrl) return null;
  if (!logoUrl.includes("/touchlineArena/shared/club-logos/2026-27/ui-512/")) return logoUrl;

  return logoUrl
    .replace("/touchlineArena/shared/club-logos/2026-27/ui-512/", "/touchlineArena/shared/club-logos/2026-27/live-160/")
    .replace(/\.png$/i, `.webp?v=${ARENA_LIVE_VISUAL_ASSET_VERSION}`);
}

function getPremierClubVisualForFixtureSide(
  fixture: TouchlineFixture,
  side: "home" | "away",
) {
  const team = side === "home" ? fixture.homeTeam : fixture.awayTeam;
  const providerTeamId = String(team?.providerId ?? "").trim();
  if (providerTeamId) {
    const officialClub = PREMIER_CLUB_VISUALS.find((club) => club.teamId === providerTeamId);
    if (officialClub) return officialClub;
  }

  const match = buildFixtureClubMatches([fixture])[0] ?? null;
  const symbol = side === "home" ? match?.home : match?.away;
  return symbol ? getPremierClubVisual(symbol.name, symbol.shortCode) ?? null : null;
}

function clubShortCode(name?: string, shortCode?: string) {
  const officialCode = shortCode?.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (officialCode) return officialCode.slice(0, 3);

  const premierVisual = getPremierClubVisual(name, shortCode);
  if (premierVisual) return premierVisual.shortCode;

  const words = (name ?? "FC").split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
  return (words[0] ?? "FC").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "FC";
}

function fixtureClubSources(fixture: TouchlineFixture): FixtureClubSource[] {
  const parsedNames = parseFixtureClubNames(fixture.name);
  const clubs: Array<FixtureClubSource | undefined> = [
    fixture.homeTeam ?? (parsedNames[0] ? { name: parsedNames[0] } : undefined),
    fixture.awayTeam ?? (parsedNames[1] ? { name: parsedNames[1] } : undefined),
  ];
  return clubs.filter((club): club is FixtureClubSource => Boolean(club?.name));
}

function fixtureClubSourceToSymbol(fixture: TouchlineFixture, club: FixtureClubSource, index: number): ArenaClubSymbol {
  const name = club.name ?? `Club ${index + 1}`;
  const visual = PREMIER_CLUB_VISUALS.find((candidate) => candidate.teamId === String(club.providerId ?? ""))
    ?? getPremierClubVisual(name, club.shortCode);
  return {
    id: `${fixture.id}-${club.providerId ?? name}-${index}`,
    fixtureId: fixture.id,
    name: visual?.name ?? name,
    shortCode: visual?.shortCode ?? clubShortCode(name, club.shortCode),
    logoUrl: visual?.logoUrl ?? club.logoUrl,
    accent: visual?.accent ?? "#7ae7ff",
    secondaryAccent: visual?.secondaryAccent ?? "#b5ff4b",
    status: formatFixtureScore(fixture),
    matchup: fixtureLabel(fixture),
  };
}

function buildFixtureClubMatches(fixtures: TouchlineFixture[]): ArenaClubMatch[] {
  return fixtures
    .map((fixture) => {
      const [homeSource, awaySource] = fixtureClubSources(fixture);
      if (!homeSource || !awaySource) return null;
      const home = fixtureClubSourceToSymbol(fixture, homeSource, 0);
      const away = fixtureClubSourceToSymbol(fixture, awaySource, 1);
      return {
        id: fixture.id,
        fixtureId: fixture.id,
        home,
        away,
        centerLabel: fixtureHasScore(fixture) ? formatFixtureScore(fixture) : "vs",
        // The score stays in the centre of the fixture pill; its companion
        // label describes the canonical game state. Never synthesize a score
        // when the provider has not confirmed one.
        status: isFixtureActuallyLive(fixture)
          ? (fixture.status || "LIVE")
          : isFixtureFinished(fixture)
            ? "FT"
            : fixtureHasScore(fixture)
              ? formatFixtureScore(fixture)
              // The Arena rail is a premium live-result surface, not the
              // fixture calendar. A future kickoff remains an honest
              // localized "Next" label; its date and time belong only in
              // Live / Match Centre.
              : "Next",
        matchup: fixtureLabel(fixture),
      };
    })
    .filter((match): match is ArenaClubMatch => Boolean(match));
}

function isPremierFixture(fixture: TouchlineFixture) {
  const [home, away] = fixtureClubSources(fixture);
  if (!home || !away) return false;
  const homeClub = getPremierClubVisualForFixtureSide(fixture, "home");
  const awayClub = getPremierClubVisualForFixtureSide(fixture, "away");
  if (!homeClub || !awayClub || homeClub.teamId === awayClub.teamId) return false;
  if (fixture.competitionId) return PREMIER_COMPETITION_IDS.has(fixture.competitionId);
  // A provider can omit the competition relation from a degraded payload. In
  // that explicit case only, the verified 20-club registry remains the guard.
  return true;
}

function clubSymbolStyle(club: ArenaClubSymbol): CSSProperties {
  return {
    "--club-accent": club.accent,
    "--club-secondary": club.secondaryAccent,
  } as CSSProperties;
}

function slugifyBuilderId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function cardTierSortWeight(tierKey: TouchlineCardTierKey | null | undefined) {
  const index = tierKey ? TOUCHLINE_CARD_TIER_KEYS.indexOf(tierKey) : -1;
  return index;
}

function roleLabel(role: ArenaPlayer["role"]) {
  if (role === "goalkeeper") return "GK";
  if (role === "defender") return "DEF";
  if (role === "forward") return "FWD";
  return "MID";
}

function readMarketWalletBalanceTc(principal: ArenaPersistencePrincipal) {
  try {
    const savedBalance = Number.parseInt(
      readBrowserStorage(
        "localStorage",
        arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.marketWallet),
      ) ?? "",
      10,
    );
    return Number.isFinite(savedBalance) && savedBalance >= 0
      ? savedBalance
      : principal.kind === "demo" ? TOUCHLINE_DEMO_PROMOTIONAL_BALANCE_TC : 0;
  } catch {
    return principal.kind === "demo" ? TOUCHLINE_DEMO_PROMOTIONAL_BALANCE_TC : 0;
  }
}

function writeMarketWalletBalanceTc(balanceTc: number, principal: ArenaPersistencePrincipal) {
  writeBrowserStorage(
    "localStorage",
    arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.marketWallet),
    String(Math.max(0, Math.floor(balanceTc))),
  );
}

function readTouchLineLocalePreference() {
  const rawUrlLocale = new URLSearchParams(window.location.search).get("lang");
  if (rawUrlLocale) return normalizeTouchLineLocale(rawUrlLocale);

  let stored: string | null = null;

  stored = readBrowserStorage("localStorage", TOUCHLINE_LOCALE_STORAGE_KEY);

  if (stored) return stored;

  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${TOUCHLINE_LOCALE_STORAGE_KEY}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
}

function writeTouchLineLocalePreference(locale: TouchLineLocale) {
  writeBrowserStorage("localStorage", TOUCHLINE_LOCALE_STORAGE_KEY, locale);

  try {
    document.cookie = `${TOUCHLINE_LOCALE_STORAGE_KEY}=${encodeURIComponent(locale)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // React state and the URL remain authoritative when cookies are blocked.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("lang", locale);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function roleSortWeight(role: ArenaPlayer["role"]) {
  if (role === "goalkeeper") return 0;
  if (role === "defender") return 1;
  if (role === "midfielder") return 2;
  return 3;
}

function buildLiveClubPreviewEleven(club: PremierClubVisual): TeamBuilderSquadPlayer[] {
  const slots: Array<{ role: ArenaPlayer["role"]; position: string; shirtNumber: number }> = [
    { role: "goalkeeper", position: "GK", shirtNumber: 1 },
    { role: "defender", position: "RB", shirtNumber: 2 },
    { role: "defender", position: "CB", shirtNumber: 4 },
    { role: "defender", position: "CB", shirtNumber: 5 },
    { role: "defender", position: "LB", shirtNumber: 3 },
    { role: "midfielder", position: "DM", shirtNumber: 6 },
    { role: "midfielder", position: "CM", shirtNumber: 8 },
    { role: "midfielder", position: "AM", shirtNumber: 10 },
    { role: "forward", position: "RW", shirtNumber: 7 },
    { role: "forward", position: "ST", shirtNumber: 9 },
    { role: "forward", position: "LW", shirtNumber: 11 },
  ];

  return slots.map((slot, index) => ({
    id: `live-preview-${club.teamId}-${index + 1}`,
    providerId: null,
    clubTeamId: club.teamId,
    name: `${club.shortCode} ${slot.position} ${slot.shirtNumber}`,
    shortName: `${club.shortCode} ${slot.position} ${slot.shirtNumber}`,
    role: slot.role,
    position: slot.position,
    shirtNumber: slot.shirtNumber,
    clubName: club.name,
    clubShortCode: club.shortCode,
    clubLogoUrl: club.logoUrl ?? null,
    marketValue: null,
    marketValueSource: "unavailable",
    countryCode3: null,
    flagUrl: null,
    nationality: null,
    source: "live-club-preview",
  }));
}

function buildLiveSimulationEleven(
  squad: TeamBuilderSquadPlayer[],
  club: PremierClubVisual,
  primary: TeamBuilderSquadPlayer[] = [],
  forbiddenPlayerIds: ReadonlySet<string> = new Set<string>(),
) {
  return buildTouchlineLiveEleven({
    club,
    fallback: buildLiveClubPreviewEleven(club),
    forbiddenPlayerIds,
    primary,
    squad,
  });
}

function normalizeLiveClubSquad(
  players: TeamBuilderSquadPlayer[],
  club: PremierClubVisual,
  responseTeamId: string | number | null | undefined,
) {
  return normalizeTouchlineLiveSquad(players, club, responseTeamId);
}

function fixtureStarterPlayersForClub(
  lineups: TouchlinePublicFantasyLineupMember[],
  squad: TeamBuilderSquadPlayer[],
  club: PremierClubVisual,
) {
  const squadByProviderId = new Map(
    squad.flatMap((player) => {
      const providerId = String(player.providerId ?? "").trim();
      return providerId ? [[providerId, player] as const] : [];
    }),
  );

  return lineups
    .filter((lineup) => lineup.isStarter === true && String(lineup.teamId ?? "").trim() === club.teamId)
    .map((lineup, index): TeamBuilderSquadPlayer => {
      const providerId = String(lineup.playerId ?? "").trim();
      const squadPlayer = providerId ? squadByProviderId.get(providerId) : null;
      const name = squadPlayer?.name || lineup.playerName || `${club.shortCode} Player ${index + 1}`;
      const position = lineup.position ?? squadPlayer?.position ?? null;
      return {
        ...(squadPlayer ?? {}),
        id: squadPlayer?.id || (providerId ? `sportmonks:${providerId}` : `${lineup.id}-${index + 1}`),
        providerId: squadPlayer?.providerId || providerId || null,
        clubTeamId: club.teamId,
        name,
        shortName: squadPlayer?.shortName || name.split(/\s+/).at(-1) || name,
        role: inferArenaRole(position ?? undefined),
        position,
        shirtNumber: lineup.jerseyNumber ?? squadPlayer?.shirtNumber ?? null,
        clubName: club.name,
        clubShortCode: club.shortCode,
        clubLogoUrl: club.logoUrl ?? squadPlayer?.clubLogoUrl ?? null,
        marketValue: squadPlayer?.marketValue ?? null,
        marketValueSource: squadPlayer?.marketValueSource ?? "unavailable",
        cardTier: squadPlayer?.cardTier ?? null,
        cardPriceVersion: squadPlayer?.cardPriceVersion ?? null,
        countryCode3: squadPlayer?.countryCode3 ?? null,
        flagUrl: squadPlayer?.flagUrl ?? null,
        nationality: squadPlayer?.nationality ?? null,
        source: "sportmonks_fixture_lineup",
      };
    });
}

function readStoredLiveSquad(club: PremierClubVisual) {
  if (typeof window === "undefined") return [] as TeamBuilderSquadPlayer[];
  try {
    const raw = readBrowserStorage("localStorage", `${ARENA_LIVE_SQUAD_STORAGE_PREFIX}:${club.teamId}`);
    if (!raw) return [];
    const stored = JSON.parse(raw) as Partial<StoredLiveSquad>;
    if (
      stored.teamId !== club.teamId
      || !Number.isFinite(stored.savedAt)
      || Date.now() - Number(stored.savedAt) > ARENA_LIVE_SQUAD_CACHE_MAX_AGE_MS
      || !Array.isArray(stored.players)
    ) {
      return [];
    }
    const isCoherent = stored.players.every((player): player is TeamBuilderSquadPlayer => Boolean(
      player
      && typeof player === "object"
      && typeof player.id === "string"
      && typeof player.name === "string"
      && typeof player.clubName === "string",
    ));
    if (!isCoherent) {
      removeBrowserStorage("localStorage", `${ARENA_LIVE_SQUAD_STORAGE_PREFIX}:${club.teamId}`);
      return [];
    }
    const normalizedPlayers = normalizeLiveClubSquad(stored.players, club, stored.teamId);
    if (normalizedPlayers.length !== stored.players.length) {
      removeBrowserStorage("localStorage", `${ARENA_LIVE_SQUAD_STORAGE_PREFIX}:${club.teamId}`);
      return [];
    }
    return normalizedPlayers;
  } catch {
    return [];
  }
}

function writeStoredLiveSquad(club: PremierClubVisual, players: TeamBuilderSquadPlayer[]) {
  if (typeof window === "undefined" || players.length < 11) return;
  const normalizedPlayers = normalizeLiveClubSquad(players, club, club.teamId);
  if (normalizedPlayers.length < 11) return;
  writeBrowserStorage(
    "localStorage",
    `${ARENA_LIVE_SQUAD_STORAGE_PREFIX}:${club.teamId}`,
    JSON.stringify({ teamId: club.teamId, savedAt: Date.now(), players: normalizedPlayers } satisfies StoredLiveSquad),
  );
}

function isStoredLiveTeam(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const team = value as NonNullable<TouchlineFixture["homeTeam"]>;
  return typeof team.id === "string"
    && Boolean(team.id.trim())
    && typeof team.providerId === "string"
    && /^[0-9]{1,20}$/.test(team.providerId.trim())
    && typeof team.name === "string"
    && Boolean(team.name.trim());
}

function isStoredLiveFixture(value: unknown): value is TouchlineFixture {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fixture = value as Partial<TouchlineFixture>;
  return typeof fixture.id === "string"
    && Boolean(fixture.id.trim())
    && typeof fixture.providerId === "string"
    // Production provider IDs are numeric, while the canonical QA schedule
    // uses stable representative IDs (for example qa-representative-01).
    // This is a browser-cache shape check, not provider identity validation:
    // the server has already selected and published this read-only snapshot.
    && Boolean(fixture.providerId.trim())
    && isStoredLiveTeam(fixture.homeTeam)
    && isStoredLiveTeam(fixture.awayTeam);
}

function readStoredLiveFixtureSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    const raw = readBrowserStorage("localStorage", ARENA_LIVE_FIXTURE_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredLiveFixtureSnapshot>;
    const isCoherent = stored.version === 1
      && Number.isFinite(stored.savedAt)
      && Date.now() - Number(stored.savedAt) <= ARENA_LIVE_FIXTURE_CACHE_MAX_AGE_MS
      && typeof stored.fetchedAt === "string"
      && Number.isFinite(Date.parse(stored.fetchedAt))
      && Array.isArray(stored.fixtures)
      && stored.fixtures.every(isStoredLiveFixture);
    if (!isCoherent) {
      removeBrowserStorage("localStorage", ARENA_LIVE_FIXTURE_SNAPSHOT_STORAGE_KEY);
      return null;
    }
    return stored as StoredLiveFixtureSnapshot;
  } catch {
    removeBrowserStorage("localStorage", ARENA_LIVE_FIXTURE_SNAPSHOT_STORAGE_KEY);
    return null;
  }
}

function writeStoredLiveFixtureSnapshot(fixtures: TouchlineFixture[], fetchedAt?: string) {
  if (typeof window === "undefined" || !fixtures.every(isStoredLiveFixture)) return;
  if (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt))) return;
  const now = Date.now();
  const savedAt = Math.min(now, Date.parse(fetchedAt));
  writeBrowserStorage(
    "localStorage",
    ARENA_LIVE_FIXTURE_SNAPSHOT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      savedAt,
      fetchedAt,
      fixtures,
    } satisfies StoredLiveFixtureSnapshot),
  );
}

function LiveAtomicCardShell({
  children,
  className,
  label,
  playerId,
  playerName,
  readinessId,
  style,
  onOpen,
}: {
  children: ReactNode;
  className: string;
  label: string;
  playerId: string;
  playerName: string;
  readinessId: string;
  style: CSSProperties;
  onOpen: () => void;
}) {
  return (
    <span
      className={`${className} is-card-ready`}
      role="button"
      tabIndex={0}
      aria-label={label}
      data-live-player-id={playerId}
      data-live-card-readiness-id={readinessId}
      title={playerName}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      style={style}
    >
      {children}
    </span>
  );
}

const StableLiveCoachCard = memo(TouchlineCoachCard);
const StableLivePlayerCard = memo(TouchlineEliteExactCard);
const StableMarketPreviewCard = memo(TouchlineEliteExactCard);

type LiveSimulationPlayerCardProps = {
  cardLabels: Partial<TouchlineEliteExactCardLabels>;
  labelPrefix: string;
  onOpen: (playerId: string) => void;
  player: TeamBuilderSquadPlayer;
  readinessId: string;
  side: "home" | "away";
  slotIndex: number;
  siteLanguage: TouchLineLocale;
};

const LiveSimulationPlayerCard = memo(function LiveSimulationPlayerCard({
  cardLabels,
  labelPrefix,
  onOpen,
  player,
  readinessId,
  side,
  slotIndex,
  siteLanguage,
}: LiveSimulationPlayerCardProps) {
  const position = LIVE_MATCH_SIMULATION_POSITIONS[Math.max(0, Math.min(slotIndex, 10))];
  const direction = side === "home" ? 1 : -1;
  const playerId = stableBuilderPlayerId(player);
  const cardX = side === "home" ? position.x : 100 - position.x;
  const cardDx = direction * (0.7 + ((slotIndex + 1) % 3) * 0.34);
  const cardDy = (slotIndex % 2 === 0 ? -1 : 1) * (0.65 + (slotIndex % 4) * 0.22);
  const previewCard = builderPlayerToPreviewCard(player);
  const livePreviewCard = {
    ...previewCard,
    clubLogoUrl: liveOptimizedClubLogoUrl(previewCard.clubLogoUrl) ?? previewCard.clubLogoUrl,
  };
  return (
    <LiveAtomicCardShell
      className={`arena-live-moving-card is-${side}`}
      label={`${labelPrefix} ${player.name}`}
      playerId={playerId}
      playerName={player.name}
      readinessId={readinessId}
      onOpen={() => onOpen(playerId)}
      style={{
        "--live-card-x": `${cardX}%`,
        "--live-card-y": `${position.y}%`,
        "--live-card-dx-start": `${-cardDx}vw`,
        "--live-card-dy-start": `${-cardDy}vh`,
        "--live-card-dx": `${cardDx}vw`,
        "--live-card-dy": `${cardDy}vh`,
        "--live-card-duration": `${7.2 + (slotIndex % 5) * 0.58}s`,
        "--live-card-delay": `${-0.8 - slotIndex * 0.47}s`,
      } as CSSProperties}
    >
      <span className="arena-live-compact-card-product">
        <StableLivePlayerCard
          player={livePreviewCard}
          labels={cardLabels}
          imageLoading="eager"
          optimizeForLiveCompact
          runtimeLocaleOverride={siteLanguage}
          subscribeToRanking
          enableInteractiveNeon={false}
          showCardActions={false}
          showProfileAction={false}
          showMatchPoints={false}
          showSocialMetrics={false}
          rankingMode="preview"
        />
      </span>
    </LiveAtomicCardShell>
  );
});

function waitForLiveHtmlImage(
  image: HTMLImageElement,
  listenerCleanups: Array<() => void>,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let safetyTimer = 0;

    const cleanup = () => {
      window.clearTimeout(safetyTimer);
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };
    const finish = async () => {
      if (settled || !image.complete || image.naturalWidth <= 0) return;
      try {
        await image.decode();
      } catch {
        // Safari can reject decode() for an already paintable cached/SVG image.
      }
      if (settled || !image.complete || image.naturalWidth <= 0) return;
      settled = true;
      cleanup();
      resolve();
    };
    const handleLoad = () => {
      void finish();
    };
    const handleError = () => {
      const failedSource = image.currentSrc || image.src;
      queueMicrotask(() => {
        if (settled) return;
        // Player frames replace a missing club template with the tier fallback
        // in their React error handler. Keep waiting when that source changed.
        if ((image.currentSrc || image.src) !== failedSource || image.src !== failedSource) {
          void finish();
          return;
        }
        settled = true;
        cleanup();
        reject(new Error(`Live card asset failed: ${failedSource}`));
      });
    };

    listenerCleanups.push(cleanup);
    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);
    // Safari occasionally leaves decode() pending even though the compact
    // WebP is already paintable. Never let one 6–25 KB frame keep all 22
    // players and both coaches hidden. The individual card surface still
    // stays atomic, so this short guard cannot expose a half-built product.
    safetyTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, 480);
    void finish();
  });
}

function livePlayerProductSignature(player: TeamBuilderSquadPlayer) {
  return [
    stableBuilderPlayerId(player),
    player.name,
    player.shirtNumber ?? "",
    player.cardTier ?? "",
    player.clubName,
    player.clubLogoUrl ?? "",
    player.countryCode3,
    player.flagUrl ?? "",
    player.marketValue ?? "",
  ].join("~");
}

function buildLiveSimulationCardProducts({
  fixtureId,
  homeSquad,
  awaySquad,
  homeClub,
  awayClub,
}: {
  fixtureId: string;
  homeSquad: TeamBuilderSquadPlayer[];
  awaySquad: TeamBuilderSquadPlayer[];
  homeClub: PremierClubVisual;
  awayClub: PremierClubVisual;
}): LiveSimulationCardProduct[] {
  const homeEleven = buildLiveSimulationEleven(homeSquad, homeClub);
  const homePlayerIds = new Set(homeEleven.map(touchlineLivePlayerIdentity));
  const awayEleven = buildLiveSimulationEleven(awaySquad, awayClub, [], homePlayerIds);

  return [
    ...homeEleven.map((player, slotIndex) => ({
      player,
      side: "home" as const,
      slotIndex,
      readinessId: `${fixtureId}:home:${slotIndex}:${livePlayerProductSignature(player)}`,
    })),
    ...awayEleven.map((player, slotIndex) => ({
      player,
      side: "away" as const,
      slotIndex,
      readinessId: `${fixtureId}:away:${slotIndex}:${livePlayerProductSignature(player)}`,
    })),
  ];
}

function buildLiveProductSignature({
  locale,
  cards,
  homeCoach,
  awayCoach,
}: {
  locale: TouchLineLocale;
  cards: LiveSimulationCardProduct[];
  homeCoach: LiveProductCoachSignature;
  awayCoach: LiveProductCoachSignature;
}) {
  if (cards.length !== 22) return "";
  return [
    locale,
    ...cards.map(({ readinessId }) => readinessId),
    `home-coach:${homeCoach.teamId}:${homeCoach.cardTier}:${homeCoach.coachId}:${homeCoach.countryCode3}`,
    `away-coach:${awayCoach.teamId}:${awayCoach.cardTier}:${awayCoach.coachId}:${awayCoach.countryCode3}`,
  ].join("|");
}

function liveCompactPlayerFrameUrl(player: TeamBuilderSquadPlayer) {
  const previewCard = builderPlayerToPreviewCard(player);
  const sourceUrl = previewCard.cardTemplateUrl;
  return sourceUrl ? touchlineLiveCompactFrameUrl(sourceUrl) : null;
}

function liveCanonicalPlayerAssetUrls(player: TeamBuilderSquadPlayer) {
  const previewCard = builderPlayerToPreviewCard(player);
  const countryCode = normalizeTouchlineCountryCode3(previewCard.countryCode3);
  const flagUrl = touchlineCountryFlagUrl(countryCode) || previewCard.flagUrl;
  const clubLogoUrl = liveOptimizedClubLogoUrl(previewCard.clubLogoUrl) ?? previewCard.clubLogoUrl;

  return [
    liveCompactPlayerFrameUrl(player),
    flagUrl,
    clubLogoUrl,
    "/touchlineArena/brand/tl-shield-lime.svg",
    ...Object.values(TOUCHLINE_SHIRT_DIGIT_ASSETS),
  ];
}

async function preloadLiveProductImages(urls: Array<string | null | undefined>, timeoutMs = 1_200) {
  if (typeof window === "undefined" || typeof window.Image === "undefined") return;
  const uniqueUrls = Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
  if (!uniqueUrls.length) return;

  let timeoutId = 0;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = window.setTimeout(resolve, timeoutMs);
  });
  const preload = Promise.allSettled(uniqueUrls.map((url) => new Promise<void>((resolve) => {
    const image = new window.Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      resolve();
    };
    image.decoding = "sync";
    image.onload = () => {
      if (typeof image.decode === "function") {
        void image.decode().catch(() => undefined).finally(finish);
      } else {
        finish();
      }
    };
    image.onerror = finish;
    image.src = url;
    if (image.complete && image.naturalWidth > 0) finish();
  }))).then(() => undefined);

  await Promise.race([preload, timeout]);
  window.clearTimeout(timeoutId);
}

function trainingCenterPlayerSlots(players: ArenaPlayer[]) {
  const slots = new Map<string, { x: number; y: number }>();
  const lines: Array<{ role: ArenaPlayer["role"]; x: number }> = [
    { role: "goalkeeper", x: 9 },
    { role: "defender", x: 34 },
    { role: "midfielder", x: 61 },
    { role: "forward", x: 88 },
  ];

  for (const line of lines) {
    const linePlayers = players.filter((player) => player.role === line.role);
    const spacing = linePlayers.length > 1 ? 72 / (linePlayers.length - 1) : 0;
    linePlayers.forEach((player, index) => {
      slots.set(player.id, {
        x: line.x,
        y: linePlayers.length === 1 ? 50 : 14 + (spacing * index),
      });
    });
  }

  return slots;
}

function parseArenaFormationKey(value?: string | null): ArenaFormationKey {
  return FINALIZED_ARENA_FORMATION_KEYS.has(value as ArenaFormationKey)
    ? (value as ArenaFormationKey)
    : DEFAULT_ARENA_FORMATION_KEY;
}

function arenaFormationDefinition(formationKey: ArenaFormationKey) {
  return ARENA_FORMATIONS.find((formation) => formation.key === formationKey) ?? ARENA_FORMATIONS[0];
}

function isFinalizedArenaFormation(formationKey: ArenaFormationKey) {
  return FINALIZED_ARENA_FORMATION_KEYS.has(formationKey);
}

function readLockedFormationLayouts(principal?: ArenaPersistencePrincipal | null): ArenaFormationLockedLayout {
  const seed = formationLockSeed as unknown as ArenaFormationLockedLayout;
  if (typeof window === "undefined" || !principal) return seed;

  try {
    const parsed = JSON.parse(
      readBrowserStorage(
        "localStorage",
        arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.formationLocks),
      ) ?? "{}",
    ) as ArenaFormationLockedLayout;
    const persisted = parsed && typeof parsed === "object" ? parsed : {};
    const normalizedPersisted = Object.fromEntries(
      Object.entries(persisted).map(([formationKey, layout]) => {
        if (!isFinalizedArenaFormation(formationKey as ArenaFormationKey) || !layout || typeof layout !== "object") {
          return [formationKey, layout];
        }

        // The first Arena build persisted a separate absolute camera layout
        // for the protected 4-3-3 / 4-4-2 formations. Those coordinates were
        // tied to one viewport and can make official cards overlap on WebKit.
        // The canonical formation remains saved; only the obsolete camera
        // projection is discarded so every viewport uses the tested profile.
        const { cameras: _obsoleteCameraLayouts, ...canonicalLayout } = layout as ArenaFormationLockEntry;
        return [formationKey, canonicalLayout];
      }),
    ) as ArenaFormationLockedLayout;

    return {
      ...seed,
      ...normalizedPersisted,
    } as ArenaFormationLockedLayout;
  } catch {
    return seed;
  }
}

function readLockedFormationLayout(
  formationKey: ArenaFormationKey,
  principal?: ArenaPersistencePrincipal | null,
) {
  return readLockedFormationLayouts(principal)[formationKey] ?? null;
}

function touchlineInvalidJsonPayload<T>(reason: string) {
  return {
    ok: false,
    error: reason,
  } as T;
}

async function readTouchlineJsonPayload<T>(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return touchlineInvalidJsonPayload<T>(`${PUBLIC_DATA_SOURCE_LABEL} returned empty data`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return touchlineInvalidJsonPayload<T>(`${PUBLIC_DATA_SOURCE_LABEL} returned invalid data`);
  }
}

function buildRoleLayoutFromSlots(players: ArenaPlayer[], slotsByPlayerId: Map<string, Pick<ArenaPlayer, "x" | "y" | "heightVh">>) {
  const roleCounts: Record<ArenaPlayer["role"], number> = {
    goalkeeper: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  };
  const lockedLayout: ArenaFormationRoleLayout = {
    goalkeeper: [],
    defender: [],
    midfielder: [],
    forward: [],
  };

  players.forEach((player) => {
    const roleIndex = roleCounts[player.role]++;
    const slot = slotsByPlayerId.get(player.id) ?? player;
    lockedLayout[player.role]![roleIndex] = {
      x: slot.x,
      y: slot.y,
      heightVh: slot.heightVh ?? player.heightVh ?? ARENA_CARD_COMPACT_HEIGHT_VH,
    };
  });

  return lockedLayout;
}

function writeLockedFormationLayout(formationKey: ArenaFormationKey, cameraId: string, players: ArenaPlayer[], slotsByPlayerId: Map<string, Pick<ArenaPlayer, "x" | "y" | "heightVh">>, principal: ArenaPersistencePrincipal) {
  if (typeof window === "undefined") return;

  const layouts = readLockedFormationLayouts(principal);
  const entry = layouts[formationKey] ?? {};
  const cameras = entry.cameras ?? {};
  cameras[cameraId] = buildRoleLayoutFromSlots(players, slotsByPlayerId);
  layouts[formationKey] = { ...entry, cameras };
  writeBrowserStorage(
    "localStorage",
    arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.formationLocks),
    JSON.stringify(layouts),
  );
}

function touchlineJsonRequest<T>(
  url: string,
  cacheOrOptions: RequestCache | { cache?: RequestCache; timeoutMs?: number; signal?: AbortSignal } = "no-store",
): Promise<{ ok: boolean; status: number; payload: T }> {
  const options = typeof cacheOrOptions === "string"
    ? { cache: cacheOrOptions }
    : cacheOrOptions;
  const cache = options.cache ?? "no-store";

  if (typeof fetch === "function") {
    const controller = options.timeoutMs ? new AbortController() : null;
    const handleCallerAbort = () => controller?.abort(options.signal?.reason);
    if (controller && options.signal) {
      if (options.signal.aborted) handleCallerAbort();
      else options.signal.addEventListener("abort", handleCallerAbort, { once: true });
    }
    const timeout = controller
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null;
    return fetch(url, {
      cache,
      ...((controller?.signal ?? options.signal) ? { signal: controller?.signal ?? options.signal } : {}),
    }).then(async (response) => {
      const payload = await readTouchlineJsonPayload<T>(response);
      return {
        ok: response.ok && !(payload && typeof payload === "object" && "ok" in payload && payload.ok === false),
        status: response.status,
        payload,
      };
    }).finally(() => {
      if (timeout !== null) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", handleCallerAbort);
    });
  }

  if (typeof XMLHttpRequest === "undefined") {
    return Promise.reject(new Error(`${PUBLIC_DATA_SOURCE_LABEL} browser request unavailable`));
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => options.signal?.removeEventListener("abort", handleCallerAbort);
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleCallerAbort = () => {
      request.abort();
      rejectOnce(options.signal?.reason ?? new Error(`${PUBLIC_DATA_SOURCE_LABEL} request aborted`));
    };
    request.open("GET", url, true);
    if (options.timeoutMs) request.timeout = options.timeoutMs;
    request.setRequestHeader("Accept", "application/json");
    request.onload = () => {
      if (settled) return;
      try {
        const responseText = request.responseText.trim();
        const payload = responseText
          ? JSON.parse(responseText) as T
          : touchlineInvalidJsonPayload<T>(`${PUBLIC_DATA_SOURCE_LABEL} returned empty data`);
        settled = true;
        cleanup();
        resolve({
          ok: request.status >= 200 && request.status < 300 && !(payload && typeof payload === "object" && "ok" in payload && payload.ok === false),
          status: request.status,
          payload,
        });
      } catch {
        rejectOnce(new Error(`${PUBLIC_DATA_SOURCE_LABEL} returned invalid data`));
      }
    };
    request.onerror = () => rejectOnce(new Error(`${PUBLIC_DATA_SOURCE_LABEL} request failed`));
    request.ontimeout = () => rejectOnce(new Error(`${PUBLIC_DATA_SOURCE_LABEL} request timed out`));
    request.onabort = () => rejectOnce(new Error(`${PUBLIC_DATA_SOURCE_LABEL} request aborted`));
    if (options.signal?.aborted) {
      handleCallerAbort();
      return;
    }
    options.signal?.addEventListener("abort", handleCallerAbort, { once: true });
    request.send();
  });
}

async function writeLockedFormationLayoutToProject(formationKey: ArenaFormationKey, cameraId: string, players: ArenaPlayer[], slotsByPlayerId: Map<string, Pick<ArenaPlayer, "x" | "y" | "heightVh">>, principal: ArenaPersistencePrincipal) {
  const layouts = readLockedFormationLayouts(principal);
  writeLockedFormationLayout(formationKey, cameraId, players, slotsByPlayerId, principal);
  const layout = readLockedFormationLayouts(principal)[formationKey] ?? layouts[formationKey];
  if (!layout) return;
  if (typeof fetch !== "function") return;

  await fetch("/api/touchline-arena/formation-locks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ formationKey, layout }),
  });
}

function removeLockedFormationCameraLayout(formationKey: ArenaFormationKey, cameraId: string, principal: ArenaPersistencePrincipal) {
  if (typeof window === "undefined") return null;
  const layouts = readLockedFormationLayouts(principal);
  const entry = layouts[formationKey];
  if (!entry?.cameras?.[cameraId]) return entry ?? null;

  const cameras = { ...entry.cameras };
  delete cameras[cameraId];
  layouts[formationKey] = { ...entry, cameras };
  writeBrowserStorage(
    "localStorage",
    arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.formationLocks),
    JSON.stringify(layouts),
  );
  return layouts[formationKey];
}

async function removeLockedFormationCameraLayoutFromProject(formationKey: ArenaFormationKey, cameraId: string, principal: ArenaPersistencePrincipal) {
  const layout = removeLockedFormationCameraLayout(formationKey, cameraId, principal);
  if (typeof fetch !== "function") return;
  await fetch("/api/touchline-arena/formation-locks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ formationKey, layout: layout ?? {} }),
  });
}

function arenaLineYPositions(count: number) {
  const positions: Record<number, number[]> = {
    1: [52],
    2: [43, 61],
    3: [38, 52, 66],
    4: [34, 46, 58, 70],
    5: [31, 41, 52, 63, 73],
  };
  return positions[count] ?? positions[5];
}

function arenaLineSlotBlueprints(count: number, role: ArenaPlayer["role"]) {
  if (role === "goalkeeper") return [{ y: 52, xOffset: 0 }];

  const safeCount = Math.min(5, Math.max(1, count));
  const fallback = arenaLineYPositions(safeCount).map((y) => ({ y, xOffset: 0 }));

  if (role === "defender") {
    const defenderSlots: Record<number, Array<{ y: number; xOffset: number }>> = {
      2: [
        { y: 44, xOffset: 1.4 },
        { y: 60, xOffset: 1.4 },
      ],
      3: [
        { y: 37, xOffset: 1.1 },
        { y: 52, xOffset: 1.5 },
        { y: 67, xOffset: 1.1 },
      ],
      4: [
        { y: 27, xOffset: -0.8 },
        { y: 43, xOffset: 1.7 },
        { y: 61, xOffset: 1.7 },
        { y: 77, xOffset: -0.8 },
      ],
      5: [
        { y: 26, xOffset: -1 },
        { y: 38, xOffset: 1.4 },
        { y: 52, xOffset: 1.8 },
        { y: 66, xOffset: 1.4 },
        { y: 78, xOffset: -1 },
      ],
    };
    return defenderSlots[safeCount] ?? fallback;
  }

  if (role === "midfielder") {
    const midfielderSlots: Record<number, Array<{ y: number; xOffset: number }>> = {
      2: [
        { y: 41, xOffset: -0.6 },
        { y: 63, xOffset: 0.6 },
      ],
      3: [
        { y: 37, xOffset: -0.5 },
        { y: 52, xOffset: 0 },
        { y: 67, xOffset: 2.4 },
      ],
      4: [
        { y: 33, xOffset: -0.8 },
        { y: 45, xOffset: 0 },
        { y: 59, xOffset: 1.2 },
        { y: 71, xOffset: -0.8 },
      ],
      5: [
        { y: 30, xOffset: -1 },
        { y: 40, xOffset: 0 },
        { y: 52, xOffset: 1.2 },
        { y: 64, xOffset: 0 },
        { y: 74, xOffset: -1 },
      ],
    };
    return midfielderSlots[safeCount] ?? fallback;
  }

  const forwardSlots: Record<number, Array<{ y: number; xOffset: number }>> = {
    1: [{ y: 52, xOffset: 4.8 }],
    2: [
      { y: 46, xOffset: 2.8 },
      { y: 58, xOffset: 2.8 },
    ],
    3: [
      { y: 35, xOffset: -2.2 },
      { y: 52, xOffset: 4.8 },
      { y: 69, xOffset: -2.2 },
    ],
    4: [
      { y: 34, xOffset: -2 },
      { y: 46, xOffset: 2.2 },
      { y: 58, xOffset: 2.2 },
      { y: 70, xOffset: -2 },
    ],
    5: [
      { y: 32, xOffset: -2.2 },
      { y: 43, xOffset: 1.5 },
      { y: 52, xOffset: 4.8 },
      { y: 61, xOffset: 1.5 },
      { y: 72, xOffset: -2.2 },
    ],
  };
  return forwardSlots[safeCount] ?? fallback;
}

function buildArenaLineSlots(count: number, x: number, role: ArenaPlayer["role"]) {
  return arenaLineSlotBlueprints(count, role).map((slot) => ({
    x: x + slot.xOffset,
    y: slot.y,
    heightVh: ARENA_CARD_COMPACT_HEIGHT_VH,
  }));
}

function arenaSlotsForFormation(
  formationKey: ArenaFormationKey,
  principal?: ArenaPersistencePrincipal | null,
): Record<ArenaPlayer["role"], Array<Pick<ArenaPlayer, "x" | "y" | "heightVh">>> {
  const formation = arenaFormationDefinition(formationKey);
  const lockedLayout = readLockedFormationLayout(formationKey, principal);

  return {
    goalkeeper: lockedLayout?.goalkeeper?.length ? lockedLayout.goalkeeper : [{ x: ARENA_ROLE_LINE_X.goalkeeper, y: 52, heightVh: ARENA_CARD_COMPACT_HEIGHT_VH }],
    defender: lockedLayout?.defender?.length ? lockedLayout.defender : buildArenaLineSlots(formation.defenders, ARENA_ROLE_LINE_X.defender, "defender"),
    midfielder: lockedLayout?.midfielder?.length ? lockedLayout.midfielder : buildArenaLineSlots(formation.midfielders, ARENA_ROLE_LINE_X.midfielder, "midfielder"),
    forward: lockedLayout?.forward?.length ? lockedLayout.forward : buildArenaLineSlots(formation.forwards, ARENA_ROLE_LINE_X.forward, "forward"),
  };
}

function constrainArenaDisplaySlot(
  player: Pick<ArenaPlayer, "role">,
  slot: Pick<ArenaPlayer, "x" | "y" | "heightVh">,
  cameraIndex: number,
) {
  const profile = arenaLoopCameraProfile(cameraIndex);
  return {
    x: clampArenaDisplayPosition(slot.x, profile.xLimits[player.role]),
    y: clampArenaDisplayPosition(slot.y, profile.yLimits[player.role]),
    heightVh: Math.min(
      ARENA_CARD_MAX_HEIGHT_VH,
      Math.max(ARENA_CARD_MIN_HEIGHT_VH, slot.heightVh ?? ARENA_CARD_COMPACT_HEIGHT_VH),
    ),
  };
}

function roleLayoutForPlayers(
  players: ArenaPlayer[],
  layout: ArenaFormationRoleLayout | null | undefined,
  cameraIndex: number,
) {
  if (!layout) return null;
  const roleCounts: Record<ArenaPlayer["role"], number> = {
    goalkeeper: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  };

  return new Map(
    players.flatMap((player) => {
      const roleIndex = roleCounts[player.role]++;
      const slot = layout[player.role]?.[roleIndex];
      return slot ? [[player.id, constrainArenaDisplaySlot(player, slot, cameraIndex)] as const] : [];
    }),
  );
}

function maxArenaPlayersForRole(role: ArenaPlayer["role"], formationKey: ArenaFormationKey) {
  const formation = arenaFormationDefinition(formationKey);
  if (role === "goalkeeper") return 1;
  if (role === "defender") return formation.defenders;
  if (role === "midfielder") return formation.midfielders;
  return formation.forwards;
}

function clampArenaPlayerPosition(player: Pick<ArenaPlayer, "role">, position: Pick<ArenaPlayer, "x" | "y">) {
  const xLimit = ARENA_ROLE_HORIZONTAL_LIMITS[player.role];
  const yLimit = ARENA_ROLE_VERTICAL_LIMITS[player.role];
  return {
    x: Math.min(xLimit.max, Math.max(xLimit.min, Math.round(position.x))),
    y: Math.min(yLimit.max, Math.max(yLimit.min, Math.round(position.y))),
  };
}

function clampArenaDisplayPosition(value: number, limit: ArenaPositionLimit) {
  return Math.min(limit.max, Math.max(limit.min, Math.round(value * 10) / 10));
}

function arenaLoopCameraProfile(cameraIndex: number) {
  return ARENA_LOOP_CAMERA_PROFILES[cameraIndex] ?? ARENA_LOOP_CAMERA_PROFILES[0];
}

function projectArenaPlayerForLoopCamera(player: ArenaPlayer, cameraIndex: number) {
  const profile = arenaLoopCameraProfile(cameraIndex);
  const baseLineX = ARENA_ROLE_LINE_X[player.role];
  const x = profile.roleLineX[player.role] + (player.x - baseLineX) * profile.xScale;
  const y = profile.yAnchor + (player.y - 52) * profile.yScale + profile.yOffsetByRole[player.role];
  const heightScale = Math.min(ARENA_CARD_MAX_HEIGHT_VH, Math.max(ARENA_CARD_MIN_HEIGHT_VH, player.heightVh ?? ARENA_CARD_COMPACT_HEIGHT_VH)) / ARENA_CARD_COMPACT_HEIGHT_VH;

  return {
    x: clampArenaDisplayPosition(x, profile.xLimits[player.role]),
    y: clampArenaDisplayPosition(y, profile.yLimits[player.role]),
    heightVh: Math.round(profile.cardHeightVh * heightScale * 10) / 10,
  };
}

function projectArenaPlayersForLoopCamera(players: ArenaPlayer[], cameraIndex: number) {
  const profile = arenaLoopCameraProfile(cameraIndex);
  const roleCounts: Record<ArenaPlayer["role"], number> = {
    goalkeeper: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  };

  return new Map(
    players.map((player) => {
      const roleIndex = roleCounts[player.role]++;
      const projected = projectArenaPlayerForLoopCamera(player, cameraIndex);
      const xOffset = profile.roleIndexXOffsets?.[player.role]?.[roleIndex] ?? 0;
      const yOffset = profile.roleIndexYOffsets?.[player.role]?.[roleIndex] ?? 0;

      return [player.id, {
        ...projected,
        x: clampArenaDisplayPosition(projected.x + xOffset, profile.xLimits[player.role]),
        y: clampArenaDisplayPosition(projected.y + yOffset, profile.yLimits[player.role]),
      }] as const;
    }),
  );
}

function lockArenaPlayerSize(player: ArenaPlayer) {
  return {
    ...player,
    heightVh: Math.min(ARENA_CARD_MAX_HEIGHT_VH, Math.max(ARENA_CARD_MIN_HEIGHT_VH, player.heightVh ?? ARENA_CARD_COMPACT_HEIGHT_VH)),
  };
}

function normalizeArenaPlayersForFormation(
  players: ArenaPlayer[],
  formationKey: ArenaFormationKey,
  principal?: ArenaPersistencePrincipal | null,
) {
  const roleTotals = players.reduce<Record<ArenaPlayer["role"], number>>(
    (totals, player) => {
      totals[player.role] += 1;
      return totals;
    },
    { goalkeeper: 0, defender: 0, midfielder: 0, forward: 0 },
  );
  const lockedLayout = readLockedFormationLayout(formationKey, principal);
  const slots: Record<ArenaPlayer["role"], Array<Pick<ArenaPlayer, "x" | "y" | "heightVh">>> = {
    goalkeeper: lockedLayout?.goalkeeper?.length ? lockedLayout.goalkeeper : [{ x: ARENA_ROLE_LINE_X.goalkeeper, y: 52, heightVh: ARENA_CARD_COMPACT_HEIGHT_VH }],
    defender: lockedLayout?.defender?.length ? lockedLayout.defender : buildArenaLineSlots(Math.min(roleTotals.defender, maxArenaPlayersForRole("defender", formationKey)), ARENA_ROLE_LINE_X.defender, "defender"),
    midfielder: lockedLayout?.midfielder?.length ? lockedLayout.midfielder : buildArenaLineSlots(Math.min(roleTotals.midfielder, maxArenaPlayersForRole("midfielder", formationKey)), ARENA_ROLE_LINE_X.midfielder, "midfielder"),
    forward: lockedLayout?.forward?.length ? lockedLayout.forward : buildArenaLineSlots(Math.min(roleTotals.forward, maxArenaPlayersForRole("forward", formationKey)), ARENA_ROLE_LINE_X.forward, "forward"),
  };
  const roleCounts: Record<ArenaPlayer["role"], number> = {
    goalkeeper: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  };

  return players.map((player, index) => {
    const slotIndex = roleCounts[player.role]++;
    const slot = slots[player.role][slotIndex] ?? TEAM_BUILDER_SLOTS[player.role][slotIndex] ?? TEAM_BUILDER_GENERIC_SLOTS[index] ?? TEAM_BUILDER_GENERIC_SLOTS.at(-1)!;
    const position = clampArenaPlayerPosition(player, { x: slot.x, y: slot.y });
    return {
      ...player,
      ...position,
      heightVh: ARENA_CARD_COMPACT_HEIGHT_VH,
    };
  });
}

type DemoArenaPlayerSeed = {
  id: string;
  name: string;
  shortName: string;
  role: ArenaPlayer["role"];
  clubName: string;
  shirtNumber: number;
  position: string;
  countryCode3: string;
};

const DEMO_ARENA_PLAYER_SEEDS: DemoArenaPlayerSeed[] = [
  { id: "alisson", name: "Alisson Becker", shortName: "Alisson", role: "goalkeeper", clubName: "Liverpool", shirtNumber: 1, position: "GK", countryCode3: "BRA" },
  { id: "reece-james", name: "Reece James", shortName: "R. James", role: "defender", clubName: "Chelsea", shirtNumber: 24, position: "DEF", countryCode3: "ENG" },
  { id: "ibrahima-konate", name: "Ibrahima Konate", shortName: "Konate", role: "defender", clubName: "Liverpool", shirtNumber: 5, position: "DEF", countryCode3: "FRA" },
  { id: "sven-botman", name: "Sven Botman", shortName: "Botman", role: "defender", clubName: "Newcastle United", shirtNumber: 4, position: "DEF", countryCode3: "NED" },
  { id: "antonee-robinson", name: "Antonee Robinson", shortName: "Robinson", role: "defender", clubName: "Fulham", shirtNumber: 33, position: "DEF", countryCode3: "USA" },
  { id: "moises-caicedo", name: "Moises Caicedo", shortName: "Caicedo", role: "midfielder", clubName: "Chelsea", shirtNumber: 25, position: "MEI", countryCode3: "ECU" },
  { id: "bruno-guimaraes", name: "Bruno Guimaraes", shortName: "Bruno G.", role: "midfielder", clubName: "Newcastle United", shirtNumber: 39, position: "MEI", countryCode3: "BRA" },
  { id: "morgan-rogers", name: "Morgan Rogers", shortName: "Rogers", role: "midfielder", clubName: "Aston Villa", shirtNumber: 27, position: "MEI", countryCode3: "ENG" },
  { id: "mohamed-salah", name: "Mohamed Salah", shortName: "Salah", role: "forward", clubName: "Liverpool", shirtNumber: 11, position: "ATA", countryCode3: "EGY" },
  { id: "alexander-isak", name: "Alexander Isak", shortName: "Isak", role: "forward", clubName: "Newcastle United", shirtNumber: 14, position: "ATA", countryCode3: "SWE" },
  { id: "ollie-watkins", name: "Ollie Watkins", shortName: "Watkins", role: "forward", clubName: "Aston Villa", shirtNumber: 11, position: "ATA", countryCode3: "ENG" },
];

function makeDemoArenaPlayer(seed: DemoArenaPlayerSeed): ArenaPlayer {
  const marketValue = "Pending";
  const cardTier = touchlineArenaCompetitionTierForCard().key;

  return {
    id: `demo-${seed.id}`,
    name: seed.name,
    shortName: seed.shortName,
    role: seed.role,
    asset: findApprovedArenaAsset(seed.name),
    x: ARENA_ROLE_LINE_X[seed.role],
    y: 52,
    heightVh: ARENA_CARD_COMPACT_HEIGHT_VH,
    card: {
      templateUrl: touchlineArenaClubTemplateForCard(seed.clubName, marketValue, cardTier) || "",
      playerName: seed.name,
      shirtNumber: seed.shirtNumber,
      clubName: seed.clubName,
      position: seed.position,
      countryCode3: seed.countryCode3,
      flagUrl: null,
      fantasyPoints: "0.0",
      marketValue,
      marketValueSource: "unavailable",
      cardTier,
      cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
      matchStats: { goals: 0, assists: 0, defense: 0, cleanSheets: 0, cards: 0 },
    },
  };
}

function buildDemoArenaPlayers(formationKey: ArenaFormationKey) {
  return normalizeArenaPlayersForFormation(DEMO_ARENA_PLAYER_SEEDS.map(makeDemoArenaPlayer), formationKey);
}

function connectBuilderSquadToMarketInventory(
  players: TeamBuilderSquadPlayer[],
  snapshot: TouchlineMarketInventorySnapshot | null,
) {
  return players.map((player) => {
    const cardReadModel = resolveTouchlineMarketCardReadModel({
      id: player.id,
      providerId: player.providerId,
      clubTeamId: player.clubTeamId,
    }, snapshot);
    const inventory = cardReadModel.inventory;
    if (!inventory) return player;
    return {
      ...player,
      cardTier: inventory.tierKey,
      cardPriceVersion: inventory.priceTableVersion,
      inventoryId: inventory.inventoryId,
      inventoryPriceTc: inventory.priceTc,
      inventorySupplyLimit: inventory.supplyLimit,
      inventorySoldCopies: inventory.soldCopies,
      inventoryAvailableCopies: inventory.availableCopies,
      inventoryAlreadyOwned: inventory.alreadyOwned,
      officialOffer: inventory.officialOffer ?? null,
      // The read model only yields inventory after it confirms that the
      // player's provider club matches the inventory snapshot. Preserve the
      // existing contract-facing source shape without retaining a nullable
      // snapshot reference in this branch.
      inventorySource: cardReadModel.source === "supabase" ? ("supabase" as const) : null,
      marketValueEur: inventory.marketValueEur,
      previousMarketValueEur: inventory.previousMarketValueEur,
      marketValueChangeEur: inventory.marketValueChangeEur,
      marketValueUpdatedAt: inventory.marketValueUpdatedAt,
      authoritativeMarketValueSource: inventory.marketValueSource,
    };
  });
}

function stableBuilderPlayerId(player: TeamBuilderSquadPlayer) {
  return `builder-${player.clubShortCode.toLowerCase()}-${player.providerId || slugifyBuilderId(player.name)}`;
}

function matchesRequestedMarketContract(
  player: TeamBuilderSquadPlayer,
  requestedPlayerId?: string | null,
  requestedPlayerName?: string | null,
) {
  const playerId = String(requestedPlayerId ?? "").trim().toLowerCase();
  if (playerId) {
    const identifiers = [
      player.id,
      player.providerId,
      stableBuilderPlayerId(player),
      builderPlayerSquadContractId(player),
    ].map((value) => String(value ?? "").trim().toLowerCase());
    if (identifiers.some((identifier) => identifier === playerId || identifier.endsWith(`-${playerId}`))) return true;
  }

  const playerName = slugifyBuilderId(requestedPlayerName ?? "");
  return Boolean(playerName && slugifyBuilderId(player.name) === playerName);
}

function arenaCardToPlayer(player: ArenaPlayer, previewTier?: TouchlineCardTierKey): TouchlineEliteExactPlayer {
  const card = player.card;
  const clubLogoUrl = getPremierClubVisual(card?.clubName)?.logoUrl ?? "";
  const presentation = resolveArenaPublicCardPresentation(card ?? {});
  // `previewTier` is passed only by the explicit local demo fixtures. Every
  // non-demo/public card uses the adapter result below.
  const cardTier = previewTier ?? presentation.cardTier;

  return {
    sportmonksPlayerId: player.id,
    overall: card?.shirtNumber || "--",
    shirtNumber: card?.shirtNumber || "",
    role: card?.position || player.role,
    position: card?.position || player.role,
    flagUrl: card?.flagUrl || "",
    countryCode3: card?.countryCode3 || "N/A",
    name: card?.playerName || player.name,
    clubName: card?.clubName || "",
    clubLogoUrl,
    leagueName: "Premier League",
    leagueLogoUrl: "",
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : null,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
    updatedAt: PUBLIC_DATA_SOURCE_LABEL,
    age: "N/A",
    height: "N/A",
    foot: "N/A",
    contract: "",
    nationality: card?.countryCode3 || "N/A",
    stadiumName: "",
    avatarImageUrl: "",
    avatarStatus: "formation-card",
    sourcePhotoUrl: "",
    frameUrl: "",
    cardTemplateUrl: arenaPublishedCardTemplateUrl(card?.clubName || "", cardTier) || null,
    fantasyPoints: card?.fantasyPoints ?? "0.0",
    matchFantasyPoints: card?.fantasyPoints ?? "0.0",
    matchStats: card?.matchStats,
  };
}

function arenaFieldCanonicalCardAssetUrls(player: ArenaPlayer, previewTier?: TouchlineCardTierKey) {
  const previewCard = arenaCardToPlayer(player, previewTier);
  const frameUrl = previewCard.cardTemplateUrl
    ? touchlineLiveCompactFrameUrl(previewCard.cardTemplateUrl)
    : null;
  const countryCode = normalizeTouchlineCountryCode3(previewCard.countryCode3);
  const flagUrl = touchlineCountryFlagUrl(countryCode) || previewCard.flagUrl;
  const clubLogoUrl = liveOptimizedClubLogoUrl(previewCard.clubLogoUrl) ?? previewCard.clubLogoUrl;

  return [
    frameUrl,
    flagUrl,
    clubLogoUrl,
    "/touchlineArena/brand/tl-shield-lime.svg",
    ...Object.values(TOUCHLINE_SHIRT_DIGIT_ASSETS),
  ];
}

function benchOptionToPreviewCard(bench: BenchOption, previewTier?: TouchlineCardTierKey): TouchlineEliteExactPlayer {
  const clubLogoUrl = getPremierClubVisual(bench.club)?.logoUrl ?? "";
  const presentation = resolveArenaPublicCardPresentation(bench);
  // This remains an explicit demo-only visual override; normal bench cards
  // receive their tier exclusively through the public presentation adapter.
  const cardTier = previewTier ?? presentation.cardTier;

  return {
    sportmonksPlayerId: bench.id,
    overall: bench.shirtNumber ?? "--",
    shirtNumber: bench.shirtNumber,
    role: bench.position,
    position: bench.position,
    flagUrl: "",
    countryCode3: bench.countryCode3,
    name: bench.name,
    clubName: bench.club,
    clubLogoUrl,
    leagueName: "Premier League",
    leagueLogoUrl: "",
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : null,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
    updatedAt: PUBLIC_DATA_SOURCE_LABEL,
    age: "N/A",
    height: "N/A",
    foot: "N/A",
    contract: "",
    nationality: bench.countryCode3,
    stadiumName: "",
    avatarImageUrl: "",
    avatarStatus: "bench-preview",
    sourcePhotoUrl: "",
    frameUrl: "",
    cardTemplateUrl: arenaPublishedCardTemplateUrl(bench.club, cardTier) || null,
  };
}

function builderPlayerSquadContractId(player: TeamBuilderSquadPlayer) {
  return `squad-${stableBuilderPlayerId(player)}`;
}

function parseTouchlineMarketContractReleaseResult(
  value: unknown,
  requestedCardId: string,
): TouchlineMarketContractReleaseResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const countFields = [
    "activeContractCount",
    "openContractSlots",
    "soldCopies",
    "availableCopies",
    "supplyLimit",
  ] as const;
  if (
    payload.ok !== true
    || typeof payload.idempotentReplay !== "boolean"
    || payload.status !== "ended"
    || payload.cardId !== requestedCardId
    || typeof payload.contractId !== "string"
    || payload.refundTc !== 0
    || countFields.some((field) => !Number.isInteger(payload[field]) || Number(payload[field]) < 0)
  ) return null;

  return payload as TouchlineMarketContractReleaseResult;
}

function builderPlayerRetailPriceTc(player: TeamBuilderSquadPlayer) {
  const presentation = resolveArenaPublicCardPresentation(player);
  if (presentation.editorialCard) return presentation.editorialCard.cardPrice.amountMinor / 100;
  return presentation.cardPriceAuthority === "active-contract"
    && Number.isSafeInteger(player.inventoryPriceTc)
    && Number(player.inventoryPriceTc) >= 0
    ? Number(player.inventoryPriceTc)
    : 0;
}

function builderPlayerCommercialPrice(player: TeamBuilderSquadPlayer, pendingLabel: string) {
  const presentation = resolveArenaPublicCardPresentation(player);
  if (presentation.editorialCard) {
    return formatTouchlineEditorialCardPrice(presentation.editorialCard.cardPrice, "en-GB");
  }
  if (presentation.cardPriceAuthority === "active-contract") {
    return player.officialOffer?.displayPrice ?? formatTouchlineContractedCommercialCardPrice({
      tierKey: presentation.cardTier,
      priceTableVersion: presentation.cardPriceVersion,
      competition: "england",
    });
  }
  return pendingLabel;
}

function squadCardPriceLabel(card: ClubOwnerSquadCard, locale: TouchLineLocale) {
  const editorialCard = parseTouchlinePublicEditorialCardPresentation(card.editorialCard);
  if (editorialCard) {
    return formatTouchlineEditorialCardPrice(editorialCard.cardPrice, locale);
  }
  if (card.cardPriceAuthority === "active-contract") {
    return formatTouchlineContractedCommercialCardPrice({
      tierKey: card.cardTier,
      priceTableVersion: card.cardPriceVersion,
      competition: "england",
    });
  }
  return null;
}

function builderPlayerHasPublishedCard(player: TeamBuilderSquadPlayer) {
  const presentation = resolveArenaPublicCardPresentation(player);
  return Boolean(
    presentation.editorialCard
    || (presentation.cardPriceAuthority === "active-contract" && presentation.cardTier),
  );
}

function builderPlayerToPreviewCard(
  player: TeamBuilderSquadPlayer,
  options: Readonly<{ allowInventoryVisualPreview?: boolean }> = {},
): TouchlineEliteExactPlayer {
  const shirtNumber = normalizeOfficialShirtNumber(player.shirtNumber);
  const presentation = resolveArenaPublicCardPresentation(player);
  // Keep the server-approved inventory tier inside the authenticated Market
  // preview only. This is a visual frame selector, never a publication,
  // price, contract or public-card fallback.
  const previewTier = options.allowInventoryVisualPreview
    ? touchlineArenaTierForKey(player.cardTier)?.key ?? presentation.cardTier
    : presentation.cardTier;

  return {
    sportmonksPlayerId: player.providerId || player.id,
    overall: shirtNumber ?? "--",
    shirtNumber,
    role: player.position || roleLabel(player.role),
    position: player.position || roleLabel(player.role),
    flagUrl: player.flagUrl || "",
    countryCode3: player.countryCode3 || "N/A",
    name: player.name,
    clubName: player.clubName,
    clubLogoUrl: player.clubLogoUrl || "",
    leagueName: "Premier League",
    leagueLogoUrl: "",
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "unavailable",
    classificationState: "unavailable",
    cardTier: previewTier,
    cardPriceVersion: presentation.cardPriceAuthority
      ? presentation.cardPriceVersion || TOUCHLINE_CARD_PRICE_TABLE_VERSION
      : null,
    cardPriceAuthority: presentation.cardPriceAuthority,
    editorialCard: presentation.editorialCard,
    updatedAt: PUBLIC_DATA_SOURCE_LABEL,
    age: "N/A",
    height: "N/A",
    foot: "N/A",
    contract: "",
    nationality: player.nationality || player.countryCode3 || "N/A",
    stadiumName: "",
    avatarImageUrl: "",
    avatarStatus: "team-builder-preview",
    sourcePhotoUrl: "",
    frameUrl: "",
    cardTemplateUrl: arenaPublishedCardTemplateUrl(player.clubName, previewTier) || null,
    fantasyPoints: player.touchlinePoints,
    matchFantasyPoints: player.matchFantasyPoints,
    seasonStats: player.seasonStats,
    matchStats: player.matchStats,
  };
}

function arenaPlayerZoomDetails(
  player: TouchlineEliteExactPlayer,
  locale: TouchLineLocale,
  profileHref?: string | null,
): TouchlineCardZoomDetails {
  return buildTouchlinePlayerCardZoomDetails({
    locale,
    name: player.name,
    clubName: player.clubName,
    position: player.position || player.role,
    nationality: player.nationality || player.countryCode3,
    marketValue: player.marketValue,
    marketValueSource: player.marketValueSource,
    marketValueState: player.marketValueState,
    classificationState: player.classificationState,
    cardTier: player.cardTier,
    cardPriceAuthority: player.cardPriceAuthority,
    cardPriceVersion: player.cardPriceVersion,
    editorialCard: player.editorialCard,
    touchlinePoints: player.fantasyPoints,
    profileHref,
  });
}

function rumourTypeLabel(type: TouchLineArenaRumourSignal["type"]) {
  const labels: Record<TouchLineArenaRumourSignal["type"], string> = {
    rumor: "Rumour",
    confirmed_lineup: "Confirmed lineup",
    predicted_lineup: "Predicted lineup",
    injury: "Injury",
    suspension: "Suspension",
    absence: "Availability",
    live_event: "Live event",
    news: "News",
    transfer: "Transfer",
  };
  return labels[type];
}

function rumourStatusLabel(status: TouchLineArenaRumourSignal["status"]) {
  const labels: Record<TouchLineArenaRumourSignal["status"], string> = {
    rumor: "Rumour",
    doubt: "Doubt",
    confirmed: "Confirmed",
    official: "Official",
    live: "Live",
    unavailable: "Unavailable",
  };
  return labels[status];
}

function filterRumourSignals(
  signals: TouchLineArenaRumourSignal[],
  filters: { clubKey: string; search: string; sortMode: RumourSortMode; favorites: string[] },
) {
  const search = filters.search.trim().toLowerCase();
  const favoriteIds = new Set(filters.favorites);
  const selectedClub = TEAM_BUILDER_CLUBS.find((club) => club.teamId === filters.clubKey);

  return signals
    .filter((signal) => {
      if (filters.clubKey === "favorites" && !favoriteIds.has(signal.id)) return false;
      if (selectedClub) {
        const clubText = `${signal.clubId ?? ""} ${signal.club ?? ""}`.toLowerCase();
        const aliases = [selectedClub.teamId, selectedClub.name, selectedClub.shortCode, ...selectedClub.aliases].map((value) => value.toLowerCase());
        if (!aliases.some((alias) => clubText.includes(alias))) return false;
      }
      if (!search) return true;
      return [signal.title, signal.summary, signal.club, signal.player, signal.status, signal.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    })
    .sort((a, b) => {
      if (filters.sortMode === "relevance") return b.confidence - a.confidence || Date.parse(b.happenedAt ?? b.trace?.fetchedAt ?? "") - Date.parse(a.happenedAt ?? a.trace?.fetchedAt ?? "");
      return Date.parse(b.happenedAt ?? b.trace?.fetchedAt ?? "") - Date.parse(a.happenedAt ?? a.trace?.fetchedAt ?? "") || b.confidence - a.confidence;
    });
}

function toggleFavoriteRumour(signalId: string, setFavoriteRumourIds: Dispatch<SetStateAction<string[]>>) {
  setFavoriteRumourIds((currentIds) => currentIds.includes(signalId) ? currentIds.filter((id) => id !== signalId) : [...currentIds, signalId]);
}

function normalizeRumourText(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isSignalLinkedToArenaCards(signal: TouchLineArenaRumourSignal, players: ArenaPlayer[]) {
  const playerName = normalizeRumourText(signal.player);
  if (!playerName) return false;
  return players.some((player) => {
    const card = player.card as Partial<TouchlineEliteExactPlayer> | undefined;
    return [
      player.name,
      player.shortName,
      card?.name,
    ].some((candidate) => {
      const normalizedCandidate = normalizeRumourText(candidate);
      return normalizedCandidate && (normalizedCandidate.includes(playerName) || playerName.includes(normalizedCandidate));
    });
  });
}

type ArenaClientProps = {
  initialPanel?: ArenaPanelKey | null;
  initialLocale?: TouchLineLocale | null;
  initialContractPlayerId?: string | null;
  initialContractPlayerName?: string | null;
  initialContractClubId?: string | null;
  initialIntroIntent?: TouchlineArenaIntroIntent;
  standaloneMarket?: boolean;
  standalonePanel?: "bench" | "live";
  /** Local-only visual QA can supply a deterministic non-persistent lineup. */
  initialDemoLineup?: boolean;
  /** Local-only visual QA can exercise the empty matchday state without storage. */
  initialEmptyLineup?: boolean;
};

type ArenaDragState = {
  playerId: string;
  pointerId: number;
};
type ArenaFieldSlot = Pick<ArenaPlayer, "x" | "y" | "heightVh">;

type TouchlineArenaRemoteState = {
  formation_key?: string;
  lineup?: unknown;
  saved_formation_layouts?: unknown;
  coach_provider_id?: string | null;
};

function coachClassificationLabel(reason: string, locale: TouchLineLocale) {
  const portuguese = locale === "pt-BR";
  const labels: Record<string, string> = portuguese
    ? {
        "elite-final-position": "Última temporada em liga elite",
        "elite-relegation-free": "Última temporada: rebaixamento",
        promoted: "Promovido",
        newcomer: "Treinador estreante",
        "non-elite-fallback": "Histórico fora de liga elite",
        "classification-pending": "Classificação em revisão",
      }
    : {
        "elite-final-position": "Elite league last season",
        "elite-relegation-free": "Last season: relegation",
        promoted: "Promoted",
        newcomer: "New manager",
        "non-elite-fallback": "Non-elite league history",
        "classification-pending": "Classification pending",
      };
  return labels[reason] ?? (portuguese ? "Classificação oficial" : "Official classification");
}

function clientPointToArenaPosition(player: ArenaPlayer, clientX: number, clientY: number, stageRect: DOMRect, cameraIndex: number) {
  const profile = arenaLoopCameraProfile(cameraIndex);
  const displayX = ((clientX - stageRect.left) / stageRect.width) * 100;
  const displayY = ((clientY - stageRect.top) / stageRect.height) * 100;

  return {
    x: Math.min(95, Math.max(5, Math.round(ARENA_ROLE_LINE_X[player.role] + ((displayX - profile.roleLineX[player.role]) / profile.xScale)))),
    y: Math.min(95, Math.max(5, Math.round(52 + ((displayY - profile.yAnchor - profile.yOffsetByRole[player.role]) / profile.yScale)))),
  };
}

export default function ArenaClient({
  initialPanel = null,
  initialLocale = null,
  initialContractPlayerId = null,
  initialContractPlayerName = null,
  initialContractClubId = null,
  initialIntroIntent = null,
  standaloneMarket = false,
  standalonePanel,
  initialDemoLineup = false,
  initialEmptyLineup = false,
}: ArenaClientProps) {
  const standaloneExperience = standaloneMarket ? "market" : standalonePanel ?? null;
  const initialBuilderClubKey = TEAM_BUILDER_CLUBS.some((club) => club.teamId === initialContractClubId)
    ? initialContractClubId!
    : TEAM_BUILDER_CLUBS[0].teamId;
  const stageRef = useRef<HTMLElement | null>(null);
  const actionLayerRef = useRef<HTMLElement | null>(null);
  const arenaFullscreenRequestedRef = useRef(false);
  const arenaNavRef = useRef<HTMLElement | null>(null);
  const benchListShellRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const liveSimulationRef = useRef<HTMLDivElement | null>(null);
  const liveCoachCardsRef = useRef<HTMLDivElement | null>(null);
  const firstVideoRef = useRef<HTMLVideoElement | null>(null);
  const secondVideoRef = useRef<HTMLVideoElement | null>(null);
  const loopCameraFrameRequestRef = useRef<number | null>(null);
  const loopCameraFrameVideoRef = useRef<HTMLVideoElement | null>(null);
  const loopRevealTimerRef = useRef<number | null>(null);
  const accountLineupSaveTimerRef = useRef<number | null>(null);
  const pendingCardHydrationClubIdsRef = useRef(new Set<string>());
  const lastCardHydrationSignatureByClubRef = useRef(new Map<string, string>());
  const dragStateRef = useRef<ArenaDragState | null>(null);
  const quickSubPointerDragRef = useRef<QuickSubPointerDragState | null>(null);
  const quickSubCloseTimerRef = useRef<number | null>(null);
  const suppressQuickSubClickRef = useRef<string | null>(null);
  const [players, setPlayers] = useState<ArenaPlayer[]>(DEFAULT_ARENA_PLAYERS);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [spotlightPlayerId, setSpotlightPlayerId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(initialPanel === "formation");
  const initialIntroWasSkipped = Boolean(standaloneExperience) || initialIntroIntent === "skip";
  const [activeVideoIndex, setActiveVideoIndex] = useState(initialIntroWasSkipped ? 1 : 0);
  const [hasEntryVideoFinished, setHasEntryVideoFinished] = useState(initialIntroWasSkipped);
  const [introExperienceMode, setIntroExperienceMode] = useState<"pending" | "hidden" | TouchlineArenaIntroLaunchMode>(initialIntroWasSkipped ? "hidden" : "pending");
  const [introExperienceRun, setIntroExperienceRun] = useState(0);
  const [isEntrySkipAvailable, setIsEntrySkipAvailable] = useState(false);
  // Every supported viewport, including portrait phones, can run the Arena
  // journey immediately. Landscape fullscreen remains an optional immersion
  // control rather than an entry requirement.
  const isArenaIntroViewportReady = true;
  const [hasLoadedSavedLineup, setHasLoadedSavedLineup] = useState(false);
  const [hasLoadedClubOwnerRoster, setHasLoadedClubOwnerRoster] = useState(false);
  const [arenaPersistencePrincipal, setArenaPersistencePrincipal] = useState<ArenaPersistencePrincipal | null>(null);
  const [arenaAccountSyncStatus, setArenaAccountSyncStatus] = useState<ArenaAccountSyncStatus>("pending");
  const [arenaRosterSyncStatus, setArenaRosterSyncStatus] = useState<ArenaAccountSyncStatus>("pending");
  const [shouldRenderPlayers, setShouldRenderPlayers] = useState(false);
  const [isArenaMatchdayViewActive, setIsArenaMatchdayViewActive] = useState(false);
  const [readyArenaFieldCardsSignature, setReadyArenaFieldCardsSignature] = useState("");
  const [loopCameraIndex, setLoopCameraIndex] = useState(0);
  const [arenaVideoViewport, setArenaVideoViewport] = useState<ArenaVideoViewport>(() => (
    typeof window === "undefined"
      ? "desktop"
      : arenaVideoViewportForDimensions(window.innerWidth, window.innerHeight)
  ));
  const [isArenaNavOpen, setIsArenaNavOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isArenaNativeFullscreen, setIsArenaNativeFullscreen] = useState(false);
  const [isArenaFallbackFullscreen, setIsArenaFallbackFullscreen] = useState(false);
  const isArenaFullscreen = isArenaNativeFullscreen || isArenaFallbackFullscreen;
  const [isArenaVideoPaused, setIsArenaVideoPaused] = useState(false);
  const [isMarketOnboardingWelcomeVisible, setIsMarketOnboardingWelcomeVisible] = useState(false);
  const isArenaFunctionalReady = Boolean(standaloneExperience) || (
    isArenaIntroViewportReady
    && introExperienceMode === "hidden"
    && hasEntryVideoFinished
  );
  const [activeArenaPanel, setActiveArenaPanel] = useState<ArenaPanelKey | null>(standalonePanel === "bench" ? "bench" : initialPanel === "live" ? null : initialPanel);
  const [isLiveDockOpen, setIsLiveDockOpen] = useState(standalonePanel === "live" || initialPanel === "live");
  const [selectedLiveFixtureId, setSelectedLiveFixtureId] = useState<string | null>(null);
  const [pendingLiveFixtureId, setPendingLiveFixtureId] = useState<string | null>(null);
  const [hasRestoredLiveFixtureSelection, setHasRestoredLiveFixtureSelection] = useState(false);
  const [liveMatchSquads, setLiveMatchSquads] = useState<LiveMatchSquadsState | null>(null);
  const [selectedLiveSimulationCardId, setSelectedLiveSimulationCardId] = useState<string | null>(null);
  const [selectedLiveCoachSide, setSelectedLiveCoachSide] = useState<"home" | "away" | null>(null);
  const [readyLiveCardProductsSignature, setReadyLiveCardProductsSignature] = useState("");
  const loadedLiveSquadFixtureRef = useRef<string | null>(null);
  const liveFixtureSelectionSequenceRef = useRef(0);
  const liveSquadRequestSequenceRef = useRef(0);
  const liveSquadRefreshAtRef = useRef(new Map<string, number>());
  const carouselTouchStartXRef = useRef<number | null>(null);
  const [benchPlayers, setBenchPlayers] = useState<BenchOption[]>([]);
  const [ownerCoachProviderId, setOwnerCoachProviderId] = useState<string | null>(null);
  const [hasLoadedOwnerCoach, setHasLoadedOwnerCoach] = useState(false);
  const [isCoachSaving, setIsCoachSaving] = useState(false);
  const [coachSelectionError, setCoachSelectionError] = useState<string | null>(null);
  const [coachOffersByProviderId, setCoachOffersByProviderId] = useState<Record<string, TouchlineCompetitionCardOffer>>({});
  const [coachOfferStatus, setCoachOfferStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isCoachSpotlightOpen, setIsCoachSpotlightOpen] = useState(false);
  const [selectedBenchId, setSelectedBenchId] = useState("");
  const [draggingBenchId, setDraggingBenchId] = useState<string | null>(null);
  const [replacementTargetId, setReplacementTargetId] = useState<string | null>(null);
  const [isQuickSubRailClosing, setIsQuickSubRailClosing] = useState(false);
  const [isQuickSubstitutionConfirmationOpen, setIsQuickSubstitutionConfirmationOpen] = useState(false);
  const [quickSubstitutionSession, setQuickSubstitutionSession] = useState<TouchlineQuickSubstitutionSessionState | null>(null);
  const [pendingContractReleaseTargetId, setPendingContractReleaseTargetId] = useState<string | null>(null);
  const [isDemoLineup, setIsDemoLineup] = useState(false);
  const [liveFixtures, setLiveFixtures] = useState<TouchlineFixture[]>([]);
  const [, setLiveFeedStatus] = useState(`${PUBLIC_DATA_SOURCE_LABEL} live`);
  const [saveStatus, setSaveStatus] = useState("Auto saved");
  const [fixtureStatus, setFixtureStatus] = useState("Local data");
  const [siteLanguage, setSiteLanguage] = useState<TouchLineLocale>(initialLocale ?? TOUCHLINE_DEFAULT_LOCALE);
  const [hasLoadedLocalePreference, setHasLoadedLocalePreference] = useState(false);
  const [selectedBuilderClubKey, setSelectedBuilderClubKey] = useState(initialBuilderClubKey);
  const [builderSquad, setBuilderSquad] = useState<TeamBuilderSquadPlayer[]>([]);
  const [builderSquadClubKey, setBuilderSquadClubKey] = useState<string | null>(null);
  const [builderLoadState, setBuilderLoadState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    playerCount?: number;
    message?: string;
  }>({ status: "idle" });
  const [selectedBuilderPlayerId, setSelectedBuilderPlayerId] = useState<string | null>(null);
  const [marketSearch, setMarketSearch] = useState("");
  const [marketPositionFilter, setMarketPositionFilter] = useState<TouchlineMarketPositionFilter>("all");
  const [marketPositionBucketFilter, setMarketPositionBucketFilter] = useState<TouchlineMarketPositionBucketFilter>("all");
  const [marketNeedsOnly, setMarketNeedsOnly] = useState(false);
  const [marketFormationConfirmed, setMarketFormationConfirmed] = useState(false);
  const [marketSortMode, setMarketSortMode] = useState<TouchlineMarketSortMode>("recommended");
  const [marketCartPlayers, setMarketCartPlayers] = useState<TeamBuilderSquadPlayer[]>([]);
  const [marketSpotlightPlayerId, setMarketSpotlightPlayerId] = useState<string | null>(null);
  const [marketWalletBalanceTc, setMarketWalletBalanceTc] = useState(0);
  const [marketInventorySnapshot, setMarketInventorySnapshot] = useState<TouchlineMarketInventorySnapshot | null>(null);
  const [marketInventoryMode, setMarketInventoryMode] = useState<TouchlineMarketInventoryMode>("checking");
  const [isMarketCheckoutPending, setIsMarketCheckoutPending] = useState(false);
  const [isMarketCheckoutConfirmationOpen, setIsMarketCheckoutConfirmationOpen] = useState(false);
  const [pendingMarketReplacementPlayerId, setPendingMarketReplacementPlayerId] = useState<string | null>(null);
  const [isContractReleasePending, setIsContractReleasePending] = useState(false);

  useEffect(() => () => {
    if (quickSubCloseTimerRef.current !== null) window.clearTimeout(quickSubCloseTimerRef.current);
  }, []);
  const [marketInventoryRevision, setMarketInventoryRevision] = useState(0);
  const marketCheckoutAttemptRef = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const marketContractReleaseAttemptRef = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const marketMutationPendingRef = useRef<"checkout" | "release" | null>(null);
  const marketBootstrapAttemptRef = useRef<string | null>(null);
  const marketSelectionRef = useRef<HTMLDivElement | null>(null);
  const marketCartDraftRestoredRef = useRef<string | null>(null);
  const marketCartDraftIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (activeArenaPanel !== "bench") return;
    const frame = window.requestAnimationFrame(() => {
      benchListShellRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeArenaPanel]);

  useEffect(() => {
    if (!isMarketCheckoutConfirmationOpen && !pendingMarketReplacementPlayerId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMarketCheckoutConfirmationOpen(false);
      setPendingMarketReplacementPlayerId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMarketCheckoutConfirmationOpen, pendingMarketReplacementPlayerId]);

  useEffect(() => {
    const syncArenaPanelFromUrl = () => {
      if (standaloneExperience) {
        setActiveArenaPanel(standaloneExperience === "live" ? null : standaloneExperience);
        setIsLiveDockOpen(standaloneExperience === "live");
        setIsEditorOpen(false);
        setIsArenaNavOpen(false);
        setReplacementTargetId(null);
        return;
      }
      // A route can provide a deliberate initial panel (the visual QA fixture
      // uses it for the in-Arena Quick Sub rail). A URL panel still wins, but
      // an absent query parameter must not immediately erase that initial UI.
      const panel = parseTouchlineArenaPanel(new URLSearchParams(window.location.search).get("panel")) ?? initialPanel;
      setActiveArenaPanel(panel === "live" ? null : panel);
      setIsEditorOpen(panel === "formation");
      setIsArenaNavOpen(false);
      if (panel !== "bench") setReplacementTargetId(null);
    };

    syncArenaPanelFromUrl();
    window.addEventListener("popstate", syncArenaPanelFromUrl);
    return () => window.removeEventListener("popstate", syncArenaPanelFromUrl);
  }, [initialPanel, standaloneExperience]);
  const initialContractHandledRef = useRef(false);
  const [selectedFormationKey, setSelectedFormationKey] = useState<ArenaFormationKey>(DEFAULT_ARENA_FORMATION_KEY);
  const [rumourSignals, setRumourSignals] = useState<TouchLineArenaRumourSignal[]>([]);
  const [rumourStatus, setRumourStatus] = useState("Open New Rumours");
  const [rumourError, setRumourError] = useState<string | null>(null);
  const [rumourClubKey, setRumourClubKey] = useState("all");
  const [rumourSearch, setRumourSearch] = useState("");
  const [rumourSortMode, setRumourSortMode] = useState<RumourSortMode>("recent");
  const [favoriteRumourIds, setFavoriteRumourIds] = useState<string[]>([]);
  const [lockedFormationKeys, setLockedFormationKeys] = useState<ArenaFormationKey[]>([]);
  const [cameraEditSlots, setCameraEditSlots] = useState<Record<string, Record<string, ArenaFieldSlot>>>({});

  const matchdayBenchPlayers = useMemo(() => buildMatchdayBench(benchPlayers), [benchPlayers]);
  const matchdayBenchIds = useMemo(() => new Set(matchdayBenchPlayers.map((bench) => bench.id)), [matchdayBenchPlayers]);
  const reserveVaultPlayers = useMemo(
    () => orderTouchlineBenchByPosition(benchPlayers.filter((bench) => !matchdayBenchIds.has(bench.id))),
    [benchPlayers, matchdayBenchIds],
  );
  const isQuickSubstitutionOpen = activeArenaPanel === "bench";
  useEffect(() => {
    if (!isQuickSubstitutionConfirmationOpen) return;
    function handleQuickSubConfirmationKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsQuickSubstitutionConfirmationOpen(false);
      setSelectedBenchId("");
      setReplacementTargetId(null);
      setDraggingBenchId(null);
    }
    window.addEventListener("keydown", handleQuickSubConfirmationKeyDown);
    return () => window.removeEventListener("keydown", handleQuickSubConfirmationKeyDown);
  }, [isQuickSubstitutionConfirmationOpen]);
  // Keep the large legacy action panel closed during Quick Substitution while
  // preserving the full panel union for the existing overlay's render types.
  const arenaOverlayPanel = activeArenaPanel && activeArenaPanel !== "bench" ? activeArenaPanel : null;
  const standaloneQuickSubstitutionReadiness = resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup,
      hasLoadedClubOwnerRoster,
      starterCount: players.length,
      benchCount: matchdayBenchPlayers.length,
  });
  const quickSubstitutionSessionSource = useMemo(() => {
    if (!isQuickSubstitutionOpen || standaloneQuickSubstitutionReadiness.state !== "ready") return null;
    return buildQuickSubstitutionSessionSource({
      principal: arenaPersistencePrincipal,
      players,
      matchdayBench: matchdayBenchPlayers,
      allowDemoIdentity: isDemoLineup,
    });
  }, [arenaPersistencePrincipal, isDemoLineup, isQuickSubstitutionOpen, matchdayBenchPlayers, players, standaloneQuickSubstitutionReadiness.state]);
  const quickSubstitutionSessionStorageKey = useMemo(
    () => (arenaPersistencePrincipal
      ? arenaPersistenceKeys(arenaPersistencePrincipal, "quick-substitution-session").storageKey
      : null),
    [arenaPersistencePrincipal],
  );

  useEffect(() => {
    if (!quickSubstitutionSessionSource || !quickSubstitutionSessionStorageKey) {
      return;
    }

    let nextState: TouchlineQuickSubstitutionSessionState | null = null;
    const storedState = readBrowserStorage("sessionStorage", quickSubstitutionSessionStorageKey);
    if (storedState) {
      try {
        const restored: unknown = JSON.parse(storedState);
        const replayed = restoreTouchlineQuickSubstitutionSession({
          matchId: quickSubstitutionSessionSource.matchId,
          ownerId: quickSubstitutionSessionSource.ownerId,
          rosterRevision: quickSubstitutionSessionSource.rosterRevision,
          startingSlots: quickSubstitutionSessionSource.startingSlots,
          benchInventoryIds: quickSubstitutionSessionSource.benchInventoryIds,
        }, restored);
        if (replayed.status === "ready") nextState = replayed.state;
      } catch {
        // A malformed browser-session record is not match authority. Rebuild
        // only from the current complete owned 11 + 9 snapshot below.
      }
    }

    if (!nextState) {
      const initialized = createTouchlineQuickSubstitutionSession({
        matchId: quickSubstitutionSessionSource.matchId,
        ownerId: quickSubstitutionSessionSource.ownerId,
        rosterRevision: quickSubstitutionSessionSource.rosterRevision,
        startingSlots: quickSubstitutionSessionSource.startingSlots,
        benchInventoryIds: quickSubstitutionSessionSource.benchInventoryIds,
      });
      nextState = initialized.status === "ready" ? initialized.state : null;
    }

    const frame = window.requestAnimationFrame(() => setQuickSubstitutionSession(nextState));
    return () => window.cancelAnimationFrame(frame);
  }, [
    quickSubstitutionSessionSource,
    quickSubstitutionSessionSource?.matchId,
    quickSubstitutionSessionSource?.ownerId,
    quickSubstitutionSessionSource?.rosterRevision,
    quickSubstitutionSessionStorageKey,
  ]);

  useEffect(() => {
    if (!quickSubstitutionSession || !quickSubstitutionSessionStorageKey || !quickSubstitutionSessionSource) return;
    if (
      quickSubstitutionSession.matchId !== quickSubstitutionSessionSource.matchId
      || quickSubstitutionSession.rosterRevision !== quickSubstitutionSessionSource.rosterRevision
    ) return;
    writeBrowserStorage("sessionStorage", quickSubstitutionSessionStorageKey, JSON.stringify(quickSubstitutionSession));
  }, [
    quickSubstitutionSession,
    quickSubstitutionSessionSource,
    quickSubstitutionSessionSource?.matchId,
    quickSubstitutionSessionSource?.rosterRevision,
    quickSubstitutionSessionStorageKey,
  ]);

  const quickSubstitutionFieldPlayers = useMemo(() => {
    if (!quickSubstitutionSession || !quickSubstitutionSessionSource) return null;
    if (
      quickSubstitutionSession.matchId !== quickSubstitutionSessionSource.matchId
      || quickSubstitutionSession.rosterRevision !== quickSubstitutionSessionSource.rosterRevision
    ) return null;

    const field = quickSubstitutionSession.activeSlots.map((slot) => {
      const startingPlayer = quickSubstitutionSessionSource.playerByPositionSlotId.get(slot.positionSlotId);
      if (!startingPlayer) return null;
      const originalPlayer = quickSubstitutionSessionSource.playerByInventoryId.get(slot.inventoryId);
      if (originalPlayer) {
        return {
          ...originalPlayer,
          id: slot.positionSlotId,
          x: startingPlayer.x,
          y: startingPlayer.y,
          heightVh: startingPlayer.heightVh,
          role: startingPlayer.role,
        };
      }
      const incomingBench = quickSubstitutionSessionSource.benchByInventoryId.get(slot.inventoryId);
      if (!incomingBench) return null;
      return {
        ...benchOptionToArenaPlayer(incomingBench, startingPlayer),
        id: slot.positionSlotId,
      };
    });
    return field.every((player): player is ArenaPlayer => Boolean(player)) ? field : null;
  }, [quickSubstitutionSession, quickSubstitutionSessionSource]);
  const quickSubstitutionAvailableBenchPlayers = useMemo(() => {
    if (!quickSubstitutionSession || !quickSubstitutionSessionSource) return null;
    const bench = quickSubstitutionSession.availableBenchInventoryIds.map((inventoryId) => (
      quickSubstitutionSessionSource.benchByInventoryId.get(inventoryId) ?? null
    ));
    return bench.every((player): player is BenchOption => Boolean(player)) ? bench : null;
  }, [quickSubstitutionSession, quickSubstitutionSessionSource]);
  const quickSubstitutionSubstitutedOutPlayers = useMemo(() => {
    if (!quickSubstitutionSession || !quickSubstitutionSessionSource) return [] as BenchOption[];
    return quickSubstitutionSession.substitutedOutInventoryIds.flatMap((inventoryId) => {
      const startingPlayer = quickSubstitutionSessionSource.playerByInventoryId.get(inventoryId);
      if (startingPlayer) return [arenaPlayerToSubstitutedOutOption(startingPlayer)];
      const benchPlayer = quickSubstitutionSessionSource.benchByInventoryId.get(inventoryId);
      return benchPlayer ? [benchPlayer] : [];
    });
  }, [quickSubstitutionSession, quickSubstitutionSessionSource]);
  const isQuickSubstitutionSessionActive = Boolean(
    quickSubstitutionSessionSource
    && quickSubstitutionSession
    && quickSubstitutionSession.matchId === quickSubstitutionSessionSource.matchId
    && quickSubstitutionSession.ownerId === quickSubstitutionSessionSource.ownerId
    && quickSubstitutionSession.rosterRevision === quickSubstitutionSessionSource.rosterRevision
    && quickSubstitutionFieldPlayers
    && quickSubstitutionAvailableBenchPlayers,
  );
  const quickSubstitutionInteractivePlayers = isQuickSubstitutionSessionActive
    ? quickSubstitutionFieldPlayers!
    : players;
  const quickSubstitutionInteractiveBench = isQuickSubstitutionSessionActive
    ? quickSubstitutionAvailableBenchPlayers!
    : matchdayBenchPlayers;
  const standaloneQuickSubstitutionSessionState = standaloneQuickSubstitutionReadiness.state === "ready"
      ? !quickSubstitutionSessionSource
      ? "identity-required"
      : isQuickSubstitutionSessionActive
        ? "ready"
        : "session-loading"
    : standaloneQuickSubstitutionReadiness.state;
  const selectedPlayer = quickSubstitutionInteractivePlayers.find((player) => player.id === selectedPlayerId) ?? quickSubstitutionInteractivePlayers[0] ?? null;
  const spotlightPlayer = quickSubstitutionInteractivePlayers.find((player) => player.id === spotlightPlayerId) ?? null;
  const selectedBench = selectedBenchId
    ? quickSubstitutionInteractiveBench.find((bench) => bench.id === selectedBenchId) ?? null
    : null;
  const replacementTarget = replacementTargetId
    ? quickSubstitutionInteractivePlayers.find((player) => player.id === replacementTargetId) ?? null
    : null;
  const clubOwnerRoster = arenaClubOwnerRoster(players, benchPlayers);
  const ownedSquadCount = clubOwnerRoster.length;
  const standaloneQuickSubstitutionCopy = siteLanguage === "pt-BR"
    ? {
      loadingEyebrow: "SUBSTITUIÇÃO RÁPIDA",
      loadingTitle: "Preparando sua escalação",
      loadingMessage: "Estamos confirmando titulares e banco antes de liberar uma troca.",
      identityEyebrow: "PARTIDA AINDA EM REVISÃO",
      identityTitle: "A substituição precisa de cards de contrato válidos",
      identityMessage: "Não liberamos uma troca até que os 11 titulares e os 9 reservas tenham IDs de contrato únicos.",
      sessionEyebrow: "SUBSTITUIÇÃO RÁPIDA",
      sessionTitle: "Preparando a sessão da partida",
      sessionMessage: "Estamos protegendo titulares, banco e histórico de quem já saiu antes de liberar a troca.",
      setupEyebrow: "ESCALAÇÃO AINDA NÃO PRONTA",
      setupTitle: "A substituição rápida precisa de um time completo",
      setupMessage: "Nenhum jogador é criado automaticamente. Complete titulares e banco no Market Transfer para liberar a substituição.",
      starters: "titulares",
      bench: "banco",
      openMarket: "Abrir Market Transfer",
      returnClub: "Voltar ao Meu Clube",
    }
    : {
      loadingEyebrow: "QUICK SUBSTITUTION",
      loadingTitle: "Preparing your matchday squad",
      loadingMessage: "We are confirming starters and substitutes before allowing a change.",
      identityEyebrow: "MATCHDAY IDENTITY PENDING",
      identityTitle: "Quick Substitution needs verified contract cards",
      identityMessage: "A change stays locked until all 11 starters and 9 substitutes have unique contract IDs.",
      sessionEyebrow: "QUICK SUBSTITUTION",
      sessionTitle: "Preparing the match session",
      sessionMessage: "We are protecting the starters, bench, and substituted-out history before enabling a change.",
      setupEyebrow: "MATCHDAY SQUAD NOT READY",
      setupTitle: "Quick Substitution needs a complete team sheet",
      setupMessage: "No players are created automatically. Complete your starters and bench in Market Transfer to unlock a substitution.",
      starters: "starters",
      bench: "bench",
      openMarket: "Open Market Transfer",
      returnClub: "Return to My Club",
    };
  const isSelectedBenchInMatchday = Boolean(selectedBench && quickSubstitutionInteractiveBench.some((bench) => bench.id === selectedBench.id));
  const selectedBenchFormationLocked = Boolean(selectedBench && isBenchFormationLocked(selectedBench, quickSubstitutionInteractivePlayers, selectedFormationKey, replacementTarget));
  const canSelectedBenchReplaceTarget = Boolean(selectedBench && replacementTarget && canBenchReplaceTarget(selectedBench, replacementTarget));
  const selectedBuilderClub = PREMIER_CLUB_VISUALS.find((club) => club.teamId === selectedBuilderClubKey) ?? PREMIER_CLUB_VISUALS[0];
  // The Arena's general ClubHub navigation is a discovery action. It must not
  // silently inherit the builder's initial Manchester City selection.
  const allClubsHubHref = touchlineClubHubHref(siteLanguage);
  const selectedBuilderClubHubHref = clubHubHref(selectedBuilderClub, siteLanguage);
  const selectedFormation = arenaFormationDefinition(selectedFormationKey);
  const spotlightPlayerCard = spotlightPlayer
    ? arenaCardToPlayer(spotlightPlayer, isDemoLineup ? touchlineDemoTierForPlayer(spotlightPlayer.id, spotlightPlayer.name) : undefined)
    : null;
  const spotlightPlayerProfileHref = spotlightPlayerCard
    ? touchlinePlayerProfileHref(
        spotlightPlayerCard,
        siteLanguage,
        isDemoLineup ? { previewTier: spotlightPlayerCard.cardTier } : undefined,
      )
    : null;
  const spotlightPlayerTierAccent = spotlightPlayerCard
    ? touchlineCardTierPalette(spotlightPlayerCard.cardTier).accent
    : "#b5ff4b";
  const spotlightPlayerTierLabel = spotlightPlayerCard
    ? touchlineCardTierName(spotlightPlayerCard.cardTier, siteLanguage)
    : "";
  const spotlightPlayerContractHref = spotlightPlayerCard
    ? touchlineArenaContractHref({
        locale: siteLanguage,
        playerId: spotlightPlayerCard.sportmonksPlayerId || spotlightPlayer?.id || spotlightPlayerCard.name,
        playerName: spotlightPlayerCard.name,
      })
    : null;
  const spotlightPlayerZoomDetails = spotlightPlayerCard
    ? arenaPlayerZoomDetails(spotlightPlayerCard, siteLanguage, spotlightPlayerProfileHref)
    : null;
  const replacementTargetProfileHref = replacementTarget
    ? touchlinePlayerProfileHref(arenaCardToPlayer(replacementTarget), siteLanguage)
    : null;
  const isSelectedFormationFinalized = isFinalizedArenaFormation(selectedFormationKey);
  const currentCameraId = arenaLoopCameraProfile(loopCameraIndex).id;
  const currentCameraEditKey = `${selectedFormationKey}:${currentCameraId}`;
  const premierLiveFixtures = liveFixtures.filter(isPremierFixture);
  // Arena surfaces one coherent canonical fixture round, while Match Centre
  // remains the place for the full schedule. This prevents mixed rounds from
  // appearing in the bottom carousel when a public snapshot spans weeks.
  const visibleLiveFixtures = selectArenaFixtureRound(premierLiveFixtures);
  const visibleClubMatches = buildFixtureClubMatches(visibleLiveFixtures);
  // Keep the match centre populated on the very first frame. Persistence still
  // wins as soon as it is restored, while an absent/stale id safely resolves to
  // the first currently valid fixture without rendering an empty instruction.
  const selectedLiveFixture = visibleLiveFixtures.find((fixture) => fixture.id === selectedLiveFixtureId)
    ?? visibleLiveFixtures[0]
    ?? null;
  const effectiveSelectedLiveFixtureId = selectedLiveFixture?.id ?? null;
  const selectedLiveMatch = selectedLiveFixture ? buildFixtureClubMatches([selectedLiveFixture])[0] ?? null : null;
  const selectedLiveFixtureIsLive = Boolean(selectedLiveFixture && isFixtureActuallyLive(selectedLiveFixture));
  const selectedLiveBoardBadge = selectedLiveFixtureIsLive
    ? (siteLanguage === "pt-BR" ? "AO VIVO" : "LIVE")
    : (siteLanguage === "pt-BR" ? "PARTIDA" : "MATCH");
  const selectedLiveHomeClub = selectedLiveFixture
    ? getPremierClubVisualForFixtureSide(selectedLiveFixture, "home")
    : null;
  const selectedLiveAwayClub = selectedLiveFixture
    ? getPremierClubVisualForFixtureSide(selectedLiveFixture, "away")
    : null;
  const selectedLiveHomeCoachIdentity = useMemo(
    () => touchlineLiveCoachForTeam(selectedLiveHomeClub?.teamId),
    [selectedLiveHomeClub?.teamId],
  );
  const selectedLiveAwayCoachIdentity = useMemo(
    () => touchlineLiveCoachForTeam(selectedLiveAwayClub?.teamId),
    [selectedLiveAwayClub?.teamId],
  );
  const ownerCoachIdentity = useMemo(
    () => touchlineLiveCoachForProviderId(ownerCoachProviderId),
    [ownerCoachProviderId],
  );
  const activeArenaCoachIdentity = ownerCoachIdentity
    ?? (arenaPersistencePrincipal?.kind === "demo"
      ? { coach: TOUCHLINE_DEMO_COACH, countryCode3: "ITA" }
      : null);
  const ownerCoachClub = activeArenaCoachIdentity?.coach.teamId
    ? PREMIER_CLUB_VISUALS.find((club) => club.teamId === String(activeArenaCoachIdentity.coach.teamId)) ?? null
    : null;
  const ownerCoachOffer = activeArenaCoachIdentity?.coach
    ? coachOffersByProviderId[activeArenaCoachIdentity.coach.providerId] ?? null
    : null;
  const coachSlot = useMemo(
    () => createTouchlineArenaCoachSlot(
      activeArenaCoachIdentity?.coach ?? null,
      null,
      ownerCoachOffer?.tierKey ?? "sapphire-blue",
    ),
    [activeArenaCoachIdentity?.coach, ownerCoachOffer?.tierKey],
  );
  const arenaCoachClubName = ownerCoachClub?.name ?? "TouchLine England";
  const arenaCoachClubLogoUrl = ownerCoachClub?.logoUrl;
  const arenaCoachClubAccent = ownerCoachClub?.accent ?? "#b5ff4b";
  const arenaCoachCountryCode3 = activeArenaCoachIdentity?.countryCode3 ?? "ENG";
  const isCoachSelectionBootstrapPending = Boolean(
    standaloneExperience === "market" && !hasLoadedOwnerCoach,
  );
  const isCoachSelectionRequired = Boolean(
    isArenaFunctionalReady
    && hasLoadedOwnerCoach
    && arenaPersistencePrincipal?.kind !== "demo"
    && !activeArenaCoachIdentity?.coach
    // Coach selection is part of the Market Transfer acquisition journey.
    // The Arena itself stays available and uncluttered; it must never turn
    // into a mandatory shopping screen for a ClubOwner who has no coach yet.
    && standaloneExperience === "market",
  );
  const needsArenaRosterRecovery = Boolean(
    isArenaFunctionalReady
    && hasLoadedOwnerCoach
    && arenaPersistencePrincipal?.kind !== "demo"
    && standaloneExperience === null
    && (!activeArenaCoachIdentity?.coach || ownedSquadCount < 11),
  );
  const coachFirstLoginHref = touchLineAuthEntryHref(
    "/login",
    siteLanguage,
    `/market-transfer?lang=${encodeURIComponent(siteLanguage)}`,
  );
  const marketOnboardingWelcomeCopy = siteLanguage === "pt-BR"
    ? {
        eyebrow: "TOUCHLINE ENGLAND · BEM-VINDO",
        titleLead: "Bem-vindo à TouchLine",
        titleAccent: "Arena",
        message: "Seu clube começa agora.",
        journey: "Escolha seu treinador. Monte seu elenco. Boa sorte.",
        transition: "Abrindo o Market Transfer",
        skip: "Ir para o Market Transfer agora",
      }
    : {
        eyebrow: "TOUCHLINE ENGLAND · WELCOME",
        titleLead: "Welcome to TouchLine",
        titleAccent: "Arena",
        message: "Your club starts now.",
        journey: "Choose your coach. Build your squad. Good luck.",
        transition: "Opening Market Transfer",
        skip: "Open Market Transfer now",
      };

  useEffect(() => {
    // The first ClubOwner arrival has a short Arena welcome, then continues
    // into the Market Transfer journey. This marker is issued only by the
    // registration flow, so intentionally visiting Arena is never hijacked.
    if (
      standaloneExperience
      || !isArenaFunctionalReady
      || !hasLoadedOwnerCoach
      || arenaPersistencePrincipal?.kind === "demo"
      || activeArenaCoachIdentity?.coach
    ) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarding") !== "market") return;

    // Schedule the visual state after the initial effect tick: this preserves
    // server/client hydration while still presenting the welcome immediately.
    const welcomeTimer = window.setTimeout(() => setIsMarketOnboardingWelcomeVisible(true), 0);
    const redirectTimer = window.setTimeout(() => {
      window.location.replace(`/market-transfer?lang=${encodeURIComponent(siteLanguage)}`);
    }, 6_500);

    return () => {
      window.clearTimeout(welcomeTimer);
      window.clearTimeout(redirectTimer);
    };
  }, [
    activeArenaCoachIdentity?.coach,
    arenaPersistencePrincipal?.kind,
    hasLoadedOwnerCoach,
    isArenaFunctionalReady,
    siteLanguage,
    standaloneExperience,
  ]);

  // Once the authoritative roster is ready, the owner's XI remains visible in
  // the normal Arena as well as during Quick Sub. `shouldRenderPlayers` stays
  // false while account/roster state is being reconciled, so no stale cards can
  // flash before the saved formation is restored.
  const shouldRenderArenaOwnerLayer = (shouldRenderPlayers || isQuickSubstitutionSessionActive)
    && standaloneExperience !== "live"
    && !isCoachSelectionRequired;
  const selectedLiveHomeCoachSlot = useMemo(
    () => selectedLiveHomeClub
      ? createTouchlineArenaCoachSlot(
          selectedLiveHomeCoachIdentity?.coach ?? null,
          TEAM_BUILDER_CLUB_RANK[selectedLiveHomeClub.shortCode] ?? null,
        )
      : null,
    [selectedLiveHomeClub, selectedLiveHomeCoachIdentity?.coach],
  );
  const selectedLiveAwayCoachSlot = useMemo(
    () => selectedLiveAwayClub
      ? createTouchlineArenaCoachSlot(
          selectedLiveAwayCoachIdentity?.coach ?? null,
          TEAM_BUILDER_CLUB_RANK[selectedLiveAwayClub.shortCode] ?? null,
        )
      : null,
    [selectedLiveAwayClub, selectedLiveAwayCoachIdentity?.coach],
  );
  const selectedLiveCoachData = selectedLiveCoachSide === "home" && selectedLiveHomeClub && selectedLiveHomeCoachSlot
    ? {
        side: "home" as const,
        club: selectedLiveHomeClub,
        coach: selectedLiveHomeCoachIdentity?.coach ?? null,
        countryCode3: selectedLiveHomeCoachIdentity?.countryCode3 ?? "N/A",
        slot: selectedLiveHomeCoachSlot,
      }
    : selectedLiveCoachSide === "away" && selectedLiveAwayClub && selectedLiveAwayCoachSlot
      ? {
          side: "away" as const,
          club: selectedLiveAwayClub,
          coach: selectedLiveAwayCoachIdentity?.coach ?? null,
          countryCode3: selectedLiveAwayCoachIdentity?.countryCode3 ?? "N/A",
          slot: selectedLiveAwayCoachSlot,
        }
      : null;
  const liveSimulationFixtureId = selectedLiveFixture?.id ?? "none";
  const liveSimulationCards = useMemo(
    () => {
      const currentLiveSquads = liveMatchSquads;
      if (
        !currentLiveSquads
        || currentLiveSquads.fixtureId !== selectedLiveFixture?.id
        || currentLiveSquads.status !== "ready"
        || !selectedLiveHomeClub
        || !selectedLiveAwayClub
      ) return [];

      return buildLiveSimulationCardProducts({
        fixtureId: liveSimulationFixtureId,
        homeSquad: currentLiveSquads.home,
        awaySquad: currentLiveSquads.away,
        homeClub: selectedLiveHomeClub,
        awayClub: selectedLiveAwayClub,
      });
    },
    [
      liveMatchSquads,
      liveSimulationFixtureId,
      selectedLiveAwayClub,
      selectedLiveFixture?.id,
      selectedLiveHomeClub,
    ],
  );
  const liveCardProductsSignature = useMemo(() => {
    if (
      liveSimulationCards.length !== 22
      || !selectedLiveHomeClub
      || !selectedLiveAwayClub
      || !selectedLiveHomeCoachSlot
      || !selectedLiveAwayCoachSlot
    ) return "";

    return buildLiveProductSignature({
      locale: siteLanguage,
      cards: liveSimulationCards,
      homeCoach: {
        teamId: selectedLiveHomeClub.teamId,
        cardTier: selectedLiveHomeCoachSlot.cardTier,
        coachId: String(selectedLiveHomeCoachIdentity?.coach.id ?? "pending"),
        countryCode3: selectedLiveHomeCoachIdentity?.countryCode3 ?? "N/A",
      },
      awayCoach: {
        teamId: selectedLiveAwayClub.teamId,
        cardTier: selectedLiveAwayCoachSlot.cardTier,
        coachId: String(selectedLiveAwayCoachIdentity?.coach.id ?? "pending"),
        countryCode3: selectedLiveAwayCoachIdentity?.countryCode3 ?? "N/A",
      },
    });
  }, [
    liveSimulationCards,
    selectedLiveAwayClub,
    selectedLiveAwayCoachIdentity,
    selectedLiveAwayCoachSlot,
    selectedLiveHomeClub,
    selectedLiveHomeCoachIdentity,
    selectedLiveHomeCoachSlot,
    siteLanguage,
  ]);
  const isLiveLineupVisuallyReady = Boolean(
    liveCardProductsSignature
    && readyLiveCardProductsSignature === liveCardProductsSignature,
  );
  const selectedLiveSimulationCard = liveSimulationCards.find(
    ({ player }) => stableBuilderPlayerId(player) === selectedLiveSimulationCardId,
  )?.player ?? null;
  const selectedLiveSimulationPreviewCard = selectedLiveSimulationCard
    ? builderPlayerToPreviewCard(selectedLiveSimulationCard)
    : null;
  const selectedLiveSimulationProfileHref = selectedLiveSimulationPreviewCard
    ? touchlinePlayerProfileHref(selectedLiveSimulationPreviewCard, siteLanguage)
    : null;
  const selectedLiveSimulationZoomDetails = selectedLiveSimulationPreviewCard
    ? arenaPlayerZoomDetails(selectedLiveSimulationPreviewCard, siteLanguage, selectedLiveSimulationProfileHref)
    : null;
  const clubMatchLoop = visibleClubMatches.length > 1
    ? [...visibleClubMatches, ...visibleClubMatches]
    : visibleClubMatches;
  const playerCardRankings = [...clubOwnerRoster].sort(rankClubOwnerCards);
  const topPlayerCardRankings = playerCardRankings.slice(0, 8);
  const clubOwnerStandings = buildDemoClubOwnerStandings(clubOwnerRoster).slice(0, 5);
  const rosterCardValue = clubOwnerSquadTcValue(clubOwnerRoster);
  const rosterCardValueDisplay = formatTouchlineCommercialCardTotal({
    numericPrice: rosterCardValue,
    competition: "england",
  });
  const rosterPointsTotal = clubOwnerRoster.reduce((sum, card) => sum + card.touchlinePoints, 0);
  const isBuilderSquadCurrent = builderSquadClubKey === selectedBuilderClub.teamId;
  const currentBuilderSquad = isBuilderSquadCurrent ? builderSquad : [];
  const sortedBuilderSquad = [...currentBuilderSquad].sort((a, b) => roleSortWeight(a.role) - roleSortWeight(b.role) || a.name.localeCompare(b.name));
  const authoritativeOwnedSquadCount = marketInventorySnapshot?.activeContractCount ?? ownedSquadCount;
  const pendingMarketReplacementPlayer = pendingMarketReplacementPlayerId
    ? sortedBuilderSquad.find((player) => stableBuilderPlayerId(player) === pendingMarketReplacementPlayerId) ?? null
    : null;
  const pendingMarketReplacementBucket = pendingMarketReplacementPlayer
    ? touchlineMarketPositionBucket(pendingMarketReplacementPlayer.position, pendingMarketReplacementPlayer.role)
    : null;
  const marketPositionReplacementCandidates: MarketPositionReplacementCandidate[] = pendingMarketReplacementBucket
    ? [
        ...players.map((player): MarketPositionReplacementCandidate => ({
          id: player.id,
          name: player.name,
          shortName: player.shortName,
          position: player.card?.position || roleLabel(player.role),
          role: player.role,
          inventoryId: player.card?.inventoryId,
          location: "field",
        })),
        ...benchPlayers.map((player): MarketPositionReplacementCandidate => ({
          id: player.id,
          name: player.name,
          shortName: player.shortName,
          position: player.position,
          role: player.role,
          inventoryId: player.inventoryId,
          location: "reserve",
        })),
      ].filter((player) => touchlineMarketPositionBucket(player.position, player.role) === pendingMarketReplacementBucket)
    : [];
  const normalizedMarketSearch = normalizeTextKey(marketSearch);
  const marketPositionCounts = touchlineMarketPositionBucketCount([
    ...players.map((player) => ({ position: player.card?.position, role: player.role })),
    ...benchPlayers.map((bench) => ({ position: bench.position, role: bench.role })),
    ...marketCartPlayers.map((player) => ({ position: player.position, role: player.role })),
  ]);
  // A ClubOwner can build a squad in football order, not in a forced wizard
  // order. The selected position must always be the position being browsed;
  // each bucket still has its approved squad limit at contract time.
  const effectiveMarketPositionBucketFilter: TouchlineMarketPositionBucketFilter = marketPositionBucketFilter;
  const visibleMarketPlayers = sortedBuilderSquad
    .filter((player) => {
      if (marketPositionFilter !== "all" && player.role !== marketPositionFilter) return false;
      if (
        effectiveMarketPositionBucketFilter !== "all"
        && touchlineMarketPositionBucket(player.position, player.role) !== effectiveMarketPositionBucketFilter
      ) return false;
      if (marketNeedsOnly) {
        const bucket = touchlineMarketPositionBucket(player.position, player.role);
        if ((marketPositionCounts[bucket] ?? 0) >= TOUCHLINE_MARKET_POSITION_LIMITS[bucket]) return false;
      }
      if (!normalizedMarketSearch) return true;
      return normalizeTextKey([
        player.name,
        player.shortName,
        player.position,
        player.clubName,
        player.countryCode3,
      ].filter(Boolean).join(" ")).includes(normalizedMarketSearch);
    })
    .sort((a, b) => {
      if (marketSortMode === "price-asc") return builderPlayerRetailPriceTc(a) - builderPlayerRetailPriceTc(b) || a.name.localeCompare(b.name);
      if (marketSortMode === "price-desc") return builderPlayerRetailPriceTc(b) - builderPlayerRetailPriceTc(a) || a.name.localeCompare(b.name);
      if (marketSortMode === "tier-desc") return cardTierSortWeight(b.cardTier) - cardTierSortWeight(a.cardTier) || a.name.localeCompare(b.name);
      if (marketSortMode === "name") return a.name.localeCompare(b.name);
      return roleSortWeight(a.role) - roleSortWeight(b.role) || builderPlayerRetailPriceTc(b) - builderPlayerRetailPriceTc(a) || a.name.localeCompare(b.name);
    });
  const marketSpotlightPlayer = sortedBuilderSquad.find((player) => stableBuilderPlayerId(player) === marketSpotlightPlayerId) ?? null;
  const marketSpotlightCard = marketSpotlightPlayer
    ? builderPlayerToPreviewCard(marketSpotlightPlayer, { allowInventoryVisualPreview: true })
    : null;
  const marketSpotlightZoomDetails = marketSpotlightCard
    ? arenaPlayerZoomDetails(
        marketSpotlightCard,
        siteLanguage,
        touchlinePlayerProfileHref({
          sportmonksPlayerId: marketSpotlightPlayer?.providerId || marketSpotlightPlayer?.id || "",
          name: marketSpotlightPlayer?.name || "",
          clubName: marketSpotlightPlayer?.clubName || "",
          position: marketSpotlightPlayer?.position || marketSpotlightPlayer?.role || "",
          shirtNumber: marketSpotlightPlayer?.shirtNumber,
          countryCode3: marketSpotlightPlayer?.countryCode3,
        }, siteLanguage, { previewTier: marketSpotlightCard.cardTier }),
      )
    : null;
  const requiresAuthoritativeMarketInventory = marketInventoryMode === "checking"
    || marketInventoryMode === "authoritative"
    || marketInventoryMode === "unavailable";
  const isMarketDataRefreshing = marketInventoryMode === "checking";
  const currentLocale = TOUCHLINE_SUPPORTED_LOCALES.find((locale) => locale.code === siteLanguage) ?? TOUCHLINE_SUPPORTED_LOCALES[0];
  const marketPlayerCount = sortedBuilderSquad.length;
  const openContractSlots = marketInventorySnapshot?.openContractSlots
    ?? Math.max(0, TOUCHLINE_SQUAD_RULES.contracted - ownedSquadCount);
  const isContractRosterFull = openContractSlots === 0;
  const marketCartContractIds = new Set(marketCartPlayers.map(builderPlayerSquadContractId));
  const isMarketCartAtCapacity = openContractSlots > 0 && marketCartPlayers.length >= openContractSlots;
  const marketCartQuote = quoteTouchlineMarketCart({
    candidates: marketCartPlayers.map((player) => {
      const contractId = builderPlayerSquadContractId(player);
      const alreadyOwned = players.some((arenaPlayer) => matchesBuilderPlayer(arenaPlayer, player))
        || benchPlayers.some((bench) => matchesBuilderBenchPlayer(bench, player));
      return {
        id: player.inventoryId || contractId,
        cardTier: player.cardTier,
        authoritativeUnitPriceTc: player.inventoryPriceTc,
        authoritativePriceTableVersion: player.inventoryId ? player.cardPriceVersion : undefined,
        alreadyOwned: player.inventoryAlreadyOwned ?? alreadyOwned,
        availableCopies: player.inventoryAvailableCopies
          ?? (TOUCHLINE_MARKET_CARD_SUPPLY_PER_PLAYER - (alreadyOwned ? 1 : 0)),
      };
    }),
    walletBalanceTc: marketWalletBalanceTc,
    openContractSlots,
    checkoutPolicy: marketInventorySnapshot?.checkoutPolicy,
  });
  const visibleRumourSignals = filterRumourSignals(rumourSignals, {
    clubKey: rumourClubKey,
    search: rumourSearch,
    sortMode: rumourSortMode,
    favorites: favoriteRumourIds,
  });
  const t = useCallback((key: Parameters<typeof touchLineT>[1]) => touchLineT(siteLanguage, key), [siteLanguage]);
  const marketUi = useMemo(() => getTouchLineMarketCopy(siteLanguage), [siteLanguage]);
  const builderStatus = builderLoadState.status === "loading"
    ? `${marketUi.updatingClub}: ${selectedBuilderClub.name}`
    : builderLoadState.status === "ready"
      ? `${builderLoadState.playerCount ?? 0} ${t("playersLoaded")}`
      : builderLoadState.status === "error"
        ? builderLoadState.message || marketUi.genericError
        : marketUi.choosePremierClub;
  const persistArenaRoster = useCallback((fieldPlayers: ArenaPlayer[], reserves: BenchOption[]) => {
    if (!arenaPersistencePrincipal) return;
    writeBrowserClubOwnerRoster(arenaClubOwnerRoster(fieldPlayers, reserves), {
      principal: arenaPersistencePrincipal,
    });
  }, [arenaPersistencePrincipal]);
  const cardLabels = useMemo<Partial<TouchlineEliteExactCardLabels>>(() => ({
    nationality: t("nationalityShort"),
    points: t("points"),
    totalPoints: t("touchlinePoints"),
    cardPrice: siteLanguage === "pt-BR" ? "Preço do card" : "Card price",
    currentClub: siteLanguage === "pt-BR" ? "Clube atual" : "Current Club",
  }), [siteLanguage, t]);
  const arenaFieldPlayersForRendering = isQuickSubstitutionSessionActive
    ? quickSubstitutionInteractivePlayers
    : players;
  const arenaFieldCardSignature = useMemo(() => arenaFieldPlayersForRendering
    .filter((player) => Boolean(player.card))
    .map((player) => {
      const previewTier = isDemoLineup ? touchlineDemoTierForPlayer(player.id, player.name) : undefined;
      const previewCard = arenaCardToPlayer(player, previewTier);
      return [
        player.id,
        previewCard.cardTemplateUrl,
        previewCard.flagUrl,
        previewCard.clubLogoUrl,
        previewCard.shirtNumber,
        previewCard.cardTier,
      ].join(":");
    })
    .join("|"), [arenaFieldPlayersForRendering, isDemoLineup]);
  const arenaFieldCardsAreReady = !arenaFieldCardSignature || readyArenaFieldCardsSignature === arenaFieldCardSignature;

  useEffect(() => {
    if ((!shouldRenderPlayers && !isQuickSubstitutionSessionActive) || !arenaFieldCardSignature) {
      return;
    }
    if (readyArenaFieldCardsSignature === arenaFieldCardSignature) return;

    let cancelled = false;
    const assetUrls = arenaFieldPlayersForRendering.flatMap((player) => {
      if (!player.card) return [];
      const previewTier = isDemoLineup ? touchlineDemoTierForPlayer(player.id, player.name) : undefined;
      return arenaFieldCanonicalCardAssetUrls(player, previewTier);
    });

    void preloadLiveProductImages(assetUrls, 1_200).then(() => {
      if (!cancelled) setReadyArenaFieldCardsSignature(arenaFieldCardSignature);
    });

    return () => {
      cancelled = true;
    };
  }, [
    arenaFieldCardSignature,
    arenaFieldPlayersForRendering,
    isDemoLineup,
    isQuickSubstitutionSessionActive,
    readyArenaFieldCardsSignature,
    shouldRenderPlayers,
  ]);

  const openLiveSimulationCard = useCallback((playerId: string) => {
    setSelectedLiveCoachSide(null);
    setSelectedLiveSimulationCardId(playerId);
  }, []);

  useEffect(() => {
    if (!liveCardProductsSignature) return;
    const simulation = liveSimulationRef.current;
    const coaches = liveCoachCardsRef.current;
    if (!simulation || !coaches) return;
    if (simulation.querySelectorAll("[data-live-player-id]").length !== 22) return;
    if (coaches.querySelectorAll("[data-live-coach-card]").length !== 2) return;

    let cancelled = false;
    let firstRevealFrame = 0;
    let secondRevealFrame = 0;
    const listenerCleanups: Array<() => void> = [];
    const htmlImages = [
      ...simulation.querySelectorAll<HTMLImageElement>("img[data-live-card-asset]"),
      ...coaches.querySelectorAll<HTMLImageElement>("img[data-live-card-asset]"),
    ];

    const settledAssets = Promise.allSettled([
      ...htmlImages.map((image) => waitForLiveHtmlImage(image, listenerCleanups)),
    ]).then(() => undefined);

    void settledAssets.then(() => {
      if (cancelled) return;
      listenerCleanups.forEach((cleanup) => cleanup());
      firstRevealFrame = window.requestAnimationFrame(() => {
        secondRevealFrame = window.requestAnimationFrame(() => {
          if (!cancelled) {
            setReadyLiveCardProductsSignature(liveCardProductsSignature);
          }
        });
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstRevealFrame);
      window.cancelAnimationFrame(secondRevealFrame);
      listenerCleanups.forEach((cleanup) => cleanup());
    };
  }, [liveCardProductsSignature]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const intent = initialIntroIntent ?? parseTouchlineArenaIntroIntent({
      intro: params.get(TOUCHLINE_ARENA_INTRO_QUERY_PARAM),
      skipIntro: params.get(TOUCHLINE_ARENA_SKIP_INTRO_QUERY_PARAM),
    });
    const hasCompletedIntro = readBrowserStorage(
      "localStorage",
      TOUCHLINE_ARENA_INTRO_STORAGE_KEY,
    ) === "1";

    const launchMode = resolveTouchlineArenaIntroLaunchMode({ intent, hasCompletedIntro });
    queueMicrotask(() => {
      if (cancelled) return;
      if (launchMode === "skip") {
        writeBrowserStorage("localStorage", TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "1");
        setIntroExperienceMode("hidden");
        setIsEntrySkipAvailable(false);
        startCardLoopVideo();
        return;
      }

      firstVideoRef.current?.pause();
      secondVideoRef.current?.pause();
      setActiveVideoIndex(0);
      setHasEntryVideoFinished(false);
      setIsArenaVideoPaused(false);
      setIntroExperienceMode(launchMode);
    });

    return () => {
      cancelled = true;
    };
  }, [initialIntroIntent]);

  useEffect(() => {
    const entryVideo = firstVideoRef.current;
    const loopVideo = secondVideoRef.current;
    if (!isArenaIntroViewportReady) {
      entryVideo?.pause();
      loopVideo?.pause();
      if (entryVideo && !hasEntryVideoFinished) entryVideo.currentTime = 0;
      return;
    }

    if (introExperienceMode !== "hidden") return;
    const videoToResume = hasEntryVideoFinished ? loopVideo : entryVideo;
    if (!videoToResume) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videoToResume.pause();
      return;
    }
    void videoToResume.play().catch(() => setIsArenaVideoPaused(true));
  }, [hasEntryVideoFinished, introExperienceMode, isArenaIntroViewportReady]);

  useEffect(() => () => {
    if (loopRevealTimerRef.current !== null) window.clearTimeout(loopRevealTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    queueResilientAsyncTask(async () => {
      const savedLocale = normalizeTouchLineLocale(readTouchLineLocalePreference());
      const preferredLocale = initialLocale
        ?? (isTouchLineLocaleComplete(savedLocale) ? savedLocale : TOUCHLINE_DEFAULT_LOCALE);
      if (!cancelled) {
        setSiteLanguage((current) => current === preferredLocale ? current : preferredLocale);
        setHasLoadedLocalePreference(true);
      }

      const params = new URLSearchParams(window.location.search);
      const shouldSkipIntro = params.get(TOUCHLINE_ARENA_SKIP_INTRO_QUERY_PARAM) === "1";
      const isDemoRequest = initialDemoLineup || initialEmptyLineup || params.get(DEMO_LINEUP_QUERY_PARAM) === "1";
      const requestedClub = findPremierClubByHubParam(params.get("club"));
      const anonymousPrincipal = browserAnonymousArenaPrincipal();
      let syncResolution = resolveArenaAccountSync<TouchlineArenaRemoteState>({
        isDemoRequest,
        anonymousPrincipal,
        response: null,
      });

      if (!isDemoRequest) {
        try {
          const response = await touchlineJsonRequest<{
            ok?: boolean;
            userId?: string;
            state?: TouchlineArenaRemoteState | null;
          }>(
            "/api/touchline-arena/state",
            { cache: "no-store", timeoutMs: 8_000 },
          );
          syncResolution = resolveArenaAccountSync({
            isDemoRequest: false,
            anonymousPrincipal,
            response: {
              ok: response.ok,
              status: response.status,
              payload: response.payload,
            },
          });
        } catch {
          // The anonymous cache remains visual-only while account identity is unavailable.
        }
      }

      if (cancelled) return;
      const { principal, remoteState, status: accountSyncStatus } = syncResolution;
      setArenaPersistencePrincipal(principal);
      setArenaAccountSyncStatus(accountSyncStatus);
      setMarketWalletBalanceTc(
        principal.kind === "authenticated" ? 0 : readMarketWalletBalanceTc(principal),
      );
      if (principal.kind === "authenticated") {
        setMarketInventoryMode(accountSyncStatus === "ready" ? "checking" : "unavailable");
      } else {
        setMarketInventoryMode("demo");
      }

      const formationStorageKey = arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.formation);
      const lineupStorageKey = arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.lineup);
      const formationLocksStorageKey = arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.formationLocks);
      const coachStorageKey = arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.coach);
      const marketFormationStorageKey = arenaStorageKey(principal, ARENA_PERSISTENCE_RESOURCES.marketFormation);
      const remoteCoachProviderId = typeof remoteState?.coach_provider_id === "string"
        ? remoteState.coach_provider_id.trim()
        : "";
      const storedCoachProviderId = remoteCoachProviderId || readBrowserStorage("localStorage", coachStorageKey) || "";
      const restoredCoach = touchlineLiveCoachForProviderId(storedCoachProviderId);
      if (restoredCoach) {
        writeBrowserStorage("localStorage", coachStorageKey, restoredCoach.coach.providerId);
        setOwnerCoachProviderId(restoredCoach.coach.providerId);
      } else {
        removeBrowserStorage("localStorage", coachStorageKey);
        setOwnerCoachProviderId(null);
      }
      setHasLoadedOwnerCoach(true);
      let effectiveFormationKey = remoteState
        ? parseArenaFormationKey(remoteState.formation_key ?? null)
        : parseArenaFormationKey(readBrowserStorage("localStorage", formationStorageKey));
      const storedMarketFormation = readBrowserStorage("localStorage", marketFormationStorageKey);
      const hasExistingRemoteLineup = Boolean(remoteState && Array.isArray(remoteState.lineup) && remoteState.lineup.length > 0);
      setMarketFormationConfirmed(
        hasExistingRemoteLineup || storedMarketFormation === effectiveFormationKey,
      );

      if (remoteState?.saved_formation_layouts && typeof remoteState.saved_formation_layouts === "object") {
        writeBrowserStorage(
          "localStorage",
          formationLocksStorageKey,
          JSON.stringify(remoteState.saved_formation_layouts),
        );
      }
      setLockedFormationKeys(
        Object.keys(readLockedFormationLayouts(principal)).filter(
          (key): key is ArenaFormationKey => ARENA_FORMATIONS.some((formation) => formation.key === key),
        ),
      );

      if (requestedClub) {
        setSelectedBuilderClubKey(requestedClub.teamId);
        setActiveArenaPanel("market");
        window.history.replaceState(window.history.state, "", touchlineArenaPanelUrl(window.location.href, "market"));
        setIsLiveDockOpen(false);
        writeBrowserStorage("localStorage", ARENA_LIVE_DOCK_VISIBILITY_STORAGE_KEY, "hidden");
        setIsArenaNavOpen(false);
      }

      if (params.get("clearLineup") === "1") {
        setIsDemoLineup(false);
        removeBrowserStorage("localStorage", formationStorageKey);
        removeBrowserStorage("localStorage", lineupStorageKey);
        removeBrowserStorage("localStorage", marketFormationStorageKey);
        setMarketFormationConfirmed(false);
        const clearedUrl = new URL(window.location.href);
        clearedUrl.searchParams.delete("clearLineup");
        window.history.replaceState(null, "", `${clearedUrl.pathname}${clearedUrl.search}${clearedUrl.hash}`);
        setPlayers([]);
        setBenchPlayers([]);
        setSelectedPlayerId(null);
        setSelectedBenchId("");
        setShouldRenderPlayers(false);
        setHasLoadedSavedLineup(true);
        setSaveStatus(touchLineT(preferredLocale, "arenaCleared"));
        return;
      }

      setSelectedFormationKey(effectiveFormationKey);
      if (shouldSkipIntro) {
        setHasEntryVideoFinished(true);
        setActiveVideoIndex(1);
        setShouldRenderPlayers(true);
      }

      if (initialEmptyLineup) {
        setIsDemoLineup(false);
        setArenaRosterSyncStatus("demo");
        setPlayers([]);
        setBenchPlayers([]);
        setSelectedBenchId("");
        setSelectedPlayerId(null);
        setShouldRenderPlayers(false);
        setHasLoadedClubOwnerRoster(true);
        setHasLoadedSavedLineup(true);
        return;
      }

      if (isDemoRequest) {
        setIsDemoLineup(true);
        setArenaRosterSyncStatus("demo");
        setPlayers(buildDemoArenaPlayers(effectiveFormationKey));
        setBenchPlayers(BENCH_OPTIONS);
        setSelectedBenchId(BENCH_OPTIONS[0]?.id ?? "");
        setSelectedPlayerId(null);
        setShouldRenderPlayers(true);
        setSaveStatus(touchLineT(preferredLocale, "demoElevenCards"));
        setHasLoadedClubOwnerRoster(true);
        setHasLoadedSavedLineup(true);
        return;
      }

      setIsDemoLineup(false);
      const savedLineup = remoteState && Array.isArray(remoteState.lineup)
        ? JSON.stringify(remoteState.lineup)
        : readBrowserStorage("localStorage", lineupStorageKey);

      if (remoteState && Array.isArray(remoteState.lineup)) {
        effectiveFormationKey = parseArenaFormationKey(remoteState.formation_key ?? null);
        setSelectedFormationKey(effectiveFormationKey);
        writeBrowserStorage("localStorage", formationStorageKey, effectiveFormationKey);
        writeBrowserStorage("localStorage", lineupStorageKey, savedLineup ?? "[]");
      }

      if (!savedLineup) {
        setPlayers([]);
        setShouldRenderPlayers(false);
        setHasLoadedSavedLineup(true);
        return;
      }

      try {
        const parsed = JSON.parse(savedLineup) as Partial<ArenaPlayer>[];
        const mergedPlayers = mergeSavedPlayers(
          Array.isArray(parsed) ? parsed : [],
          effectiveFormationKey,
          principal,
        );
        writeBrowserStorage("localStorage", lineupStorageKey, JSON.stringify(mergedPlayers));
        setPlayers(mergedPlayers);
        setShouldRenderPlayers(mergedPlayers.length > 0 || shouldSkipIntro);
      } catch {
        removeBrowserStorage("localStorage", lineupStorageKey);
        setPlayers([]);
      } finally {
        setHasLoadedSavedLineup(true);
      }
    }, () => {
      if (cancelled) return;
      setPlayers([]);
      setShouldRenderPlayers(false);
      setHasLoadedOwnerCoach(true);
      setHasLoadedSavedLineup(true);
    });

    return () => {
      cancelled = true;
    };
  }, [initialDemoLineup, initialEmptyLineup, initialLocale]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsLiveDockOpen(standalonePanel === "live" || initialPanel === "live");
      setSelectedLiveFixtureId(readBrowserStorage("localStorage", ARENA_LIVE_DOCK_FIXTURE_STORAGE_KEY));
      setHasRestoredLiveFixtureSelection(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialPanel, standalonePanel]);

  useEffect(() => {
    if (!hasRestoredLiveFixtureSelection) return;
    const premierFixtures = liveFixtures.filter(isPremierFixture);
    const fixtures = premierFixtures;
    if (!fixtures.length || fixtures.some((fixture) => fixture.id === selectedLiveFixtureId)) return;

    const defaultFixtureId = fixtures[0].id;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectedLiveFixtureId(defaultFixtureId);
      writeBrowserStorage("localStorage", ARENA_LIVE_DOCK_FIXTURE_STORAGE_KEY, defaultFixtureId);
    });
    return () => {
      cancelled = true;
    };
  }, [hasRestoredLiveFixtureSelection, liveFixtures, selectedLiveFixtureId]);

  useEffect(() => {
    if (!hasLoadedSavedLineup || hasLoadedClubOwnerRoster || !arenaPersistencePrincipal) return;

    if (arenaPersistencePrincipal.kind === "demo") {
      queueMicrotask(() => {
        setArenaRosterSyncStatus("demo");
        setHasLoadedClubOwnerRoster(true);
      });
      return;
    }

    let cancelled = false;
    queueResilientAsyncTask(async () => {
      if (cancelled) return;

      const persistedRoster = readBrowserClubOwnerRoster({
        principal: arenaPersistencePrincipal,
        fallback: "empty",
      });
      let roster = persistedRoster;
      let rosterStatus: ArenaAccountSyncStatus = arenaPersistencePrincipal.kind === "anonymous"
        ? arenaAccountSyncStatus === "anonymous" ? "anonymous" : "unavailable"
        : "unavailable";
      let isAuthoritativeRoster = false;

      if (arenaPersistencePrincipal.kind === "authenticated") {
        try {
          const response = await fetch("/api/touchline-arena/roster", { cache: "no-store" });
          const payload: unknown = await response.json();
          const parsedRoster = response.ok
            ? parseAuthoritativeRosterResponse(payload)
            : { ok: false as const };
          if (parsedRoster.ok) {
            roster = parsedRoster.cards;
            rosterStatus = "ready";
            isAuthoritativeRoster = true;
          }
        } catch {
          // The namespaced browser roster remains a visual-only fallback.
        }
      }

      if (cancelled) return;
      const reconciledPlayers = isAuthoritativeRoster
        ? reconcileArenaLineupWithAuthoritativeRoster(players, roster)
        : mergeArenaLineupInventoryFromRoster(players, roster);
      const fieldInventoryIds = new Set(
        reconciledPlayers
          .map((player) => normalizeTouchlineMarketInventoryId(player.card?.inventoryId))
          .filter((inventoryId): inventoryId is string => Boolean(inventoryId)),
      );
      const fieldCardIds = new Set(
        reconciledPlayers.map((player) => arenaPlayerToClubOwnerCard(player).id),
      );
      const restoredBench = roster
        .filter((card) => {
          const inventoryId = normalizeTouchlineMarketInventoryId(card.inventoryId);
          return inventoryId
            ? !fieldInventoryIds.has(inventoryId)
            : !fieldCardIds.has(card.id);
        })
        .map(clubOwnerCardToBenchOption);

      if (reconciledPlayers !== players) setPlayers(reconciledPlayers);
      if (isAuthoritativeRoster) setShouldRenderPlayers(reconciledPlayers.length > 0);
      setBenchPlayers(restoredBench);
      setSelectedBenchId(restoredBench[0]?.id ?? "");
      if (isAuthoritativeRoster) {
        writeBrowserClubOwnerRoster(roster, {
          principal: arenaPersistencePrincipal,
        });
      }
      setArenaRosterSyncStatus(rosterStatus);
      setHasLoadedClubOwnerRoster(true);
    }, () => {
      if (cancelled) return;
      setArenaRosterSyncStatus("unavailable");
      setHasLoadedClubOwnerRoster(true);
    });
    return () => {
      cancelled = true;
    };
  }, [arenaAccountSyncStatus, arenaPersistencePrincipal, hasLoadedClubOwnerRoster, hasLoadedSavedLineup, players]);

  useEffect(() => {
    let cancelled = false;
    if (arenaPersistencePrincipal?.kind !== "authenticated") {
      queueMicrotask(() => {
        if (cancelled) return;
        setCoachOffersByProviderId({});
        setCoachOfferStatus("idle");
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setCoachOfferStatus("loading");
    });
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), 10_000);
    fetch("/api/touchline-arena/coach", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await readTouchlineJsonPayload<{
          ok?: boolean;
          offers?: TouchlineCompetitionCardOffer[];
        }>(response);
        if (cancelled || !response.ok || !payload?.ok || !Array.isArray(payload.offers)) {
          if (!cancelled) setCoachOfferStatus("error");
          return;
        }
        const offers = Object.fromEntries(
          payload.offers
            .filter((offer) => offer.subjectType === "coach" && offer.subjectId.trim())
            .map((offer) => [offer.subjectId, offer]),
        ) as Record<string, TouchlineCompetitionCardOffer>;
        if (!cancelled) {
          setCoachOffersByProviderId(offers);
          setCoachOfferStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setCoachOfferStatus("error");
      })
      .finally(() => {
        window.clearTimeout(requestTimeout);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(requestTimeout);
    };
  }, [arenaPersistencePrincipal]);

  useEffect(() => {
    if (
      arenaAccountSyncStatus !== "ready"
      || arenaPersistencePrincipal?.kind !== "authenticated"
      || activeArenaPanel === "market"
    ) return;

    let cancelled = false;
    let settled = false;
    const teamId = selectedBuilderClubKey;
    const bootstrapKey = `${arenaPersistencePrincipal.userId}:${teamId}`;
    if (marketBootstrapAttemptRef.current === bootstrapKey) return;
    marketBootstrapAttemptRef.current = bootstrapKey;
    queueMicrotask(() => {
      if (!cancelled) setMarketInventoryMode("checking");
    });

    touchlineJsonRequest<unknown>(
      `/api/touchline-arena/market/inventory?teamId=${encodeURIComponent(teamId)}`,
    ).then(({ ok, payload }) => {
      settled = true;
      if (cancelled) return;
      const inventorySnapshot = ok
        ? parseTouchlineMarketInventorySnapshot(payload)
        : null;
      if (!inventorySnapshot) {
        marketBootstrapAttemptRef.current = null;
        setMarketInventorySnapshot(null);
        setMarketInventoryMode("unavailable");
        return;
      }

      setMarketInventorySnapshot(inventorySnapshot);
      setMarketInventoryMode("authoritative");
      setMarketWalletBalanceTc(inventorySnapshot.walletBalanceTc);
    }).catch(() => {
      settled = true;
      if (cancelled) return;
      marketBootstrapAttemptRef.current = null;
      setMarketInventorySnapshot(null);
      setMarketInventoryMode("unavailable");
    });

    return () => {
      cancelled = true;
      if (!settled && marketBootstrapAttemptRef.current === bootstrapKey) {
        marketBootstrapAttemptRef.current = null;
      }
    };
  }, [activeArenaPanel, arenaAccountSyncStatus, arenaPersistencePrincipal, selectedBuilderClubKey]);

  useEffect(() => {
    if (!hasLoadedLocalePreference) return;
    writeTouchLineLocalePreference(siteLanguage);
    document.documentElement.lang = siteLanguage;
  }, [hasLoadedLocalePreference, siteLanguage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fixtureId = params.get("fixtureId") ?? params.get("fixture");
    const showPlayers = params.get("showPlayers") === "1";
    const fixtureFormationKey = arenaPersistencePrincipal
      ? parseArenaFormationKey(
          readBrowserStorage(
            "localStorage",
            arenaStorageKey(arenaPersistencePrincipal, ARENA_PERSISTENCE_RESOURCES.formation),
          ),
        )
      : DEFAULT_ARENA_FORMATION_KEY;

    // `showPlayers=1` is an explicit internal/QA matchday view. A canonical
    // fixture activates the public layer only after its complete lineup has
    // loaded, preventing a previously saved card from flashing meanwhile.
    queueMicrotask(() => setIsArenaMatchdayViewActive(showPlayers));
    if (showPlayers) queueMicrotask(() => setShouldRenderPlayers(true));
    if (!fixtureId) return;

    let cancelled = false;
    queueMicrotask(() => setFixtureStatus(t("loadingSource")));

    touchlineJsonRequest<
      | { ok: true; data: TouchlinePublicFantasyFixtureFeed }
      | { ok?: false; error?: string }
    >(`/api/football-data/fantasy/fixture?fixtureId=${encodeURIComponent(fixtureId)}`)
      .then(({ ok, payload }) => {
        const fixturePayload = payload as
          | { ok: true; data: TouchlinePublicFantasyFixtureFeed }
          | { ok?: false; error?: string };

        if (!ok || fixturePayload.ok !== true) {
          throw new Error("error" in fixturePayload ? fixturePayload.error : `${PUBLIC_DATA_SOURCE_LABEL} fixture failed.`);
        }

        return fixturePayload.data;
      })
      .then((feed) => {
        if (cancelled) return;

        const lineupPlayers = buildArenaPlayersFromFantasyLineup(feed.lineups);
        if (lineupPlayers.length < 11) {
          setFixtureStatus(`${PUBLIC_DATA_SOURCE_LABEL} · ${t("fixtureNeedsElevenStarters")}`);
          setSaveStatus(t("fixtureNeedsElevenStarters"));
          return;
        }

        setIsDemoLineup(false);
        setPlayers(normalizeArenaPlayersForFormation(lineupPlayers, fixtureFormationKey, arenaPersistencePrincipal));
        setIsArenaMatchdayViewActive(true);
        setShouldRenderPlayers(true);
        setFixtureStatus(`${feed.fixture.name || PUBLIC_DATA_SOURCE_LABEL} ${t("fixtureLoaded")}`);
        setSaveStatus(`${PUBLIC_DATA_SOURCE_LABEL} · ${t("saved")}`);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setIsArenaMatchdayViewActive(false);
        setFixtureStatus((error.message || `${PUBLIC_DATA_SOURCE_LABEL} failed`).replace(/SportMonks/gi, PUBLIC_DATA_SOURCE_LABEL));
        setSaveStatus(`${PUBLIC_DATA_SOURCE_LABEL} · ${t("sourceUnavailable")}`);
      });

    return () => {
      cancelled = true;
    };
  }, [arenaPersistencePrincipal, t]);

  useEffect(() => {
    if (!hasLoadedSavedLineup || !hasLoadedClubOwnerRoster || isDemoLineup || !arenaPersistencePrincipal) return;
    // Quick Substitution is a match-session projection, never an Arena roster
    // save. An empty lineup is likewise not a valid automatic state update:
    // `?clearLineup=1` must not silently erase the owner's remote lineup.
    if (isQuickSubstitutionOpen || isArenaMatchdayViewActive || players.length === 0) {
      if (accountLineupSaveTimerRef.current) {
        window.clearTimeout(accountLineupSaveTimerRef.current);
        accountLineupSaveTimerRef.current = null;
      }
      return;
    }
    saveLineup(players, selectedFormationKey, arenaPersistencePrincipal);
    if (
      !canPersistArenaAccountState(arenaPersistencePrincipal, arenaAccountSyncStatus)
      || arenaRosterSyncStatus !== "ready"
    ) {
      if (accountLineupSaveTimerRef.current) {
        window.clearTimeout(accountLineupSaveTimerRef.current);
        accountLineupSaveTimerRef.current = null;
      }
      queueMicrotask(() => setSaveStatus(
        arenaAccountSyncStatus === "unavailable" || arenaRosterSyncStatus === "unavailable"
          ? t("savedLocallySyncUnavailable")
          : t("savedLocally"),
      ));
      return;
    }
    if (accountLineupSaveTimerRef.current) window.clearTimeout(accountLineupSaveTimerRef.current);
    accountLineupSaveTimerRef.current = window.setTimeout(() => {
      fetch("/api/touchline-arena/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formation: selectedFormationKey,
          lineup: players.map(lockArenaPlayerSize),
          savedFormationLayouts: Object.fromEntries(
            Object.entries(readLockedFormationLayouts(arenaPersistencePrincipal))
              .filter(([key]) => key === "4-3-3" || key === "4-4-2"),
          ),
        }),
        keepalive: true,
      }).catch(() => null);
    }, 700);
    queueMicrotask(() => setSaveStatus(t("autoSaved")));
    return () => {
      if (accountLineupSaveTimerRef.current) window.clearTimeout(accountLineupSaveTimerRef.current);
    };
  }, [arenaAccountSyncStatus, arenaPersistencePrincipal, arenaRosterSyncStatus, hasLoadedClubOwnerRoster, hasLoadedSavedLineup, isArenaMatchdayViewActive, isDemoLineup, isQuickSubstitutionOpen, players, selectedFormationKey, t]);

  useEffect(() => {
    if (!hasLoadedSavedLineup || !players.some(hasArenaCardForHydration)) return;

    const savedCardSignatureByClubId = new Map<string, string[]>();
    players
      .filter(hasArenaCardForHydration)
      .forEach((player) => {
        const club = clubForArenaPlayer(player);
        if (!club) return;
        const current = savedCardSignatureByClubId.get(club.teamId) ?? [];
        current.push(String(player.id));
        savedCardSignatureByClubId.set(club.teamId, current);
      });
    const normalizedSavedCardSignatureByClubId = new Map(
      [...savedCardSignatureByClubId].map(([clubId, playerIds]) => [clubId, playerIds.sort().join(",")] as const),
    );

    const clubsToHydrate = Array.from(
      new Map(
        players
          .filter(hasArenaCardForHydration)
          .map((player) => clubForArenaPlayer(player))
          .filter((club): club is PremierClubVisual => Boolean(club))
          .map((club) => [club.teamId, club] as const),
      ).values(),
    ).filter((club) => {
      const signature = normalizedSavedCardSignatureByClubId.get(club.teamId);
      return Boolean(signature)
        && !pendingCardHydrationClubIdsRef.current.has(club.teamId)
        && lastCardHydrationSignatureByClubRef.current.get(club.teamId) !== signature;
    });

    if (!clubsToHydrate.length) return;

    clubsToHydrate.forEach((club) => {
      pendingCardHydrationClubIdsRef.current.add(club.teamId);
      lastCardHydrationSignatureByClubRef.current.set(
        club.teamId,
        normalizedSavedCardSignatureByClubId.get(club.teamId) ?? "",
      );
    });

    let cancelled = false;

    async function hydrateSavedCards() {
      const squadEntries = await Promise.all(
        clubsToHydrate.map(async (club) => {
          const params = new URLSearchParams({
            teamId: club.teamId,
            clubName: club.name,
            clubShortCode: club.shortCode,
            clubLogoUrl: club.logoUrl ?? "",
          });

          const squadRequest = touchlineJsonRequest<
            | { ok: true; players: TeamBuilderSquadPlayer[] }
            | { ok: false; error?: string; status?: string }
          >(`/api/football-data/premier-squad?${params.toString()}`);
          const inventoryRequest = canPersistArenaAccountState(
            arenaPersistencePrincipal,
            arenaAccountSyncStatus,
          )
            ? touchlineJsonRequest<unknown>(
                `/api/touchline-arena/market/inventory?teamId=${encodeURIComponent(club.teamId)}`,
              ).catch(() => null)
            : Promise.resolve(null);
          const [{ ok, payload }, inventoryResponse] = await Promise.all([
            squadRequest,
            inventoryRequest,
          ]);
          if (!ok) return [club.teamId, [] as TeamBuilderSquadPlayer[]] as const;

          const inventorySnapshot = inventoryResponse?.ok
            ? parseTouchlineMarketInventorySnapshot(inventoryResponse.payload)
            : null;
          return [
            club.teamId,
            connectBuilderSquadToMarketInventory(payload.ok ? payload.players : [], inventorySnapshot),
          ] as const;
        }),
      );

      if (cancelled) return;

      const squadByClubId = new Map(squadEntries);

      setPlayers((currentPlayers) => {
        let changed = false;
        const nextPlayers = currentPlayers.map((player) => {
          if (!hasArenaCardForHydration(player)) return player;

          const club = clubForArenaPlayer(player);
          if (!club) return player;

          const squad = squadByClubId.get(club.teamId) ?? [];
          const squadPlayer = squad.find((candidate) => matchesBuilderPlayer(player, candidate));
          if (!squadPlayer) return player;

          const hydratedPlayer = hydrateArenaPlayerFromSquad(player, squadPlayer);
          if (JSON.stringify(hydratedPlayer.card) !== JSON.stringify(player.card)) changed = true;
          return hydratedPlayer;
        });

        if (changed) queueMicrotask(() => setSaveStatus(t("cardDataUpdated")));
        return changed ? nextPlayers : currentPlayers;
      });
    }

    void hydrateSavedCards()
      .catch(() => {
        if (!cancelled) queueMicrotask(() => setSaveStatus(`${PUBLIC_DATA_SOURCE_LABEL} · ${t("sourceUnavailableToCompleteCards")}`));
      })
      .finally(() => {
        clubsToHydrate.forEach((club) => pendingCardHydrationClubIdsRef.current.delete(club.teamId));
      });

    return () => {
      cancelled = true;
    };
  }, [arenaAccountSyncStatus, arenaPersistencePrincipal, hasLoadedSavedLineup, players, t]);

  useEffect(() => {
    // Every Arena paint reads the persisted schedule. The optional Live dock
    // only re-reads the durable snapshot; browser code never refreshes data.
    const shouldPollPersistedLiveSnapshot = isLiveDockOpen || standalonePanel === "live";

    let cancelled = false;
    let hasPersistedSchedule = false;
    const requestController = new AbortController();
    const storedSnapshot = readStoredLiveFixtureSnapshot();
    if (storedSnapshot?.fixtures.length) {
      queueMicrotask(() => {
        if (cancelled) return;
        setLiveFixtures(storedSnapshot.fixtures);
        setLiveFeedStatus("England cache");
      });
    }

    function applyPersistedSchedule(payload: {
      data: TouchlineFixture[];
      cached?: boolean;
      degraded?: boolean;
      fetchedAt?: string;
    }) {
      if (
        cancelled
        || !Array.isArray(payload.data)
        || !payload.data.every(isStoredLiveFixture)
      ) return false;
      hasPersistedSchedule = true;
      writeStoredLiveFixtureSnapshot(payload.data, payload.fetchedAt);
      setLiveFixtures(payload.data);
      setLiveFeedStatus(
        payload.data.some(isPremierFixture)
          ? "England cache"
          : "TouchLine England",
      );
      return true;
    }

    function applyPersistedLiveSnapshot(payload: {
      data: TouchlineFixture[];
      cached?: boolean;
      degraded?: boolean;
      fetchedAt?: string;
    }) {
      if (cancelled || !payload.data.length || !payload.data.every(isStoredLiveFixture)) return false;
      // The endpoint emits one durable server snapshot. Do not merge it with
      // browser state: a future canonical-round projection must be selected
      // server-side rather than recomputed from visitor-specific inputs.
      writeStoredLiveFixtureSnapshot(payload.data, payload.fetchedAt);
      setLiveFixtures(payload.data);
      setLiveFeedStatus(payload.cached || payload.degraded ? "England cache" : "England live");
      return true;
    }

    async function loadPersistedSchedule() {
      try {
        const { ok, payload } = await touchlineJsonRequest<
          | { ok: true; data: TouchlineFixture[]; cached?: boolean; degraded?: boolean; fetchedAt?: string }
          | { ok: false; error?: string; code?: string }
        >("/api/football-data/fixture-schedule", {
          timeoutMs: ARENA_LIVE_SCHEDULE_REQUEST_TIMEOUT_MS,
          signal: requestController.signal,
        });

        if (!ok || payload.ok === false || !applyPersistedSchedule(payload)) {
          // The Live projection is the same server-owned, read-only fixture
          // snapshot. Use it as a fallback so the normal Arena never leaves
          // its premium score rail blank when the fuller schedule is delayed.
          await refreshLiveFixtures();
        }
      } catch {
        // A delayed or failed schedule must still try the persisted Live
        // projection; neither path refreshes a provider from the browser.
        await refreshLiveFixtures();
      }
    }

    async function refreshLiveFixtures() {
      try {
        const { ok, payload } = await touchlineJsonRequest<
          | { ok: true; data: TouchlineFixture[]; cached?: boolean; degraded?: boolean; fetchedAt?: string }
          | { ok: false; error?: string; code?: string }
        >("/api/football-data/fantasy/livescores", {
          timeoutMs: ARENA_LIVE_SNAPSHOT_REQUEST_TIMEOUT_MS,
          signal: requestController.signal,
        });

        if (cancelled) return;

        if (!ok || payload.ok === false) {
          if (!storedSnapshot) {
            setLiveFeedStatus(payload.ok === false && payload.code === "not_configured" ? `${PUBLIC_DATA_SOURCE_LABEL} unavailable` : "No canonical fixture snapshot");
          }
          return;
        }

        applyPersistedLiveSnapshot(payload);
      } catch {
        if (!cancelled && !storedSnapshot && !hasPersistedSchedule) {
          setLiveFeedStatus("No canonical fixture snapshot");
        }
      }
    }

    void loadPersistedSchedule();
    if (shouldPollPersistedLiveSnapshot) void refreshLiveFixtures();
    const interval = shouldPollPersistedLiveSnapshot
      ? window.setInterval(() => void refreshLiveFixtures(), 45_000)
      : null;
    return () => {
      cancelled = true;
      requestController.abort();
      if (interval !== null) window.clearInterval(interval);
    };
  }, [isLiveDockOpen, standalonePanel]);

  useEffect(() => {
    // Do not request a provisional fallback squad before browser persistence
    // has had one microtask to restore a user's saved fixture.
    if (!hasRestoredLiveFixtureSelection) return;

    // The full 22-card match product belongs to the independent Live
    // experience. Keeping it out of the first Arena paint avoids duplicate
    // squad/API work while the user is choosing a formation. The live page
    // and an explicitly opened live dock still activate the exact same
    // snapshot pipeline below.
    if (!isLiveDockOpen && standalonePanel !== "live") return;

    if (!effectiveSelectedLiveFixtureId) {
      queueMicrotask(() => {
        loadedLiveSquadFixtureRef.current = null;
        liveSquadRequestSequenceRef.current += 1;
        setLiveMatchSquads(null);
        setSelectedLiveSimulationCardId(null);
      });
      return;
    }

    const premierFixtures = liveFixtures.filter(isPremierFixture);
    const fixtures = premierFixtures;
    const fixture = fixtures.find((candidate) => candidate.id === effectiveSelectedLiveFixtureId);
    const homeClub = fixture ? getPremierClubVisualForFixtureSide(fixture, "home") : null;
    const awayClub = fixture ? getPremierClubVisualForFixtureSide(fixture, "away") : null;

    if (!fixture || !homeClub || !awayClub) {
      queueMicrotask(() => {
        loadedLiveSquadFixtureRef.current = null;
        liveSquadRequestSequenceRef.current += 1;
        setLiveMatchSquads({ fixtureId: effectiveSelectedLiveFixtureId, home: [], away: [], status: "unavailable" });
        setSelectedLiveSimulationCardId(null);
      });
      return;
    }

    const squadFixtureSignature = `${fixture.id}:${homeClub.teamId}:${awayClub.teamId}`;
    const squadRequestId = `${squadFixtureSignature}:${liveSquadRequestSequenceRef.current += 1}`;
    loadedLiveSquadFixtureRef.current = squadRequestId;

    let cancelled = false;
    const requestController = new AbortController();
    const cachedHome = readStoredLiveSquad(homeClub);
    const cachedAway = readStoredLiveSquad(awayClub);
    const hasCompleteStoredSquads = cachedHome.length >= 11 && cachedAway.length >= 11;
    const lastProviderRefreshAt = liveSquadRefreshAtRef.current.get(squadFixtureSignature) ?? 0;
    const shouldRefreshSquads = !hasCompleteStoredSquads
      || Date.now() - lastProviderRefreshAt > ARENA_LIVE_SQUAD_REFRESH_DEDUP_MS;
    const immediateHomeSquad = hasCompleteStoredSquads ? cachedHome : buildLiveClubPreviewEleven(homeClub);
    const immediateAwaySquad = hasCompleteStoredSquads ? cachedAway : buildLiveClubPreviewEleven(awayClub);
    const immediateHome = buildLiveSimulationEleven(immediateHomeSquad, homeClub);
    const immediateHomeIds = new Set(immediateHome.map(touchlineLivePlayerIdentity));
    const immediateAway = buildLiveSimulationEleven(immediateAwaySquad, awayClub, [], immediateHomeIds);
    queueMicrotask(() => {
      if (cancelled) return;
      setLiveMatchSquads((current) => current?.fixtureId === fixture.id && current.status === "ready"
        ? current
        : { fixtureId: fixture.id, home: immediateHome, away: immediateAway, status: "ready" });
    });

    async function loadClubSquad(club: PremierClubVisual) {
      const params = new URLSearchParams({ teamId: club.teamId });
      const { ok, payload } = await touchlineJsonRequest<
        | { ok: true; teamId: string; players: TeamBuilderSquadPlayer[] }
        | { ok: false; error?: string }
      >(`/api/football-data/premier-squad?${params.toString()}`, {
        cache: "no-store",
        timeoutMs: ARENA_LIVE_SNAPSHOT_REQUEST_TIMEOUT_MS,
        signal: requestController.signal,
      });
      if (!ok || payload.ok === false) throw new Error(payload.ok === false ? payload.error || "Squad unavailable" : "Squad unavailable");
      const matchingPlayers = normalizeLiveClubSquad(payload.players, club, payload.teamId);
      if (matchingPlayers.length < 11) throw new Error("Squad does not match the selected fixture club");
      return matchingPlayers;
    }

    const lineupFixture = fixture;
    const lineupHomeClub = homeClub;
    const lineupAwayClub = awayClub;

    async function loadFixtureLineups() {
      const providerFixtureId = String(lineupFixture.providerId ?? "").trim();
      if (!/^[0-9]{1,20}$/.test(providerFixtureId)) return [] as TouchlinePublicFantasyLineupMember[];
      try {
        const { ok, payload } = await touchlineJsonRequest<
          | { ok: true; data: TouchlinePublicFantasyFixtureFeed }
          | { ok: false; error?: string }
        >(`/api/football-data/fantasy/fixture?fixtureId=${encodeURIComponent(providerFixtureId)}`, {
          timeoutMs: ARENA_LIVE_SNAPSHOT_REQUEST_TIMEOUT_MS,
          signal: requestController.signal,
        });
        if (!ok || payload.ok === false) return [];
        const feedHomeTeamId = String(payload.data.fixture.homeTeam?.id ?? "").trim();
        const feedAwayTeamId = String(payload.data.fixture.awayTeam?.id ?? "").trim();
        if (feedHomeTeamId !== lineupHomeClub.teamId || feedAwayTeamId !== lineupAwayClub.teamId) return [];
        return payload.data.lineups;
      } catch {
        return [];
      }
    }

    let appliedSquadPriority = 0;
    async function applyCompleteSquadSnapshot(
      homeSquad: TeamBuilderSquadPlayer[],
      awaySquad: TeamBuilderSquadPlayer[],
      fixtureLineups: TouchlinePublicFantasyLineupMember[],
      priority: number,
    ) {
      if (
        cancelled
        || loadedLiveSquadFixtureRef.current !== squadRequestId
        || priority < appliedSquadPriority
      ) return;
      appliedSquadPriority = priority;
      writeStoredLiveSquad(lineupHomeClub, homeSquad);
      writeStoredLiveSquad(lineupAwayClub, awaySquad);

      const homeStarters = fixtureStarterPlayersForClub(fixtureLineups, homeSquad, lineupHomeClub);
      const awayStarters = fixtureStarterPlayersForClub(fixtureLineups, awaySquad, lineupAwayClub);
      const home = buildLiveSimulationEleven(homeSquad, lineupHomeClub, homeStarters);
      const homePlayerIds = new Set(home.map(touchlineLivePlayerIdentity));
      const away = buildLiveSimulationEleven(awaySquad, lineupAwayClub, awayStarters, homePlayerIds);
      const targetCards = buildLiveSimulationCardProducts({
        fixtureId: lineupFixture.id,
        homeSquad: home,
        awaySquad: away,
        homeClub: lineupHomeClub,
        awayClub: lineupAwayClub,
      });
      const targetHomeCoachIdentity = touchlineLiveCoachForTeam(lineupHomeClub.teamId);
      const targetAwayCoachIdentity = touchlineLiveCoachForTeam(lineupAwayClub.teamId);
      const targetHomeCoachSlot = createTouchlineArenaCoachSlot(
        targetHomeCoachIdentity?.coach ?? null,
        TEAM_BUILDER_CLUB_RANK[lineupHomeClub.shortCode] ?? null,
      );
      const targetAwayCoachSlot = createTouchlineArenaCoachSlot(
        targetAwayCoachIdentity?.coach ?? null,
        TEAM_BUILDER_CLUB_RANK[lineupAwayClub.shortCode] ?? null,
      );
      const targetProductSignature = buildLiveProductSignature({
        locale: siteLanguage,
        cards: targetCards,
        homeCoach: {
          teamId: lineupHomeClub.teamId,
          cardTier: targetHomeCoachSlot.cardTier,
          coachId: String(targetHomeCoachIdentity?.coach.id ?? "pending"),
          countryCode3: targetHomeCoachIdentity?.countryCode3 ?? "N/A",
        },
        awayCoach: {
          teamId: lineupAwayClub.teamId,
          cardTier: targetAwayCoachSlot.cardTier,
          coachId: String(targetAwayCoachIdentity?.coach.id ?? "pending"),
          countryCode3: targetAwayCoachIdentity?.countryCode3 ?? "N/A",
        },
      });

      await preloadLiveProductImages([
        ...targetCards.flatMap(({ player }) => liveCanonicalPlayerAssetUrls(player)),
        touchlineLiveCompactCoachFrameUrl(targetHomeCoachSlot.cardTier),
        touchlineLiveCompactCoachFrameUrl(targetAwayCoachSlot.cardTier),
      ], 700);
      if (
        cancelled
        || loadedLiveSquadFixtureRef.current !== squadRequestId
        || priority !== appliedSquadPriority
      ) return;

      // Persisted snapshot reads replace the complete XI and its ready
      // signature in the same batch. Score updates can no longer expose dots, partial cards
      // or an empty pitch while Safari decodes a new frame.
      setLiveMatchSquads({ fixtureId: lineupFixture.id, home, away, status: "ready" });
      setReadyLiveCardProductsSignature(targetProductSignature);
    }

    const squadRequestTimer = window.setTimeout(() => {
      if (cancelled) return;

      if (!hasCompleteStoredSquads) {
        void Promise.all([loadClubSquad(homeClub), loadClubSquad(awayClub)])
          .then(([homeSquad, awaySquad]) => {
            void applyCompleteSquadSnapshot(homeSquad, awaySquad, [], 1);
          })
          .catch(() => {
            // A snapshot miss keeps the complete local preview XI.
          });
      }

      if (shouldRefreshSquads) {
        void Promise.all([loadClubSquad(homeClub), loadClubSquad(awayClub), loadFixtureLineups()])
          .then(([homeSquad, awaySquad, fixtureLineups]) => {
            if (cancelled || loadedLiveSquadFixtureRef.current !== squadRequestId) return;
            void applyCompleteSquadSnapshot(homeSquad, awaySquad, fixtureLineups, 2);
            liveSquadRefreshAtRef.current.set(squadFixtureSignature, Date.now());
          })
          .catch(() => {
            if (cancelled || loadedLiveSquadFixtureRef.current !== squadRequestId) return;
            if (!hasCompleteStoredSquads) {
              setLiveMatchSquads({ fixtureId: fixture.id, home: immediateHome, away: immediateAway, status: "ready" });
            }
          });
      }
    }, ARENA_LIVE_SQUAD_REQUEST_SETTLE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(squadRequestTimer);
      requestController.abort();
    };
    // A score/clock refresh replaces `liveFixtures`, but it must not reload both
    // squads. Reload only when the selected fixture/provider or either club
    // actually changes; this keeps the 22-card product stable on Safari and
    // avoids repeated provider calls while the match feed is ticking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveSelectedLiveFixtureId,
    hasRestoredLiveFixtureSelection,
    isLiveDockOpen,
    selectedLiveFixture?.providerId,
    selectedLiveHomeClub?.teamId,
    selectedLiveAwayClub?.teamId,
    standalonePanel,
  ]);

  useEffect(() => {
    if (activeArenaPanel !== "market") return;

    let cancelled = false;
    const builderClub = PREMIER_CLUB_VISUALS.find((club) => club.teamId === selectedBuilderClubKey) ?? PREMIER_CLUB_VISUALS[0];
    queueMicrotask(() => {
      if (cancelled) return;
      setMarketInventoryMode("checking");
      setMarketInventorySnapshot(null);
      setBuilderSquad([]);
      setBuilderSquadClubKey(null);
      setSelectedBuilderPlayerId(null);
      setBuilderLoadState({ status: "loading" });
    });

    const params = new URLSearchParams({
      teamId: builderClub.teamId,
      clubName: builderClub.name,
      clubShortCode: builderClub.shortCode,
      clubLogoUrl: builderClub.logoUrl ?? "",
    });

    const squadRequest = touchlineJsonRequest<
      | { ok: true; players: TeamBuilderSquadPlayer[]; status?: string }
      | { ok: false; error?: string; status?: string }
    >(`/api/football-data/premier-squad?${params.toString()}`)
      .then(({ ok, payload }) => {
        const squadPayload = payload as
          | { ok: true; players: TeamBuilderSquadPlayer[]; status?: string }
          | { ok: false; error?: string; status?: string };

        if (!ok || squadPayload.ok === false) {
          throw new Error(squadPayload.ok === false ? squadPayload.error ?? squadPayload.status ?? `${PUBLIC_DATA_SOURCE_LABEL} unavailable` : `${PUBLIC_DATA_SOURCE_LABEL} unavailable`);
        }
        return squadPayload;
      });
    const inventoryRequest = canPersistArenaAccountState(
      arenaPersistencePrincipal,
      arenaAccountSyncStatus,
    )
      ? touchlineJsonRequest<unknown>(
          `/api/touchline-arena/market/inventory?teamId=${encodeURIComponent(builderClub.teamId)}`,
        ).catch(() => null)
      : Promise.resolve(null);

    Promise.all([squadRequest, inventoryRequest])
      .then(([payload, inventoryResponse]) => {
        const inventorySnapshot = inventoryResponse?.ok
          ? parseTouchlineMarketInventorySnapshot(inventoryResponse.payload)
          : null;
        const inventoryMode: TouchlineMarketInventoryMode = inventorySnapshot
          ? "authoritative"
          : arenaPersistencePrincipal?.kind === "authenticated"
            ? "unavailable"
            : inventoryResponse?.status === 401 || inventoryResponse?.status === 503
              ? "demo"
              : "unavailable";

        if (cancelled) return;
        if (inventorySnapshot && arenaPersistencePrincipal?.kind === "authenticated") {
          marketBootstrapAttemptRef.current = `${arenaPersistencePrincipal.userId}:${builderClub.teamId}`;
        }
        setMarketInventorySnapshot(inventorySnapshot);
        setMarketInventoryMode(inventoryMode);
        if (inventorySnapshot) setMarketWalletBalanceTc(inventorySnapshot.walletBalanceTc);
        setBuilderSquad(connectBuilderSquadToMarketInventory(payload.players, inventorySnapshot));
        setBuilderSquadClubKey(builderClub.teamId);
        setBuilderLoadState({ status: "ready", playerCount: payload.players.length });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setMarketInventorySnapshot(null);
        setMarketInventoryMode("unavailable");
        setBuilderSquad([]);
        setBuilderSquadClubKey(null);
        setBuilderLoadState({
          status: "error",
          message: (error.message || `${PUBLIC_DATA_SOURCE_LABEL} unavailable`).replace(/SportMonks/gi, PUBLIC_DATA_SOURCE_LABEL),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeArenaPanel, arenaAccountSyncStatus, arenaPersistencePrincipal, marketInventoryRevision, selectedBuilderClubKey]);

  useEffect(() => {
    if (activeArenaPanel !== "news") return;

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setRumourError(null);
      setRumourStatus(t("loadingSignals"));
    });

    touchlineJsonRequest<
      | { ok: true; data: TouchLineArenaRumourSignal[]; status?: string; fetchedAt?: string; warnings?: string[] }
      | { ok?: false; error?: string }
    >("/api/touchline-arena/rumours")
      .then(({ ok, payload }) => {
        const rumoursPayload = payload as
          | { ok: true; data: TouchLineArenaRumourSignal[]; status?: string; fetchedAt?: string; warnings?: string[] }
          | { ok?: false; error?: string };

        if (!ok || rumoursPayload.ok !== true) {
          throw new Error(rumoursPayload.ok === false ? rumoursPayload.error ?? `${PUBLIC_DATA_SOURCE_LABEL} unavailable` : `${PUBLIC_DATA_SOURCE_LABEL} unavailable`);
        }

        return rumoursPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        setRumourSignals(payload.data);
        setRumourStatus(payload.status ?? `${payload.data.length} ${PUBLIC_DATA_SOURCE_LABEL} signals`);
        setRumourError(payload.warnings?.[0] ?? null);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setRumourSignals([]);
        setRumourStatus(`${PUBLIC_DATA_SOURCE_LABEL} unavailable`);
        setRumourError((error.message || `${PUBLIC_DATA_SOURCE_LABEL} unavailable`).replace(/SportMonks|Sportmonks/gi, PUBLIC_DATA_SOURCE_LABEL));
      });

    return () => {
      cancelled = true;
    };
  }, [activeArenaPanel, t]);

  useEffect(() => {
    const sortedSquad = builderSquadClubKey === selectedBuilderClubKey
      ? [...builderSquad].sort((a, b) => roleSortWeight(a.role) - roleSortWeight(b.role) || a.name.localeCompare(b.name))
      : [];

    queueMicrotask(() => {
      setSelectedBuilderPlayerId((currentPlayerId) => {
        if (!sortedSquad.length) return null;
        if (currentPlayerId && sortedSquad.some((player) => stableBuilderPlayerId(player) === currentPlayerId)) return currentPlayerId;
        return stableBuilderPlayerId(sortedSquad[0]);
      });
    });
  }, [builderSquad, builderSquadClubKey, selectedBuilderClubKey]);

  // A click on "Sign player" prepares a contract; it must survive an
  // accidental refresh, but it is not a contract until checkout succeeds.
  // Store only stable public player keys, then reconcile them against the
  // freshly loaded club squads before restoring the local draft.
  useEffect(() => {
    if (!arenaPersistencePrincipal || !builderSquad.length) return;
    const draftKey = arenaStorageKey(arenaPersistencePrincipal, ARENA_PERSISTENCE_RESOURCES.marketCart);
    if (marketCartDraftRestoredRef.current !== draftKey) {
      const requestedIds = new Set(parseStoredMarketDraftIds(readBrowserStorage("localStorage", draftKey)));
      marketCartDraftRestoredRef.current = draftKey;
      marketCartDraftIdsRef.current = requestedIds;
      if (requestedIds.size) {
        queueMicrotask(() => {
          setMarketCartPlayers((current) => {
            const currentIds = new Set(current.map(builderPlayerSquadContractId));
            const restored = builderSquad.filter((player) => (
              requestedIds.has(builderPlayerSquadContractId(player))
              && player.inventoryId
              && builderPlayerHasPublishedCard(player)
              && !player.inventoryAlreadyOwned
              && !currentIds.has(builderPlayerSquadContractId(player))
            ));
            return restored.length ? [...current, ...restored] : current;
          });
        });
      }
    }
  }, [arenaPersistencePrincipal, builderSquad]);

  useEffect(() => {
    if (!arenaPersistencePrincipal || marketCartDraftRestoredRef.current === null) return;
    const draftKey = arenaStorageKey(arenaPersistencePrincipal, ARENA_PERSISTENCE_RESOURCES.marketCart);
    const draftIds = new Set(marketCartDraftIdsRef.current ?? []);
    for (const player of marketCartPlayers) draftIds.add(builderPlayerSquadContractId(player));
    marketCartDraftIdsRef.current = draftIds;
    writeBrowserStorage(
      "localStorage",
      draftKey,
      JSON.stringify([...draftIds]),
    );
  }, [arenaPersistencePrincipal, marketCartPlayers]);

  useEffect(() => {
    if (
      initialContractHandledRef.current
      || activeArenaPanel !== "market"
      || !hasLoadedClubOwnerRoster
      || !builderSquad.length
      || (!initialContractPlayerId && !initialContractPlayerName)
    ) return;

    const requestedPlayer = builderSquad.find((player) => matchesRequestedMarketContract(
      player,
      initialContractPlayerId,
      initialContractPlayerName,
    ));
    initialContractHandledRef.current = true;

    const clearContractRequest = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("contractPlayer");
      url.searchParams.delete("contractName");
      url.searchParams.delete("contractClub");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    };

    if (!requestedPlayer) {
      queueMicrotask(() => setSaveStatus(siteLanguage === "pt-BR" ? "Jogador não encontrado neste mercado" : "Player not found in this market"));
      clearContractRequest();
      return;
    }

    const fieldId = stableBuilderPlayerId(requestedPlayer);
    const contractId = builderPlayerSquadContractId(requestedPlayer);
    const alreadyOwned = requestedPlayer.inventoryAlreadyOwned === true
      || players.some((player) => matchesBuilderPlayer(player, requestedPlayer))
      || benchPlayers.some((bench) => matchesBuilderBenchPlayer(bench, requestedPlayer));
    const soldOut = (requestedPlayer.inventoryAvailableCopies ?? TOUCHLINE_MARKET_CARD_SUPPLY_PER_PLAYER) <= 0;

    queueMicrotask(() => {
      setSelectedBuilderPlayerId(fieldId);
      if (alreadyOwned) {
        setSaveStatus(`${requestedPlayer.shortName} · ${t("openSquad")}`);
      } else if (soldOut) {
        setSaveStatus(`${requestedPlayer.shortName} · ${t("soldOut")}`);
      } else {
        setMarketCartPlayers((current) => {
          if (current.some((player) => builderPlayerSquadContractId(player) === contractId)) return current;
          if (openContractSlots === 0 && current.length >= 1) return current;
          return [...current, requestedPlayer];
        });
        setSaveStatus(openContractSlots === 0
          ? `${requestedPlayer.shortName} · ${t("releaseContractFirst")}`
          : `${requestedPlayer.shortName} · ${t("addToCart")}`);
      }
    });
    clearContractRequest();
  }, [
    activeArenaPanel,
    benchPlayers,
    builderSquad,
    hasLoadedClubOwnerRoster,
    initialContractPlayerId,
    initialContractPlayerName,
    openContractSlots,
    players,
    siteLanguage,
    t,
  ]);

  useEffect(() => {
    function syncFullscreenState() {
      const nativeFullscreenIsActive = touchlineFullscreenElement(document) === stageRef.current;
      const mobileFullscreenShellIsRequired = window.matchMedia("(max-width: 1100px)").matches;
      setIsArenaNativeFullscreen(nativeFullscreenIsActive);
      setIsArenaFallbackFullscreen(
        arenaFullscreenRequestedRef.current && (mobileFullscreenShellIsRequired || !nativeFullscreenIsActive),
      );
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    const fallbackClass = "touchline-arena-mobile-fullscreen";
    document.documentElement.classList.toggle(fallbackClass, isArenaFallbackFullscreen);
    document.body.classList.toggle(fallbackClass, isArenaFallbackFullscreen);

    if (isArenaFallbackFullscreen) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    return () => {
      document.documentElement.classList.remove(fallbackClass);
      document.body.classList.remove(fallbackClass);
    };
  }, [isArenaFallbackFullscreen]);

  useEffect(() => {
    if (!isArenaFunctionalReady) return;

    function handleArenaHotkeys(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        toggleArenaVideoPause();
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        replayEntryVideo();
      }
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        void toggleLineupEditor();
      }
    }

    document.addEventListener("keydown", handleArenaHotkeys);
    return () => document.removeEventListener("keydown", handleArenaHotkeys);
  });

  useEffect(() => {
    if (!activeArenaPanel || !standaloneExperience) return;

    function scrollStandalonePanelWithKeyboard(event: KeyboardEvent) {
      if (
        event.defaultPrevented
        || event.target instanceof HTMLInputElement
        || event.target instanceof HTMLSelectElement
        || event.target instanceof HTMLTextAreaElement
      ) return;

      const scrollContainer = actionLayerRef.current;
      if (!scrollContainer || scrollContainer.scrollHeight <= scrollContainer.clientHeight) return;

      const pageDistance = Math.max(160, Math.round(scrollContainer.clientHeight * 0.82));
      const lineDistance = 96;
      let nextTop: number | null = null;

      if (event.key === "ArrowDown") nextTop = scrollContainer.scrollTop + lineDistance;
      if (event.key === "ArrowUp") nextTop = scrollContainer.scrollTop - lineDistance;
      if (event.key === "PageDown") nextTop = scrollContainer.scrollTop + pageDistance;
      if (event.key === "PageUp") nextTop = scrollContainer.scrollTop - pageDistance;
      if (event.key === "Home") nextTop = 0;
      if (event.key === "End") nextTop = scrollContainer.scrollHeight;
      if (nextTop === null) return;

      event.preventDefault();
      scrollContainer.scrollTo({ top: nextTop, behavior: "smooth" });
    }

    // Listen during capture so a focused player card cannot swallow the vertical
    // keys before the Market's actual scrolling surface sees them.  Inputs keep
    // their native arrow-key behaviour through the guard above.
    window.addEventListener("keydown", scrollStandalonePanelWithKeyboard, true);
    return () => window.removeEventListener("keydown", scrollStandalonePanelWithKeyboard, true);
  }, [activeArenaPanel, standaloneExperience]);

  useEffect(() => {
    if (!isArenaNavOpen) return;

    function closeNavOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (arenaNavRef.current?.contains(target)) return;
      setIsArenaNavOpen(false);
    }

    function closeNavOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsArenaNavOpen(false);
    }

    document.addEventListener("pointerdown", closeNavOnOutsideClick);
    document.addEventListener("keydown", closeNavOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeNavOnOutsideClick);
      document.removeEventListener("keydown", closeNavOnEscape);
    };
  }, [isArenaNavOpen]);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;

    function closeLanguageMenuOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (languageMenuRef.current?.contains(target)) return;
      setIsLanguageMenuOpen(false);
    }

    function closeLanguageMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsLanguageMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeLanguageMenuOnOutsideClick);
    document.addEventListener("keydown", closeLanguageMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeLanguageMenuOnOutsideClick);
      document.removeEventListener("keydown", closeLanguageMenuOnEscape);
    };
  }, [isLanguageMenuOpen]);

  useEffect(() => {
    const hasOpenCardSpotlight = Boolean(
      spotlightPlayerId
      || isCoachSpotlightOpen
      || selectedLiveSimulationCardId
      || selectedLiveCoachSide,
    );
    if (!hasOpenCardSpotlight) return;

    // Match the compact navigation behaviour: a keyboard user can always
    // leave a player or coach spotlight without having to hunt for its close
    // button. This changes only interaction state, never the card product.
    function closeSpotlightOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSpotlightPlayerId(null);
      setIsCoachSpotlightOpen(false);
      setSelectedLiveSimulationCardId(null);
      setSelectedLiveCoachSide(null);
    }

    document.addEventListener("keydown", closeSpotlightOnEscape);
    return () => document.removeEventListener("keydown", closeSpotlightOnEscape);
  }, [isCoachSpotlightOpen, selectedLiveCoachSide, selectedLiveSimulationCardId, spotlightPlayerId]);

  useEffect(() => {
    if (activeVideoIndex !== 1) return;
    if (isArenaVideoPaused) return;

    const loopVideo = secondVideoRef.current;
    if (!loopVideo || !loopVideo.paused) return;

    void loopVideo.play().catch(() => undefined);
  }, [activeVideoIndex, isArenaVideoPaused]);

  useEffect(() => () => {
    cancelLoopCameraFrameSync();
  }, []);

  useEffect(() => {
    const syncArenaVideoViewport = () => {
      setArenaVideoViewport(arenaVideoViewportForDimensions(window.innerWidth, window.innerHeight));
    };
    const visualViewport = window.visualViewport;

    syncArenaVideoViewport();
    window.addEventListener("resize", syncArenaVideoViewport);
    window.addEventListener("orientationchange", syncArenaVideoViewport);
    visualViewport?.addEventListener("resize", syncArenaVideoViewport);

    return () => {
      window.removeEventListener("resize", syncArenaVideoViewport);
      window.removeEventListener("orientationchange", syncArenaVideoViewport);
      visualViewport?.removeEventListener("resize", syncArenaVideoViewport);
    };
  }, []);

  function handleManualSave() {
    if (isDemoLineup) {
      setSaveStatus(t("demoLineupNotSaved"));
      return;
    }

    if (!arenaPersistencePrincipal) {
      setSaveStatus(t("accountStateLoading"));
      return;
    }
    saveLineup(players, selectedFormationKey, arenaPersistencePrincipal);
    persistArenaRoster(players, benchPlayers);
    setSaveStatus(t("saved"));
  }

  async function handleSaveFormationLock() {
    if (isFinalizedArenaFormation(selectedFormationKey)) {
      setSaveStatus(`${selectedFormationKey} · ${t("formationFinalized")}`);
      return;
    }

    if (!arenaPersistencePrincipal) {
      setSaveStatus(t("accountStateLoading"));
      return;
    }
    const lockedPlayers = players.map(lockArenaPlayerSize);
    const cameraId = arenaLoopCameraProfile(loopCameraIndex).id;
    const currentSlots = projectArenaPlayersForLoopCamera(lockedPlayers, loopCameraIndex);
    writeLockedFormationLayout(selectedFormationKey, cameraId, lockedPlayers, currentSlots, arenaPersistencePrincipal);
    setLockedFormationKeys(Object.keys(readLockedFormationLayouts(arenaPersistencePrincipal)).filter((key): key is ArenaFormationKey => ARENA_FORMATIONS.some((formation) => formation.key === key)));
    saveLineup(lockedPlayers, selectedFormationKey, arenaPersistencePrincipal);
    persistArenaRoster(lockedPlayers, benchPlayers);
    setPlayers(lockedPlayers);
    setSaveStatus(`${selectedFormationKey} ${cameraId} · ${t("formationLocking")}`);

    try {
      await writeLockedFormationLayoutToProject(selectedFormationKey, cameraId, lockedPlayers, currentSlots, arenaPersistencePrincipal);
      setSaveStatus(`${selectedFormationKey} ${cameraId} · ${t("formationLocked")}`);
    } catch {
      setSaveStatus(`${selectedFormationKey} ${cameraId} · ${t("formationLockedLocally")}`);
    }
  }

  async function handleUnlockCurrentCamera() {
    if (isFinalizedArenaFormation(selectedFormationKey)) {
      setSaveStatus(`${selectedFormationKey} · ${t("protectedAsSaved")}`);
      return;
    }

    if (!arenaPersistencePrincipal) {
      setSaveStatus(t("accountStateLoading"));
      return;
    }
    const cameraId = arenaLoopCameraProfile(loopCameraIndex).id;
    removeLockedFormationCameraLayout(selectedFormationKey, cameraId, arenaPersistencePrincipal);
    setLockedFormationKeys(Object.keys(readLockedFormationLayouts(arenaPersistencePrincipal)).filter((key): key is ArenaFormationKey => ARENA_FORMATIONS.some((formation) => formation.key === key)));
    setSaveStatus(`${selectedFormationKey} ${cameraId} · ${t("formationUnlocked")}`);

    try {
      await removeLockedFormationCameraLayoutFromProject(selectedFormationKey, cameraId, arenaPersistencePrincipal);
    } catch {
      setSaveStatus(`${selectedFormationKey} ${cameraId} · ${t("formationUnlockedLocally")}`);
    }
  }

  function changeFormation(formationKey: ArenaFormationKey) {
    if (!isFinalizedArenaFormation(formationKey)) {
      setSaveStatus(`${formationKey} · ${t("comingSoon")}`);
      return;
    }
    setSelectedFormationKey(formationKey);
    setPlayers((currentPlayers) => normalizeArenaPlayersForFormation(
      currentPlayers,
      formationKey,
      arenaPersistencePrincipal,
    ));
    setSaveStatus(`${formationKey} · ${t("formationApplied")}`);
  }

  function updateSelectedPlayerPosition(axis: "x" | "y", value: number) {
    if (!selectedPlayer) return;
    if (isFinalizedArenaFormation(selectedFormationKey)) {
      setSaveStatus(`${selectedFormationKey} · ${t("protectedAsSaved")}`);
      return;
    }

    setPlayers((currentPlayers) =>
      currentPlayers.map((player) => {
        if (player.id !== selectedPlayer.id) return player;
        return {
          ...player,
          x: Math.min(95, Math.max(5, Math.round(axis === "x" ? value : player.x))),
          y: Math.min(95, Math.max(5, Math.round(axis === "y" ? value : player.y))),
        };
      }),
    );
    setSaveStatus(`${selectedFormationKey} · ${t("formationEditing")}`);
  }

  function updateSelectedPlayerSize(value: number) {
    if (!selectedPlayer) return;
    if (isFinalizedArenaFormation(selectedFormationKey)) {
      setSaveStatus(`${selectedFormationKey} · ${t("protectedAsSaved")}`);
      return;
    }

    const heightVh = Math.min(ARENA_CARD_MAX_HEIGHT_VH, Math.max(ARENA_CARD_MIN_HEIGHT_VH, Math.round(value * 10) / 10));
    setPlayers((currentPlayers) =>
      currentPlayers.map((player) => player.id === selectedPlayer.id ? { ...player, heightVh } : player),
    );
    setSaveStatus(`${selectedFormationKey} · ${t("formationSizeEditing")}`);
  }

  function nudgeSelectedPlayer(dx: number, dy: number) {
    if (!selectedPlayer) return;
    if (isFinalizedArenaFormation(selectedFormationKey)) {
      setSaveStatus(`${selectedFormationKey} · ${t("protectedAsSaved")}`);
      return;
    }

    updateSelectedPlayerPosition("x", selectedPlayer.x + dx);
    if (dy) updateSelectedPlayerPosition("y", selectedPlayer.y + dy);
  }

  function activeArenaVideo() {
    return activeVideoIndex === 0 ? firstVideoRef.current : secondVideoRef.current;
  }

  function playArenaVideo() {
    let video = hasEntryVideoFinished ? secondVideoRef.current : activeArenaVideo();
    if (!video && secondVideoRef.current) {
      setHasEntryVideoFinished(true);
      setActiveVideoIndex(1);
      video = secondVideoRef.current;
    }

    if (!video) return;
    if (video.ended && secondVideoRef.current) {
      video = secondVideoRef.current;
      setHasEntryVideoFinished(true);
      setActiveVideoIndex(1);
    }
    setIsArenaVideoPaused(false);
    if (video === secondVideoRef.current) setActiveVideoIndex(1);
    void video.play().catch(() => setIsArenaVideoPaused(true));
  }

  function pauseArenaVideo() {
    activeArenaVideo()?.pause();
    secondVideoRef.current?.pause();
    setIsArenaVideoPaused(true);
  }

  function toggleArenaVideoPause() {
    const activeVideo = activeArenaVideo();
    if (!activeVideo || isArenaVideoPaused || activeVideo.paused) {
      playArenaVideo();
      return;
    }

    pauseArenaVideo();
  }

  function handleFieldPlayerClick(player: ArenaPlayer) {
    setSelectedPlayerId(player.id);
    if (activeArenaPanel === "bench") {
      setReplacementTargetId(player.id);
      setPendingContractReleaseTargetId(null);
      if (selectedBench) {
        requestQuickSubstitutionConfirmation(selectedBench, player);
      } else {
        setSaveStatus(`${player.shortName} · ${t("chooseReserve")}`);
      }
      return;
    }
    // A contracted player on the pitch always opens the shared, centred card
    // spotlight. The editor still retains its selected-player state above.
    setSpotlightPlayerId(player.id);
  }

  function prepareBenchReplacement(bench: BenchOption, target?: ArenaPlayer | null) {
    setSelectedBenchId(bench.id);
    if (target) {
      requestQuickSubstitutionConfirmation(bench, target);
      return;
    }
    if (replacementTarget) {
      requestQuickSubstitutionConfirmation(bench, replacementTarget);
      return;
    }
    setSaveStatus(`${bench.shortName} ${t("selectedFromBench")}`);
  }

  function requestQuickSubstitutionConfirmation(bench: BenchOption, target: ArenaPlayer) {
    if (isBenchFormationLocked(bench, quickSubstitutionInteractivePlayers, selectedFormationKey, target) || !canBenchReplaceTarget(bench, target)) {
      setSaveStatus(`${bench.shortName} ${t("locked")}: ${t("choosePosition")} ${positionGroupLabel(arenaPositionGroup(target.card?.position, target.role), t)}`);
      return;
    }
    setSelectedBenchId(bench.id);
    setReplacementTargetId(target.id);
    setSelectedPlayerId(target.id);
    setPendingContractReleaseTargetId(null);
    setIsQuickSubstitutionConfirmationOpen(true);
    setSaveStatus(`${bench.shortName} → ${target.shortName} · ${t("confirmSubstitution")}`);
  }

  function cancelQuickSubstitutionConfirmation() {
    setIsQuickSubstitutionConfirmationOpen(false);
    setSelectedBenchId("");
    setReplacementTargetId(null);
    setDraggingBenchId(null);
    setPendingContractReleaseTargetId(null);
    setSaveStatus(siteLanguage === "pt-BR" ? "Substituição cancelada. O jogo continua." : "Substitution cancelled. The match continues.");
  }

  function handleBenchDrop(target: ArenaPlayer, benchId: string) {
    const bench = quickSubstitutionInteractiveBench.find((candidate) => candidate.id === benchId);
    setDraggingBenchId(null);
    if (!bench) return;
    if (isBenchFormationLocked(bench, quickSubstitutionInteractivePlayers, selectedFormationKey, target) || !canBenchReplaceTarget(bench, target)) {
      setSaveStatus(`${bench.shortName} ${t("locked")}: ${t("choosePosition")} ${positionGroupLabel(arenaPositionGroup(target.card?.position, target.role), t)}`);
      return;
    }
    prepareBenchReplacement(bench, target);
  }

  function clearQuickSubPointerDrag() {
    const pointerDrag = quickSubPointerDragRef.current;
    if (pointerDrag?.timerId !== null && pointerDrag?.timerId !== undefined) window.clearTimeout(pointerDrag.timerId);
    quickSubPointerDragRef.current = null;
    setDraggingBenchId(null);
  }

  function handleQuickSubPointerDown(event: ReactPointerEvent<HTMLButtonElement>, bench: BenchOption) {
    if (event.pointerType === "mouse") return;
    clearQuickSubPointerDrag();
    const dragElement = event.currentTarget;
    const pointerDrag: QuickSubPointerDragState = {
      pointerId: event.pointerId,
      benchId: bench.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      timerId: null,
    };
    pointerDrag.timerId = window.setTimeout(() => {
      const current = quickSubPointerDragRef.current;
      if (!current || current.pointerId !== pointerDrag.pointerId || current.benchId !== bench.id) return;
      current.active = true;
      current.timerId = null;
      suppressQuickSubClickRef.current = bench.id;
      setDraggingBenchId(bench.id);
      if (!dragElement.hasPointerCapture(event.pointerId)) dragElement.setPointerCapture(event.pointerId);
    }, 260);
    quickSubPointerDragRef.current = pointerDrag;
  }

  function handleQuickSubPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointerDrag = quickSubPointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    if (!pointerDrag.active) {
      const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
      if (distance > 10) clearQuickSubPointerDrag();
      return;
    }
    event.preventDefault();
  }

  function handleQuickSubPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointerDrag = quickSubPointerDragRef.current;
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const wasActive = pointerDrag.active;
    const benchId = pointerDrag.benchId;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    clearQuickSubPointerDrag();
    if (!wasActive) return;
    event.preventDefault();
    const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-substitution-target-id]");
    const targetId = dropTarget?.dataset.substitutionTargetId;
    const target = targetId ? quickSubstitutionInteractivePlayers.find((player) => player.id === targetId) : null;
    if (target) handleBenchDrop(target, benchId);
    window.setTimeout(() => {
      if (suppressQuickSubClickRef.current === benchId) suppressQuickSubClickRef.current = null;
    }, 0);
  }

  function moveFieldPlayerFromPointer(player: ArenaPlayer, clientX: number, clientY: number) {
    if (isFinalizedArenaFormation(selectedFormationKey)) {
      setSaveStatus(`${selectedFormationKey} · ${t("protectedAsSaved")}`);
      return;
    }

    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) return;
    const displaySlot = {
      x: Math.min(98, Math.max(2, Math.round(((clientX - stageRect.left) / stageRect.width) * 1000) / 10)),
      y: Math.min(96, Math.max(6, Math.round(((clientY - stageRect.top) / stageRect.height) * 1000) / 10)),
      heightVh: fieldPlayerPositions.get(player.id)?.heightVh ?? player.heightVh ?? ARENA_CARD_COMPACT_HEIGHT_VH,
    };
    const position = clientPointToArenaPosition(player, clientX, clientY, stageRect, loopCameraIndex);

    setCameraEditSlots((currentSlots) => ({
      ...currentSlots,
      [currentCameraEditKey]: {
        ...(currentSlots[currentCameraEditKey] ?? {}),
        [player.id]: displaySlot,
      },
    }));
    setPlayers((currentPlayers) =>
      currentPlayers.map((currentPlayer) => currentPlayer.id === player.id ? { ...currentPlayer, ...position } : currentPlayer),
    );
    setSaveStatus(`${selectedFormationKey} · ${t("formationDragging")}`);
  }

  function handleFieldPlayerPointerDown(event: ReactPointerEvent<HTMLDivElement>, player: ArenaPlayer) {
    if ((event.target as HTMLElement).closest("a,button")) return;
    setSelectedPlayerId(player.id);
    if (activeArenaPanel === "bench") {
      setReplacementTargetId(player.id);
      setSaveStatus(selectedBench
        ? `${selectedBench.shortName} · ${t("selectedForThisGame")} · ${player.shortName}`
        : `${player.shortName} · ${t("chooseReserve")}`);
    }
    if (!isEditorOpen) return;
    if (isFinalizedArenaFormation(selectedFormationKey)) {
      setSaveStatus(`${selectedFormationKey} · ${t("protectedAsSaved")}`);
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = { playerId: player.id, pointerId: event.pointerId };
    moveFieldPlayerFromPointer(player, event.clientX, event.clientY);
  }

  function handleFieldPlayerPointerMove(event: ReactPointerEvent<HTMLDivElement>, player: ArenaPlayer) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.playerId !== player.id || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    moveFieldPlayerFromPointer(player, event.clientX, event.clientY);
  }

  function handleFieldPlayerPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setSaveStatus(`${selectedFormationKey} · ${t("ready")} · ${t("lockFormation")}`);
  }

  function startCardLoopVideo() {
    const loopVideo = secondVideoRef.current;
    if (!loopVideo) return;

    firstVideoRef.current?.pause();
    loopVideo.currentTime = 0;
    syncLoopCameraFromVideo(loopVideo);
    if (loopRevealTimerRef.current !== null) window.clearTimeout(loopRevealTimerRef.current);

    const finishLoopReveal = (paused: boolean) => {
      if (loopRevealTimerRef.current !== null) window.clearTimeout(loopRevealTimerRef.current);
      loopRevealTimerRef.current = null;
      setIsArenaVideoPaused(paused);
      setHasEntryVideoFinished(true);
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      loopVideo.pause();
      finishLoopReveal(true);
    } else {
      loopRevealTimerRef.current = window.setTimeout(() => finishLoopReveal(loopVideo.paused), 700);
      void loopVideo.play().catch(() => finishLoopReveal(true));
      setIsArenaVideoPaused(false);
    }
    setActiveVideoIndex(1);
    setIsEntrySkipAvailable(false);
  }

  function syncLoopCameraFromVideo(loopVideo: HTMLVideoElement | null) {
    if (!loopVideo) return;
    const nextCameraIndex = arena433VideoLoopIndexForPlayback(loopVideo.currentTime, loopVideo.duration);
    setLoopCameraIndex((currentIndex) => (currentIndex === nextCameraIndex ? currentIndex : nextCameraIndex));
  }

  function cancelLoopCameraFrameSync() {
    const loopVideo = loopCameraFrameVideoRef.current;
    const requestId = loopCameraFrameRequestRef.current;
    if (loopVideo && requestId !== null && "cancelVideoFrameCallback" in loopVideo) {
      loopVideo.cancelVideoFrameCallback(requestId);
    }
    loopCameraFrameRequestRef.current = null;
    loopCameraFrameVideoRef.current = null;
  }

  function startLoopCameraFrameSync(loopVideo: HTMLVideoElement) {
    syncLoopCameraFromVideo(loopVideo);
    cancelLoopCameraFrameSync();
    if (loopVideo.paused || loopVideo.ended || !("requestVideoFrameCallback" in loopVideo)) return;

    loopCameraFrameVideoRef.current = loopVideo;
    const syncOnVideoFrame = () => {
      if (loopCameraFrameVideoRef.current !== loopVideo) return;
      syncLoopCameraFromVideo(loopVideo);
      if (loopVideo.paused || loopVideo.ended) {
        loopCameraFrameRequestRef.current = null;
        loopCameraFrameVideoRef.current = null;
        return;
      }
      loopCameraFrameRequestRef.current = loopVideo.requestVideoFrameCallback(syncOnVideoFrame);
    };
    loopCameraFrameRequestRef.current = loopVideo.requestVideoFrameCallback(syncOnVideoFrame);
  }

  function handleCardLoopTimelineEvent(event: SyntheticEvent<HTMLVideoElement>) {
    syncLoopCameraFromVideo(event.currentTarget);
  }

  function handleCardLoopPlaying(event: SyntheticEvent<HTMLVideoElement>) {
    startLoopCameraFrameSync(event.currentTarget);
    if (loopRevealTimerRef.current !== null) window.clearTimeout(loopRevealTimerRef.current);
    loopRevealTimerRef.current = null;
    setIsArenaVideoPaused(false);
    setHasEntryVideoFinished(true);
  }

  function rememberCompletedOfficialIntro() {
    writeBrowserStorage("localStorage", TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "1");

    const url = new URL(window.location.href);
    if (!url.searchParams.has(TOUCHLINE_ARENA_INTRO_QUERY_PARAM)) return;
    url.searchParams.delete(TOUCHLINE_ARENA_INTRO_QUERY_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function completeOfficialIntroExperience() {
    rememberCompletedOfficialIntro();
    setIntroExperienceMode("hidden");
  }

  function revealOfficialArena(reducedMotion: boolean) {
    const entryVideo = firstVideoRef.current;
    const loopVideo = secondVideoRef.current;

    if (reducedMotion) {
      entryVideo?.pause();
      if (loopVideo) {
        loopVideo.currentTime = 0;
        loopVideo.pause();
      }
      setActiveVideoIndex(1);
      setHasEntryVideoFinished(true);
      setIsArenaVideoPaused(true);
      setIsEntrySkipAvailable(false);
      return;
    }

    if (!entryVideo) {
      startCardLoopVideo();
      return;
    }

    loopVideo?.pause();
    if (loopVideo) loopVideo.currentTime = 0;
    entryVideo.currentTime = 0;
    setHasEntryVideoFinished(false);
    setActiveVideoIndex(0);
    setIsArenaVideoPaused(false);
    void entryVideo.play().catch(startCardLoopVideo);
  }

  function skipOfficialIntroExperience() {
    completeOfficialIntroExperience();
    startCardLoopVideo();
  }

  // The official cinematic remains available by an explicit Arena action,
  // without forcing returning users through it on every visit.
  function replayEntryVideo() {
    firstVideoRef.current?.pause();
    secondVideoRef.current?.pause();
    if (firstVideoRef.current) firstVideoRef.current.currentTime = 0;
    if (secondVideoRef.current) secondVideoRef.current.currentTime = 0;
    closeArenaPanel();
    setIsLanguageMenuOpen(false);
    setIsEntrySkipAvailable(false);
    setHasEntryVideoFinished(false);
    setActiveVideoIndex(0);
    setIsArenaVideoPaused(false);
    setIntroExperienceRun((run) => run + 1);
    setIntroExperienceMode("first");
  }

  async function selectOfficialArenaCoach(coachProviderId: string) {
    const coach = touchlineLiveCoachForProviderId(coachProviderId);
    if (!coach || !arenaPersistencePrincipal || isCoachSaving) return;

    const coachStorageKey = arenaStorageKey(arenaPersistencePrincipal, ARENA_PERSISTENCE_RESOURCES.coach);
    setCoachSelectionError(null);
    const mustPersistForClubOwner = canPersistArenaAccountState(
      arenaPersistencePrincipal,
      arenaAccountSyncStatus,
    );

    if (mustPersistForClubOwner) {
      setIsCoachSaving(true);
      try {
        const response = await fetch("/api/touchline-arena/coach", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ coachProviderId: coach.coach.providerId }),
        });
        if (!response.ok) {
          const message = siteLanguage === "pt-BR"
            ? "Não foi possível salvar o treinador na sua conta. Tente novamente."
            : "We could not save this coach to your account. Please try again.";
          setCoachSelectionError(message);
          setSaveStatus(message);
          return;
        }
      } catch {
        const message = siteLanguage === "pt-BR"
          ? "Não foi possível salvar o treinador na sua conta. Tente novamente."
          : "We could not save this coach to your account. Please try again.";
        setCoachSelectionError(message);
        setSaveStatus(message);
        return;
      } finally {
        setIsCoachSaving(false);
      }
    }

    // A signed-in ClubOwner may continue only after the server accepted the
    // canonical coach identity. Browser storage is merely a local cache and
    // must never be the source of a real account's coach selection.
    writeBrowserStorage("localStorage", coachStorageKey, coach.coach.providerId);
    setOwnerCoachProviderId(coach.coach.providerId);
    setHasLoadedOwnerCoach(true);
    setIsCoachSpotlightOpen(false);
    // Formation is an explicit, mandatory second decision. A new ClubOwner
    // never falls through from coach selection into an accidental default XI.
    if (standaloneExperience === "market") {
      removeBrowserStorage(
        "localStorage",
        arenaStorageKey(arenaPersistencePrincipal, ARENA_PERSISTENCE_RESOURCES.marketFormation),
      );
      setMarketFormationConfirmed(false);
      setMarketPositionFilter("all");
      setMarketPositionBucketFilter("all");
      setMarketNeedsOnly(false);
    }
    setSaveStatus(siteLanguage === "pt-BR" ? "Treinador oficial selecionado" : "Official coach selected");
  }

  function confirmMarketFormation(formationKey: ArenaFormationKey) {
    if (!ownerCoachProviderId || !arenaPersistencePrincipal) {
      setSaveStatus(siteLanguage === "pt-BR" ? "Escolha o treinador antes da formação." : "Choose the coach before formation.");
      return;
    }
    changeFormation(formationKey);
    writeBrowserStorage(
      "localStorage",
      arenaStorageKey(arenaPersistencePrincipal, ARENA_PERSISTENCE_RESOURCES.marketFormation),
      formationKey,
    );
    setMarketFormationConfirmed(true);
    setMarketPositionFilter("all");
    setMarketPositionBucketFilter("goalkeeper");
    setMarketNeedsOnly(false);
    setSaveStatus(siteLanguage === "pt-BR"
      ? `${formationKey} confirmada · comece pelos goleiros`
      : `${formationKey} confirmed · start with goalkeepers`);
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      marketSelectionRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  async function toggleArenaFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;

    // Fullscreen is an immersion action, not a panel. Remove the navigation
    // surface before entering either native fullscreen or the Safari fallback.
    setIsArenaNavOpen(false);

    if (touchlineFullscreenElement(document)) {
      arenaFullscreenRequestedRef.current = false;
      await exitTouchlineFullscreen(document);
      setIsArenaNativeFullscreen(false);
      setIsArenaFallbackFullscreen(false);
      return;
    }

    if (isArenaFallbackFullscreen) {
      arenaFullscreenRequestedRef.current = false;
      setIsArenaFallbackFullscreen(false);
      return;
    }

    await requestArenaFullscreen(stage);
  }

  async function enterArenaFullscreen() {
    const stage = stageRef.current;
    if (!stage || touchlineFullscreenElement(document) === stage || isArenaFallbackFullscreen) return;
    await requestArenaFullscreen(stage);
  }

  async function requestArenaFullscreen(stage: HTMLElement) {
    arenaFullscreenRequestedRef.current = true;
    const enteredNativeFullscreen = await requestTouchlineFullscreen(stage, document);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
    const nativeFullscreenRemainedActive = enteredNativeFullscreen && touchlineFullscreenElement(document) === stage;
    const mobileFullscreenShellIsRequired = window.matchMedia("(max-width: 1100px)").matches;
    setIsArenaNativeFullscreen(nativeFullscreenRemainedActive);
    setIsArenaFallbackFullscreen(mobileFullscreenShellIsRequired || !nativeFullscreenRemainedActive);
    window.setTimeout(() => {
      const nativeFullscreenIsStillActive = touchlineFullscreenElement(document) === stage;
      setIsArenaNativeFullscreen(nativeFullscreenIsStillActive);
      setIsArenaFallbackFullscreen(
        arenaFullscreenRequestedRef.current && (mobileFullscreenShellIsRequired || !nativeFullscreenIsStillActive),
      );
    }, 240);
    await lockArenaLandscape();
  }

  async function lockArenaLandscape() {
    const orientation = window.screen.orientation as ScreenOrientation & {
      lock?: (mode: "landscape") => Promise<void>;
    };
    await orientation?.lock?.("landscape").catch(() => undefined);
  }

  async function toggleLineupEditor() {
    if (isEditorOpen) {
      setIsEditorOpen(false);
      return;
    }

    closeArenaPanel();
    setIsEditorOpen(true);
    setShouldRenderPlayers(true);
    setHasEntryVideoFinished(true);
    setActiveVideoIndex(1);
    await enterArenaFullscreen();
  }

  function updateLiveDockVisibility(isOpen: boolean) {
    setIsLiveDockOpen(isOpen);
    writeBrowserStorage(
      "localStorage",
      ARENA_LIVE_DOCK_VISIBILITY_STORAGE_KEY,
      isOpen ? "visible" : "hidden",
    );
  }

  function selectCarouselFixture(fixtureId: string) {
    if (!visibleLiveFixtures.some((fixture) => fixture.id === fixtureId)) return;
    setSelectedLiveFixtureId(fixtureId);
    writeBrowserStorage("localStorage", ARENA_LIVE_DOCK_FIXTURE_STORAGE_KEY, fixtureId);
  }

  function cycleCarouselFixture(direction: -1 | 1) {
    if (!visibleLiveFixtures.length) return;
    const currentIndex = Math.max(0, visibleLiveFixtures.findIndex((fixture) => fixture.id === effectiveSelectedLiveFixtureId));
    const nextIndex = (currentIndex + direction + visibleLiveFixtures.length) % visibleLiveFixtures.length;
    selectCarouselFixture(visibleLiveFixtures[nextIndex].id);
  }

  async function selectLiveFixture(fixtureId: string) {
    const selectionSequence = liveFixtureSelectionSequenceRef.current += 1;
    if (fixtureId === effectiveSelectedLiveFixtureId) {
      setPendingLiveFixtureId(null);
      return;
    }

    const targetFixture = visibleLiveFixtures.find((fixture) => fixture.id === fixtureId) ?? null;
    const targetHomeClub = targetFixture ? getPremierClubVisualForFixtureSide(targetFixture, "home") : null;
    const targetAwayClub = targetFixture ? getPremierClubVisualForFixtureSide(targetFixture, "away") : null;

    if (!targetFixture || !targetHomeClub || !targetAwayClub) {
      loadedLiveSquadFixtureRef.current = null;
      setSelectedLiveSimulationCardId(null);
      setSelectedLiveCoachSide(null);
      setReadyLiveCardProductsSignature("");
      setSelectedLiveFixtureId(fixtureId);
      writeBrowserStorage("localStorage", ARENA_LIVE_DOCK_FIXTURE_STORAGE_KEY, fixtureId);
      return;
    }

    setPendingLiveFixtureId(fixtureId);
    const cachedHome = readStoredLiveSquad(targetHomeClub);
    const cachedAway = readStoredLiveSquad(targetAwayClub);
    const targetHomeSquad = cachedHome.length >= 11 ? cachedHome : buildLiveClubPreviewEleven(targetHomeClub);
    const targetAwaySquad = cachedAway.length >= 11 ? cachedAway : buildLiveClubPreviewEleven(targetAwayClub);
    const targetCards = buildLiveSimulationCardProducts({
      fixtureId: targetFixture.id,
      homeSquad: targetHomeSquad,
      awaySquad: targetAwaySquad,
      homeClub: targetHomeClub,
      awayClub: targetAwayClub,
    });
    const targetHomeCoachIdentity = touchlineLiveCoachForTeam(targetHomeClub.teamId);
    const targetAwayCoachIdentity = touchlineLiveCoachForTeam(targetAwayClub.teamId);
    const targetHomeCoachSlot = createTouchlineArenaCoachSlot(
      targetHomeCoachIdentity?.coach ?? null,
      TEAM_BUILDER_CLUB_RANK[targetHomeClub.shortCode] ?? null,
    );
    const targetAwayCoachSlot = createTouchlineArenaCoachSlot(
      targetAwayCoachIdentity?.coach ?? null,
      TEAM_BUILDER_CLUB_RANK[targetAwayClub.shortCode] ?? null,
    );
    const targetProductSignature = buildLiveProductSignature({
      locale: siteLanguage,
      cards: targetCards,
      homeCoach: {
        teamId: targetHomeClub.teamId,
        cardTier: targetHomeCoachSlot.cardTier,
        coachId: String(targetHomeCoachIdentity?.coach.id ?? "pending"),
        countryCode3: targetHomeCoachIdentity?.countryCode3 ?? "N/A",
      },
      awayCoach: {
        teamId: targetAwayClub.teamId,
        cardTier: targetAwayCoachSlot.cardTier,
        coachId: String(targetAwayCoachIdentity?.coach.id ?? "pending"),
        countryCode3: targetAwayCoachIdentity?.countryCode3 ?? "N/A",
      },
    });

    await preloadLiveProductImages([
      ...targetCards.flatMap(({ player }) => liveCanonicalPlayerAssetUrls(player)),
      touchlineLiveCompactCoachFrameUrl(targetHomeCoachSlot.cardTier),
      touchlineLiveCompactCoachFrameUrl(targetAwayCoachSlot.cardTier),
      liveOptimizedClubLogoUrl(targetHomeClub.logoUrl) ?? targetHomeClub.logoUrl,
      liveOptimizedClubLogoUrl(targetAwayClub.logoUrl) ?? targetAwayClub.logoUrl,
    ]);
    if (selectionSequence !== liveFixtureSelectionSequenceRef.current) return;

    // Commit fixture, squads and readiness in one React batch. The previous XI
    // remains fully visible while the tiny frame assets warm up, so Safari never
    // paints an empty field or exposes card internals during a match switch.
    loadedLiveSquadFixtureRef.current = null;
    setSelectedLiveSimulationCardId(null);
    setSelectedLiveCoachSide(null);
    setLiveMatchSquads({
      fixtureId: targetFixture.id,
      home: targetCards.filter(({ side }) => side === "home").map(({ player }) => player),
      away: targetCards.filter(({ side }) => side === "away").map(({ player }) => player),
      status: "ready",
    });
    setReadyLiveCardProductsSignature(targetProductSignature);
    setSelectedLiveFixtureId(fixtureId);
    setPendingLiveFixtureId(null);
    writeBrowserStorage("localStorage", ARENA_LIVE_DOCK_FIXTURE_STORAGE_KEY, fixtureId);
  }

  function openArenaPanel(panel: ArenaPanelKey) {
    if (quickSubCloseTimerRef.current !== null) {
      window.clearTimeout(quickSubCloseTimerRef.current);
      quickSubCloseTimerRef.current = null;
    }
    setIsQuickSubRailClosing(false);
    window.history.replaceState(window.history.state, "", touchlineArenaPanelUrl(window.location.href, panel));
    setIsQuickSubstitutionConfirmationOpen(false);
    if (panel === "live") {
      setActiveArenaPanel(null);
      setIsEditorOpen(false);
      setIsArenaNavOpen(false);
      setReplacementTargetId(null);
      updateLiveDockVisibility(true);
      return;
    }

    updateLiveDockVisibility(false);
    setActiveArenaPanel(panel);
    setIsEditorOpen(panel === "formation");
    setIsArenaNavOpen(false);
    if (panel !== "bench") setReplacementTargetId(null);
  }

  function closeArenaPanel() {
    window.history.replaceState(window.history.state, "", touchlineArenaPanelUrl(window.location.href, null));
    clearQuickSubPointerDrag();
    setIsQuickSubstitutionConfirmationOpen(false);

    if (activeArenaPanel === "bench") {
      setIsQuickSubRailClosing(true);
      if (quickSubCloseTimerRef.current !== null) window.clearTimeout(quickSubCloseTimerRef.current);
      quickSubCloseTimerRef.current = window.setTimeout(() => {
        quickSubCloseTimerRef.current = null;
        setSelectedBenchId("");
        updateLiveDockVisibility(false);
        setActiveArenaPanel(null);
        setReplacementTargetId(null);
        setIsArenaNavOpen(false);
        setIsQuickSubRailClosing(false);
      }, 180);
      return;
    }

    setSelectedBenchId("");
    updateLiveDockVisibility(false);
    setActiveArenaPanel(null);
    setIsEditorOpen(false);
    setReplacementTargetId(null);
    setIsArenaNavOpen(false);
  }

  function confirmBenchSwap() {
    if (!replacementTarget || !selectedBench) return;
    if (!isSelectedBenchInMatchday) {
      setSaveStatus(`${selectedBench.shortName} ${t("outsideMatchdayBenchStatus")}`);
      return;
    }
    if (isBenchFormationLocked(selectedBench, quickSubstitutionInteractivePlayers, selectedFormationKey, replacementTarget)) {
      setSaveStatus(`${selectedBench.shortName} ${t("lockedByFormation")} ${selectedFormationKey}`);
      return;
    }
    if (!canBenchReplaceTarget(selectedBench, replacementTarget)) {
      const needed = positionGroupLabel(arenaPositionGroup(replacementTarget.card?.position, replacementTarget.role), t);
      const offered = positionGroupLabel(arenaPositionGroup(selectedBench.position, selectedBench.role), t);
      setSaveStatus(`${selectedFormationKey}: ${t("needsPosition")} ${needed}, ${t("selectedCardIs")} ${offered}`);
      return;
    }

    if (isQuickSubstitutionSessionActive && quickSubstitutionSession && quickSubstitutionSessionSource) {
      const incomingInventoryId = quickSubstitutionSession.availableBenchInventoryIds.find((inventoryId) => (
        quickSubstitutionSessionSource.benchByInventoryId.get(inventoryId)?.id === selectedBench.id
      ));
      if (!incomingInventoryId) {
        setSaveStatus(siteLanguage === "pt-BR"
          ? "Esse reserva não está mais disponível para esta partida."
          : "This substitute is no longer available for this match.");
        return;
      }

      const commandId = createResilientBrowserId("quick-sub");
      const result = applyTouchlineQuickSubstitutionSession(quickSubstitutionSession, {
        commandId,
        commandHash: `${quickSubstitutionSession.matchId}:${quickSubstitutionSession.revision}:${replacementTarget.id}:${incomingInventoryId}:${commandId}`,
        expectedRevision: quickSubstitutionSession.revision,
        outgoingPositionSlotId: replacementTarget.id,
        incomingInventoryId,
        occurredAt: new Date().toISOString(),
      });
      if (result.status !== "applied" && result.status !== "replayed") {
        setSaveStatus(result.reason === "player_cannot_reenter"
          ? (siteLanguage === "pt-BR" ? "Este jogador já saiu e não pode voltar nesta partida." : "This player has already left and cannot return in this match.")
          : (siteLanguage === "pt-BR" ? "A substituição não pôde ser confirmada com segurança." : "The substitution could not be safely confirmed."));
        return;
      }

      setQuickSubstitutionSession(result.state);
      setIsQuickSubstitutionConfirmationOpen(false);
      setSelectedBenchId("");
      setReplacementTargetId(null);
      setSelectedPlayerId(replacementTarget.id);
      setPendingContractReleaseTargetId(null);
      // Return to the live Arena canvas after a confirmed Quick Sub. This is
      // intentionally state-only: the document is never reloaded, and the
      // score rail resumes in the same match context.
      window.history.replaceState(window.history.state, "", touchlineArenaPanelUrl(window.location.href, null));
      setActiveArenaPanel(null);
      setIsEditorOpen(false);
      setIsArenaNavOpen(false);
      updateLiveDockVisibility(false);
      setSaveStatus(siteLanguage === "pt-BR"
        ? `${selectedBench.shortName} entrou; ${replacementTarget.shortName} saiu e não pode voltar.`
        : `${selectedBench.shortName} is on; ${replacementTarget.shortName} is out and cannot return.`);
      return;
    }

    const incomingPlayer = benchOptionToArenaPlayer(selectedBench, replacementTarget);
    const outgoingBench = arenaPlayerToBenchOption(replacementTarget, selectedBench);
    const nextPlayers = players.map((player) => (player.id === replacementTarget.id ? incomingPlayer : player));
    const nextBench = benchPlayers.map((bench) => (bench.id === selectedBench.id ? outgoingBench : bench));

    setPlayers(nextPlayers);
    setBenchPlayers(nextBench);
    persistArenaRoster(nextPlayers, nextBench);
    setSelectedPlayerId(incomingPlayer.id);
    setReplacementTargetId(incomingPlayer.id);
    setIsQuickSubstitutionConfirmationOpen(false);
    setPendingContractReleaseTargetId(null);
    setSelectedBenchId(outgoingBench.id);
    setIsDemoLineup(false);
    setShouldRenderPlayers(true);
    setHasEntryVideoFinished(true);
    setActiveVideoIndex(1);
    setSaveStatus(`${selectedBench.shortName} ${t("replacementCompleted")} ${replacementTarget.shortName}`);
  }

  function openBuilderPlayerInSquad(builderPlayer: TeamBuilderSquadPlayer) {
    const existingPlayer = players.find((player) => matchesBuilderPlayer(player, builderPlayer));
    if (existingPlayer) {
      setSelectedPlayerId(existingPlayer.id);
      openArenaPanel("bench");
      setShouldRenderPlayers(true);
      setHasEntryVideoFinished(true);
      setActiveVideoIndex(1);
      setSaveStatus(marketUi.playerAlreadyOnPitch(builderPlayer.shortName));
      return;
    }

    const existingBenchPlayer = benchPlayers.find((bench) => matchesBuilderBenchPlayer(bench, builderPlayer));
    if (existingBenchPlayer) {
      setSelectedBenchId(existingBenchPlayer.id);
      openArenaPanel("bench");
      setSaveStatus(marketUi.playerAlreadyInSquad(builderPlayer.shortName));
      return;
    }
  }

  function marketCartErrorLabel(errorCode: TouchlineMarketCartErrorCode | null) {
    if (errorCode === "roster-capacity") return t("cartCapacityError").replace("{count}", String(openContractSlots));
    if (errorCode === "insufficient-balance") return t("insufficientTc");
    if (errorCode === "sold-out") return t("soldOut");
    if (errorCode === "already-owned") return t("openSquad");
    if (errorCode === "duplicate-card") return t("inCart");
    return t("cartEmpty");
  }

  function toggleBuilderPlayerInCart(builderPlayer: TeamBuilderSquadPlayer) {
    if (!ownerCoachProviderId) {
      setSaveStatus(siteLanguage === "pt-BR" ? "Escolha o treinador antes de contratar jogadores." : "Choose the coach before signing players.");
      return;
    }
    if (!marketFormationConfirmed) {
      setSaveStatus(siteLanguage === "pt-BR" ? "Confirme a formação antes de contratar jogadores." : "Confirm the formation before signing players.");
      return;
    }
    const contractId = builderPlayerSquadContractId(builderPlayer);
    const alreadyOwned = players.some((player) => matchesBuilderPlayer(player, builderPlayer))
      || benchPlayers.some((bench) => matchesBuilderBenchPlayer(bench, builderPlayer))
      || builderPlayer.inventoryAlreadyOwned === true;

    if (!builderPlayer.inventoryId || !builderPlayerHasPublishedCard(builderPlayer)) {
      setSaveStatus(marketUi.cardUnavailable);
      return;
    }

    if (alreadyOwned) {
      if (
        builderPlayer.inventoryAlreadyOwned
        && !players.some((player) => matchesBuilderPlayer(player, builderPlayer))
        && !benchPlayers.some((bench) => matchesBuilderBenchPlayer(bench, builderPlayer))
      ) {
        setSaveStatus(t("openSquad"));
      } else {
        openBuilderPlayerInSquad(builderPlayer);
      }
      return;
    }

    if (marketCartContractIds.has(contractId)) {
      marketCheckoutAttemptRef.current = null;
      marketCartDraftIdsRef.current?.delete(contractId);
      setMarketCartPlayers((current) => current.filter((player) => builderPlayerSquadContractId(player) !== contractId));
      setSaveStatus(`${builderPlayer.shortName} · ${t("removeFromCart")}`);
      return;
    }

    const stagedReplacementLimit = openContractSlots === 0 ? 1 : openContractSlots;
    if (marketCartPlayers.length >= stagedReplacementLimit) {
      setSaveStatus(t("cartCapacityError").replace("{count}", String(openContractSlots)));
      return;
    }

    const positionBucket = touchlineMarketPositionBucket(builderPlayer.position, builderPlayer.role);
    if (positionBucket === "outfield") {
      setSaveStatus(siteLanguage === "pt-BR" ? "Posição em classificação. Este jogador ainda não pode ser contratado." : "Position pending classification. This player cannot be signed yet.");
      return;
    }
    const positionLimit = TOUCHLINE_MARKET_POSITION_LIMITS[positionBucket];
    const positionCount = marketPositionCounts[positionBucket] ?? 0;
    if (positionCount >= positionLimit) {
      const positionLabel = touchlineMarketPositionBucketLabel(positionBucket, siteLanguage);
      const tacticalHint = positionBucket === "centre-forward" ? ` ${touchlineTwoStrikerFormationHint(siteLanguage)}` : "";
      setSaveStatus(`${marketUi.positionLimitReached(positionLabel, positionLimit)}.${tacticalHint}`);
      return;
    }

    marketCheckoutAttemptRef.current = null;
    marketCartDraftIdsRef.current?.add(contractId);
    setMarketCartPlayers((current) => [...current, builderPlayer]);
    setSaveStatus(`${builderPlayer.shortName} · ${t("addToCart")}`);
  }

  async function checkoutBuilderCart() {
    if (!marketCartQuote.valid) {
      setSaveStatus(marketCartErrorLabel(marketCartQuote.errorCode));
      return;
    }

    if (isMarketCheckoutPending || isContractReleasePending || marketMutationPendingRef.current) return;

    const newBenchCards = marketCartPlayers.map(builderPlayerToBenchOption);
    let nextWalletBalanceTc = marketCartQuote.balanceAfterTc;
    let completedItemCount = marketCartQuote.itemCount;
    let completedTotalTc = marketCartQuote.totalTc;
    const inventoryIds = marketCartPlayers.map((player) => player.inventoryId).filter((id): id is string => Boolean(id));
    const hasAuthoritativeCartItems = marketCartPlayers.some((player) => player.inventorySource === "supabase" || Boolean(player.inventoryId));
    const isAuthoritativeCheckout = Boolean(
      hasAuthoritativeCartItems && inventoryIds.length === marketCartPlayers.length,
    );

    if ((requiresAuthoritativeMarketInventory || hasAuthoritativeCartItems) && !isAuthoritativeCheckout) {
      setSaveStatus(marketUi.cardUnavailable);
      return;
    }

    if (isAuthoritativeCheckout) {
      const signature = [...inventoryIds].sort().join(":");
      const existingAttempt = marketCheckoutAttemptRef.current;
      const randomKey = createResilientBrowserId();
      const idempotencyKey = existingAttempt?.signature === signature
        ? existingAttempt.idempotencyKey
        : `touchline-market-${randomKey}`;
      marketCheckoutAttemptRef.current = { signature, idempotencyKey };
      marketMutationPendingRef.current = "checkout";
      setIsMarketCheckoutPending(true);

      try {
        const response = await fetch("/api/touchline-arena/market/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          cache: "no-store",
          body: JSON.stringify({ cardIds: inventoryIds, idempotencyKey }),
        });
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!response.ok) {
          const errorCode = typeof payload?.error === "string" ? payload.error : "TL_MARKET_CHECKOUT_FAILED";
          if (errorCode.includes("ROSTER_CAPACITY")) setSaveStatus(marketCartErrorLabel("roster-capacity"));
          else if (errorCode.includes("INSUFFICIENT_BALANCE")) setSaveStatus(marketCartErrorLabel("insufficient-balance"));
          else if (errorCode.includes("SOLD_OUT") || errorCode.includes("UNAVAILABLE")) setSaveStatus(marketCartErrorLabel("sold-out"));
          else if (errorCode.includes("ALREADY_OWNED")) setSaveStatus(marketCartErrorLabel("already-owned"));
          else setSaveStatus(marketUi.genericError);
          return;
        }

        const checkout = parseTouchlineMarketCheckoutResult(payload);
        if (!checkout || checkout.itemCount !== inventoryIds.length) {
          setSaveStatus(marketUi.checkoutInvalidResponse);
          return;
        }
        nextWalletBalanceTc = checkout.balanceAfterTc;
        completedItemCount = checkout.itemCount;
        completedTotalTc = checkout.totalTc;

        const purchasedIds = new Set(inventoryIds);
        setMarketInventorySnapshot((current) => current ? {
          ...current,
          walletBalanceTc: nextWalletBalanceTc,
          activeContractCount: current.activeContractCount + completedItemCount,
          openContractSlots: Math.max(0, current.openContractSlots - completedItemCount),
          cards: current.cards.map((card) => purchasedIds.has(card.inventoryId) ? {
            ...card,
            soldCopies: Math.min(card.supplyLimit, card.soldCopies + 1),
            availableCopies: Math.max(0, card.availableCopies - 1),
            alreadyOwned: true,
          } : card),
        } : current);
        setBuilderSquad((current) => current.map((player) => (
          player.inventoryId && purchasedIds.has(player.inventoryId)
            ? {
                ...player,
                inventorySoldCopies: Math.min(player.inventorySupplyLimit ?? TOUCHLINE_MARKET_CARD_SUPPLY_PER_PLAYER, (player.inventorySoldCopies ?? 0) + 1),
                inventoryAvailableCopies: Math.max(0, (player.inventoryAvailableCopies ?? TOUCHLINE_MARKET_CARD_SUPPLY_PER_PLAYER) - 1),
                inventoryAlreadyOwned: true,
              }
            : player
        )));
        marketCheckoutAttemptRef.current = null;
      } catch {
        setSaveStatus(marketUi.connectionUnavailable);
        return;
      } finally {
        if (marketMutationPendingRef.current === "checkout") marketMutationPendingRef.current = null;
        setIsMarketCheckoutPending(false);
      }
    }

    const completedStatus = t("checkoutCompleted")
      .replace("{count}", String(completedItemCount))
      .replace("{total}", String(completedTotalTc));

    const placement = placeNewContractsInSquad(
      isDemoLineup ? [] : players,
      isDemoLineup ? [] : benchPlayers,
      newBenchCards,
      selectedFormationKey,
    );
    setIsDemoLineup(false);
    setPlayers(placement.players);
    setBenchPlayers(placement.bench);
    persistArenaRoster(placement.players, placement.bench);
    setMarketWalletBalanceTc(nextWalletBalanceTc);
    if (!isAuthoritativeCheckout && arenaPersistencePrincipal) {
      writeMarketWalletBalanceTc(nextWalletBalanceTc, arenaPersistencePrincipal);
    }
    setSelectedBenchId(placement.bench.at(-1)?.id ?? selectedBenchId);
    marketCartDraftIdsRef.current?.clear();
    setMarketCartPlayers([]);
    setIsMarketCheckoutConfirmationOpen(false);
    setShouldRenderPlayers(true);
    setHasEntryVideoFinished(true);
    setActiveVideoIndex(1);
    setIsEditorOpen(false);
    setSaveStatus(completedStatus);
  }

  async function releaseAuthoritativeContract(
    cardId: string | null | undefined,
    releaseContext: "reserve" | "field",
  ) {
    const normalizedCardId = normalizeTouchlineMarketInventoryId(cardId);
    const isExplicitLocalDemo = arenaPersistencePrincipal?.kind === "demo"
      && !normalizedCardId
      && marketInventoryMode !== "authoritative";
    if (isExplicitLocalDemo) return true;

    if (!normalizedCardId) {
      setSaveStatus(marketUi.releaseIdentitySyncing);
      setMarketInventoryRevision((revision) => revision + 1);
      return false;
    }
    if (isContractReleasePending || isMarketCheckoutPending || marketMutationPendingRef.current) return false;

    const signature = `${releaseContext}:${normalizedCardId}`;
    const previousAttempt = marketContractReleaseAttemptRef.current;
    const randomKey = createResilientBrowserId();
    const idempotencyKey = previousAttempt?.signature === signature
      ? previousAttempt.idempotencyKey
      : `touchline-release-${randomKey}`;
    marketContractReleaseAttemptRef.current = { signature, idempotencyKey };
    marketMutationPendingRef.current = "release";
    setIsContractReleasePending(true);
    setSaveStatus(marketUi.releaseInProgress);

    try {
      const response = await fetch("/api/touchline-arena/contracts/release", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify({ cardId: normalizedCardId, idempotencyKey }),
      });
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok) {
        setSaveStatus(marketUi.genericError);
        setMarketInventoryRevision((revision) => revision + 1);
        return false;
      }

      const released = parseTouchlineMarketContractReleaseResult(payload, normalizedCardId);
      if (!released) {
        setSaveStatus(marketUi.releaseInvalidResponse);
        setMarketInventoryRevision((revision) => revision + 1);
        return false;
      }

      if (released.idempotentReplay) {
        // Replay counters describe the original operation, not necessarily the
        // current market. Discard the stale snapshot and reconcile from source.
        setMarketInventorySnapshot(null);
      } else {
        setMarketInventorySnapshot((current) => current ? {
          ...current,
          activeContractCount: released.activeContractCount,
          openContractSlots: released.openContractSlots,
          cards: current.cards.map((card) => card.inventoryId === released.cardId ? {
            ...card,
            supplyLimit: released.supplyLimit,
            soldCopies: released.soldCopies,
            availableCopies: released.availableCopies,
            alreadyOwned: false,
          } : card),
        } : current);
        setBuilderSquad((current) => current.map((player) => player.inventoryId === released.cardId ? {
          ...player,
          inventorySupplyLimit: released.supplyLimit,
          inventorySoldCopies: released.soldCopies,
          inventoryAvailableCopies: released.availableCopies,
          inventoryAlreadyOwned: false,
        } : player));
      }
      marketContractReleaseAttemptRef.current = null;
      setMarketInventoryRevision((revision) => revision + 1);
      return true;
    } catch {
      setSaveStatus(marketUi.releaseConnectionUnavailable);
      setMarketInventoryRevision((revision) => revision + 1);
      return false;
    } finally {
      if (marketMutationPendingRef.current === "release") marketMutationPendingRef.current = null;
      setIsContractReleasePending(false);
    }
  }

  function openMarketPositionReplacement(player: TeamBuilderSquadPlayer) {
    setSelectedBuilderPlayerId(stableBuilderPlayerId(player));
    setPendingMarketReplacementPlayerId(stableBuilderPlayerId(player));
    setIsMarketCheckoutConfirmationOpen(false);
  }

  async function releaseMarketPositionContract(candidate: MarketPositionReplacementCandidate) {
    const incoming = pendingMarketReplacementPlayer;
    if (!incoming) return;
    const released = await releaseAuthoritativeContract(candidate.inventoryId, candidate.location);
    if (!released) return;

    const nextPlayers = players.filter((player) => player.id !== candidate.id);
    const nextBench = benchPlayers.filter((player) => player.id !== candidate.id);
    setPlayers(nextPlayers);
    setBenchPlayers(nextBench);
    persistArenaRoster(nextPlayers, nextBench);
    setPendingMarketReplacementPlayerId(null);
    marketCheckoutAttemptRef.current = null;
    setMarketCartPlayers((current) => {
      const contractId = builderPlayerSquadContractId(incoming);
      return current.some((player) => builderPlayerSquadContractId(player) === contractId)
        ? current
        : [...current, incoming];
    });
    setSaveStatus(siteLanguage === "pt-BR"
      ? `${candidate.shortName}: contrato encerrado sem reembolso · ${incoming.shortName} selecionado para nova contratação`
      : `${candidate.shortName}: contract ended without refund · ${incoming.shortName} selected for a new signing`);
  }

  async function releaseSelectedBenchContract() {
    if (!selectedBench) return;
    const released = await releaseAuthoritativeContract(
      selectedBench.inventoryId,
      "reserve",
    );
    if (!released) return;
    const nextBench = benchPlayers.filter((bench) => bench.id !== selectedBench.id);
    setBenchPlayers(nextBench);
    persistArenaRoster(players, nextBench);
    setSelectedBenchId(nextBench[0]?.id ?? "");
    setReplacementTargetId(null);
    setPendingContractReleaseTargetId(null);
    openArenaPanel("market");
    setSaveStatus(marketUi.contractReleased(selectedBench.shortName));
  }

  async function replaceAndReleaseSelectedContract() {
    if (!replacementTarget || !selectedBench) return;
    if (!isSelectedBenchInMatchday) {
      setSaveStatus(`${selectedBench.shortName} ${t("outsideMatchdayBenchStatus")}`);
      return;
    }
    if (isBenchFormationLocked(selectedBench, players, selectedFormationKey, replacementTarget)) {
      setSaveStatus(`${selectedBench.shortName} ${t("lockedByFormation")} ${selectedFormationKey}`);
      return;
    }
    if (!canBenchReplaceTarget(selectedBench, replacementTarget)) {
      const needed = positionGroupLabel(arenaPositionGroup(replacementTarget.card?.position, replacementTarget.role), t);
      const offered = positionGroupLabel(arenaPositionGroup(selectedBench.position, selectedBench.role), t);
      setSaveStatus(`${selectedFormationKey}: ${t("needsPosition")} ${needed}, ${t("selectedCardIs")} ${offered}`);
      return;
    }

    const releasedPlayer = replacementTarget;
    const released = await releaseAuthoritativeContract(
      releasedPlayer.card?.inventoryId,
      "field",
    );
    if (!released) return;
    const incomingPlayer = benchOptionToArenaPlayer(selectedBench, releasedPlayer);
    const nextPlayers = players.map((player) => (player.id === releasedPlayer.id ? incomingPlayer : player));
    const nextBench = benchPlayers.filter((bench) => bench.id !== selectedBench.id);

    setPlayers(nextPlayers);
    setBenchPlayers(nextBench);
    persistArenaRoster(nextPlayers, nextBench);
    setSelectedPlayerId(incomingPlayer.id);
    setReplacementTargetId(incomingPlayer.id);
    setPendingContractReleaseTargetId(null);
    setSelectedBenchId(nextBench[0]?.id ?? "");
    setIsDemoLineup(false);
    setShouldRenderPlayers(true);
    setHasEntryVideoFinished(true);
    setActiveVideoIndex(1);
    setSaveStatus(marketUi.replacementReleased(incomingPlayer.shortName, releasedPlayer.shortName));
  }

  const canonical433VideoPositions = selectedFormationKey === "4-3-3"
    ? resolveArena433VideoSlots(
      arenaFieldPlayersForRendering,
      arenaLoopCameraProfile(loopCameraIndex).id,
      arenaVideoViewport,
    )
    : null;
  const projectedFieldPlayerPositions = projectArenaPlayersForLoopCamera(arenaFieldPlayersForRendering, loopCameraIndex);
  const lockedCameraLayout = readLockedFormationLayout(selectedFormationKey, arenaPersistencePrincipal)?.cameras?.[currentCameraId];
  const lockedCameraPositions = roleLayoutForPlayers(arenaFieldPlayersForRendering, lockedCameraLayout, loopCameraIndex);
  const cameraEditPositions = cameraEditSlots[currentCameraEditKey];
  // 4-3-3 is a protected match presentation. Its video position must come
  // only from formation + loop + viewport, never a persisted camera drag.
  const fieldPlayerPositions = new Map(canonical433VideoPositions ?? lockedCameraPositions ?? projectedFieldPlayerPositions);
  const trainingCenterSlots = isQuickSubstitutionSessionActive && quickSubstitutionSessionSource
    ? new Map(quickSubstitutionSessionSource.pitchSlotByPositionSlotId)
    : trainingCenterPlayerSlots(arenaFieldPlayersForRendering);
  if (cameraEditPositions && !canonical433VideoPositions) {
    for (const [playerId, slot] of Object.entries(cameraEditPositions)) {
      const player = arenaFieldPlayersForRendering.find((candidate) => candidate.id === playerId);
      if (player) fieldPlayerPositions.set(playerId, constrainArenaDisplaySlot(player, slot, loopCameraIndex));
    }
  }

  return (
    <main
      className={`touchline-game fixed inset-0 overflow-hidden bg-black text-white${standaloneExperience ? ` is-panel-standalone is-${standaloneExperience}-standalone` : ""}`}
      data-account-sync-status={arenaAccountSyncStatus}
      data-roster-sync-status={arenaRosterSyncStatus}
    >
      <section
        ref={stageRef}
        className={`arena-stage relative h-[100dvh] min-h-0 w-full overflow-hidden bg-black${isArenaFallbackFullscreen ? " is-mobile-fullscreen-fallback" : ""}`}
        data-fullscreen-mode={isArenaFallbackFullscreen ? "fallback" : isArenaNativeFullscreen ? "native" : "windowed"}
        data-entry-state={isArenaFunctionalReady ? "ready" : "intro"}
        data-coach-spotlight={isCoachSpotlightOpen || selectedLiveCoachData ? "open" : "closed"}
        data-card-spotlight={isCoachSpotlightOpen || selectedLiveCoachData || selectedLiveSimulationCard || spotlightPlayer ? "open" : "closed"}
      >
        <TouchlineArenaIntro
          key={`touchline-arena-intro-${introExperienceRun}`}
          locale={siteLanguage}
          mode={introExperienceMode === "hidden" ? "hidden" : isArenaIntroViewportReady ? introExperienceMode : "pending"}
          onComplete={completeOfficialIntroExperience}
          onReveal={revealOfficialArena}
          onSequenceStart={(canSkip) => setIsEntrySkipAvailable(canSkip)}
          onSkip={skipOfficialIntroExperience}
        />
        {standalonePanel !== "live" ? (
          <div className="arena-video-stack" aria-hidden="true">
            <video
              className={`arena-video arena-video-a ${activeVideoIndex === 0 ? "is-visible" : ""}`}
              ref={firstVideoRef}
              // WebKit may keep buffering a hidden video even after pause().
              // Do not attach the large official source until the Arena can
              // actually be seen in its required landscape viewport.
              src={isArenaIntroViewportReady ? TOUCHLINE_ARENA_ENTRY_VIDEO : undefined}
              poster={TOUCHLINE_ARENA_VIDEO_POSTER}
              muted
              playsInline
              preload={isEntrySkipAvailable ? "auto" : "metadata"}
              onEnded={startCardLoopVideo}
              onError={startCardLoopVideo}
              onPlay={() => setIsArenaVideoPaused(false)}
              onPause={() => {
                if (activeVideoIndex === 0) setIsArenaVideoPaused(true);
              }}
            />
            <video
              className={`arena-video arena-video-b ${activeVideoIndex === 1 ? "is-visible" : ""}`}
              ref={secondVideoRef}
              src={isArenaIntroViewportReady ? TOUCHLINE_ARENA_LOOP_VIDEO : undefined}
              poster={TOUCHLINE_ARENA_VIDEO_POSTER}
              muted
              playsInline
              loop
              preload="metadata"
              onLoadedMetadata={handleCardLoopTimelineEvent}
              onTimeUpdate={handleCardLoopTimelineEvent}
              onSeeking={handleCardLoopTimelineEvent}
              onSeeked={handleCardLoopTimelineEvent}
              onPlaying={handleCardLoopPlaying}
              onPause={() => {
                cancelLoopCameraFrameSync();
                if (activeVideoIndex === 1) setIsArenaVideoPaused(true);
              }}
            />
          </div>
        ) : null}
        <div className="arena-atmosphere" />

        <div className="arena-intro-actions" aria-label={siteLanguage === "pt-BR" ? "Controles da introdução" : "Intro controls"}>
          {hasEntryVideoFinished ? (
            <button
              className="arena-intro-replay-toggle"
              type="button"
              onClick={replayEntryVideo}
              aria-label={siteLanguage === "pt-BR" ? "Ver introdução" : "Watch intro"}
              title={siteLanguage === "pt-BR" ? "Ver introdução" : "Watch intro"}
            >
              <RotateCw aria-hidden="true" />
              <span>{siteLanguage === "pt-BR" ? "Ver intro" : "Watch intro"}</span>
            </button>
          ) : null}
          {isEntrySkipAvailable && !hasEntryVideoFinished && introExperienceMode === "hidden" ? (
            <button
              className="arena-entry-skip-toggle"
              type="button"
              onClick={skipOfficialIntroExperience}
            >
              <span>{t("skipIntro")}</span>
              <FastForward aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div
          className="arena-functional-layer"
          inert={isArenaFunctionalReady ? undefined : true}
          aria-hidden={!isArenaFunctionalReady}
        >
        {!isMarketOnboardingWelcomeVisible && !isCoachSelectionBootstrapPending && !isCoachSelectionRequired ? (
          <h1 className="sr-only">TouchLine Arena</h1>
        ) : null}
        {isMarketOnboardingWelcomeVisible ? (
          <section className="arena-market-welcome" role="status" aria-live="polite" aria-label={`${marketOnboardingWelcomeCopy.titleLead} ${marketOnboardingWelcomeCopy.titleAccent}`}>
            <div className="arena-market-welcome-rings" aria-hidden="true"><i /><i /><i /></div>
            <div className="arena-market-welcome-copy">
              <span>{marketOnboardingWelcomeCopy.eyebrow}</span>
              <h1>{marketOnboardingWelcomeCopy.titleLead} <em>{marketOnboardingWelcomeCopy.titleAccent}</em></h1>
              <p>{marketOnboardingWelcomeCopy.message}</p>
              <strong>{marketOnboardingWelcomeCopy.journey}</strong>
              <div><i aria-hidden="true" />{marketOnboardingWelcomeCopy.transition}</div>
              <button
                type="button"
                onClick={() => window.location.replace(`/market-transfer?lang=${encodeURIComponent(siteLanguage)}`)}
              >
                {marketOnboardingWelcomeCopy.skip}
              </button>
            </div>
          </section>
        ) : null}
        {needsArenaRosterRecovery && !isMarketOnboardingWelcomeVisible && !activeArenaPanel ? (
          <aside className="arena-empty-roster-recovery" role="status" aria-label={siteLanguage === "pt-BR" ? "Concluir preparação do clube" : "Complete club setup"}>
            <span>{siteLanguage === "pt-BR" ? "SEU CLUBE CONTINUA SEGURO" : "YOUR CLUB REMAINS SAFE"}</span>
            <h2>{siteLanguage === "pt-BR" ? "Prepare seu clube para a próxima rodada" : "Prepare your club for the next round"}</h2>
            <p>
              {!activeArenaCoachIdentity?.coach
                ? (siteLanguage === "pt-BR" ? "Escolha primeiro seu treinador oficial no Market Transfer. A Arena fica livre para o dia de jogo." : "Choose your official coach first in Market Transfer. Arena stays clear for matchday.")
                : ownedSquadCount === 0
                  ? (siteLanguage === "pt-BR" ? "Seu treinador está salvo. Agora contrate os jogadores do seu elenco no Market Transfer." : "Your coach is saved. Now contract your squad players in Market Transfer.")
                  : (siteLanguage === "pt-BR" ? `Seu elenco tem ${ownedSquadCount} jogadores. Continue a montagem até completar a formação.` : `Your squad has ${ownedSquadCount} players. Continue building until the formation is complete.`)}
            </p>
            <div>
              <a className="is-primary" href={`/market-transfer?lang=${encodeURIComponent(siteLanguage)}`}>
                {!activeArenaCoachIdentity?.coach
                  ? (siteLanguage === "pt-BR" ? "Abrir Mercado de Treinadores" : "Open Coach Market")
                  : ownedSquadCount === 0
                    ? (siteLanguage === "pt-BR" ? "Abrir Mercado de Jogadores" : "Open Player Market")
                    : (siteLanguage === "pt-BR" ? "Continuar Montagem do Elenco" : "Continue Squad Building")}
              </a>
              <a href={allClubsHubHref}>{siteLanguage === "pt-BR" ? "Ver todos os clubes" : "View all clubs"}</a>
            </div>
          </aside>
        ) : null}
        {isCoachSelectionBootstrapPending ? (
          <section
            className="arena-coach-first-gate is-bootstrap-pending"
            aria-label={siteLanguage === "pt-BR" ? "Preparando Market Transfer" : "Preparing Market Transfer"}
            aria-busy="true"
            data-testid="arena-coach-bootstrap"
          >
            <div className="arena-coach-first-copy">
              <span>{siteLanguage === "pt-BR" ? "TOUCHLINE MARKET" : "TOUCHLINE MARKET"}</span>
              <h1>{siteLanguage === "pt-BR" ? "Preparando seu clube" : "Preparing your club"}</h1>
              <p>{siteLanguage === "pt-BR" ? "Confirmando treinador e elenco para abrir a etapa correta." : "Confirming your coach and squad so we can open the correct step."}</p>
            </div>
            <div className="arena-coach-bootstrap-pulse" aria-hidden="true"><i /><i /><i /></div>
          </section>
        ) : isCoachSelectionRequired ? (
          <section className={`arena-coach-first-gate${coachOfferStatus !== "ready" ? " is-offer-pending" : ""}`} aria-label={siteLanguage === "pt-BR" ? "Escolha seu treinador" : "Choose your coach"} data-testid="arena-coach-first-gate">
            <div className="arena-coach-first-copy">
              <span>{siteLanguage === "pt-BR" ? "MERCADO · PASSO 1 DE 10" : "MARKET · STEP 1 OF 10"}</span>
              <h1>{siteLanguage === "pt-BR" ? "Escolha seu treinador" : "Choose your coach"}</h1>
              <p>{siteLanguage === "pt-BR" ? "Comece pelo treinador e confirme a formação. Depois complete, em ordem: goleiros, zagueiros, lateral direito, lateral esquerdo, volantes, meias, atacantes e centroavantes." : "Start with the coach and confirm the formation. Then complete, in order: goalkeepers, centre-backs, right-backs, left-backs, defensive midfielders, midfielders, attackers and centre-forwards."}</p>
              {coachSelectionError ? <p className="arena-coach-selection-error" role="alert">{coachSelectionError}</p> : null}
            </div>
            <div className="arena-coach-choice-rail" role="list">
              {coachOfferStatus !== "ready" ? (
                <div className="arena-coach-offer-status" role="status">
                  <p>
                    {coachOfferStatus === "error"
                      ? (siteLanguage === "pt-BR" ? "As ofertas oficiais dos treinadores estão indisponíveis. Tente novamente." : "Official coach offers are unavailable. Please try again.")
                      : coachOfferStatus === "idle"
                        ? (siteLanguage === "pt-BR" ? "Entre na sua conta para carregar as ofertas oficiais dos treinadores." : "Sign in to load official coach offers.")
                        : (siteLanguage === "pt-BR" ? "Carregando ofertas oficiais dos treinadores…" : "Loading official coach offers…")}
                  </p>
                  {coachOfferStatus === "idle" ? (
                    <a className="arena-coach-login-link" href={coachFirstLoginHref}>
                      {siteLanguage === "pt-BR" ? "Entrar para abrir o Market Transfer" : "Sign in to open Market Transfer"}
                    </a>
                  ) : null}
                </div>
              ) : TOUCHLINE_LIVE_COACHES.map(({ coach, countryCode3 }) => {
                const club = PREMIER_CLUB_VISUALS.find((candidate) => candidate.teamId === coach.teamId) ?? null;
                const offer = coachOffersByProviderId[coach.providerId];
                if (!offer) return null;
                const slot = createTouchlineArenaCoachSlot(
                  coach,
                  null,
                  offer.tierKey,
                );
                return (
                  <button
                    key={coach.providerId}
                    type="button"
                    className="arena-coach-choice"
                    role="listitem"
                    disabled={isCoachSaving}
                    onClick={() => void selectOfficialArenaCoach(coach.providerId)}
                    aria-label={`${siteLanguage === "pt-BR" ? "Selecionar" : "Select"} ${coach.displayName}`}
                  >
                    <span className="arena-coach-choice-card" aria-hidden="true">
                      <TouchlineCoachCard
                        coach={coach}
                        slot={slot}
                        clubName={club?.name ?? "TouchLine England"}
                        clubLogoUrl={club?.logoUrl}
                        clubAccent={club?.accent ?? "#b5ff4b"}
                        countryCode3={countryCode3}
                        formation={selectedFormationKey}
                        locale={siteLanguage}
                        displayMode="compact"
                        optimizeForLiveCompact
                      />
                    </span>
                    <strong>{coach.displayName}</strong>
                    <small>{club?.name ?? "TouchLine England"}</small>
                    <span className="arena-coach-choice-offer" aria-label={`${offer.tierName} ${offer.displayPrice}`}>
                      <b>{offer.tierName}</b>
                      <b>{offer.displayPrice}</b>
                    </span>
                    <small className="arena-coach-choice-reason">{coachClassificationLabel(offer.classificationReason, siteLanguage)}</small>
                    <em>{siteLanguage === "pt-BR" ? "Selecionar treinador" : "Select coach"}</em>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
        <div
          className="arena-coach-gated-content"
          inert={isCoachSelectionRequired || isCoachSelectionBootstrapPending ? true : undefined}
          aria-hidden={isCoachSelectionRequired || isCoachSelectionBootstrapPending}
        >
        <div
          className="arena-field-selection-clear-layer"
          aria-hidden="true"
          onClick={() => setSelectedPlayerId(null)}
        />

        {shouldRenderArenaOwnerLayer ? (
          <section
            className="field-player-layer is-entry-ready"
            data-card-assets-ready={arenaFieldCardsAreReady ? "true" : "false"}
            aria-label="Editable field players"
            aria-hidden={false}
          >
            {arenaFieldPlayersForRendering.map((player) => {
              const fieldPosition = fieldPlayerPositions.get(player.id) ?? projectArenaPlayerForLoopCamera(player, loopCameraIndex);
              // The canonical video layout owns the size with its coordinate.
              // Saved/editor sizes never control the protected 4-3-3 match.
              const baseHeight = fieldPosition.heightVh ?? arenaLoopCameraProfile(loopCameraIndex).cardHeightVh;

              return (
                <div
                  key={player.id}
                  role="button"
                  tabIndex={0}
                  className={`arena-field-player ${selectedPlayerId === player.id ? "is-selected" : ""}${isQuickSubstitutionOpen && selectedBench && canBenchReplaceTarget(selectedBench, player) && !isBenchFormationLocked(selectedBench, quickSubstitutionInteractivePlayers, selectedFormationKey, player) ? " is-substitution-eligible" : ""}${isQuickSubstitutionOpen && replacementTargetId === player.id ? " is-substitution-target" : ""}`}
                  data-camera={arenaLoopCameraProfile(loopCameraIndex).id}
                  data-editing={isEditorOpen}
                  data-substitution-target-id={isQuickSubstitutionOpen ? player.id : undefined}
                  style={{
                    left: `${fieldPosition.x}%`,
                    top: `${fieldPosition.y}%`,
                    // `dvh` follows the current visual viewport after a Safari
                    // portrait-to-landscape rotation. Plain `vh` can retain the
                    // former portrait height and make compact cards overlap.
                    height: `${baseHeight}dvh`,
                    zIndex: selectedPlayerId === player.id ? 1200 : Math.round(fieldPosition.y * 10),
                  }}
                  onPointerDown={(event) => handleFieldPlayerPointerDown(event, player)}
                  onPointerMove={(event) => handleFieldPlayerPointerMove(event, player)}
                  onPointerUp={handleFieldPlayerPointerUp}
                  onPointerCancel={handleFieldPlayerPointerUp}
                  onDragOver={(event) => {
                    if (!isQuickSubstitutionOpen || !draggingBenchId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    if (!isQuickSubstitutionOpen) return;
                    event.preventDefault();
                    const benchId = event.dataTransfer.getData("text/touchline-bench-id") || draggingBenchId;
                    if (benchId) handleBenchDrop(player, benchId);
                  }}
                  onClickCapture={(event) => {
                    if (!isQuickSubstitutionOpen) return;
                    event.preventDefault();
                    event.stopPropagation();
                    handleFieldPlayerClick(player);
                  }}
                  onClick={(event) => {
                    if (isQuickSubstitutionOpen) return;
                    if ((event.target as HTMLElement).closest("a,button")) return;
                    handleFieldPlayerClick(player);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    handleFieldPlayerClick(player);
                  }}
                  aria-label={`Select ${player.name} card`}
                  aria-pressed={selectedPlayerId === player.id}
                >
                  <span className="player-ground-shadow" />
                  {player.card ? (
                    <span className="arena-field-card">
                      <TouchlineEliteExactCard
                        player={arenaCardToPlayer(player, isDemoLineup ? touchlineDemoTierForPlayer(player.id, player.name) : undefined)}
                        layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                        labels={cardLabels}
                        rankingMode={isDemoLineup ? "preview" : "live"}
                        showMatchPoints
                        showProfileAction={false}
                        showSocialMetrics={false}
                        forceNeonActive={selectedPlayerId === player.id}
                        optimizeForLiveCompact
                        allowVisualInventoryPreview={isDemoLineup}
                      />
                    </span>
                  ) : player.asset ? (
                    <img src={player.asset} alt={player.name} draggable={false} />
                  ) : (
                    <span className="arena-field-placeholder" aria-hidden="true">
                      {player.shortName.slice(0, 2)}
                    </span>
                  )}
                  {!player.card ? <span className="player-name-tag">{player.shortName}</span> : null}
                </div>
              );
            })}
          </section>
        ) : null}

        <header className="game-hud" aria-label="Arena controls">
          <div className="hud-actions-row">
            <nav ref={arenaNavRef} className={`arena-quick-dock ${isArenaNavOpen ? "is-open" : "is-collapsed"}`} aria-label="Arena quick actions">
              <button
                type="button"
                className="arena-quick-toggle"
                aria-expanded={isArenaNavOpen}
                aria-label={t("arenaMenu")}
                onClick={() => {
                  setIsLanguageMenuOpen(false);
                  setIsArenaNavOpen((value) => !value);
                }}
              >
                <Menu className="arena-quick-menu-icon" aria-hidden="true" />
                <span>{t("arenaMenu")}</span>
                <strong aria-hidden="true">{isArenaNavOpen ? "v" : "^"}</strong>
              </button>
              <div
                className="arena-quick-links"
                aria-hidden={!isArenaNavOpen}
                // A closed dock is visually hidden. Keep its links out of the
                // keyboard path too, so focus cannot land on an invisible
                // navigation action over the Arena.
                inert={!isArenaNavOpen ? true : undefined}
              >
                <a href={touchlineClubOwnerProfileHref(siteLanguage)}>
                  ClubOwner
                </a>
                <a href={allClubsHubHref}>
                  {t("clubHub")}
                </a>
                <a
                  href={touchlineArenaPanelHref("bench", siteLanguage)}
                  onClick={(event) => {
                    event.preventDefault();
                    openArenaPanel("bench");
                  }}
                >
                  {t("quickSubstitution")}
                </a>
                {hasEntryVideoFinished ? (
                  <button type="button" onClick={replayEntryVideo}>
                    {siteLanguage === "pt-BR" ? "Ver intro" : "Watch intro"}
                  </button>
                ) : null}
                {!hasEntryVideoFinished ? (
                  <button type="button" onClick={startCardLoopVideo}>{t("skipIntro")}</button>
                ) : null}
                <button type="button" onClick={() => void toggleArenaFullscreen()}>{isArenaFullscreen ? t("exit") : t("full")}</button>
              </div>
            </nav>
          </div>
          <div ref={languageMenuRef} className={`language-switcher ${isLanguageMenuOpen ? "is-open" : ""}`}>
            <button
              type="button"
              className="language-trigger"
              aria-haspopup="listbox"
              aria-expanded={isLanguageMenuOpen}
              aria-label={t("language")}
              onClick={() => {
                setIsArenaNavOpen(false);
                setIsLanguageMenuOpen((value) => !value);
              }}
            >
              <span className="language-flag" aria-hidden="true">{currentLocale.flag}</span>
              <span className="language-current-name">{currentLocale.label}</span>
              <ChevronDown className="language-chevron" aria-hidden="true" />
            </button>
            {isLanguageMenuOpen ? (
              <div className="language-menu" role="listbox" aria-label={t("language")}>
                {TOUCHLINE_SUPPORTED_LOCALES.map((locale) => {
                  const isComplete = isTouchLineLocaleComplete(locale.code);
                  const isSelected = locale.code === siteLanguage;
                  return (
                    <button
                      key={locale.code}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={!isComplete}
                      className={isSelected ? "is-selected" : ""}
                      onClick={() => {
                        writeTouchLineLocalePreference(locale.code);
                        setSiteLanguage(locale.code);
                        setIsLanguageMenuOpen(false);
                      }}
                    >
                      <span className="language-option-flag" aria-hidden="true">{locale.flag}</span>
                      <span className="language-option-copy">
                        <strong>{locale.label}</strong>
                        {!isComplete ? <small>{t("comingSoon")}</small> : null}
                      </span>
                      {isSelected ? <Check className="language-option-check" aria-hidden="true" /> : <span className="language-option-code">{locale.shortLabel}</span>}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </header>

        {standalonePanel === "live" ? <aside
          className={`arena-live-dock ${isLiveDockOpen ? "is-open" : "is-collapsed"}`}
          aria-label={t("live")}
          data-testid="arena-live-dock"
        >
          {isLiveDockOpen ? (
            <div className="arena-live-dock-panel">
              <div className="arena-live-dock-head">
                <span className="arena-live-dock-title">
                  <Radio aria-hidden="true" />
                  <span>
                    <strong>{t("live")}</strong>
                    <small>{PUBLIC_DATA_SOURCE_LABEL} · {visibleLiveFixtures.length}</small>
                  </span>
                </span>
                <a
                  className="arena-live-dock-close"
                  aria-label={t("backToArena")}
                  title={t("backToArena")}
                  href={`/arena?skipIntro=1&lang=${encodeURIComponent(siteLanguage)}`}
                >
                  <X aria-hidden="true" />
                </a>
              </div>
              <div className="arena-live-dock-list">
                {visibleLiveFixtures.map((fixture) => {
                  const match = buildFixtureClubMatches([fixture])[0];
                  const fixtureState = fixtureHasScore(fixture)
                    ? displayFixtureStatus(fixture.status || t("live"), t("nextMatchShort"))
                    : displayFixtureStatus(formatFixtureScore(fixture), t("nextMatchShort"));
                  return (
                    <button
                      key={fixture.id}
                      type="button"
                      className={[
                        effectiveSelectedLiveFixtureId === fixture.id ? "is-active" : "",
                        pendingLiveFixtureId === fixture.id ? "is-pending" : "",
                      ].filter(Boolean).join(" ")}
                      aria-pressed={effectiveSelectedLiveFixtureId === fixture.id}
                      aria-busy={pendingLiveFixtureId === fixture.id}
                      title={fixtureLabel(fixture)}
                      onClick={() => selectLiveFixture(fixture.id)}
                    >
                      {match ? (
                        <>
                          <span className="arena-live-dock-club">
                            <span className="arena-live-dock-badge" style={clubSymbolStyle(match.home)}>
                              {match.home.logoUrl ? <img src={liveOptimizedClubLogoUrl(match.home.logoUrl) ?? match.home.logoUrl} alt="" draggable={false} /> : <span>{match.home.shortCode}</span>}
                            </span>
                            <strong>{match.home.shortCode}</strong>
                          </span>
                          <span className="arena-live-dock-score">
                            <strong>{match.centerLabel}</strong>
                            <small>{fixtureState}</small>
                          </span>
                          <span className="arena-live-dock-club">
                            <span className="arena-live-dock-badge" style={clubSymbolStyle(match.away)}>
                              {match.away.logoUrl ? <img src={liveOptimizedClubLogoUrl(match.away.logoUrl) ?? match.away.logoUrl} alt="" draggable={false} /> : <span>{match.away.shortCode}</span>}
                            </span>
                            <strong>{match.away.shortCode}</strong>
                          </span>
                        </>
                      ) : (
                        <span className="arena-live-dock-fallback">
                          <strong>{fixtureLabel(fixture)}</strong>
                          <small>{fixtureState}</small>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedLiveFixture ? (
                <section
                  className="arena-live-match-center"
                  aria-busy={!isLiveLineupVisuallyReady}
                  aria-label={siteLanguage === "pt-BR" ? "Central da partida" : "Match centre"}
                  data-live-products-ready={isLiveLineupVisuallyReady ? "true" : "false"}
                >
                  <span className="arena-live-match-kicker">{siteLanguage === "pt-BR" ? "Central da partida" : "Match centre"}</span>
                  <div className="arena-live-match-score">
                    <i className="arena-live-score-sweep" aria-hidden="true" />
                    <em className={`arena-live-score-live${selectedLiveFixtureIsLive ? " is-live" : ""}`}>{selectedLiveBoardBadge}</em>
                    <span className="arena-live-match-team">
                      {selectedLiveMatch?.home.logoUrl ? <img src={liveOptimizedClubLogoUrl(selectedLiveMatch.home.logoUrl) ?? selectedLiveMatch.home.logoUrl} alt="" draggable={false} /> : null}
                      <strong>{selectedLiveMatch?.home.name ?? selectedLiveFixture.homeTeam?.name ?? "Home"}</strong>
                    </span>
                    <b className="arena-live-score-centre">
                      <span>{fixtureBoardScore(selectedLiveFixture)}</span>
                      <small>{fixtureBoardClock(selectedLiveFixture, siteLanguage)}</small>
                    </b>
                    <span className="arena-live-match-team">
                      {selectedLiveMatch?.away.logoUrl ? <img src={liveOptimizedClubLogoUrl(selectedLiveMatch.away.logoUrl) ?? selectedLiveMatch.away.logoUrl} alt="" draggable={false} /> : null}
                      <strong>{selectedLiveMatch?.away.name ?? selectedLiveFixture.awayTeam?.name ?? "Away"}</strong>
                    </span>
                  </div>
                  <div className="arena-live-stadium">
                    <TouchlinePitchSurface className="arena-live-visualizer" ariaLabel={siteLanguage === "pt-BR" ? "Visualização do jogo" : "Match visualisation"}>
                      <div
                        ref={liveSimulationRef}
                        className={`arena-live-card-simulation ${isLiveLineupVisuallyReady ? "is-lineup-ready" : "is-lineup-loading"}`}
                        aria-busy={!isLiveLineupVisuallyReady}
                        aria-label={siteLanguage === "pt-BR" ? "Simulação dos 22 cards dos clubes em movimento" : "Moving simulation of both clubs' 22 cards"}
                      >
                        {liveSimulationCards.map(({ player, readinessId, side, slotIndex }) => (
                          <LiveSimulationPlayerCard
                            key={`live-simulation-${readinessId}`}
                            cardLabels={cardLabels}
                            labelPrefix={siteLanguage === "pt-BR" ? "Ampliar card de" : "Open card for"}
                            onOpen={openLiveSimulationCard}
                            player={player}
                            readinessId={readinessId}
                            side={side}
                            siteLanguage={siteLanguage}
                            slotIndex={slotIndex}
                          />
                        ))}
                        {!isLiveLineupVisuallyReady ? (
                          <span className="arena-live-lineup-status">{siteLanguage === "pt-BR" ? "Preparando transmissão…" : "Preparing broadcast…"}</span>
                        ) : null}
                      </div>
                      <span className="arena-live-ball" aria-hidden="true" />
                    </TouchlinePitchSurface>
                    <div
                      ref={liveCoachCardsRef}
                      className="arena-live-technical-area"
                      aria-label={siteLanguage === "pt-BR" ? "Áreas técnicas dos treinadores" : "Coaches technical areas"}
                    >
                      {selectedLiveHomeClub && selectedLiveHomeCoachSlot ? (
                        <div
                          className="arena-live-coach-card is-home"
                          data-live-coach-card="home"
                          role="button"
                          tabIndex={0}
                          aria-label={`${siteLanguage === "pt-BR" ? "Ampliar card do treinador" : "Open coach card for"} ${selectedLiveHomeCoachIdentity?.coach.displayName ?? selectedLiveHomeClub.name}`}
                          onClick={() => {
                            setSelectedLiveSimulationCardId(null);
                            setSelectedLiveCoachSide("home");
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            setSelectedLiveSimulationCardId(null);
                            setSelectedLiveCoachSide("home");
                          }}
                        >
                          <StableLiveCoachCard
                            className="arena-live-coach-card-art"
                            coach={selectedLiveHomeCoachIdentity?.coach ?? null}
                            slot={selectedLiveHomeCoachSlot}
                            clubName={selectedLiveHomeClub.name}
                            clubLogoUrl={liveOptimizedClubLogoUrl(selectedLiveHomeClub.logoUrl) ?? selectedLiveHomeClub.logoUrl}
                            clubAccent={selectedLiveHomeClub.accent}
                            countryCode3={selectedLiveHomeCoachIdentity?.countryCode3 ?? "N/A"}
                            locale={siteLanguage}
                            displayMode="compact"
                            layoutOverride={TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT}
                            optimizeForLiveCompact
                            enableInteractiveNeon={false}
                          />
                          <span className="arena-live-coach-copy">
                            <span>{siteLanguage === "pt-BR" ? "Treinador da casa" : "Home coach"}</span>
                            <strong>{selectedLiveHomeCoachIdentity?.coach.displayName ?? (siteLanguage === "pt-BR" ? "Aguardando treinador" : "Awaiting coach")}</strong>
                            <small>{selectedLiveHomeClub.name}</small>
                          </span>
                        </div>
                      ) : null}
                      <b>{siteLanguage === "pt-BR" ? "ÁREA TÉCNICA" : "TECHNICAL AREA"}</b>
                      {selectedLiveAwayClub && selectedLiveAwayCoachSlot ? (
                        <div
                          className="arena-live-coach-card is-away"
                          data-live-coach-card="away"
                          role="button"
                          tabIndex={0}
                          aria-label={`${siteLanguage === "pt-BR" ? "Ampliar card do treinador" : "Open coach card for"} ${selectedLiveAwayCoachIdentity?.coach.displayName ?? selectedLiveAwayClub.name}`}
                          onClick={() => {
                            setSelectedLiveSimulationCardId(null);
                            setSelectedLiveCoachSide("away");
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            setSelectedLiveSimulationCardId(null);
                            setSelectedLiveCoachSide("away");
                          }}
                        >
                          <StableLiveCoachCard
                            className="arena-live-coach-card-art"
                            coach={selectedLiveAwayCoachIdentity?.coach ?? null}
                            slot={selectedLiveAwayCoachSlot}
                            clubName={selectedLiveAwayClub.name}
                            clubLogoUrl={liveOptimizedClubLogoUrl(selectedLiveAwayClub.logoUrl) ?? selectedLiveAwayClub.logoUrl}
                            clubAccent={selectedLiveAwayClub.accent}
                            countryCode3={selectedLiveAwayCoachIdentity?.countryCode3 ?? "N/A"}
                            locale={siteLanguage}
                            displayMode="compact"
                            layoutOverride={TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT}
                            optimizeForLiveCompact
                            enableInteractiveNeon={false}
                          />
                          <span className="arena-live-coach-copy">
                            <span>{siteLanguage === "pt-BR" ? "Treinador visitante" : "Away coach"}</span>
                            <strong>{selectedLiveAwayCoachIdentity?.coach.displayName ?? (siteLanguage === "pt-BR" ? "Aguardando treinador" : "Awaiting coach")}</strong>
                            <small>{selectedLiveAwayClub.name}</small>
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <a
                      className="arena-live-pitch-credit"
                      href="https://www.freepik.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Designed by dgim-studio / Freepik
                    </a>
                  </div>
                  <div className="arena-live-match-tabs" aria-label={siteLanguage === "pt-BR" ? "Dados da partida" : "Match data"}>
                    <span className="is-active">{siteLanguage === "pt-BR" ? "Resumo" : "Summary"}</span>
                    <span>{siteLanguage === "pt-BR" ? "Estatísticas" : "Statistics"}</span>
                    <span>{siteLanguage === "pt-BR" ? "Escalações" : "Line-ups"}</span>
                  </div>
                  <p>{siteLanguage === "pt-BR" ? "Eventos, estatísticas e escalações oficiais serão exibidos aqui assim que forem verificados pela TouchLine." : "Official events, statistics and line-ups appear here as soon as TouchLine verifies them."}</p>
                  <small>{PUBLIC_DATA_SOURCE_LABEL} · {selectedLiveFixture.status || (siteLanguage === "pt-BR" ? "Sincronizando" : "Syncing")}</small>
                </section>
              ) : (
                <p className="arena-live-select-hint">{siteLanguage === "pt-BR" ? "Selecione um jogo para abrir a central da partida." : "Select a match to open its match centre."}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="arena-live-dock-trigger"
              aria-label={t("live")}
              title={t("live")}
              onClick={() => updateLiveDockVisibility(true)}
            >
              <Radio aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
          )}
        </aside> : null}

        {isQuickSubstitutionOpen && isQuickSubstitutionConfirmationOpen && selectedBench && replacementTarget ? (
          <div
            className="arena-quick-sub-confirmation"
            role="presentation"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) cancelQuickSubstitutionConfirmation();
            }}
          >
            <section
              className="arena-quick-sub-confirmation-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="arena-quick-sub-confirmation-title"
            >
              <header>
                <span>{siteLanguage === "pt-BR" ? "SUBSTITUIÇÃO" : "SUBSTITUTION"}</span>
                <h2 id="arena-quick-sub-confirmation-title">
                  {siteLanguage === "pt-BR" ? "Confirmar a troca?" : "Confirm the change?"}
                </h2>
                <button type="button" onClick={cancelQuickSubstitutionConfirmation} aria-label={siteLanguage === "pt-BR" ? "Cancelar substituição" : "Cancel substitution"}>
                  <X aria-hidden="true" />
                </button>
              </header>
              <div className="arena-quick-sub-confirmation-cards">
                <article className="is-outgoing">
                  <small>{siteLanguage === "pt-BR" ? "SAI" : "OFF"}</small>
                  <span aria-hidden="true">
                    <TouchlineEliteExactCard
                      player={arenaCardToPlayer(replacementTarget, isDemoLineup ? touchlineDemoTierForPlayer(replacementTarget.id, replacementTarget.name) : undefined)}
                      layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                      labels={cardLabels}
                      rankingMode={isDemoLineup ? "preview" : "live"}
                      showProfileAction={false}
                      showSocialMetrics={false}
                      enableInteractiveNeon
                      optimizeForLiveCompact
                      allowVisualInventoryPreview={isDemoLineup}
                    />
                  </span>
                  <strong>{replacementTarget.name}</strong>
                </article>
                <TouchlineSubstitutionMark className="arena-quick-sub-confirmation-arrow" />
                <article className="is-incoming">
                  <small>{siteLanguage === "pt-BR" ? "ENTRA" : "ON"}</small>
                  <span aria-hidden="true">
                    <TouchlineEliteExactCard
                      player={benchOptionToPreviewCard(selectedBench, isDemoLineup ? touchlineDemoTierForPlayer(selectedBench.id, selectedBench.name) : undefined)}
                      layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                      labels={cardLabels}
                      rankingMode={isDemoLineup ? "preview" : "live"}
                      showProfileAction={false}
                      showSocialMetrics={false}
                      enableInteractiveNeon
                      allowVisualInventoryPreview={isDemoLineup}
                    />
                  </span>
                  <strong>{selectedBench.name}</strong>
                </article>
              </div>
              <p>{siteLanguage === "pt-BR" ? "O jogador que sair não poderá voltar nesta partida." : "The player leaving the pitch cannot return in this match."}</p>
              <footer>
                <button type="button" className="is-cancel" onClick={cancelQuickSubstitutionConfirmation}>
                  {siteLanguage === "pt-BR" ? "Cancelar" : "Cancel"}
                </button>
                <button type="button" className="is-confirm" onClick={confirmBenchSwap}>
                  <Check aria-hidden="true" />
                  {siteLanguage === "pt-BR" ? "Confirmar substituição" : "Confirm substitution"}
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        {standalonePanel !== "live" && isQuickSubstitutionOpen ? (
          <section
            className={`arena-quick-sub-rail${isQuickSubRailClosing ? " is-closing" : ""}`}
            aria-label={siteLanguage === "pt-BR" ? "Substituição rápida" : "Quick substitution"}
            data-quick-substitution-rail="true"
          >
            {standaloneQuickSubstitutionSessionState !== "ready" ? (
              <div className="arena-quick-sub-readiness" role="status" aria-live="polite">
                <strong>{siteLanguage === "pt-BR" ? "ESCALAÇÃO AINDA NÃO ESTÁ PRONTA" : "MATCHDAY SQUAD NOT READY"}</strong>
                <span>
                  {standaloneQuickSubstitutionReadiness.starterCount}/{TOUCHLINE_SQUAD_RULES.starters} {siteLanguage === "pt-BR" ? "titulares" : "starters"}
                  {" · "}
                  {standaloneQuickSubstitutionReadiness.benchCount}/{TOUCHLINE_SQUAD_RULES.bench} {siteLanguage === "pt-BR" ? "reservas" : "bench"}
                </span>
                <button type="button" onClick={closeArenaPanel}>
                  {siteLanguage === "pt-BR" ? "Voltar aos placares" : "Back to scores"}
                </button>
              </div>
            ) : (
              <>
                <div className="arena-quick-sub-rail-head">
                  <span>{siteLanguage === "pt-BR" ? "SUBSTITUIÇÃO RÁPIDA" : "QUICK SUBSTITUTION"}</span>
                  <strong>{selectedBench ? (siteLanguage === "pt-BR" ? "Agora selecione quem sai no campo" : "Now select the player leaving the field") : (siteLanguage === "pt-BR" ? "Escolha um reserva" : "Choose a substitute")}</strong>
                  <button type="button" onClick={closeArenaPanel} aria-label={siteLanguage === "pt-BR" ? "Fechar substituição" : "Close substitution"}>
                    <X aria-hidden="true" />
                  </button>
                </div>
                <div className="arena-quick-sub-rail-cards" aria-label={siteLanguage === "pt-BR" ? "Banco de nove reservas" : "Nine-player substitute bench"}>
                  {quickSubstitutionInteractiveBench.map((bench) => {
                    const isSlotLocked = Boolean(replacementTarget && !canBenchReplaceTarget(bench, replacementTarget));
                    const isFormationLocked = isBenchFormationLocked(bench, quickSubstitutionInteractivePlayers, selectedFormationKey, replacementTarget);
                    const isLocked = isSlotLocked || isFormationLocked;
                    return (
                      <button
                        key={bench.id}
                        type="button"
                        className={`arena-quick-sub-card${selectedBench?.id === bench.id ? " is-selected" : ""}${isLocked ? " is-locked" : ""}`}
                        aria-pressed={selectedBench?.id === bench.id}
                        aria-disabled={isLocked}
                        draggable={!isLocked}
                        onDragStart={(event) => {
                          if (isLocked) return event.preventDefault();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/touchline-bench-id", bench.id);
                          setDraggingBenchId(bench.id);
                        }}
                        onDragEnd={() => setDraggingBenchId(null)}
                        onPointerDown={(event) => {
                          if (isLocked) return;
                          handleQuickSubPointerDown(event, bench);
                        }}
                        onPointerMove={handleQuickSubPointerMove}
                        onPointerUp={handleQuickSubPointerUp}
                        onPointerCancel={() => clearQuickSubPointerDrag()}
                        onClick={() => {
                          if (isLocked) return;
                          if (suppressQuickSubClickRef.current === bench.id) {
                            suppressQuickSubClickRef.current = null;
                            return;
                          }
                          prepareBenchReplacement(bench);
                        }}
                      >
                        <span className="arena-quick-sub-card-art" aria-hidden="true">
                          <TouchlineEliteExactCard
                            player={benchOptionToPreviewCard(bench, isDemoLineup ? touchlineDemoTierForPlayer(bench.id, bench.name) : undefined)}
                            layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                            labels={cardLabels}
                            rankingMode={isDemoLineup ? "preview" : "live"}
                            showProfileAction={false}
                            showSocialMetrics={false}
                            forceNeonActive={selectedBench?.id === bench.id}
                            allowVisualInventoryPreview={isDemoLineup}
                          />
                        </span>
                        <span>{bench.shortName}</span>
                    </button>
                  );
                })}
                  <button
                    type="button"
                    className="arena-quick-sub-coach"
                    aria-label={`${siteLanguage === "pt-BR" ? "Treinador" : "Coach"}: ${coachSlot.coach?.displayName ?? t("verifiedCoachPending")}`}
                    onClick={() => setIsCoachSpotlightOpen(true)}
                  >
                    <span aria-hidden="true">
                      <TouchlineCoachCard
                        coach={coachSlot.coach}
                        slot={coachSlot}
                        clubName={arenaCoachClubName}
                        clubLogoUrl={arenaCoachClubLogoUrl}
                        clubAccent={arenaCoachClubAccent}
                        countryCode3={arenaCoachCountryCode3}
                        formation={selectedFormationKey}
                        locale={siteLanguage}
                        displayMode="compact"
                        enableInteractiveNeon
                      />
                    </span>
                    <b>{siteLanguage === "pt-BR" ? "TREINADOR" : "COACH"}</b>
                  </button>
                </div>
                {quickSubstitutionSubstitutedOutPlayers.length ? (
                  <div className="arena-quick-sub-out" aria-label={siteLanguage === "pt-BR" ? "Jogadores que saíram da partida" : "Players substituted out"}>
                    <span>{siteLanguage === "pt-BR" ? "SAÍRAM DA PARTIDA" : "SUBSTITUTED OUT"}</span>
                    <ul>
                      {quickSubstitutionSubstitutedOutPlayers.map((player) => (
                        <li key={player.id} data-substitution-status="substituted-out" aria-label={siteLanguage === "pt-BR" ? `${player.name} saiu da partida e não pode voltar` : `${player.name} has left the match and cannot re-enter`}>
                          {player.shortName}
                        </li>
                      ))}
                    </ul>
                    <small>{siteLanguage === "pt-BR" ? "Não podem voltar nesta partida" : "Cannot return in this match"}</small>
                  </div>
                ) : null}
                {selectedBench && replacementTarget ? (
                  <button
                    type="button"
                    className="arena-quick-sub-confirm"
                    onClick={() => requestQuickSubstitutionConfirmation(selectedBench, replacementTarget)}
                    disabled={selectedBenchFormationLocked || !canSelectedBenchReplaceTarget}
                  >
                    <Check aria-hidden="true" />
                    {siteLanguage === "pt-BR" ? `Confirmar: ${selectedBench.shortName} entra` : `Confirm: ${selectedBench.shortName} comes on`}
                  </button>
                ) : null}
              </>
            )}
          </section>
        ) : standalonePanel !== "live" && visibleClubMatches.length ? (
          <section className="club-symbol-carousel" aria-label="TouchLine England" data-testid="arena-club-symbol-carousel">
            <div className="club-symbol-open">
              <a className="club-symbol-kicker" href={`/live?lang=${encodeURIComponent(siteLanguage)}`}>
                <strong>England</strong>
                <small>League</small>
              </a>
              <button
                type="button"
                className="club-symbol-arrow club-symbol-arrow-previous"
                aria-label={siteLanguage === "pt-BR" ? "Jogo anterior da rodada" : "Previous round match"}
                onClick={() => cycleCarouselFixture(-1)}
              >
                ‹
              </button>
              <span
                className="club-symbol-mask"
                onTouchStart={(event) => {
                  carouselTouchStartXRef.current = event.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  const startX = carouselTouchStartXRef.current;
                  const endX = event.changedTouches[0]?.clientX;
                  carouselTouchStartXRef.current = null;
                  if (startX === null || endX === undefined) return;
                  const distance = endX - startX;
                  if (Math.abs(distance) < 32) return;
                  cycleCarouselFixture(distance > 0 ? -1 : 1);
                }}
              >
                <span className={`club-symbol-stream${visibleClubMatches.length <= 1 ? " is-static" : ""}`}>
                  {clubMatchLoop.map((match, index) => (
                    <a
                      key={`${match.id}-${index}`}
                      href={`/live?fixture=${encodeURIComponent(match.fixtureId)}&lang=${encodeURIComponent(siteLanguage)}`}
                      className="club-symbol-pill"
                      aria-hidden={index >= visibleClubMatches.length}
                      tabIndex={index >= visibleClubMatches.length ? -1 : undefined}
                      aria-current={index < visibleClubMatches.length && match.fixtureId === effectiveSelectedLiveFixtureId ? "true" : undefined}
                      onFocus={() => selectCarouselFixture(match.fixtureId)}
                    >
                      <span className="club-symbol-fixture-logos" aria-hidden="true">
                        <span className="club-symbol-icon" style={clubSymbolStyle(match.home)}>
                          {match.home.logoUrl ? <img src={liveOptimizedClubLogoUrl(match.home.logoUrl) ?? match.home.logoUrl} alt="" draggable={false} /> : <span>{match.home.shortCode}</span>}
                        </span>
                        <b>{match.centerLabel}</b>
                        <span className="club-symbol-icon" style={clubSymbolStyle(match.away)}>
                          {match.away.logoUrl ? <img src={liveOptimizedClubLogoUrl(match.away.logoUrl) ?? match.away.logoUrl} alt="" draggable={false} /> : <span>{match.away.shortCode}</span>}
                        </span>
                      </span>
                      <span className="club-symbol-copy">
                        <strong>{match.home.shortCode} vs {match.away.shortCode}</strong>
                        <small>{displayFixtureStatus(match.status, t("nextMatchShort"))}</small>
                      </span>
                    </a>
                  ))}
                </span>
              </span>
              <button
                type="button"
                className="club-symbol-arrow club-symbol-arrow-next"
                aria-label={siteLanguage === "pt-BR" ? "Próximo jogo da rodada" : "Next round match"}
                onClick={() => cycleCarouselFixture(1)}
              >
                ›
              </button>
              {effectiveSelectedLiveFixtureId ? (
                <a
                  className="club-symbol-match-centre"
                  href={`/live?fixture=${encodeURIComponent(effectiveSelectedLiveFixtureId)}&lang=${encodeURIComponent(siteLanguage)}`}
                  data-testid="arena-open-match-centre"
                  aria-label={siteLanguage === "pt-BR" ? "Abrir Match Centre" : "Open Match Centre"}
                >
                  <span>{siteLanguage === "pt-BR" ? "Abrir Match Centre" : "Open Match Centre"}</span>
                  <b>→</b>
                </a>
              ) : null}
            </div>
          </section>
        ) : standalonePanel !== "live" ? (
          <section className="club-symbol-carousel club-symbol-carousel-empty" aria-label={siteLanguage === "pt-BR" ? "Placares da rodada" : "Round scores"} data-testid="arena-score-rail-empty">
            <div className="club-symbol-open club-symbol-open-empty">
              <span className="club-symbol-kicker" aria-hidden="true">
                <strong>England</strong>
                <small>League</small>
              </span>
              <strong>{siteLanguage === "pt-BR" ? "PLACARES PREMIUM" : "PREMIUM SCORES"}</strong>
              <span>{siteLanguage === "pt-BR" ? "Aguardando placares verificados da rodada" : "Awaiting verified round scores"}</span>
              <a href={`/live?lang=${encodeURIComponent(siteLanguage)}`}>{siteLanguage === "pt-BR" ? "Abrir Live" : "Open Live"}</a>
            </div>
          </section>
        ) : null}

        {selectedLiveSimulationCard ? (
          <section className="arena-player-spotlight arena-live-card-spotlight" aria-label={`${siteLanguage === "pt-BR" ? "Card ampliado de" : "Expanded card for"} ${selectedLiveSimulationCard.name}`}>
            <div
              className="arena-player-spotlight-backdrop"
              aria-hidden="true"
              onClick={() => setSelectedLiveSimulationCardId(null)}
            />
            <div
              className="arena-player-spotlight-panel arena-player-spotlight-panel-with-details"
              style={{
                "--spotlight-accent": touchlineCardTierPalette(
                  selectedLiveSimulationPreviewCard?.cardTier ?? "ruby-red",
                ).accent,
              } as CSSProperties}
            >
              <button
                type="button"
                className="arena-player-spotlight-close"
                aria-label={t("closePreview")}
                onClick={() => setSelectedLiveSimulationCardId(null)}
              >
                <X aria-hidden="true" size={18} />
              </button>
              <div className="arena-player-spotlight-product">
                <div
                  className="arena-live-expanded-card"
                  role="button"
                  tabIndex={0}
                  aria-label={siteLanguage === "pt-BR" ? "Fechar card ampliado" : "Close expanded card"}
                  onClick={() => setSelectedLiveSimulationCardId(null)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedLiveSimulationCardId(null);
                  }}
                >
                  {selectedLiveSimulationPreviewCard ? (
                    <TouchlineEliteExactCard
                      className="arena-player-spotlight-card"
                      player={{
                        ...selectedLiveSimulationPreviewCard,
                        clubLogoUrl: liveOptimizedClubLogoUrl(selectedLiveSimulationPreviewCard.clubLogoUrl)
                          ?? selectedLiveSimulationPreviewCard.clubLogoUrl,
                      }}
                      layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                      labels={cardLabels}
                      rankingMode="preview"
                      showCardActions={false}
                      showProfileAction={false}
                      showSocialMetrics={false}
                      forceNeonActive
                      imageLoading="eager"
                      runtimeLocaleOverride={siteLanguage}
                      subscribeToRanking
                      enableInteractiveNeon={false}
                    />
                  ) : null}
                </div>
                <div className="arena-player-spotlight-meta">
                  <strong>{selectedLiveSimulationCard.clubName}</strong>
                  <span>{siteLanguage === "pt-BR" ? "Simulação ao vivo" : "Live simulation"}</span>
                </div>
              </div>
              {selectedLiveSimulationZoomDetails ? <TouchlineCardZoomDetailsPanel details={selectedLiveSimulationZoomDetails} /> : null}
            </div>
          </section>
        ) : null}

        {selectedLiveCoachData ? (
          <section
            className="arena-coach-spotlight arena-live-card-spotlight arena-live-coach-spotlight"
            aria-label={`${siteLanguage === "pt-BR" ? "Card ampliado do treinador" : "Expanded coach card for"} ${selectedLiveCoachData.coach?.displayName ?? selectedLiveCoachData.club.name}`}
          >
            <div
              className="arena-player-spotlight-backdrop"
              aria-hidden="true"
              onClick={() => setSelectedLiveCoachSide(null)}
            />
            <div className="arena-coach-spotlight-panel arena-live-coach-spotlight-panel">
              <button
                type="button"
                className="arena-player-spotlight-close"
                aria-label={t("closePreview")}
                onClick={() => setSelectedLiveCoachSide(null)}
              >
                <X aria-hidden="true" size={18} />
              </button>
              <div
                className="arena-live-expanded-coach-card"
                role="button"
                tabIndex={0}
                aria-label={siteLanguage === "pt-BR" ? "Fechar card ampliado do treinador" : "Close expanded coach card"}
                onClick={() => setSelectedLiveCoachSide(null)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  setSelectedLiveCoachSide(null);
                }}
              >
                <TouchlineCoachCard
                  className="arena-live-coach-spotlight-card"
                  coach={selectedLiveCoachData.coach}
                  slot={selectedLiveCoachData.slot}
                  clubName={selectedLiveCoachData.club.name}
                  clubLogoUrl={liveOptimizedClubLogoUrl(selectedLiveCoachData.club.logoUrl) ?? selectedLiveCoachData.club.logoUrl}
                  clubAccent={selectedLiveCoachData.club.accent}
                  countryCode3={selectedLiveCoachData.countryCode3}
                  locale={siteLanguage}
                  forceNeonActive
                  layoutOverride={TOUCHLINE_COACH_CARD_DEFAULT_LAYOUT}
                  enableInteractiveNeon={false}
                  frameLoading="eager"
                  frameDecoding="sync"
                  frameFetchPriority="high"
                />
              </div>
              <div className="arena-live-coach-spotlight-meta">
                <span>{selectedLiveCoachData.side === "home"
                  ? (siteLanguage === "pt-BR" ? "Treinador da casa" : "Home coach")
                  : (siteLanguage === "pt-BR" ? "Treinador visitante" : "Away coach")}</span>
                <strong>{selectedLiveCoachData.club.name}</strong>
              </div>
            </div>
          </section>
        ) : null}

        {spotlightPlayer && spotlightPlayerCard ? (
          <section className="arena-player-spotlight" aria-label={t("playerProfile")}>
            <div
              className="arena-player-spotlight-backdrop"
              aria-hidden="true"
              onClick={() => {
                setSpotlightPlayerId(null);
                setSelectedPlayerId(null);
              }}
            />
            <div
              className="arena-player-spotlight-panel arena-player-spotlight-panel-with-details"
              style={{ "--spotlight-accent": spotlightPlayerTierAccent } as CSSProperties}
            >
              <button
                type="button"
                className="arena-player-spotlight-close"
                aria-label={t("closePreview")}
                onClick={() => {
                  setSpotlightPlayerId(null);
                  setSelectedPlayerId(null);
                }}
              >
                <X aria-hidden="true" size={18} />
              </button>
              <div className="arena-player-spotlight-product">
                <TouchlineEliteExactCard
                  className="arena-player-spotlight-card"
                  player={spotlightPlayerCard}
                  layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                  labels={cardLabels}
                  rankingMode={isDemoLineup ? "preview" : "live"}
                  showCardActions
                  showProfileAction
                  forceNeonActive
                  playerProfileHref={spotlightPlayerProfileHref ?? undefined}
                  imageLoading="eager"
                  allowVisualInventoryPreview
                />
                <div className="arena-player-spotlight-meta">
                  <strong>{spotlightPlayerTierLabel}</strong>
                  <span>{siteLanguage === "pt-BR" ? "Contrato · 1 temporada" : "Contract · 1 season"}</span>
                </div>
                {spotlightPlayerContractHref ? (
                  <a className="arena-player-spotlight-contract" href={spotlightPlayerContractHref}>
                    <TouchlineCoinMark size={18} />
                    <span>{siteLanguage === "pt-BR" ? "Contratar" : "Contract"}</span>
                    <strong>{spotlightPlayerCard.editorialCard
                      ? formatTouchlineEditorialCardPrice(spotlightPlayerCard.editorialCard.cardPrice, siteLanguage)
                      : marketUi.cardUnavailable}</strong>
                  </a>
                ) : null}
              </div>
              {spotlightPlayerZoomDetails ? <TouchlineCardZoomDetailsPanel details={spotlightPlayerZoomDetails} /> : null}
            </div>
          </section>
        ) : null}

        {isCoachSpotlightOpen ? (
          <section className="arena-coach-spotlight" aria-label={t("coachSlot")}>
            <div
              className="arena-player-spotlight-backdrop"
              aria-hidden="true"
              onClick={() => setIsCoachSpotlightOpen(false)}
            />
            <div className="arena-coach-spotlight-panel">
              <button type="button" className="arena-player-spotlight-close" aria-label={t("closePreview")} onClick={() => setIsCoachSpotlightOpen(false)}>
                <X aria-hidden="true" size={18} />
              </button>
              <TouchlineCoachCard
                coach={coachSlot.coach}
                slot={coachSlot}
                clubName={arenaCoachClubName}
                clubLogoUrl={arenaCoachClubLogoUrl}
                clubAccent={arenaCoachClubAccent}
                countryCode3={arenaCoachCountryCode3}
                formation={selectedFormationKey}
                locale={siteLanguage}
                forceNeonActive
                frameLoading="eager"
                frameDecoding="sync"
                frameFetchPriority="high"
              />
            </div>
          </section>
        ) : null}

        {arenaOverlayPanel ? (
          <section ref={actionLayerRef} className="arena-action-layer" aria-label="Arena action panel">
            <div className={`arena-action-panel arena-action-panel-${arenaOverlayPanel}${arenaOverlayPanel === "market" && marketSpotlightPlayer ? " has-market-spotlight" : ""}`}>
              <div className="arena-action-topline">
                <div>
                  <p>{arenaOverlayPanel === "market" ? t("touchlineMarketTransfer") : t("touchlineArenaOnline")}</p>
                  <h2>
                    {arenaOverlayPanel === "market" ? t("touchlineMarketTransfer") : null}
                    {arenaOverlayPanel === "rankings" ? t("playerCardsRanking") : null}
                    {arenaOverlayPanel === "news" ? t("newRumours") : null}
                    {arenaOverlayPanel === "watch" ? t("watchGuide") : null}
                    {arenaOverlayPanel === "formation" ? t("formation") : null}
                  </h2>
                  {arenaOverlayPanel === "market" ? (
                    <span className="arena-market-subtitle">
                      <Handshake aria-hidden="true" />
                      {marketUi.negotiationRoom} · {marketUi.officialContracts}
                    </span>
                  ) : null}
                </div>
                {standaloneExperience ? (
                  <a className="arena-market-return" href={`/arena?skipIntro=1&lang=${encodeURIComponent(siteLanguage)}`}>{t("backToArena")}</a>
                ) : (
                  <button type="button" onClick={closeArenaPanel}>{t("backToArena")}</button>
                )}
              </div>

              {arenaOverlayPanel === "market" ? (
                <div className="team-builder-bank" aria-label={t("touchlineMarketTransfer")}>
                  <span>
                    <small>{marketUi.signingBalance}</small>
                    <strong className="touchline-tc-balance"><TouchlineCoinMark size={24} /><b>{marketWalletBalanceTc}</b><em>TC</em></strong>
                  </span>
                  <span>
                    <small>{marketUi.squadTcValue}</small>
                    <strong className="touchline-card-value"><b>{rosterCardValueDisplay}</b></strong>
                  </span>
                  <span>
                    <small>{marketUi.activeContracts}</small>
                    <strong>{authoritativeOwnedSquadCount}/{TOUCHLINE_SQUAD_RULES.contracted}</strong>
                  </span>
                  <span>
                    <small>{marketUi.contractSlots}</small>
                    <strong>{openContractSlots}</strong>
                  </span>
                  <span>
                    <small>{marketUi.clubPlayers}</small>
                    <strong>{marketPlayerCount}</strong>
                  </span>
                </div>
              ) : null}

              {arenaOverlayPanel === "market" && marketInventorySnapshot?.checkoutPolicy ? (
                <p className="arena-market-test-policy" role="status">
                  {marketInventorySnapshot.checkoutPolicy.notice || marketUi.launchTestNotice}
                </p>
              ) : null}

              {["market", "rankings"].includes(arenaOverlayPanel) ? (
                <nav className="arena-club-sections" aria-label={t("clubControl")}>
                  <a href={touchlineClubOwnerProfileHref(siteLanguage)}>
                    {t("profile")}
                  </a>
                  <a href={allClubsHubHref}>
                    {t("clubHub")}
                  </a>
                  <a
                    href={touchlineArenaPanelHref("bench", siteLanguage)}
                    onClick={(event) => {
                      event.preventDefault();
                      openArenaPanel("bench");
                    }}
                  >
                    {t("substitutesBench")}
                  </a>
                  {arenaOverlayPanel !== "market" ? (
                    <a href={`/market-transfer?lang=${encodeURIComponent(siteLanguage)}`}>
                      {t("marketTransfer")}
                    </a>
                  ) : null}
                  <a className={arenaOverlayPanel === "rankings" ? "is-active" : ""} href={`/touchline-tables?lang=${encodeURIComponent(siteLanguage)}`}>
                    {t("rankings")}
                  </a>
                </nav>
              ) : null}

              {activeArenaPanel === "bench" && Boolean(standalonePanel) ? (
                standaloneQuickSubstitutionSessionState && standaloneQuickSubstitutionSessionState !== "ready" ? (
                  <section
                    className="arena-standalone-bench-readiness"
                    role="status"
                    aria-live="polite"
                    aria-busy={standaloneQuickSubstitutionSessionState === "loading" || standaloneQuickSubstitutionSessionState === "session-loading"}
                    data-quick-substitution-readiness={standaloneQuickSubstitutionSessionState}
                  >
                    <span>
                      {standaloneQuickSubstitutionSessionState === "loading"
                        ? standaloneQuickSubstitutionCopy.loadingEyebrow
                        : standaloneQuickSubstitutionSessionState === "identity-required"
                          ? standaloneQuickSubstitutionCopy.identityEyebrow
                          : standaloneQuickSubstitutionSessionState === "setup-required"
                            ? standaloneQuickSubstitutionCopy.setupEyebrow
                            : standaloneQuickSubstitutionCopy.sessionEyebrow}
                    </span>
                    <h2>
                      {standaloneQuickSubstitutionSessionState === "loading"
                        ? standaloneQuickSubstitutionCopy.loadingTitle
                        : standaloneQuickSubstitutionSessionState === "identity-required"
                          ? standaloneQuickSubstitutionCopy.identityTitle
                          : standaloneQuickSubstitutionSessionState === "setup-required"
                            ? standaloneQuickSubstitutionCopy.setupTitle
                            : standaloneQuickSubstitutionCopy.sessionTitle}
                    </h2>
                    <p>
                      {standaloneQuickSubstitutionSessionState === "loading"
                        ? standaloneQuickSubstitutionCopy.loadingMessage
                        : standaloneQuickSubstitutionSessionState === "identity-required"
                          ? standaloneQuickSubstitutionCopy.identityMessage
                          : standaloneQuickSubstitutionSessionState === "setup-required"
                            ? standaloneQuickSubstitutionCopy.setupMessage
                            : standaloneQuickSubstitutionCopy.sessionMessage}
                    </p>
                    <div className="arena-standalone-bench-readiness-counts" aria-label={siteLanguage === "pt-BR" ? "Progresso da escalação" : "Team sheet progress"}>
                      <strong>
                        <b>{standaloneQuickSubstitutionReadiness?.starterCount ?? players.length}</b>/{TOUCHLINE_SQUAD_RULES.starters}
                        <small>{standaloneQuickSubstitutionCopy.starters}</small>
                      </strong>
                      <strong>
                        <b>{standaloneQuickSubstitutionReadiness?.benchCount ?? matchdayBenchPlayers.length}</b>/{TOUCHLINE_SQUAD_RULES.bench}
                        <small>{standaloneQuickSubstitutionCopy.bench}</small>
                      </strong>
                    </div>
                    {standaloneQuickSubstitutionSessionState === "setup-required" ? (
                      <div className="arena-standalone-bench-readiness-actions">
                        <a className="is-primary" href={`/market-transfer?lang=${encodeURIComponent(siteLanguage)}`}>
                          {standaloneQuickSubstitutionCopy.openMarket}
                        </a>
                        <a href={touchlineClubOwnerProfileHref(siteLanguage)}>
                          {standaloneQuickSubstitutionCopy.returnClub}
                        </a>
                      </div>
                    ) : null}
                  </section>
                ) : (
                <div className="arena-bench-board">
                  <div ref={benchListShellRef} className="bench-list-shell">
                    <div className="bench-roster-summary" aria-label={t("clubControl")}>
                      <span>
                        <small>{t("squad")}</small>
                        <strong>{ownedSquadCount}/{TOUCHLINE_SQUAD_RULES.contracted}</strong>
                      </span>
                      <span>
                        <small>{t("matchday")}</small>
                        <strong>{players.length + matchdayBenchPlayers.length}/{TOUCHLINE_SQUAD_RULES.matchday}</strong>
                      </span>
                      <span>
                        <small>{t("gameBench")}</small>
                        <strong>{matchdayBenchPlayers.length}/{TOUCHLINE_SQUAD_RULES.bench}</strong>
                      </span>
                      <span>
                        <small>{t("squadTcValue")}</small>
                        <strong>{rosterCardValueDisplay}</strong>
                      </span>
                      <span>
                        <small>{t("walletBalance")}</small>
                        <strong>{marketWalletBalanceTc} TC</strong>
                      </span>
                      <span>
                        <small>{t("touchlinePoints")}</small>
                        <strong>{rosterPointsTotal}</strong>
                      </span>
                    </div>
                    <div className="bench-rule-stack" aria-label="TouchLine Arena squad rules">
                      <span>
                        <small>{t("squadRule")}</small>
                        <strong>{TOUCHLINE_SQUAD_RULES.goalkeepers} {t("gkRequired")}</strong>
                      </span>
                      <span>
                        <small>{t("matchRule")}</small>
                        <strong>1 {t("gkBenchMinimum")}</strong>
                      </span>
                      <span>
                        <small>{t("subLimit")}</small>
                        <strong>{TOUCHLINE_SQUAD_RULES.substitutions} {t("changes")}</strong>
                      </span>
                    </div>
                    <section className="training-center-board" aria-label={t("startingXi")}>
                      <div className="substitution-flow" aria-label={siteLanguage === "pt-BR" ? "Fluxo rápido de substituição" : "Quick substitution flow"}>
                        <span className={selectedBench ? "is-done" : "is-current"}><b>1</b>{siteLanguage === "pt-BR" ? "Escolha ou arraste o reserva" : "Choose or drag the substitute"}</span>
                        <span className={replacementTarget ? "is-done" : selectedBench ? "is-current" : ""}><b>2</b>{siteLanguage === "pt-BR" ? "Selecione quem sai" : "Select who leaves"}</span>
                        <span className={replacementTarget && selectedBench ? "is-current" : ""}><b>3</b>{siteLanguage === "pt-BR" ? "Confirme" : "Confirm"}</span>
                      </div>
                      <div className="training-center-head">
                        <span>{t("startingXi")}</span>
                        <button type="button" className={`training-center-coach${coachSlot.coach ? " has-coach" : ""}`} aria-label={t("coachSlot")} onClick={() => setIsCoachSpotlightOpen(true)}>
                          <span className="training-center-coach-card" aria-hidden="true">
                            <TouchlineCoachCard
                              coach={coachSlot.coach}
                              slot={coachSlot}
                              clubName={arenaCoachClubName}
                              clubLogoUrl={arenaCoachClubLogoUrl}
                              clubAccent={arenaCoachClubAccent}
                              countryCode3={arenaCoachCountryCode3}
                              formation={selectedFormationKey}
                              locale={siteLanguage}
                            />
                          </span>
                          <span>
                            <small>{t("coach")}</small>
                            <strong>{coachSlot.coach?.displayName ?? t("verifiedCoachPending")}</strong>
                          </span>
                          {coachSlot.status === "awaiting-match-evidence" ? <em>{t("coachMatchEvidencePending")}</em> : null}
                        </button>
                        <strong title={ARENA_FORMATION_POSITION_RULES[selectedFormationKey]}>{selectedFormationKey}</strong>
                      </div>
                      <TouchlinePitchSurface className="training-center-pitch" ariaLabel={t("startingXi")}>
                        {quickSubstitutionInteractivePlayers.map((player) => {
                          const slot = trainingCenterSlots.get(player.id) ?? { x: 50, y: 50 };
                          const isReplacementTarget = replacementTargetId === player.id;
                          return (
                            <button
                              key={player.id}
                              type="button"
                              className={`training-center-player${isReplacementTarget ? " is-target" : ""}`}
                              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                              onClick={() => handleFieldPlayerClick(player)}
                              data-substitution-target-id={player.id}
                              onDragOver={(event) => {
                                if (!draggingBenchId) return;
                                event.preventDefault();
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                handleBenchDrop(player, event.dataTransfer.getData("text/touchline-bench-id") || draggingBenchId || "");
                              }}
                              aria-label={`${t("out")}: ${player.name}`}
                              aria-pressed={isReplacementTarget}
                            >
                              <span className="training-center-player-card" aria-hidden="true">
                                <TouchlineEliteExactCard
                                  className="training-center-rendered-card"
                                  player={arenaCardToPlayer(player, isDemoLineup ? touchlineDemoTierForPlayer(player.id, player.name) : undefined)}
                                  layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
                                  labels={cardLabels}
                                  rankingMode={isDemoLineup ? "preview" : "live"}
                                  showProfileAction={false}
                                  showSocialMetrics={false}
                                  /* Field cards are already-owned, frozen
                                     contract inventory. This opt-in renders
                                     only their approved visual tier. */
                                  allowVisualInventoryPreview
                                />
                              </span>
                              <strong>{player.shortName}</strong>
                            </button>
                          );
                        })}
                      </TouchlinePitchSurface>
                    </section>
                    <div className="bench-group-title">
                      <span>{t("selectedBench")}</span>
                      <strong>{replacementTarget ? `${positionGroupLabel(arenaPositionGroup(replacementTarget.card?.position, replacementTarget.role), t)}: ${t("slotSelected")}` : t("selectPitchCard")}</strong>
                    </div>
                    <div className="bench-list" aria-label="TouchLine matchday substitute deck">
                    {quickSubstitutionInteractiveBench.map((bench) => {
                      const isFormationLocked = isBenchFormationLocked(bench, quickSubstitutionInteractivePlayers, selectedFormationKey, replacementTarget);
                      const isSlotLocked = Boolean(replacementTarget && !canBenchReplaceTarget(bench, replacementTarget));
                      const isLocked = isFormationLocked || isSlotLocked;
                      return (
                      <button
                        key={bench.id}
                        type="button"
                        draggable={!isLocked}
                        className={`${selectedBench?.id === bench.id ? "is-active" : ""} ${isLocked ? "is-formation-locked" : ""}`}
                        onDragStart={(event) => {
                          if (isLocked) return event.preventDefault();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/touchline-bench-id", bench.id);
                          setDraggingBenchId(bench.id);
                        }}
                        onDragEnd={() => setDraggingBenchId(null)}
                        onClick={() => {
                          prepareBenchReplacement(bench);
                          if (isSlotLocked) {
                            setSaveStatus(`${bench.shortName} ${t("locked")}: ${t("choosePosition")} ${positionGroupLabel(arenaPositionGroup(replacementTarget?.card?.position, replacementTarget?.role), t)}`);
                          } else {
                            setSaveStatus(isFormationLocked ? `${bench.shortName} ${t("lockedByFormation")} ${selectedFormationKey}` : `${bench.shortName} ${t("selectedFromBench")}`);
                          }
                        }}
                      >
                        <span className={`bench-status bench-status-${bench.status}`}>{isLocked ? t("locked") : benchStatusLabel(bench.status, t)}</span>
                        <span className="bench-player-card bench-player-card-real" aria-hidden="true">
                          <TouchlineEliteExactCard className="bench-rendered-card" player={benchOptionToPreviewCard(bench, isDemoLineup ? touchlineDemoTierForPlayer(bench.id, bench.name) : undefined)} layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} labels={cardLabels} rankingMode={isDemoLineup ? "preview" : "live"} showProfileAction={false} showSocialMetrics={false} allowVisualInventoryPreview />
                        </span>
                        <span className="bench-card-copy">
                          <strong>{bench.shortName}</strong>
                          <small>{bench.position} / {arenaShirtNumberLabel(bench.shirtNumber)} / {bench.club}</small>
                          <em>{isSlotLocked ? `${t("needsPosition")} ${positionGroupLabel(arenaPositionGroup(replacementTarget?.card?.position, replacementTarget?.role), t)}` : isFormationLocked ? `${selectedFormationKey}: ${t("slotFull")}` : benchImpactLabel(bench.impact, t)}</em>
                        </span>
                      </button>
                      );
                    })}
                    </div>
                    {isQuickSubstitutionSessionActive && quickSubstitutionSubstitutedOutPlayers.length ? (
                      <section className="quick-substitution-substituted-out" aria-label={siteLanguage === "pt-BR" ? "Jogadores que saíram da partida" : "Players substituted out"}>
                        <div className="bench-group-title">
                          <span>{siteLanguage === "pt-BR" ? "SAÍRAM DA PARTIDA" : "SUBSTITUTED OUT"}</span>
                          <strong>{siteLanguage === "pt-BR" ? "Não podem voltar" : "Cannot re-enter"}</strong>
                        </div>
                        <ul>
                          {quickSubstitutionSubstitutedOutPlayers.map((player) => (
                            <li
                              key={player.id}
                              data-substitution-status="substituted-out"
                              aria-label={siteLanguage === "pt-BR"
                                ? `${player.name} saiu da partida e não pode voltar`
                                : `${player.name} has left the match and cannot re-enter`}
                            >
                              <span className="bench-player-card bench-player-card-real" aria-hidden="true">
                                <TouchlineEliteExactCard className="bench-rendered-card" player={benchOptionToPreviewCard(player, isDemoLineup ? touchlineDemoTierForPlayer(player.id, player.name) : undefined)} layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} labels={cardLabels} rankingMode={isDemoLineup ? "preview" : "live"} showProfileAction={false} showSocialMetrics={false} allowVisualInventoryPreview />
                              </span>
                              <span>
                                <strong>{player.shortName}</strong>
                                <small>{siteLanguage === "pt-BR" ? "Substituído — não pode voltar nesta partida" : "Substituted out — cannot return in this match"}</small>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    <div className="bench-group-title bench-group-title-vault">
                      <span>{t("reserveVault")}</span>
                      <strong>{reserveVaultPlayers.length} {t("outsideMatchSheet")}</strong>
                    </div>
                    <div className="bench-vault-list" aria-label="TouchLine reserve vault">
                      {reserveVaultPlayers.map((bench) => {
                        const isSlotLocked = Boolean(replacementTarget && !canBenchReplaceTarget(bench, replacementTarget));
                        return (
                        <button
                          key={bench.id}
                          type="button"
                          className={`${selectedBench?.id === bench.id ? "is-active" : ""} ${isSlotLocked ? "is-slot-locked" : ""}`}
                          onClick={() => {
                            setSelectedBenchId(bench.id);
                            setSaveStatus(isSlotLocked ? `${bench.shortName} ${t("invalidForSelectedSlot")}` : `${bench.shortName} ${t("outsideMatchdayBenchStatus")}`);
                          }}
                        >
                          <span className="bench-vault-lock">{isSlotLocked ? t("locked") : bench.position}</span>
                          <span className="bench-player-card bench-player-card-real bench-player-card-vault" aria-hidden="true">
                            <TouchlineEliteExactCard className="bench-rendered-card" player={benchOptionToPreviewCard(bench, isDemoLineup ? touchlineDemoTierForPlayer(bench.id, bench.name) : undefined)} layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} labels={cardLabels} rankingMode={isDemoLineup ? "preview" : "live"} showProfileAction={false} showSocialMetrics={false} allowVisualInventoryPreview />
                          </span>
                          <span className="bench-vault-copy">
                            <strong>{bench.shortName}</strong>
                            <small>{bench.club}</small>
                          </span>
                        </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bench-confirm">
                    {selectedBench ? (
                    <>
                    <span>{t("selectedForThisGame")}</span>
                    <strong>{selectedBench.name}</strong>
                    <p>{isSelectedBenchInMatchday ? t("eligibleBenchInstruction") : t("reserveVaultInstruction")}</p>
                    <div className="bench-selected-card" aria-label={`${selectedBench.name} selected card preview`}>
                      <TouchlineEliteExactCard className="bench-rendered-card" player={benchOptionToPreviewCard(selectedBench, isDemoLineup ? touchlineDemoTierForPlayer(selectedBench.id, selectedBench.name) : undefined)} layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} labels={cardLabels} rankingMode={isDemoLineup ? "preview" : "live"} allowVisualInventoryPreview />
                    </div>
                    <div className="bench-swap-preview">
                      <span>{t("in")}</span>
                      <strong>{selectedBench.shortName}</strong>
                      <small>{selectedBench.position} / {selectedBench.club}</small>
                    </div>
                    <div className="bench-swap-preview bench-swap-preview-out">
                      <span>{t("out")}</span>
                      <strong>{replacementTarget?.shortName ?? t("chooseCard")}</strong>
                      <small>{replacementTarget ? `${positionGroupLabel(arenaPositionGroup(replacementTarget.card?.position, replacementTarget.role), t)} / ${replacementTarget.card?.clubName ?? "TouchLine XI"}` : t("clickCardOnField")}</small>
                    </div>
                    {replacementTargetProfileHref ? (
                      <a className="bench-open-player-profile" href={replacementTargetProfileHref}>
                        <UserRound aria-hidden="true" />
                        <span>{t("openSelectedPlayerProfile")}</span>
                      </a>
                    ) : null}
                    {(selectedBenchFormationLocked || !canSelectedBenchReplaceTarget) && replacementTarget ? (
                      <p className="bench-rule-warning">
                        {selectedBenchFormationLocked
                          ? `${selectedBench.shortName} ${t("lockedByFormation")} ${selectedFormationKey}. ${t("useFormationForTwoStrikers").replace("{formations}", formationsWithTwoStrikers())}`
                          : `${t("needsPosition")} ${positionGroupLabel(arenaPositionGroup(replacementTarget.card?.position, replacementTarget.role), t)}; ${t("selectedCardIs")} ${positionGroupLabel(arenaPositionGroup(selectedBench.position, selectedBench.role), t)}.`}
                      </p>
                    ) : null}
                    <button type="button" onClick={confirmBenchSwap} disabled={isContractReleasePending || isMarketCheckoutPending || !replacementTarget || !isSelectedBenchInMatchday || selectedBenchFormationLocked || !canSelectedBenchReplaceTarget}>
                      <Check aria-hidden="true" />
                      <span>{t("confirmSubstitution")}</span>
                    </button>
                    {standalonePanel !== "bench" ? (
                      <>
                        <button
                          type="button"
                          className="bench-release-target-contract"
                          disabled={isContractReleasePending || isMarketCheckoutPending || !replacementTarget || !isSelectedBenchInMatchday || selectedBenchFormationLocked || !canSelectedBenchReplaceTarget}
                          onClick={() => setPendingContractReleaseTargetId((current) => current === replacementTarget?.id ? null : replacementTarget?.id ?? null)}
                        >
                          <X aria-hidden="true" />
                          <span>{t("replaceAndReleaseContract")}</span>
                        </button>
                        {replacementTarget && pendingContractReleaseTargetId === replacementTarget.id ? (
                          <div className="bench-contract-confirmation" role="alert">
                            <p>{t("contractTerminationWarning").replace("{incoming}", selectedBench.shortName).replace("{outgoing}", replacementTarget.shortName)}</p>
                            <div>
                              <button type="button" disabled={isContractReleasePending || isMarketCheckoutPending} onClick={() => setPendingContractReleaseTargetId(null)}>{t("cancelContractTermination")}</button>
                              <button type="button" disabled={isContractReleasePending || isMarketCheckoutPending} onClick={() => void replaceAndReleaseSelectedContract()}>{t("confirmContractTermination")}</button>
                            </div>
                          </div>
                        ) : null}
                        <button type="button" className="bench-release-contract" disabled={isContractReleasePending || isMarketCheckoutPending} onClick={() => void releaseSelectedBenchContract()}>
                          <X aria-hidden="true" />
                          <span>{t("releaseSelectedReserve")} · {selectedBench.shortName}</span>
                        </button>
                      </>
                    ) : null}
                    </>
                    ) : (
                      <div className="bench-contract-confirmation" role="status">
                        <strong>{marketUi.noContractSelected}</strong>
                        <p>{marketUi.emptySquadCallToAction}</p>
                      </div>
                    )}
                  </div>
                </div>
                )
              ) : null}

              {activeArenaPanel === "market" ? (
                <div className="team-builder-shell">
                  <TouchlineSquadBuilderStage
                    locale={siteLanguage}
                    formation={selectedFormationKey}
                    formationConfirmed={marketFormationConfirmed}
                    formationOptions={ARENA_FORMATIONS.filter((formation) => isFinalizedArenaFormation(formation.key)).map((formation) => formation.key)}
                    onSelectFormation={(formation) => confirmMarketFormation(formation as ArenaFormationKey)}
                    coachName={activeArenaCoachIdentity?.coach?.displayName ?? coachSlot.coach?.displayName ?? null}
                    coachProfileHref={activeArenaCoachIdentity?.coach
                      ? `/touchline-coaches/${encodeURIComponent(activeArenaCoachIdentity.coach.providerId)}?lang=${encodeURIComponent(siteLanguage)}`
                      : null}
                    coachCard={coachSlot.coach ? (
                      <TouchlineCoachCard
                        coach={coachSlot.coach}
                        slot={coachSlot}
                        clubName={arenaCoachClubName}
                        clubLogoUrl={arenaCoachClubLogoUrl}
                        clubAccent={arenaCoachClubAccent}
                        countryCode3={arenaCoachCountryCode3}
                        formation={selectedFormationKey}
                        locale={siteLanguage}
                        displayMode="compact"
                        optimizeForLiveCompact
                        enableInteractiveNeon={false}
                      />
                    ) : null}
                    starters={players.map((player) => ({
                      id: player.id,
                      name: player.name,
                      shortName: player.shortName,
                      role: player.role,
                      card: arenaCardToPlayer(player, isDemoLineup ? touchlineDemoTierForPlayer(player.id, player.name) : undefined),
                    }))}
                    bench={matchdayBenchPlayers.map((player) => ({
                      id: player.id,
                      shortName: player.shortName,
                      position: player.position,
                      card: benchOptionToPreviewCard(player, isDemoLineup ? touchlineDemoTierForPlayer(player.id, player.shortName) : undefined),
                    }))}
                    remainingSquad={reserveVaultPlayers.map((player) => ({
                      id: player.id,
                      shortName: player.shortName,
                      position: player.position,
                      card: benchOptionToPreviewCard(player, isDemoLineup ? touchlineDemoTierForPlayer(player.id, player.shortName) : undefined),
                    }))}
                    contractedCount={authoritativeOwnedSquadCount}
                    selectedRole={marketPositionFilter}
                    onSelectRole={(role) => {
                      setMarketPositionFilter(role);
                      setMarketPositionBucketFilter("all");
                      setMarketNeedsOnly(false);
                      window.requestAnimationFrame(() => {
                        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                        marketSelectionRef.current?.scrollIntoView({
                          behavior: reduceMotion ? "auto" : "smooth",
                          block: "start",
                        });
                      });
                    }}
                  />

                  <div className={`team-builder-cart-dock ${marketCartPlayers.length ? "has-items" : "is-empty"}`} aria-label={t("marketCart")}>
                    <div className="team-builder-cart-title">
                      <TouchlineSelectedPlayersMark className="team-builder-selected-mark" size={28} />
                      <span>
                        <small>{t("marketCart")}</small>
                        <strong>{marketCartPlayers.length || 0}</strong>
                      </span>
                    </div>
                    <div className="team-builder-cart-items">
                      {marketCartPlayers.length ? marketCartPlayers.map((player) => (
                        <button key={builderPlayerSquadContractId(player)} type="button" onClick={() => toggleBuilderPlayerInCart(player)} title={t("removeFromCart")}>
                          <span>{player.shortName}</span>
                          <strong>{builderPlayerCommercialPrice(player, marketUi.cardUnavailable)}</strong>
                          <X aria-hidden="true" />
                        </button>
                      )) : (
                        <span className="team-builder-cart-empty">{t("cartEmpty")}</span>
                      )}
                    </div>
                    <div className="team-builder-cart-totals">
                      <span>
                        <small>{t("cartTotal")}</small>
                        <strong className="touchline-tc-total"><TouchlineCoinMark size={15} />{marketCartQuote.totalTc} TC</strong>
                      </span>
                      <span>
                        <small>{marketCartPlayers.length ? t("balanceAfter") : marketUi.currentBalance}</small>
                        <strong className="touchline-tc-total"><TouchlineCoinMark size={15} />{marketCartQuote.balanceAfterTc} TC</strong>
                      </span>
                    </div>
                    <button type="button" className="team-builder-cart-checkout" onClick={() => setIsMarketCheckoutConfirmationOpen(true)} disabled={!marketCartQuote.valid || isMarketCheckoutPending || isContractReleasePending}>
                      <Check aria-hidden="true" />
                      <span>{marketUi.reviewContract}</span>
                    </button>
                  </div>

                  {isMarketCheckoutConfirmationOpen ? (
                    <div className="team-builder-confirm-layer" role="presentation" onMouseDown={(event) => {
                      if (event.currentTarget === event.target) setIsMarketCheckoutConfirmationOpen(false);
                    }}>
                      <section className="team-builder-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="market-confirm-title">
                        <button type="button" className="team-builder-confirm-close" onClick={() => setIsMarketCheckoutConfirmationOpen(false)} aria-label={marketUi.cancel}>
                          <X aria-hidden="true" />
                        </button>
                        <div className="team-builder-confirm-head">
                          <TouchlineSelectedPlayersMark size={34} />
                          <span>
                            <small>{marketUi.officialContracts}</small>
                            <strong id="market-confirm-title">{marketUi.confirmSigning}</strong>
                          </span>
                        </div>
                        <div className="team-builder-confirm-players">
                          {marketCartPlayers.map((player) => (
                            <span key={builderPlayerSquadContractId(player)}>
                              <b>{player.shortName}</b>
                              <strong>{builderPlayerCommercialPrice(player, marketUi.cardUnavailable)}</strong>
                            </span>
                          ))}
                        </div>
                        <dl className="team-builder-confirm-totals">
                          <div><dt>{marketUi.selectedContracts}</dt><dd>{marketCartQuote.itemCount}</dd></div>
                          <div><dt>{marketUi.totalContractValue}</dt><dd>{marketCartQuote.totalTc} TC</dd></div>
                          <div><dt>{marketUi.balanceAfterSigning}</dt><dd>{marketCartQuote.balanceAfterTc} TC</dd></div>
                        </dl>
                        <div className="team-builder-confirm-actions">
                          <button type="button" onClick={() => setIsMarketCheckoutConfirmationOpen(false)}>{marketUi.cancel}</button>
                          <button type="button" className="is-primary" onClick={() => {
                            setIsMarketCheckoutConfirmationOpen(false);
                            void checkoutBuilderCart();
                          }} disabled={isMarketCheckoutPending || isContractReleasePending}>
                            <Check aria-hidden="true" />
                            {marketUi.confirmSigning}
                          </button>
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {pendingMarketReplacementPlayer && pendingMarketReplacementBucket ? (
                    <div className="team-builder-confirm-layer" role="presentation" onMouseDown={(event) => {
                      if (event.currentTarget === event.target) setPendingMarketReplacementPlayerId(null);
                    }}>
                      <section className="team-builder-confirm-dialog team-builder-replacement-dialog" role="dialog" aria-modal="true" aria-labelledby="market-replacement-title">
                        <button type="button" className="team-builder-confirm-close" onClick={() => setPendingMarketReplacementPlayerId(null)} aria-label={marketUi.cancel}>
                          <X aria-hidden="true" />
                        </button>
                        <div className="team-builder-confirm-head">
                          <TouchlineSelectedPlayersMark size={34} />
                          <span>
                            <small>{touchlineMarketPositionBucketLabel(pendingMarketReplacementBucket, siteLanguage)}</small>
                            <strong id="market-replacement-title">
                              {siteLanguage === "pt-BR" ? "Substituir contrato" : "Replace contract"}
                            </strong>
                          </span>
                        </div>
                        <p className="team-builder-replacement-warning">
                          {siteLanguage === "pt-BR"
                            ? `Você já atingiu ${TOUCHLINE_MARKET_POSITION_LIMITS[pendingMarketReplacementBucket]}/${TOUCHLINE_MARKET_POSITION_LIMITS[pendingMarketReplacementBucket]} nesta posição. Escolha quem sairá. O contrato será encerrado sem reembolso; ${pendingMarketReplacementPlayer.shortName} será adicionado ao carrinho para uma nova contratação.`
                            : `You already reached ${TOUCHLINE_MARKET_POSITION_LIMITS[pendingMarketReplacementBucket]}/${TOUCHLINE_MARKET_POSITION_LIMITS[pendingMarketReplacementBucket]} in this position. Choose who leaves. The contract ends without refund; ${pendingMarketReplacementPlayer.shortName} will be added to the cart as a new signing.`}
                        </p>
                        <div className="team-builder-replacement-list">
                          {marketPositionReplacementCandidates.length ? marketPositionReplacementCandidates.map((candidate) => (
                            <button
                              key={`${candidate.location}:${candidate.id}`}
                              type="button"
                              disabled={isContractReleasePending || isMarketCheckoutPending || !candidate.inventoryId}
                              onClick={() => void releaseMarketPositionContract(candidate)}
                            >
                              <span>
                                <strong>{candidate.shortName}</strong>
                                <small>{candidate.position} · {candidate.location === "field" ? (siteLanguage === "pt-BR" ? "titular" : "starting XI") : (siteLanguage === "pt-BR" ? "reserva" : "reserve")}</small>
                              </span>
                              <b>{siteLanguage === "pt-BR" ? "Encerrar e substituir" : "Release and replace"}</b>
                            </button>
                          )) : (
                            <p>{siteLanguage === "pt-BR" ? "Não foi encontrado um contrato substituível nesta posição. Atualize o elenco e tente novamente." : "No replaceable contract was found in this position. Refresh the squad and try again."}</p>
                          )}
                        </div>
                      </section>
                    </div>
                  ) : null}

                  <div className="team-builder-board" ref={marketSelectionRef}>
                    <section className="team-builder-clubs" aria-label={marketUi.ariaEnglandClubs}>
                      <div className="team-builder-section-title">
                        <div>
                          <span>{t("touchlineMarketTransfer")}</span>
                          <strong>{t("premierClubs")}</strong>
                        </div>
                      </div>
                      <div className="team-builder-club-grid" role="region" tabIndex={0} aria-label={marketUi.ariaEnglandClubs}>
                        {TEAM_BUILDER_CLUBS.map((club) => (
                          <button
                            key={club.teamId}
                            type="button"
                            className={club.teamId === selectedBuilderClub.teamId ? "is-active" : ""}
                            onClick={() => {
                              if (club.teamId === selectedBuilderClubKey) return;
                              setSelectedBuilderPlayerId(null);
                              setMarketSearch("");
                              setMarketInventorySnapshot(null);
                              setMarketInventoryMode("checking");
                              setBuilderSquad([]);
                              setBuilderSquadClubKey(null);
                              setBuilderLoadState({ status: "loading" });
                              setIsMarketCheckoutConfirmationOpen(false);
                              setSelectedBuilderClubKey(club.teamId);
                              /* The club rail is deliberately long. Pair its
                                 selection with the athlete gallery so the
                                 next squad never opens below the viewport. */
                              requestAnimationFrame(() => {
                                const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                                marketSelectionRef.current?.scrollIntoView({
                                  behavior: shouldReduceMotion ? "auto" : "smooth",
                                  block: "start",
                                });
                              });
                            }}
                          >
                            <span className="team-builder-club-logo" style={{ "--club-accent": club.accent, "--club-secondary": club.secondaryAccent } as CSSProperties}>
                              {club.logoUrl ? <img src={club.logoUrl} alt="" draggable={false} /> : club.shortCode}
                            </span>
                            <span>
                              <strong>{club.shortCode}</strong>
                              <small>{club.name}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className={`team-builder-roster ${isMarketDataRefreshing ? "is-refreshing" : ""}`} data-refresh-label={marketUi.updatingClub} aria-busy={isMarketDataRefreshing} aria-label={marketUi.clubSquadAria(selectedBuilderClub.name)}>
                      <div className="team-builder-roster-head">
                        <span className="team-builder-club-logo" style={{ "--club-accent": selectedBuilderClub.accent, "--club-secondary": selectedBuilderClub.secondaryAccent } as CSSProperties}>
                          {selectedBuilderClub.logoUrl ? <img src={selectedBuilderClub.logoUrl} alt="" draggable={false} /> : selectedBuilderClub.shortCode}
                        </span>
                        <div>
                          <span>{builderStatus}</span>
                          <strong>{selectedBuilderClub.name}</strong>
                          <small>{t("choosePlayerPremiumCard")}</small>
                        </div>
                        <a className="team-builder-club-hub" href={selectedBuilderClubHubHref}>
                          {t("clubHub")}
                        </a>
                      </div>

                      <div className="team-builder-market-tools" aria-label={t("search")}>
                        <div className="team-builder-market-search">
                          <Search aria-hidden="true" />
                          <input
                            type="search"
                            value={marketSearch}
                            onChange={(event) => setMarketSearch(event.target.value)}
                            placeholder={marketUi.searchPlaceholder}
                            aria-label={marketUi.searchPlaceholder}
                          />
                          {marketSearch ? (
                            <button type="button" onClick={() => setMarketSearch("")} aria-label={marketUi.ariaClearSearch}>
                              <X aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                        <div className="team-builder-position-filters" aria-label={marketUi.ariaPositionFilters}>
                          <button
                            type="button"
                            className={effectiveMarketPositionBucketFilter === "all" && marketPositionFilter === "all" ? "is-active" : ""}
                            onClick={() => {
                              setMarketPositionFilter("all");
                              setMarketPositionBucketFilter("all");
                              setMarketNeedsOnly(false);
                            }}
                            disabled={!marketFormationConfirmed}
                          >
                            <span>{marketUi.filterAll}</span>
                            <small>{authoritativeOwnedSquadCount}/35</small>
                          </button>
                          {TOUCHLINE_MARKET_POSITION_SEQUENCE.map((bucket) => {
                            const count = marketPositionCounts[bucket] ?? 0;
                            const limit = TOUCHLINE_MARKET_POSITION_LIMITS[bucket];
                            const label = touchlineMarketPositionBucketLabel(bucket, siteLanguage).split(" / ")[0];
                            return (
                              <button
                                key={bucket}
                                type="button"
                                className={`${effectiveMarketPositionBucketFilter === bucket ? "is-active" : ""}${count >= limit ? " is-full" : ""}`}
                                onClick={() => {
                                  setMarketPositionFilter("all");
                                  setMarketPositionBucketFilter(bucket);
                                  setMarketNeedsOnly(false);
                                }}
                                disabled={!marketFormationConfirmed}
                                aria-label={`${label}: ${count} de ${limit}`}
                              >
                                <span>{label}</span>
                                <small>{count}/{limit}</small>
                              </button>
                            );
                          })}
                        </div>
                        <label className="team-builder-market-sort">
                          <ArrowUpDown aria-hidden="true" />
                          <select value={marketSortMode} onChange={(event) => setMarketSortMode(event.target.value as TouchlineMarketSortMode)} aria-label={marketUi.ariaSortMarketCards}>
                            <option value="recommended">{marketUi.sortRecommended}</option>
                            <option value="price-asc">{marketUi.sortPriceLow}</option>
                            <option value="price-desc">{marketUi.sortPriceHigh}</option>
                            <option value="tier-desc">{marketUi.sortTierHigh}</option>
                            <option value="name">{marketUi.sortAlphabetical}</option>
                          </select>
                        </label>
                      </div>

                      <div className="team-builder-market-results-head">
                        <span><i aria-hidden="true" /> {marketUi.liveMarket}</span>
                        <strong>{marketUi.cardsFound(visibleMarketPlayers.length)}</strong>
                      </div>

                      <div className="team-builder-player-list">
                        {visibleMarketPlayers.length ? visibleMarketPlayers.map((player) => {
                          const fieldId = stableBuilderPlayerId(player);
                          const isInField = players.some((arenaPlayer) => matchesBuilderPlayer(arenaPlayer, player));
                          const isInSquad = benchPlayers.some((bench) => matchesBuilderBenchPlayer(bench, player))
                            || player.inventoryAlreadyOwned === true;
                          const soldCopies = player.inventorySoldCopies ?? (isInField || isInSquad ? 1 : 0);
                          const supplyLimit = player.inventorySupplyLimit ?? TOUCHLINE_MARKET_CARD_SUPPLY_PER_PLAYER;
                          const availableCopies = player.inventoryAvailableCopies ?? Math.max(0, supplyLimit - soldCopies);
                          const isInCart = marketCartContractIds.has(builderPlayerSquadContractId(player));
                          const isSoldOut = availableCopies <= 0 && !isInField && !isInSquad;
                          const positionBucket = touchlineMarketPositionBucket(player.position, player.role);
                          const positionLabel = touchlineMarketPositionBucketLabel(positionBucket, siteLanguage);
                          const positionLimit = TOUCHLINE_MARKET_POSITION_LIMITS[positionBucket];
                          const positionCount = marketPositionCounts[positionBucket] ?? 0;
                          const isPositionLimitReached = !isInCart && !isInField && !isInSquad && positionCount >= positionLimit;
                          const isInventoryUnavailable = Boolean(
                            positionBucket === "outfield"
                            || !player.inventoryId
                            || !builderPlayerHasPublishedCard(player),
                          );
                          const replacementAlreadyStaged = isContractRosterFull
                            && marketCartPlayers.length >= 1
                            && !isInCart;
                          const palette = isInventoryUnavailable
                            ? { accent: "#7ae7ff", secondary: "#16343d" }
                            : touchlineCardTierPalette(player.cardTier);
                          const isSelectedMarketPlayer = selectedBuilderPlayerId === fieldId;
                          const marketCard = builderPlayerToPreviewCard(player, { allowInventoryVisualPreview: true });
                          return (
                            <article
                              key={fieldId}
                              className={`${isInField || isInSquad ? "is-in-field" : ""} ${isInCart ? "is-in-cart" : ""} ${isSelectedMarketPlayer ? "is-selected" : ""} ${isInventoryUnavailable ? "is-market-pending" : ""} ${isPositionLimitReached ? "is-position-locked" : ""}`}
                              style={{ "--market-card-accent": palette.accent, "--market-card-secondary": palette.secondary } as CSSProperties}
                            >
                              <button
                                type="button"
                                className="team-builder-player-select"
                                onClick={() => {
                                  setSelectedBuilderPlayerId(fieldId);
                                  setMarketSpotlightPlayerId(fieldId);
                                }}
                                aria-pressed={isSelectedMarketPlayer}
                                aria-label={`${siteLanguage === "pt-BR" ? "Abrir card de" : "Open card for"} ${player.name}`}
                              >
                                <span className="team-builder-gallery-card" aria-hidden="true">
                                  <StableMarketPreviewCard
                                    player={marketCard}
                                    runtimeLocaleOverride={siteLanguage}
                                    rankingMode="preview"
                                    subscribeToRanking={false}
                                    enableInteractiveNeon={false}
                                    showCardActions={false}
                                  showProfileAction={false}
                                  showSocialMetrics={false}
                                  /* Keep the rendered 430×691 card inside its
                                     deliberately smaller Market gallery slot. */
                                  staticRenderScale={0.56}
                                  allowVisualInventoryPreview
                                  />
                                </span>
                                <span className="team-builder-gallery-caption">
                                  <strong>{player.name}</strong>
                                  <small>{positionLabel}{player.shirtNumber ? ` · #${player.shirtNumber}` : ""}</small>
                                  <em className={isPositionLimitReached ? "team-builder-position-cap is-full" : "team-builder-position-cap"}>{marketUi.positionRosterCount(positionCount, positionLimit)}</em>
                                </span>
                              </button>
                              <button
                                type="button"
                                className="team-builder-card-sign"
                                onClick={() => {
                                  setSelectedBuilderPlayerId(fieldId);
                                  isPositionLimitReached ? openMarketPositionReplacement(player) : toggleBuilderPlayerInCart(player);
                                }}
                                disabled={isInventoryUnavailable || isMarketDataRefreshing || isSoldOut || !marketFormationConfirmed || (replacementAlreadyStaged && !isInField && !isInSquad) || (isMarketCartAtCapacity && !isInCart && !isInField && !isInSquad)}
                              >
                                {isInField
                                  ? t("openOnPitch")
                                  : isInSquad
                                    ? t("openSquad")
                                    : isInCart
                                      ? t("removeFromCart")
                                      : isPositionLimitReached
                                        ? (siteLanguage === "pt-BR" ? "Substituir no elenco" : "Replace in squad")
                                        : isInventoryUnavailable
                                          ? marketUi.cardUnavailable
                                          : isSoldOut
                                            ? t("soldOut")
                                            : `${t("addToCart")} · ${builderPlayerCommercialPrice(player, marketUi.cardUnavailable)}`}
                              </button>
                            </article>
                          );
                        }) : (
                          <div className="team-builder-empty">
                            {marketSearch ? `${t("noSignal")} · ${marketSearch}` : builderStatus}
                          </div>
                        )}
                      </div>
                    </section>

                  </div>
                </div>
              ) : null}

              {marketSpotlightPlayer && marketSpotlightCard ? (
                <section
                  className="arena-player-spotlight team-builder-card-spotlight"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${siteLanguage === "pt-BR" ? "Card ampliado de" : "Expanded card for"} ${marketSpotlightPlayer.name}`}
                >
                  <div className="arena-player-spotlight-backdrop" aria-hidden="true" onClick={() => setMarketSpotlightPlayerId(null)} />
                  <div className="arena-player-spotlight-panel arena-player-spotlight-panel-with-details" style={{ "--spotlight-accent": touchlineCardTierPalette(marketSpotlightCard.cardTier ?? "ruby-red").accent } as CSSProperties}>
                    <button type="button" className="arena-player-spotlight-close" aria-label={t("closePreview")} autoFocus onClick={() => setMarketSpotlightPlayerId(null)}><X aria-hidden="true" size={18} /></button>
                    <div className="arena-player-spotlight-product">
                      <TouchlineEliteExactCard
                        className="arena-player-spotlight-card"
                        player={marketSpotlightCard}
                        labels={cardLabels}
                        rankingMode="preview"
                        showCardActions={false}
                        showProfileAction={false}
                        showSocialMetrics={false}
                        forceNeonActive
                        imageLoading="eager"
                        runtimeLocaleOverride={siteLanguage}
                        subscribeToRanking={false}
                        enableInteractiveNeon={false}
                        allowVisualInventoryPreview
                      />
                      <div className="arena-player-spotlight-meta"><strong>{marketSpotlightPlayer.clubName}</strong><span>{siteLanguage === "pt-BR" ? "Card de contratação" : "Signing card"}</span></div>
                    </div>
                    {marketSpotlightZoomDetails ? <TouchlineCardZoomDetailsPanel details={marketSpotlightZoomDetails} /> : null}
                  </div>
                </section>
              ) : null}

              {activeArenaPanel === "rankings" ? (
                <div className="arena-card-ranking-panel" aria-label="TouchLine Player Cards Ranking">
                  <div className="arena-ranking-hero">
                    <div>
                      <span>{t("touchlineTables")}</span>
                      <strong>{t("clubOwnersAndCards")}</strong>
                      <small>{t("rankingsDescription")}</small>
                    </div>
                    <div className="arena-ranking-hero-links">
                      <a href={`/touchline-tables?lang=${encodeURIComponent(siteLanguage)}`}>{t("openTables")}</a>
                      <a href={`/touchline-player-card-rankings?lang=${encodeURIComponent(siteLanguage)}`}>{t("cardRanking")}</a>
                    </div>
                  </div>
                  <section className="arena-owner-table" aria-label="TouchLine Club Owner table">
                    <div className="arena-ranking-section-head">
                      <span>{t("cardClubOwnerRank")}</span>
                      <small>{t("top20OwnerValue")}</small>
                    </div>
                    <div className="arena-owner-table-list">
                      {clubOwnerStandings.map((owner) => {
                        const row = (
                          <>
                          <span>#{owner.rank}</span>
                          <strong>{owner.name}</strong>
                          <small>{owner.countryCode3} / {owner.squadCount} cards</small>
                          <b>{owner.touchlinePoints.toLocaleString(siteLanguage)} pts</b>
                          <em>{formatTouchlineCommercialCardTotal({ numericPrice: owner.squadValueTc, competition: "england" })}</em>
                          </>
                        );
                        return owner.profileHref ? (
                          <a key={owner.id} href={`${owner.profileHref}?lang=${encodeURIComponent(siteLanguage)}`} className="arena-owner-row">{row}</a>
                        ) : (
                          <div key={owner.id} className="arena-owner-row is-demo" aria-disabled="true">{row}</div>
                        );
                      })}
                    </div>
                  </section>
                  <div className="arena-ranking-section-head">
                    <span>{t("playerCardsRanking")}</span>
                    <small>{t("topCardsDescription")}</small>
                  </div>
                  <div className="arena-ranking-featured">
                    {topPlayerCardRankings.slice(0, 3).map((card, index) => {
                      const cardPrice = squadCardPriceLabel(card, siteLanguage);
                      return (
                        <article key={card.id}>
                          <span className="arena-ranking-position">#{index + 1}</span>
                          <TouchlineEliteExactCard className="arena-ranking-card-render" player={squadCardToExactPlayer(card)} layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY} labels={cardLabels} />
                          <div>
                            <strong>{card.shortName}</strong>
                            <small>{[card.clubName, cardPrice, `${card.touchlinePoints} pts`].filter(Boolean).join(" / ")}</small>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="arena-ranking-list">
                    {topPlayerCardRankings.map((card, index) => {
                      const club = findTouchLineClub(card.clubName);
                      const cardPrice = squadCardPriceLabel(card, siteLanguage);
                      return (
                        <a key={card.id} href={`/touchline-player-card-rankings?lang=${encodeURIComponent(siteLanguage)}#row-${card.id}`} className="arena-ranking-row">
                          <span>#{index + 1}</span>
                          <strong>{card.shortName}</strong>
                          <small>{card.position} / {club?.shortCode ?? card.clubName}</small>
                          <b>{card.touchlinePoints} pts</b>
                          {cardPrice ? <em>{cardPrice}</em> : null}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {activeArenaPanel === "news" ? (
                <div className="rumour-board" aria-label="TouchLine England New Rumours">
                  <div className="rumour-toolbar">
                    <label>
                      <span>{t("club")}</span>
                      <select value={rumourClubKey} onChange={(event) => setRumourClubKey(event.target.value)}>
                        <option value="all">{t("allClubs")}</option>
                        <option value="favorites">{t("favorites")}</option>
                        {TEAM_BUILDER_CLUBS.map((club) => (
                          <option key={club.teamId} value={club.teamId}>{club.shortCode} / {club.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t("search")}</span>
                      <input value={rumourSearch} onChange={(event) => setRumourSearch(event.target.value)} placeholder={t("searchPlaceholder")} />
                    </label>
                    <div className="rumour-sort" aria-label="Sort New Rumours">
                      <button type="button" className={rumourSortMode === "recent" ? "is-active" : ""} onClick={() => setRumourSortMode("recent")}>{t("recent")}</button>
                      <button type="button" className={rumourSortMode === "relevance" ? "is-active" : ""} onClick={() => setRumourSortMode("relevance")}>{t("relevance")}</button>
                    </div>
                  </div>

                  <div className="rumour-status-row">
                    <span>{PUBLIC_DATA_SOURCE_LABEL}</span>
                    <strong>{rumourStatus}</strong>
                    {rumourError ? <small>{rumourError}</small> : null}
                  </div>

                  {visibleRumourSignals.length ? (
                    <div className="rumour-list">
                      {visibleRumourSignals.map((signal) => {
                        const isFavorite = favoriteRumourIds.includes(signal.id);
                        const isOwned = isSignalLinkedToArenaCards(signal, players);
                        return (
                          <article key={signal.id} className={`rumour-card rumour-card-${signal.status}`}>
                            <div className="rumour-card-topline">
                              <span>{rumourTypeLabel(signal.type)}</span>
                              <button type="button" aria-pressed={isFavorite} onClick={() => toggleFavoriteRumour(signal.id, setFavoriteRumourIds)}>
                                {isFavorite ? t("saved") : t("save")}
                              </button>
                            </div>
                            <strong>{signal.title}</strong>
                            <p>{signal.summary}</p>
                            <div className="rumour-meta">
                              <span>{signal.club ?? "TouchLine England"}</span>
                              <span>{signal.player ?? t("squadUpdate")}</span>
                              <span>{signal.minute ? `${signal.minute}'` : rumourStatusLabel(signal.status)}</span>
                              <span>{signal.confidence}%</span>
                              {isOwned ? <span className="is-owned-card">{t("yourCard")}</span> : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rumour-empty">
                      <span>{t("noSignal")}</span>
                      <strong>{t("noSignalsNow")}</strong>
                      <p>{t("signalsDescription")}</p>
                    </div>
                  )}
                </div>
              ) : null}

              {activeArenaPanel === "watch" ? (
                <div className="arena-premium-grid">
                  <article>
                    <span>{t("broadcasters")}</span>
                    <strong>{t("officialWaysToWatch")}</strong>
                    <p>{t("watchAvailability")}</p>
                  </article>
                  <article>
                    <span>{t("fixture")}</span>
                    <strong>{t("kickoffAndChannel")}</strong>
                    <p>{t("fixtureDescription")}</p>
                  </article>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {isEditorOpen ? (
          <section className="field-editor-panel" aria-label="Formation editor">
            {selectedPlayer ? (
              <>
                <div className="editor-heading">
                  <span>{t("formation")} {selectedFormation.label}</span>
                  <strong>{selectedPlayer.shortName}</strong>
                </div>

                <div className="formation-presets" aria-label="Choose formation">
                  {ARENA_FORMATIONS.map((formation) => {
                    const isAvailable = isFinalizedArenaFormation(formation.key);
                    return (
                      <button
                        key={formation.key}
                        type="button"
                        className={`${formation.key === selectedFormationKey ? "is-active" : ""}${isAvailable ? "" : " is-coming-soon"}`}
                        disabled={!isAvailable}
                        aria-label={isAvailable ? formation.label : `${formation.label} · ${t("comingSoon")}`}
                        onClick={() => changeFormation(formation.key)}
                      >
                        <strong>{formation.label}</strong>
                        {!isAvailable ? <small>{t("comingSoon")}</small> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="formation-lock-note">
                  <span>{isSelectedFormationFinalized ? t("formationFinalized") : lockedFormationKeys.includes(selectedFormationKey) ? t("formationLocked") : t("formationDraft")}</span>
                  <strong>{isSelectedFormationFinalized ? t("protectedAsSaved") : lockedFormationKeys.includes(selectedFormationKey) ? t("shapeSaved") : t("dragAdjustLock")}</strong>
                </div>

                <div className="formation-position-controls" aria-label="Selected card position controls">
                  <label>
                    <span>{t("xPosition")}</span>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={selectedPlayer.x}
                      disabled={isSelectedFormationFinalized}
                      onChange={(event) => updateSelectedPlayerPosition("x", Number(event.target.value))}
                    />
                    <strong>{selectedPlayer.x}</strong>
                  </label>
                  <label>
                    <span>{t("yPosition")}</span>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={selectedPlayer.y}
                      disabled={isSelectedFormationFinalized}
                      onChange={(event) => updateSelectedPlayerPosition("y", Number(event.target.value))}
                    />
                    <strong>{selectedPlayer.y}</strong>
                  </label>
                  <label>
                    <span>{t("cardSize")}</span>
                    <input
                      type="range"
                      min={ARENA_CARD_MIN_HEIGHT_VH}
                      max={ARENA_CARD_MAX_HEIGHT_VH}
                      step="0.5"
                      value={selectedPlayer.heightVh ?? ARENA_CARD_COMPACT_HEIGHT_VH}
                      disabled={isSelectedFormationFinalized}
                      onChange={(event) => updateSelectedPlayerSize(Number(event.target.value))}
                    />
                    <strong>{selectedPlayer.heightVh ?? ARENA_CARD_COMPACT_HEIGHT_VH}</strong>
                  </label>
                  <div className="formation-nudge-controls" aria-label="Fine tune card position">
                    <button type="button" disabled={isSelectedFormationFinalized} onClick={() => nudgeSelectedPlayer(0, -1)}>{t("up")}</button>
                    <button type="button" disabled={isSelectedFormationFinalized} onClick={() => nudgeSelectedPlayer(-1, 0)}>{t("left")}</button>
                    <button type="button" disabled={isSelectedFormationFinalized} onClick={() => nudgeSelectedPlayer(1, 0)}>{t("right")}</button>
                    <button type="button" disabled={isSelectedFormationFinalized} onClick={() => nudgeSelectedPlayer(0, 1)}>{t("down")}</button>
                  </div>
                </div>

                <div className="player-picker" aria-label="Select player">
                  {players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className={selectedPlayer.id === player.id ? "is-active" : ""}
                      onClick={() => setSelectedPlayerId(player.id)}
                    >
                      {player.shortName}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="editor-empty-state">
                {t("saveMarketCardFirst")}
              </div>
            )}

            <div className="editor-actions">
              <button type="button" disabled={isSelectedFormationFinalized} onClick={() => void handleSaveFormationLock()}>
                {t("lockFormation")} {selectedFormationKey}
              </button>
              <button type="button" disabled={isSelectedFormationFinalized} onClick={() => void handleUnlockCurrentCamera()}>
                {t("unlockCamera")}
              </button>
              <button type="button" onClick={handleManualSave}>
                {t("saveLineup")}
              </button>
              <span>{saveStatus === "Auto saved" ? t("autoSaved") : saveStatus === "Card data updated" ? t("cardDataUpdated") : saveStatus}</span>
              <span>{fixtureStatus === "Local data" ? t("localData") : fixtureStatus}</span>
            </div>
          </section>
        ) : null}
        </div>
        </div>
      </section>

      <style>{`
        .touchline-game {
          font-family: var(--font-sans), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .arena-stage {
          isolation: isolate;
          background:
            radial-gradient(circle at 50% 15%, rgba(36, 64, 83, .4), transparent 36%),
            linear-gradient(180deg, #03070d 0%, #020306 48%, #000 100%);
        }

        .arena-functional-layer {
          display: contents;
        }

        .arena-market-welcome {
          position: absolute;
          z-index: 900;
          inset: 0;
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: clamp(22px, 5vw, 72px);
          background:
            radial-gradient(circle at 50% 48%, rgba(181,255,75,.13), transparent 27%),
            linear-gradient(110deg, rgba(2,9,11,.91), rgba(2,15,15,.64) 49%, rgba(2,9,11,.93));
          animation: arena-market-welcome-in .55s both ease-out;
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        }

        .arena-market-welcome-rings {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }

        .arena-market-welcome-rings i {
          position: absolute;
          width: min(76vw, 720px);
          aspect-ratio: 1;
          border: 1px solid rgba(181,255,75,.15);
          border-radius: 50%;
          box-shadow: 0 0 44px rgba(181,255,75,.08), inset 0 0 34px rgba(122,231,255,.04);
          animation: arena-market-welcome-ring 4.8s ease-in-out infinite;
        }

        .arena-market-welcome-rings i:nth-child(2) {
          width: min(52vw, 500px);
          border-color: rgba(122,231,255,.18);
          animation-delay: .55s;
        }

        .arena-market-welcome-rings i:nth-child(3) {
          width: min(28vw, 270px);
          border-color: rgba(255,255,255,.13);
          animation-delay: 1.1s;
        }

        .arena-market-welcome-copy {
          position: relative;
          z-index: 1;
          display: grid;
          justify-items: center;
          max-width: 920px;
          color: #f7ffe9;
          text-align: center;
        }

        .arena-market-welcome-copy > span {
          color: #b5ff4b;
          font-size: clamp(8px, 1.1vw, 12px);
          font-weight: 1000;
          letter-spacing: .22em;
          text-transform: uppercase;
          opacity: 0;
          animation: arena-market-welcome-copy .5s .15s both ease-out;
        }

        .arena-market-welcome-copy h1 {
          max-width: 860px;
          margin: 16px 0 0;
          color: #fff;
          font-size: clamp(38px, 7vw, 100px);
          font-weight: 1000;
          letter-spacing: -.07em;
          line-height: .88;
          text-wrap: balance;
          opacity: 0;
          text-shadow: 0 12px 52px rgba(0,0,0,.55);
          animation: arena-market-welcome-title .72s .38s both cubic-bezier(.18,.84,.25,1);
        }

        .arena-market-welcome-copy h1 em {
          display: inline-block;
          color: #b5ff4b;
          font-style: italic;
          text-shadow: 0 0 26px rgba(181,255,75,.4);
        }

        .arena-market-welcome-copy p {
          margin: 24px 0 0;
          color: #d9efdd;
          font-size: clamp(16px, 2vw, 23px);
          font-weight: 700;
          opacity: 0;
          animation: arena-market-welcome-copy .55s .92s both ease-out;
        }

        .arena-market-welcome-copy strong {
          margin-top: 8px;
          color: rgba(231,247,232,.76);
          font-size: clamp(12px, 1.45vw, 16px);
          font-weight: 750;
          opacity: 0;
          animation: arena-market-welcome-copy .55s 1.2s both ease-out;
        }

        .arena-market-welcome-copy > div {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 34px;
          color: #bdf3ff;
          font-size: 11px;
          font-weight: 1000;
          letter-spacing: .1em;
          text-transform: uppercase;
          opacity: 0;
          animation: arena-market-welcome-copy .5s 2.05s both ease-out;
        }

        .arena-market-welcome-copy > div i {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #b5ff4b;
          box-shadow: 0 0 0 0 rgba(181,255,75,.7);
          animation: arena-market-welcome-pulse 1.35s infinite ease-out;
        }

        .arena-market-welcome-copy button {
          margin-top: 13px;
          border: 0;
          padding: 6px 0;
          background: transparent;
          color: rgba(255,255,255,.54);
          font: inherit;
          font-size: 10px;
          font-weight: 850;
          text-decoration: underline;
          text-underline-offset: 4px;
          cursor: pointer;
          opacity: 0;
          animation: arena-market-welcome-copy .5s 2.25s both ease-out;
        }

        .arena-market-welcome-copy button:hover,
        .arena-market-welcome-copy button:focus-visible {
          color: #fff;
          outline: none;
        }

        .arena-empty-roster-recovery {
          position: absolute;
          z-index: 108;
          top: max(92px, calc(env(safe-area-inset-top) + 84px));
          right: max(22px, env(safe-area-inset-right));
          width: min(390px, calc(100vw - 44px));
          display: grid;
          gap: 10px;
          border: 1px solid rgba(181,255,75,.42);
          border-radius: 20px;
          padding: 19px;
          color: #f4ffe2;
          background: linear-gradient(145deg, rgba(4,17,13,.94), rgba(2,8,11,.94));
          box-shadow: 0 24px 70px rgba(0,0,0,.48), inset 0 0 0 1px rgba(255,255,255,.035);
          backdrop-filter: blur(18px);
        }

        .arena-empty-roster-recovery > span {
          color: #b5ff4b;
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .15em;
        }

        .arena-empty-roster-recovery h2 {
          margin: 0;
          font-size: clamp(22px, 2.6vw, 34px);
          line-height: .98;
          letter-spacing: -.04em;
        }

        .arena-empty-roster-recovery p {
          margin: 0;
          color: rgba(239,255,234,.68);
          font-size: 11px;
          font-weight: 750;
          line-height: 1.5;
        }

        .arena-empty-roster-recovery > div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .arena-empty-roster-recovery a {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 999px;
          padding: 0 14px;
          color: rgba(255,255,255,.82);
          background: rgba(255,255,255,.04);
          font-size: 9px;
          font-weight: 950;
          text-decoration: none;
        }

        .arena-empty-roster-recovery a.is-primary {
          border-color: rgba(181,255,75,.58);
          color: #071007;
          background: #a3ff12;
          box-shadow: 0 0 24px rgba(163,255,18,.16);
        }

        .arena-empty-roster-recovery a:hover,
        .arena-empty-roster-recovery a:focus-visible {
          border-color: #d5ff8d;
          outline: none;
        }

        @keyframes arena-market-welcome-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes arena-market-welcome-copy {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes arena-market-welcome-title {
          from { opacity: 0; transform: translateY(25px) scale(.95); filter: blur(7px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        @keyframes arena-market-welcome-ring {
          0%, 100% { opacity: .32; transform: scale(.9); }
          50% { opacity: .74; transform: scale(1.06); }
        }

        @keyframes arena-market-welcome-pulse {
          to { box-shadow: 0 0 0 10px rgba(181,255,75,0); }
        }

        @media (max-width: 760px) {
          .arena-market-welcome {
            padding: 24px 18px;
          }

          .arena-market-welcome-rings i {
            width: min(128vw, 560px);
          }

          .arena-market-welcome-rings i:nth-child(2) {
            width: min(88vw, 390px);
          }

          .arena-market-welcome-rings i:nth-child(3) {
            width: min(46vw, 210px);
          }

          .arena-market-welcome-copy h1 {
            max-width: 345px;
            font-size: clamp(42px, 13vw, 59px);
          }

          .arena-market-welcome-copy > div {
            margin-top: 28px;
            font-size: 9px;
          }

          .arena-empty-roster-recovery {
            top: max(82px, calc(env(safe-area-inset-top) + 74px));
            right: max(10px, env(safe-area-inset-right));
            left: max(10px, env(safe-area-inset-left));
            width: auto;
            padding: 15px;
          }

          .arena-empty-roster-recovery > div,
          .arena-empty-roster-recovery a {
            width: 100%;
          }
        }

        /* Market gallery: the card itself is the selection affordance. The
           commercial decision stays in the single detail panel, so a club
           never becomes a wall of red list rows or duplicate buy controls. */
        .arena-action-panel-market .team-builder-player-list {
          grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
          grid-auto-rows: auto;
          gap: 12px;
          padding: 4px;
        }

        .arena-action-panel-market .team-builder-player-list > article {
          display: block;
          min-height: 0;
          overflow: visible;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(10,22,18,.92), rgba(2,8,8,.96));
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 12px 28px rgba(0,0,0,.18);
        }

        /* These are market cards, not alert rows. Their tier belongs to the
           card art; the surrounding signing surface stays TouchLine black. */
        .arena-action-panel-market .team-builder-player-list > article,
        .arena-action-panel-market .team-builder-player-list > article.is-position-locked,
        .arena-action-panel-market .team-builder-player-list > article.is-market-pending {
          border-color: rgba(181,255,75,.22);
          background: linear-gradient(180deg, rgba(10,22,18,.94), rgba(2,8,8,.98));
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), 0 12px 28px rgba(0,0,0,.18);
        }

        .arena-action-panel-market .team-builder-player-list > article:hover,
        .arena-action-panel-market .team-builder-player-list > article.is-selected {
          transform: translateY(-3px);
          border-color: rgba(181,255,75,.72);
          box-shadow: 0 17px 34px rgba(0,0,0,.3), 0 0 18px rgba(181,255,75,.1), inset 0 0 0 1px rgba(181,255,75,.13);
        }

        .arena-action-panel-market .team-builder-player-list > article.is-position-locked {
          border-color: rgba(255,211,92,.42);
          box-shadow: inset 0 0 0 1px rgba(255,211,92,.08);
        }

        .arena-action-panel-market .team-builder-player-select {
          display: grid;
          grid-template-columns: 1fr;
          grid-template-rows: auto auto;
          align-content: start;
          gap: 7px;
          width: 100%;
          min-height: 0;
          padding: 8px;
          border: 0;
          background: transparent;
          color: #fff;
          text-align: left;
          box-shadow: none;
        }

        .arena-action-panel-market .team-builder-gallery-card {
          display: block;
          width: 100%;
          aspect-ratio: 430 / 691;
          overflow: visible;
          pointer-events: none;
        }

        .arena-action-panel-market .team-builder-card-sign {
          display: flex;
          width: calc(100% - 16px);
          min-height: 38px;
          align-items: center;
          justify-content: center;
          margin: 0 8px 9px;
          border: 1px solid rgba(181,255,75,.42);
          border-radius: 10px;
          color: #edffd0;
          background: linear-gradient(135deg, rgba(181,255,75,.2), rgba(12,41,32,.8));
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: .02em;
        }
        .arena-action-panel-market .team-builder-card-sign:hover:not(:disabled) { transform: translateY(-1px); border-color: #b5ff4b; box-shadow: 0 0 18px rgba(181,255,75,.16); }
        .arena-action-panel-market .team-builder-card-sign:disabled { opacity: .45; cursor: not-allowed; }

        .arena-action-panel-market .team-builder-gallery-card > .touchline-card-surface {
          width: 100% !important;
          height: 100% !important;
          overflow: visible !important;
          transform: none !important;
        }

        .arena-action-panel-market .team-builder-gallery-caption {
          display: grid;
          gap: 3px;
          min-width: 0;
          padding: 0 3px 2px;
        }

        .arena-action-panel-market .team-builder-gallery-caption strong,
        .arena-action-panel-market .team-builder-gallery-caption small,
        .arena-action-panel-market .team-builder-gallery-caption em,
        .arena-action-panel-market .team-builder-gallery-caption b {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .arena-action-panel-market .team-builder-gallery-caption strong { font-size: 11px; line-height: 1.1; }
        .arena-action-panel-market .team-builder-gallery-caption small { color: rgba(122,231,255,.86); font-size: 8px; font-weight: 900; }
        .arena-action-panel-market .team-builder-gallery-caption em { color: rgba(181,255,75,.74); font-size: 7px; font-style: normal; font-weight: 950; }
        .arena-action-panel-market .team-builder-gallery-caption em.is-full { color: #ffd35c; }
        .arena-action-panel-market .team-builder-gallery-caption b { color: #f1ffba; font-size: 9px; font-weight: 1000; }

        @media (max-width: 760px) {
          .arena-action-panel-market .team-builder-player-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
          .arena-action-panel-market .team-builder-gallery-caption strong { font-size: 10px; }
        }

        /* Final Market Transfer gallery authority: player cards own the tier colour.
           The catalogue surface stays neutral TouchLine so a Ruby card never paints
           an entire result row red. This is deliberately last to supersede legacy
           list-layout rules retained above for non-market Arena surfaces. */
        .touchline-game.is-market-standalone .team-builder-board {
          grid-template-areas: "clubs roster";
          /* The club directory is deliberately substantial on desktop: it is
             the first decision in Market, while the remaining 70% is reserved
             for the actual player cards instead of decorative empty space. */
          grid-template-columns: minmax(270px, 30%) minmax(0, 70%);
          align-items: start;
          gap: 18px;
        }

        .touchline-game.is-market-standalone .team-builder-player-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          grid-auto-rows: auto;
          gap: 18px;
          padding: 4px;
        }

        .touchline-game.is-market-standalone .team-builder-player-list > article,
        .touchline-game.is-market-standalone .team-builder-player-list > article.is-market-pending,
        .touchline-game.is-market-standalone .team-builder-player-list > article.is-position-locked {
          min-height: 0;
          overflow: visible;
          border-color: rgba(181,255,75,.2) !important;
          background: linear-gradient(145deg, rgba(7,25,22,.98), rgba(2,10,9,.98)) !important;
          box-shadow: inset 0 1px rgba(255,255,255,.035), 0 14px 28px rgba(0,0,0,.2);
        }

        .touchline-game.is-market-standalone .team-builder-player-select {
          display: grid;
          grid-template-columns: 1fr;
          align-content: start;
          gap: 12px;
          min-height: 0;
          padding: 14px 14px 10px;
          color: #f5fff3;
          background: transparent !important;
        }

        .touchline-game.is-market-standalone .team-builder-gallery-card {
          /* The card painting is a fixed 430px canvas. Keep its host and its
             paint scale in the same ratio at every breakpoint so no frame is
             ever clipped when a narrower Market column is selected. */
          width: min(100%, 184px);
          min-height: 0;
          aspect-ratio: 430 / 691;
          --touchline-card-static-scale: .428;
          display: grid;
          place-items: center;
          overflow: visible;
          justify-self: center;
        }

        .touchline-game.is-market-standalone .team-builder-player-copy,
        .touchline-game.is-market-standalone .team-builder-listing-meta {
          display: none;
        }

        .touchline-game.is-market-standalone .team-builder-gallery-caption {
          display: grid;
          gap: 3px;
          min-width: 0;
          text-align: center;
        }

        .touchline-game.is-market-standalone .team-builder-gallery-caption strong {
          color: #f5fff3;
          font-size: 15px;
          line-height: 1.15;
        }

        .touchline-game.is-market-standalone .team-builder-gallery-caption span {
          color: #88eaff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .04em;
        }

        .touchline-game.is-market-standalone .team-builder-card-sign {
          width: calc(100% - 28px);
          min-height: 44px;
          margin: 0 14px 14px;
          border: 1px solid rgba(181,255,75,.48);
          border-radius: 11px;
          color: #efffe8;
          background: linear-gradient(100deg, rgba(43,111,19,.84), rgba(14,54,37,.94));
          font: 800 12px/1 var(--font-body, inherit);
          letter-spacing: .025em;
          cursor: pointer;
        }

        .touchline-game.is-market-standalone .team-builder-card-sign:hover:not(:disabled),
        .touchline-game.is-market-standalone .team-builder-card-sign:focus-visible {
          outline: none;
          border-color: #b5ff4b;
          box-shadow: 0 0 0 3px rgba(181,255,75,.16), 0 8px 22px rgba(54,161,27,.25);
          transform: translateY(-1px);
        }

        .touchline-game.is-market-standalone .team-builder-card-sign:disabled {
          opacity: .52;
          cursor: not-allowed;
        }

        @media (min-width: 1181px) {
          .touchline-game.is-market-standalone .team-builder-board {
            grid-template-areas: "clubs roster";
            grid-template-columns: minmax(270px, 30%) minmax(0, 70%);
          }

          .touchline-game.is-market-standalone .team-builder-player-list {
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            grid-auto-rows: auto;
          }

          .touchline-game.is-market-standalone .team-builder-player-select {
            grid-template-columns: 1fr;
            min-height: 0;
            padding: 14px 14px 10px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid button {
            min-height: 78px;
            grid-template-columns: 56px minmax(0, 1fr);
            gap: 12px;
            padding: 11px;
          }

          .touchline-game.is-market-standalone .team-builder-club-logo {
            width: 56px;
            height: 56px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid strong {
            font-size: 14px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid small {
            font-size: 10px;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .touchline-game.is-market-standalone .team-builder-board {
            grid-template-areas: "clubs clubs" "roster roster";
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }

          .touchline-game.is-market-standalone .team-builder-player-list {
            grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
          }

          .touchline-game.is-market-standalone .team-builder-gallery-card {
            width: min(100%, 215px);
            --touchline-card-static-scale: .5;
          }
        }

        @media (max-width: 760px) {
          .touchline-game.is-market-standalone .team-builder-board {
            grid-template-areas: "clubs" "roster";
            grid-template-columns: minmax(0, 1fr);
          }

          .touchline-game.is-market-standalone .team-builder-player-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .touchline-game.is-market-standalone .team-builder-gallery-card {
            width: min(100%, 170px);
            min-height: 0;
            --touchline-card-static-scale: .395;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .arena-market-welcome,
          .arena-market-welcome-rings i,
          .arena-market-welcome-copy > span,
          .arena-market-welcome-copy h1,
          .arena-market-welcome-copy p,
          .arena-market-welcome-copy strong,
          .arena-market-welcome-copy > div,
          .arena-market-welcome-copy button,
          .arena-market-welcome-copy > div i {
            animation: none;
            opacity: 1;
            transform: none;
            filter: none;
          }
        }

        /* Keep every operational Arena control out of both pointer and keyboard
           access until the ClubOwner has an official persisted coach.  The
           coach-first choice itself remains the only available interaction. */
        .arena-coach-gated-content {
          display: contents;
        }

        html.touchline-arena-mobile-fullscreen,
        body.touchline-arena-mobile-fullscreen {
          width: 100%;
          height: 100%;
          overflow: hidden;
          overscroll-behavior: none;
          background: #000;
        }

        .arena-stage.is-mobile-fullscreen-fallback {
          position: fixed !important;
          z-index: 2147483000;
          inset: 0;
          width: 100vw !important;
          width: 100dvw !important;
          height: 100vh !important;
          height: 100dvh !important;
          height: var(--touchline-available-height, 100dvh) !important;
          min-height: 0 !important;
          overflow: hidden;
          background: #000;
          overscroll-behavior: none;
          touch-action: manipulation;
        }

        .arena-video-stack {
          position: absolute;
          inset: 0;
          z-index: 1;
          overflow: hidden;
          background: #000 url("${TOUCHLINE_ARENA_VIDEO_POSTER}") center / cover no-repeat;
        }

        .arena-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center center;
          transform: translateZ(0);
          filter: saturate(1.06) contrast(1.05) brightness(1.02);
          backface-visibility: hidden;
          opacity: 1;
        }

        .arena-video {
          opacity: 0;
          transition: opacity .72s ease;
        }

        .arena-video-a {
          z-index: 1;
        }

        .arena-video-b {
          z-index: 2;
        }

        .arena-video.is-visible {
          opacity: 1;
        }

        .arena-atmosphere {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 17%, rgba(83,255,214,.1), transparent 34%),
            linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.08) 45%, rgba(0,0,0,.58));
        }

        .club-symbol-open,
        .arena-quick-dock,
        .arena-action-panel,
        .arena-start-panel,
        .field-editor-panel {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(4, 8, 16, .42);
          box-shadow: 0 22px 64px rgba(0,0,0,.36), inset 0 0 0 1px rgba(255,255,255,.04);
          backdrop-filter: blur(18px);
        }

        .game-hud {
          position: absolute;
          z-index: 220;
          top: max(12px, env(safe-area-inset-top));
          left: max(5px, env(safe-area-inset-left));
          display: flex;
          width: fit-content;
          max-width: calc(100vw - 10px);
          gap: 8px;
          align-items: start;
          pointer-events: none;
          overflow: visible;
          border: 0;
          border-radius: 0;
          padding: 0;
          background: transparent;
          box-shadow: none;
          backdrop-filter: none;
          transition: opacity .72s ease, transform .72s ease;
        }

        .arena-stage[data-entry-state="intro"] .game-hud,
        .arena-stage[data-entry-state="intro"] .arena-live-dock,
        .arena-stage[data-entry-state="intro"] .club-symbol-carousel,
        .arena-stage[data-entry-state="intro"] .arena-action-layer,
        .arena-stage[data-entry-state="intro"] .arena-player-spotlight,
        .arena-stage[data-entry-state="intro"] .arena-coach-spotlight {
          opacity: 0;
          pointer-events: none;
        }

        .arena-stage[data-entry-state="intro"] .arena-action-layer,
        .arena-stage[data-entry-state="intro"] .arena-player-spotlight,
        .arena-stage[data-entry-state="intro"] .arena-coach-spotlight {
          visibility: hidden;
        }

        .arena-stage[data-entry-state="intro"] .game-hud {
          transform: translateY(-8px);
        }

        .game-hud::before,
        .game-hud::after {
          content: none;
        }

        .game-hud::before {
          left: -42px;
          top: -34px;
          background: rgba(122,231,255,.2);
        }

        .game-hud::after {
          right: -40px;
          bottom: -36px;
          background: rgba(181,255,75,.18);
        }

        .game-hud > * {
          position: relative;
          z-index: 1;
        }

        .game-hud.is-market-hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(-18px);
        }

        .language-switcher {
          position: relative;
          z-index: 160;
          pointer-events: auto;
          width: 118px;
          flex: 0 0 118px;
        }

        .language-trigger {
          display: grid;
          width: 100%;
          min-height: 44px;
          grid-template-columns: 23px minmax(0, 1fr) 13px;
          align-items: center;
          gap: 5px;
          border: 1px solid rgba(181,255,75,.26);
          border-radius: 12px;
          padding: 5px 7px;
          color: #f7ffe5;
          background:
            linear-gradient(145deg, rgba(255,255,255,.09), rgba(255,255,255,.025)),
            rgba(2,6,13,.74);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.045);
          backdrop-filter: blur(18px);
          cursor: pointer;
        }

        .language-trigger:hover,
        .language-trigger:focus-visible,
        .language-switcher.is-open .language-trigger {
          border-color: rgba(181,255,75,.48);
          background:
            linear-gradient(145deg, rgba(181,255,75,.16), rgba(255,255,255,.035)),
            rgba(2,6,13,.78);
          outline: 0;
        }

        .language-flag,
        .language-option-flag {
          display: grid;
          place-items: center;
          font-size: 18px;
          line-height: 1;
        }

        .language-current-name {
          min-width: 0;
          overflow: hidden;
          color: rgba(255,255,255,.86);
          font-size: 9px;
          font-weight: 900;
          line-height: 1.15;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .language-chevron {
          width: 15px;
          height: 15px;
          color: #caff72;
          transition: transform .16s ease;
        }

        .language-switcher.is-open .language-chevron {
          transform: rotate(180deg);
        }

        .language-menu {
          position: absolute;
          z-index: 220;
          top: calc(100% + 8px);
          right: 0;
          display: grid;
          width: min(232px, calc(100vw - 16px));
          max-height: min(430px, calc(100dvh - 90px));
          gap: 5px;
          overflow-y: auto;
          overscroll-behavior: contain;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 16px;
          padding: 8px;
          background:
            linear-gradient(150deg, rgba(16,30,32,.9), rgba(2,6,13,.94)),
            rgba(2,6,13,.94);
          box-shadow: 0 24px 64px rgba(0,0,0,.48), inset 0 0 0 1px rgba(255,255,255,.045);
          backdrop-filter: blur(22px);
          scrollbar-color: rgba(181,255,75,.55) rgba(255,255,255,.05);
          scrollbar-width: thin;
        }

        .language-menu::-webkit-scrollbar {
          width: 7px;
        }

        .language-menu::-webkit-scrollbar-track {
          background: rgba(255,255,255,.04);
        }

        .language-menu::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(181,255,75,.55);
        }

        .language-menu > button {
          display: grid;
          min-height: 48px;
          grid-template-columns: 32px minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          border: 0;
          border-radius: 10px;
          padding: 6px 10px;
          color: rgba(255,255,255,.82);
          background: rgba(255,255,255,.055);
          text-align: left;
          cursor: pointer;
        }

        .language-menu > button:hover,
        .language-menu > button:focus-visible,
        .language-menu > button.is-selected {
          color: #f5ffd4;
          background: rgba(181,255,75,.15);
          outline: 0;
        }

        .language-menu > button:disabled {
          cursor: not-allowed;
          opacity: .52;
        }

        .language-option-copy {
          display: grid;
          min-width: 0;
          gap: 2px;
        }

        .language-option-copy strong {
          overflow: hidden;
          font-size: 10px;
          font-weight: 900;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .language-option-copy small,
        .language-option-code {
          color: rgba(255,255,255,.5);
          font-size: 8px;
          font-weight: 800;
          line-height: 1;
        }

        .language-option-check {
          width: 16px;
          height: 16px;
          color: #caff72;
        }

        .hud-actions-row {
          display: flex;
          align-items: start;
          gap: 7px;
          min-width: 0;
        }

        .hud-button,
        .field-editor-panel {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(2, 7, 14, .62);
          box-shadow: 0 18px 44px rgba(0,0,0,.35);
          backdrop-filter: blur(18px);
        }

        .hud-button {
          pointer-events: auto;
          min-height: 38px;
          border-radius: 12px;
          padding: 0 12px;
          font-size: 9px;
          font-weight: 1000;                    color: rgba(255,255,255,.78);
        }

        .hud-button-primary {
          border-color: rgba(181,255,75,.44);
          background: rgba(181,255,75,.2);
          color: #f0ff9f;
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.14), 0 18px 44px rgba(0,0,0,.35);
        }

        .hud-button-skip {
          border-color: rgba(255,255,255,.2);
          background: rgba(255,255,255,.1);
          color: white;
        }

        .arena-stage:fullscreen .game-hud,
        .arena-stage:-webkit-full-screen .game-hud {
          position: fixed;
          z-index: 2147483647;
          pointer-events: auto;
          transform: translateZ(0);
          isolation: isolate;
        }

        .arena-stage:fullscreen .hud-actions-row,
        .arena-stage:fullscreen .hud-button,
        .arena-stage:fullscreen .language-switcher,
        .arena-stage:-webkit-full-screen .hud-actions-row,
        .arena-stage:-webkit-full-screen .hud-button,
        .arena-stage:-webkit-full-screen .language-switcher {
          pointer-events: auto;
        }

        .arena-stage:fullscreen .field-editor-panel,
        .arena-stage:-webkit-full-screen .field-editor-panel {
          position: fixed;
          z-index: 2147483600;
          pointer-events: auto;
          transform: translateZ(0);
        }

        .arena-stage:fullscreen .field-player-layer,
        .arena-stage:-webkit-full-screen .field-player-layer {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          pointer-events: none;
          transform: translateZ(0);
        }

        .arena-stage:fullscreen .arena-action-layer,
        .arena-stage:-webkit-full-screen .arena-action-layer {
          position: fixed;
          z-index: 2147483500;
          pointer-events: none;
          transform: translateZ(0);
          isolation: isolate;
        }

        .arena-stage:fullscreen .arena-action-panel,
        .arena-stage:-webkit-full-screen .arena-action-panel {
          pointer-events: auto;
        }

        .arena-stage:fullscreen .arena-start-menu,
        .arena-stage:-webkit-full-screen .arena-start-menu {
          position: fixed;
          z-index: 2147483550;
          pointer-events: auto;
          transform: translateZ(0);
          isolation: isolate;
        }

        .arena-stage:fullscreen .club-symbol-carousel,
        .arena-stage:-webkit-full-screen .club-symbol-carousel {
          position: fixed;
          z-index: 2147483450;
          transform: translateZ(0);
          isolation: isolate;
        }

        .arena-stage:fullscreen .arena-coach-technical-area,
        .arena-stage:-webkit-full-screen .arena-coach-technical-area {
          position: fixed;
          z-index: 2147483200;
          transform: translate(-50%, 0) translateZ(0);
        }

        .arena-stage:fullscreen .arena-intro-replay-toggle,
        .arena-stage:-webkit-full-screen .arena-intro-replay-toggle,
        .arena-stage:fullscreen .arena-entry-skip-toggle,
        .arena-stage:-webkit-full-screen .arena-entry-skip-toggle,
        .arena-stage:fullscreen .arena-video-pause-toggle,
        .arena-stage:-webkit-full-screen .arena-video-pause-toggle,
        .arena-stage:fullscreen .arena-live-dock,
        .arena-stage:-webkit-full-screen .arena-live-dock {
          position: fixed;
          z-index: 2147483210;
        }

        .arena-stage:fullscreen .arena-field-player,
        .arena-stage:-webkit-full-screen .arena-field-player {
          pointer-events: auto;
        }

        .arena-coach-technical-area {
          position: absolute;
          z-index: 118;
          /* Technical-area anchor: alongside the reserve bench, just off the
             halfway axis and beside the fixture rail. It stays out of the
             crowd and never overlays the formation cards. */
          left: clamp(72%, calc(50% + 22vw), 78%);
          right: auto;
          top: auto;
          bottom: max(104px, calc(env(safe-area-inset-bottom) + 104px));
          /* The coach lives outside the pitch. Give it the approved 30% visual
             priority over an on-field player card without changing its art. */
          width: calc(var(--arena-coach-field-card-height, 11.2dvh) * .867);
          max-width: 88px;
          display: grid;
          justify-items: center;
          gap: 5px;
          transform: translate(-50%, 0) translateZ(0);
          transition: opacity .24s ease, transform .24s ease, filter .24s ease;
        }

        .arena-coach-technical-label {
          position: absolute;
          right: 0;
          bottom: calc(100% + 5px);
          border: 1px solid rgba(255,215,92,.28);
          border-radius: 999px;
          background: rgba(3,5,5,.76);
          padding: 4px 8px;
          color: #ffe88c;
          font-size: 6px;
          font-weight: 1000;
          letter-spacing: .08em;
          text-transform: uppercase;
          box-shadow: 0 0 12px rgba(255,207,66,.16);
        }

        .arena-coach-card-button {
          width: 100%;
          min-width: 0;
          max-width: 100%;
          border: 0;
          background: transparent;
          padding: 0;
          cursor: pointer;
        }

        .arena-coach-card-button:focus-visible {
          border-radius: 12px;
          outline: 1px solid rgba(255,215,92,.9);
          outline-offset: 5px;
        }

        .arena-coach-technical-area.is-panel-open {
          opacity: .18;
          pointer-events: none;
          transform: translate(-12%, 0);
        }

        .arena-quick-sub-rail {
          position: absolute;
          z-index: 142;
          left: max(18px, env(safe-area-inset-left));
          right: max(18px, env(safe-area-inset-right));
          bottom: max(8px, env(safe-area-inset-bottom));
          display: grid;
          gap: 7px;
          border: 1px solid rgba(181,255,75,.42);
          border-radius: 14px;
          /* Quick Sub sits over the live pitch: preserve enough separation for
             its actions, but keep the stadium and field legible behind it. */
          background: linear-gradient(180deg, rgba(2,10,9,.46), rgba(1,5,8,.58));
          padding: 7px 8px;
          box-shadow: 0 18px 48px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.06);
          backdrop-filter: blur(3px);
          pointer-events: auto;
          animation: arena-quick-sub-rail-enter .22s cubic-bezier(.2,.82,.24,1) both;
        }

        .arena-quick-sub-rail.is-closing {
          pointer-events: none;
          animation: arena-quick-sub-rail-exit .18s ease-in both;
        }

        @keyframes arena-quick-sub-rail-enter {
          from { opacity: 0; transform: translate3d(0, calc(100% + 12px), 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @keyframes arena-quick-sub-rail-exit {
          from { opacity: 1; transform: translate3d(0, 0, 0); }
          to { opacity: 0; transform: translate3d(0, calc(100% + 12px), 0); }
        }

        .arena-quick-sub-rail-head {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          padding: 0 2px;
        }

        .arena-quick-sub-rail-head > span,
        .arena-quick-sub-coach > b {
          color: #b5ff4b;
          font-size: 8px;
          font-weight: 1000;
          letter-spacing: .12em;
        }

        .arena-quick-sub-rail-head > strong {
          min-width: 0;
          overflow: hidden;
          color: rgba(255,255,255,.78);
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .arena-quick-sub-rail-head > button {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 1px solid rgba(181,255,75,.3);
          border-radius: 8px;
          background: rgba(255,255,255,.04);
          color: #efffc1;
        }

        .arena-quick-sub-rail-head > button svg { width: 16px; height: 16px; }

        .arena-quick-sub-rail-cards {
          display: grid;
          grid-template-columns: repeat(10, minmax(0, 1fr));
          gap: 6px;
          align-items: end;
        }

        .arena-quick-sub-card,
        .arena-quick-sub-coach {
          position: relative;
          display: grid;
          min-width: 0;
          min-height: 104px;
          align-items: end;
          justify-items: center;
          overflow: hidden;
          border: 1px solid rgba(181,255,75,.28);
          border-radius: 10px;
          background: radial-gradient(circle at 50% 4%, rgba(181,255,75,.11), transparent 58%), rgba(0,0,0,.42);
          padding: 5px 4px;
          color: #f4ffc9;
          transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease;
        }

        .arena-quick-sub-card { touch-action: pan-y pinch-zoom; }

        .arena-quick-sub-card:hover,
        .arena-quick-sub-card:focus-visible,
        .arena-quick-sub-card.is-selected,
        .arena-quick-sub-card.is-substitution-eligible {
          border-color: rgba(181,255,75,.86);
          box-shadow: 0 0 0 1px rgba(181,255,75,.16);
          outline: 0;
        }

        .arena-quick-sub-card.is-locked { opacity: .35; filter: grayscale(.65); }
        .arena-quick-sub-card:nth-of-type(n + 5) { order: 6; }
        .arena-quick-sub-card-art { display: block; height: 80px; aspect-ratio: 430 / 691; overflow: visible; }
        .arena-quick-sub-card-art > div { width: 100% !important; height: 100% !important; }
        .arena-quick-sub-card > span:last-child { width: 100%; overflow: hidden; font-size: 9px; font-weight: 1000; line-height: 1.15; text-overflow: ellipsis; white-space: nowrap; }

        .arena-quick-sub-coach {
          order: 5;
          min-height: 136px;
          border-color: rgba(255,215,92,.52);
          background: radial-gradient(circle at 50% 2%, rgba(255,215,92,.14), transparent 58%), rgba(0,0,0,.46);
        }

        .arena-quick-sub-coach > span { display: block; height: 108px; aspect-ratio: 430 / 691; overflow: visible; }
        .arena-quick-sub-coach > span > article,
        .arena-quick-sub-coach > span > div { width: 100% !important; height: 100% !important; }
        .arena-quick-sub-coach > b { color: #ffe88c; }

        .arena-quick-sub-confirmation {
          position: fixed;
          inset: 0;
          z-index: 300000;
          display: grid;
          place-items: center;
          overflow: auto;
          overscroll-behavior: contain;
          background: rgba(0, 8, 7, .48);
          padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
          -webkit-backdrop-filter: blur(5px);
          backdrop-filter: blur(5px);
        }

        .arena-quick-sub-confirmation-dialog {
          width: min(680px, 100%);
          max-height: calc(100dvh - 32px);
          overflow: auto;
          border: 1px solid rgba(181,255,75,.55);
          border-radius: 24px;
          background: radial-gradient(circle at 50% 0%, rgba(181,255,75,.13), transparent 44%), rgba(1,16,14,.98);
          box-shadow: 0 24px 80px rgba(0,0,0,.62), 0 0 36px rgba(181,255,75,.12);
          padding: 20px;
          color: #f4ffc9;
        }

        .arena-quick-sub-confirmation-dialog > header {
          position: relative;
          display: grid;
          gap: 4px;
          padding-right: 44px;
        }

        .arena-quick-sub-confirmation-dialog > header > span { color: #b5ff4b; font-size: 11px; font-weight: 1000; letter-spacing: .16em; }
        .arena-quick-sub-confirmation-dialog > header h2 { margin: 0; font-size: clamp(24px, 4vw, 38px); line-height: 1; }
        .arena-quick-sub-confirmation-dialog > header button {
          position: absolute;
          top: 0;
          right: 0;
          display: grid;
          width: 38px;
          height: 38px;
          place-items: center;
          border: 1px solid rgba(181,255,75,.32);
          border-radius: 50%;
          background: rgba(255,255,255,.05);
          color: #efffc1;
        }

        .arena-quick-sub-confirmation-cards {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          gap: 18px;
          align-items: center;
          margin-top: 20px;
        }

        .arena-quick-sub-confirmation-cards article { display: grid; min-width: 0; justify-items: center; gap: 8px; }
        .arena-quick-sub-confirmation-cards article > small { font-size: 11px; font-weight: 1000; letter-spacing: .15em; }
        .arena-quick-sub-confirmation-cards article.is-outgoing > small { color: #ff8b8b; }
        .arena-quick-sub-confirmation-cards article.is-incoming > small { color: #b5ff4b; }
        .arena-quick-sub-confirmation-cards article > span { display: block; width: min(180px, 100%); aspect-ratio: 430 / 691; }
        .arena-quick-sub-confirmation-cards article > span > div { width: 100% !important; height: 100% !important; }
        .arena-quick-sub-confirmation-cards article > strong { width: 100%; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
        .arena-quick-sub-confirmation-arrow { width: 54px; height: 54px; }
        .arena-quick-sub-confirmation-dialog > p { margin: 16px 0; color: rgba(239,255,193,.7); text-align: center; }
        .arena-quick-sub-confirmation-dialog > footer { display: grid; grid-template-columns: 1fr 1.35fr; gap: 10px; }
        .arena-quick-sub-confirmation-dialog > footer button {
          min-height: 48px;
          border: 1px solid rgba(181,255,75,.34);
          border-radius: 14px;
          font-weight: 1000;
        }
        .arena-quick-sub-confirmation-dialog > footer .is-cancel { background: rgba(255,255,255,.04); color: #efffc1; }
        .arena-quick-sub-confirmation-dialog > footer .is-confirm { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #a9ff2e; color: #061007; }
        .arena-quick-sub-confirmation-dialog > footer .is-confirm svg { width: 18px; }

        @media (max-width: 560px) {
          .arena-quick-sub-confirmation-dialog { border-radius: 20px; padding: 16px; }
          .arena-quick-sub-confirmation-cards { gap: 8px; }
          .arena-quick-sub-confirmation-cards article > span { width: min(130px, 100%); }
          .arena-quick-sub-confirmation-arrow { width: 38px; height: 38px; }
          .arena-quick-sub-confirmation-dialog > footer { grid-template-columns: 1fr; }
        }

        .arena-quick-sub-out {
          display: flex;
          min-width: 0;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: rgba(255,255,255,.46);
          font-size: 6px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .arena-quick-sub-out > span { color: rgba(255,214,112,.72); }
        .arena-quick-sub-out ul { display: flex; min-width: 0; margin: 0; padding: 0; gap: 4px; list-style: none; }
        .arena-quick-sub-out li {
          max-width: 74px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 999px;
          padding: 3px 5px;
          opacity: .54;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .arena-quick-sub-out small { color: rgba(255,255,255,.4); font-size: 6px; font-weight: 700; letter-spacing: 0; text-transform: none; }

        .arena-quick-sub-confirm {
          justify-self: center;
          min-height: 32px;
          border: 1px solid rgba(181,255,75,.62);
          border-radius: 9px;
          background: rgba(181,255,75,.16);
          padding: 0 14px;
          color: #f4ffc9;
          font-size: 8px;
          font-weight: 1000;
        }

        .arena-quick-sub-confirm:disabled { opacity: .44; }
        .arena-quick-sub-confirm svg { width: 13px; height: 13px; margin-right: 5px; vertical-align: -2px; }

        .arena-quick-sub-readiness {
          display: flex;
          min-height: 70px;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: rgba(255,255,255,.72);
          text-align: center;
        }

        .arena-quick-sub-readiness strong { color: #b5ff4b; font-size: 7px; letter-spacing: .09em; }
        .arena-quick-sub-readiness span { font-size: 8px; font-weight: 800; }
        .arena-quick-sub-readiness button { border: 1px solid rgba(181,255,75,.36); border-radius: 8px; background: rgba(181,255,75,.1); padding: 8px 10px; color: #efffc1; font-size: 7px; font-weight: 1000; }

        .arena-field-player.is-substitution-eligible {
          --selected-card-rgb: 181 255 75;
          filter: drop-shadow(0 20px 24px rgba(0,0,0,.52)) drop-shadow(0 0 17px rgb(var(--selected-card-rgb) / .72));
        }

        .arena-field-player.is-substitution-target { transform: translate(-50%, -100%) scale(1.05); }

        @media (max-width: 720px) {
          .arena-quick-sub-rail { left: 8px; right: 8px; bottom: max(8px, env(safe-area-inset-bottom)); padding: 6px; }
          .arena-quick-sub-rail-cards { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
          .arena-quick-sub-card { min-height: 66px; border-radius: 7px; padding: 2px; }
          .arena-quick-sub-card-art { height: 52px; }
          .arena-quick-sub-card > span:last-child { display: none; }
          .arena-quick-sub-card:nth-of-type(n + 5) { order: 6; }
          .arena-quick-sub-coach { order: 5; min-height: 92px; border-radius: 8px; }
          .arena-quick-sub-coach > span { height: 68px; }
          .arena-quick-sub-coach > b { display: none; }
          .arena-quick-sub-out { flex-wrap: wrap; gap: 4px; }
          .arena-quick-sub-out small { width: 100%; text-align: center; }
          .arena-quick-sub-rail-head > strong { font-size: 6px; }
          .arena-quick-sub-readiness { min-height: 62px; flex-wrap: wrap; gap: 6px; }
        }

        /* The reserve rail is one horizontal 4 + coach + 5 decision surface in
           landscape. It stays low enough to leave the pitch readable, while
           every reserve keeps a real name and a touch-sized target. */
        /* 1280×720 is a real desktop landscape target.  Keep the full
           4 + coach + 5 rail inside the safe frame before the artwork can
           claim more width than its ten grid columns. */
        @media (max-width: 1366px) and (orientation: landscape) {
          .arena-quick-sub-rail {
            left: max(8px, env(safe-area-inset-left));
            right: max(8px, env(safe-area-inset-right));
            gap: 5px;
            border-radius: 12px;
            padding: 5px 6px;
          }

          .arena-quick-sub-rail-head { gap: 7px; }
          .arena-quick-sub-rail-head > span,
          .arena-quick-sub-coach > b { font-size: 7px; }
          .arena-quick-sub-rail-head > strong { font-size: 9px; }
          .arena-quick-sub-rail-head > button { width: 40px; height: 40px; }
          .arena-quick-sub-rail-cards { gap: 5px; }
          .arena-quick-sub-card { min-height: 88px; padding: 3px; }
          .arena-quick-sub-card-art { height: 66px; }
          .arena-quick-sub-card > span:last-child { font-size: 8px; }
          .arena-quick-sub-coach { min-height: 104px; }
          .arena-quick-sub-coach > span { height: 82px; }

          .club-symbol-carousel {
            bottom: max(4px, calc(env(safe-area-inset-bottom) + 4px));
          }

          .club-symbol-open {
            grid-template-columns: auto 44px minmax(0, 1fr) 44px 44px;
            padding-block: 4px;
          }

          .club-symbol-match-centre {
            width: 44px;
            min-width: 44px;
            padding: 0;
          }

          .club-symbol-match-centre > span {
            position: absolute;
            width: 1px;
            height: 1px;
            margin: -1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
          }
        }

        @media (max-width: 900px) and (max-height: 520px) and (orientation: landscape) {
          .arena-quick-sub-rail { gap: 3px; padding: 4px 5px; }
          .arena-quick-sub-rail-head { min-height: 30px; gap: 5px; }
          .arena-quick-sub-rail-head > span,
          .arena-quick-sub-coach > b { font-size: 6.5px; }
          .arena-quick-sub-rail-head > strong { font-size: 8px; }
          .arena-quick-sub-rail-head > button { width: 36px; height: 36px; }
          .arena-quick-sub-rail-cards { gap: 3px; }
          .arena-quick-sub-card { min-height: 72px; border-radius: 8px; padding: 2px; }
          .arena-quick-sub-card-art { height: 55px; }
          .arena-quick-sub-card > span:last-child { display: block; font-size: 7px; }
          .arena-quick-sub-coach { min-height: 84px; border-radius: 8px; }
          .arena-quick-sub-coach > span { height: 64px; }
          .arena-quick-sub-coach > b { display: block; font-size: 6px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .arena-quick-sub-rail,
          .arena-quick-sub-rail.is-closing { animation: none; }
        }

        @media (max-width: 900px), (max-height: 600px) and (orientation: landscape) {
          .arena-coach-technical-area {
            left: clamp(72%, calc(50% + 22vw), 78%);
            right: auto;
            top: auto;
            bottom: max(54px, calc(env(safe-area-inset-bottom) + 54px));
            /* The coach artwork is 2:3 and remains 30% larger than a player
               while staying outside the pitch in compact landscape. */
            width: calc(var(--arena-coach-field-card-height, 11.2dvh) * .867);
            max-width: 58px;
            gap: 2px;
          }

          .arena-coach-technical-label {
            display: none;
          }

          .arena-coach-technical-area.is-panel-open {
            transform: translate(-12%, 0);
          }
        }

        .arena-live-dock {
          position: absolute;
          z-index: 121;
          top: max(112px, calc(env(safe-area-inset-top) + 102px));
          right: max(18px, env(safe-area-inset-right));
          pointer-events: none;
          transition: opacity .72s ease, transform .72s ease;
        }

        .arena-live-dock.is-collapsed {
          top: max(72px, calc(env(safe-area-inset-top) + 62px));
          right: max(62px, calc(env(safe-area-inset-right) + 44px));
        }

        .arena-live-dock-trigger,
        .arena-live-dock-close {
          display: grid;
          place-items: center;
          border: 1px solid rgba(122,231,255,.36);
          border-radius: 8px;
          padding: 0;
          color: #c7f7ff;
          background: rgba(2,8,13,.82);
          box-shadow: 0 10px 26px rgba(0,0,0,.34), inset 0 0 0 1px rgba(255,255,255,.04);
          backdrop-filter: blur(16px);
          cursor: pointer;
        }

        .arena-live-dock-trigger {
          position: relative;
          width: 36px;
          height: 36px;
          pointer-events: auto;
        }

        .arena-live-dock-trigger svg,
        .arena-live-dock-close svg {
          width: 17px;
          height: 17px;
          stroke-width: 2;
        }

        .arena-live-dock-trigger > span {
          position: absolute;
          top: 7px;
          right: 7px;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #b5ff4b;
          box-shadow: 0 0 8px rgba(181,255,75,.78);
        }

        .arena-live-dock-trigger:hover,
        .arena-live-dock-trigger:focus-visible,
        .arena-live-dock-close:hover,
        .arena-live-dock-close:focus-visible {
          border-color: rgba(181,255,75,.72);
          color: #efffc1;
          background: rgba(7,19,18,.94);
          outline: 0;
        }

        .arena-live-dock-panel {
          display: flex;
          width: min(272px, calc(100vw - 36px));
          max-height: min(560px, calc(100dvh - 212px));
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 8px;
          background:
            linear-gradient(145deg, rgba(7,30,33,.88), rgba(4,9,14,.94) 56%, rgba(16,26,13,.9)),
            rgba(2,7,12,.92);
          box-shadow: 0 22px 54px rgba(0,0,0,.5), inset 0 0 0 1px rgba(181,255,75,.05);
          backdrop-filter: blur(20px) saturate(1.12);
          pointer-events: auto;
        }

        .arena-live-dock-head {
          display: flex;
          min-height: 54px;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid rgba(255,255,255,.1);
          padding: 8px 8px 8px 11px;
        }

        .arena-live-dock-title {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 9px;
        }

        .arena-live-dock-title > svg {
          width: 19px;
          height: 19px;
          flex: 0 0 auto;
          color: #b5ff4b;
        }

        .arena-live-dock-title > span {
          display: grid;
          min-width: 0;
          gap: 3px;
        }

        .arena-live-dock-title strong {
          color: white;
          font-size: 12px;
          line-height: 1;
          font-weight: 900;
        }

        .arena-live-dock-title small {
          overflow: hidden;
          color: rgba(255,255,255,.52);
          font-size: 7px;
          line-height: 1;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .arena-live-dock-close {
          width: 32px;
          height: 32px;
          flex: 0 0 auto;
        }

        .arena-live-dock-list {
          display: grid;
          flex: 1 1 auto;
          min-height: 0;
          gap: 5px;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 7px;
          scrollbar-color: rgba(181,255,75,.42) transparent;
          scrollbar-width: thin;
        }

        .arena-live-dock-list > button {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 52px minmax(0, 1fr);
          min-height: 56px;
          align-items: center;
          gap: 5px;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 7px;
          background: rgba(0,0,0,.24);
          padding: 6px 7px;
          color: white;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
          cursor: pointer;
          transition: border-color .16s ease, background .16s ease, transform .16s ease;
        }

        .arena-live-dock-list > button:hover,
        .arena-live-dock-list > button:focus-visible {
          border-color: rgba(122,231,255,.34);
          background: rgba(10,34,37,.5);
          outline: 0;
          transform: translateX(-1px);
        }

        .arena-live-dock-list > button.is-active {
          border-color: rgba(181,255,75,.46);
          background: rgba(181,255,75,.1);
          box-shadow: inset 3px 0 0 rgba(181,255,75,.76);
        }

        .arena-live-dock-list > button.is-pending:not(.is-active) {
          border-color: rgba(181,255,75,.3);
          background: rgba(181,255,75,.055);
          cursor: progress;
        }

        .arena-live-dock-club {
          display: grid;
          min-width: 0;
          justify-items: center;
          gap: 4px;
        }

        .arena-live-dock-club > strong {
          max-width: 100%;
          overflow: hidden;
          color: rgba(255,255,255,.8);
          font-size: 7px;
          line-height: 1;
          font-weight: 900;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .arena-live-dock-badge {
          display: grid;
          width: 24px;
          height: 24px;
          place-items: center;
          border: 0;
          border-radius: 0;
          background: transparent;
        }

        .arena-live-dock-badge img {
          width: 20px;
          height: 20px;
          object-fit: contain;
          filter: drop-shadow(0 3px 5px rgba(0,0,0,.42));
        }

        .arena-live-dock-badge > span {
          color: white;
          font-size: 6px;
          font-weight: 900;
        }

        .arena-live-dock-score {
          display: grid;
          min-width: 0;
          justify-items: center;
          gap: 4px;
        }

        .arena-live-dock-score strong {
          color: #f4ffc9;
          font-size: 12px;
          line-height: 1;
          font-weight: 900;
        }

        .arena-live-dock-score small {
          max-width: 48px;
          overflow: hidden;
          color: #b5ff4b;
          font-size: 6px;
          line-height: 1;
          font-weight: 900;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .arena-live-dock-fallback {
          display: grid;
          grid-column: 1 / -1;
          min-width: 0;
          gap: 4px;
          text-align: left;
        }

        .arena-live-dock-fallback strong {
          overflow: hidden;
          font-size: 9px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .arena-live-dock-fallback small {
          color: #b5ff4b;
          font-size: 7px;
          font-weight: 900;
        }

        .arena-live-match-center {
          display: grid;
          flex: 0 0 auto;
          gap: 9px;
          border-top: 1px solid rgba(163,255,18,.18);
          background: linear-gradient(145deg, rgba(163,255,18,.075), rgba(0,0,0,.28));
          padding: 12px;
        }

        .arena-live-match-kicker { color: #a3ff12; font-size: 6px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .arena-live-match-score { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: center; gap: 7px; text-align: center; }
        .arena-live-match-score strong { overflow: hidden; font-size: 8px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
        .arena-live-match-score b { min-width: 42px; border-radius: 8px; background: rgba(0,0,0,.46); padding: 7px 5px; color: #f3ffc8; font-size: 12px; }
        .arena-live-match-tabs { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 4px; }
        .arena-live-match-tabs span { border: 1px solid rgba(255,255,255,.08); border-radius: 7px; padding: 6px 3px; color: rgba(255,255,255,.42); font-size: 6px; font-weight: 900; text-align: center; }
        .arena-live-match-tabs span.is-active { border-color: rgba(163,255,18,.32); color: #efffc4; background: rgba(163,255,18,.08); }
        .arena-live-match-center p { margin: 0; color: rgba(255,255,255,.5); font-size: 7px; line-height: 1.45; }
        .arena-live-match-center > small { color: rgba(122,231,255,.58); font-size: 6px; font-weight: 800; }
        .arena-live-select-hint { flex: 0 0 auto; margin: 0; border-top: 1px solid rgba(255,255,255,.08); padding: 11px 12px; color: rgba(255,255,255,.42); font-size: 7px; line-height: 1.4; }

        .arena-entry-skip-toggle {
          position: absolute;
          z-index: 240;
          top: max(18px, calc(env(safe-area-inset-top) + 10px));
          right: max(18px, env(safe-area-inset-right));
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid rgba(181,255,75,.44);
          border-radius: 999px;
          padding: 0 16px;
          color: #efffd2;
          background: rgba(2,6,13,.78);
          box-shadow: 0 16px 42px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.04);
          backdrop-filter: blur(16px);
          cursor: pointer;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
          transition: border-color .16s ease, background .16s ease, box-shadow .16s ease, transform .16s ease;
        }

        .arena-intro-replay-toggle,
        .arena-video-pause-toggle {
          position: absolute;
          z-index: 122;
          top: max(72px, calc(env(safe-area-inset-top) + 62px));
          right: max(18px, env(safe-area-inset-right));
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 1px solid rgba(181,255,75,.34);
          border-radius: 9px;
          padding: 0;
          color: #dfff9c;
          background:
            linear-gradient(145deg, rgba(181,255,75,.13), rgba(255,255,255,.035)),
            rgba(2,6,13,.78);
          box-shadow: 0 10px 26px rgba(0,0,0,.34), inset 0 0 0 1px rgba(255,255,255,.045);
          backdrop-filter: blur(16px);
          cursor: pointer;
          transition: border-color .16s ease, background .16s ease, transform .16s ease;
        }

        .arena-intro-replay-toggle {
          top: max(30px, calc(env(safe-area-inset-top) + 20px));
        }

        .arena-video-pause-toggle {
          top: max(30px, calc(env(safe-area-inset-top) + 20px));
          right: max(62px, calc(env(safe-area-inset-right) + 44px));
        }

        .arena-entry-skip-toggle:hover,
        .arena-entry-skip-toggle:focus-visible,
        .arena-intro-replay-toggle:hover,
        .arena-intro-replay-toggle:focus-visible,
        .arena-video-pause-toggle:hover,
        .arena-video-pause-toggle:focus-visible {
          border-color: rgba(181,255,75,.7);
          background:
            linear-gradient(145deg, rgba(181,255,75,.24), rgba(255,255,255,.055)),
            rgba(2,6,13,.86);
          outline: 0;
          transform: translateY(-1px);
        }

        .arena-intro-replay-toggle svg,
        .arena-video-pause-toggle svg {
          width: 17px;
          height: 17px;
          stroke-width: 2;
        }

        .arena-intro-replay-toggle svg {
          transform: translateX(1px);
        }

        .arena-intro-actions {
          position: absolute;
          z-index: 240;
          top: max(18px, calc(env(safe-area-inset-top) + 10px));
          right: max(18px, env(safe-area-inset-right));
          pointer-events: auto;
        }

        .arena-intro-actions .arena-intro-replay-toggle,
        .arena-intro-actions .arena-entry-skip-toggle {
          position: static;
          display: inline-flex;
          width: auto;
          height: auto;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 999px;
          padding: 0 16px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .arena-intro-actions .arena-intro-replay-toggle span { display: inline; }

        .arena-coach-first-gate {
          position: absolute;
          z-index: 1250;
          inset: max(72px, calc(env(safe-area-inset-top) + 64px)) max(5vw, env(safe-area-inset-right)) max(58px, calc(env(safe-area-inset-bottom) + 44px)) max(5vw, env(safe-area-inset-left));
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: clamp(12px, 2vh, 24px);
          border: 1px solid rgba(181,255,75,.25);
          border-radius: clamp(18px, 2vw, 30px);
          padding: clamp(16px, 2vw, 30px);
          background: linear-gradient(125deg, rgba(1,11,10,.94), rgba(3,22,18,.84));
          box-shadow: 0 30px 90px rgba(0,0,0,.58), inset 0 1px rgba(255,255,255,.06);
          backdrop-filter: blur(22px);
          overflow: hidden;
        }

        .arena-coach-first-copy { display: grid; gap: 5px; max-width: 720px; }
        .arena-coach-first-copy span { color: #b5ff4b; font-size: 9px; font-weight: 950; letter-spacing: .14em; }
        .arena-coach-first-copy h1 { margin: 0; color: #f4ffd8; font-size: clamp(24px, 3.4vw, 46px); line-height: .98; letter-spacing: -.045em; }
        .arena-coach-first-copy p { margin: 2px 0 0; color: rgba(239,255,210,.66); font-size: 12px; line-height: 1.42; }
        .arena-coach-first-copy .arena-coach-selection-error { color: #ffd6c7; font-weight: 800; }

        .arena-coach-first-gate.is-bootstrap-pending {
          grid-template-rows: auto auto;
          align-content: center;
          justify-items: center;
          text-align: center;
        }

        .arena-coach-first-gate.is-offer-pending {
          grid-template-rows: auto auto;
          align-content: center;
        }

        .arena-coach-first-gate.is-offer-pending .arena-coach-offer-status {
          align-self: start;
        }

        .arena-coach-first-gate.is-bootstrap-pending .arena-coach-first-copy {
          justify-items: center;
        }

        .arena-coach-bootstrap-pulse {
          display: flex;
          align-items: center;
          gap: 7px;
          min-height: 44px;
        }

        .arena-coach-bootstrap-pulse i {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #b5ff4b;
          box-shadow: 0 0 16px rgba(181,255,75,.7);
          animation: arena-coach-bootstrap-pulse 1s ease-in-out infinite alternate;
        }

        .arena-coach-bootstrap-pulse i:nth-child(2) { animation-delay: .16s; }
        .arena-coach-bootstrap-pulse i:nth-child(3) { animation-delay: .32s; }

        @keyframes arena-coach-bootstrap-pulse {
          from { opacity: .34; transform: translateY(2px) scale(.82); }
          to { opacity: 1; transform: translateY(-2px) scale(1); }
        }

        .arena-coach-choice-rail {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: clamp(128px, 13vw, 170px);
          align-items: start;
          gap: 11px;
          min-height: 0;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px 2px 14px;
          scrollbar-color: rgba(181,255,75,.55) transparent;
        }

        .arena-coach-choice {
          display: grid;
          gap: 5px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 14px;
          padding: 8px;
          color: #f5ffd8;
          background: rgba(255,255,255,.035);
          text-align: left;
          cursor: pointer;
          transition: transform .16s ease, border-color .16s ease, background .16s ease;
        }

        .arena-coach-choice:hover,
        .arena-coach-choice:focus-visible {
          border-color: rgba(181,255,75,.7);
          background: rgba(181,255,75,.1);
          outline: 0;
          transform: translateY(-3px);
        }

        .arena-coach-choice:disabled { cursor: wait; opacity: .64; }
        .arena-coach-choice-card { display: block; overflow: hidden; border-radius: 10px; aspect-ratio: .75; background: rgba(0,0,0,.28); }
        .arena-coach-choice-card > * { width: 100%; height: 100%; }
        .arena-coach-choice strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .arena-coach-choice small { overflow: hidden; color: rgba(255,255,255,.55); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        .arena-coach-offer-status { display: grid; align-self: center; gap: 9px; max-width: 340px; color: rgba(239,255,210,.7); font-size: 11px; line-height: 1.45; }
        .arena-coach-offer-status p { margin: 0; }
        .arena-coach-login-link { display: inline-flex; width: fit-content; align-items: center; min-height: 44px; border: 1px solid rgba(181,255,75,.58); border-radius: 999px; padding: 0 15px; color: #e4ffc1; background: rgba(101,176,15,.14); font-size: 10px; font-weight: 950; text-decoration: none; }
        .arena-coach-login-link:hover, .arena-coach-login-link:focus-visible { border-color: #c5ff6d; background: rgba(181,255,75,.24); color: #fff; outline: none; }
        .arena-coach-choice-offer { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; color: #c8ff77; font-size: 7px; font-weight: 950; letter-spacing: .035em; }
        .arena-coach-choice-offer b:last-child { color: #fff4b1; font-size: 10px; }
        .arena-coach-choice-reason { color: rgba(239,255,210,.72) !important; font-size: 7px !important; }
        .arena-coach-choice em { color: #b5ff4b; font-size: 7px; font-style: normal; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }

        @media (max-width: 760px) {
          .arena-intro-actions { top: max(12px, calc(env(safe-area-inset-top) + 6px)); right: max(10px, env(safe-area-inset-right)); }
          .arena-intro-actions .arena-intro-replay-toggle,
          .arena-intro-actions .arena-entry-skip-toggle { min-height: 44px; gap: 6px; padding: 0 12px; font-size: 8px; }
          .arena-coach-first-gate { inset: max(54px, calc(env(safe-area-inset-top) + 46px)) 10px max(10px, calc(env(safe-area-inset-bottom) + 6px)); padding: 13px; }
          .arena-coach-first-copy p { font-size: 10px; }
          .arena-coach-choice-rail { grid-auto-columns: 108px; gap: 7px; }
          .arena-coach-choice { border-radius: 10px; padding: 5px; }
          .arena-coach-choice strong { font-size: 8px; }
          .arena-coach-choice small { font-size: 6px; }
          .arena-coach-choice-offer { font-size: 5px; }
          .arena-coach-choice-offer b:last-child { font-size: 8px; }
          .arena-coach-choice-reason { font-size: 5px !important; }
          .arena-coach-choice em { font-size: 5px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .arena-coach-bootstrap-pulse i { animation: none; }
        }

        .club-symbol-carousel {
          position: absolute;
          z-index: 110;
          left: max(12px, env(safe-area-inset-left));
          right: max(12px, env(safe-area-inset-right));
          bottom: max(34px, calc(env(safe-area-inset-bottom) + 34px));
          pointer-events: none;
          transition: opacity .72s ease, transform .72s ease;
        }

        .club-symbol-open {
          position: relative;
          display: grid;
          width: 100%;
          grid-template-columns: auto 30px minmax(0, 1fr) 30px auto;
          gap: 8px;
          align-items: center;
          overflow: hidden;
          border-radius: 18px;
          padding: 8px 10px;
          color: white;
          pointer-events: auto;
        }

        .club-symbol-open::before,
        .club-symbol-open::after {
          content: "";
          position: absolute;
          width: 156px;
          height: 72px;
          border-radius: 999px;
          filter: blur(28px);
          pointer-events: none;
          opacity: .72;
        }

        .club-symbol-open::before {
          left: -54px;
          top: -42px;
          background: rgba(122,231,255,.22);
        }

        .club-symbol-open::after {
          right: -46px;
          bottom: -44px;
          background: rgba(181,255,75,.18);
        }

        .club-symbol-open > * {
          position: relative;
          z-index: 1;
        }

        .club-symbol-kicker {
          display: grid;
          gap: 1px;
          min-width: max-content;
          border-radius: 11px;
          background: rgba(181,255,75,.14);
          padding: 7px 10px;
          color: #efff9b;
                    box-shadow: inset 0 0 0 1px rgba(181,255,75,.24);
        }

        .club-symbol-kicker strong {
          font-size: 9px;
          font-weight: 1000;          line-height: 1;
        }

        .club-symbol-kicker small {
          font-size: 6px;
          font-weight: 1000;          line-height: 1;
          color: rgba(255,255,255,.64);
        }

        .club-symbol-mask {
          overflow: hidden;
          min-width: 0;
          touch-action: pan-y;
        }

        .club-symbol-arrow {
          display: grid;
          width: 28px;
          height: 28px;
          place-items: center;
          border: 1px solid rgba(181,255,75,.22);
          border-radius: 999px;
          color: #efffbf;
          background: rgba(1,7,11,.62);
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
        }

        .club-symbol-arrow:hover,
        .club-symbol-arrow:focus-visible {
          border-color: rgba(181,255,75,.72);
          background: rgba(181,255,75,.13);
          outline: 0;
        }

        .club-symbol-match-centre {
          display: inline-flex;
          min-height: 30px;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid rgba(122,231,255,.42);
          border-radius: 999px;
          padding: 0 10px;
          color: #e9fcff;
          background: rgba(42,167,217,.12);
          font-size: 7px;
          font-weight: 950;
          letter-spacing: .05em;
          text-decoration: none;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .club-symbol-match-centre:hover,
        .club-symbol-match-centre:focus-visible {
          border-color: rgba(122,231,255,.9);
          background: rgba(42,167,217,.24);
          outline: 0;
        }

        .club-symbol-stream {
          display: flex;
          width: max-content;
          gap: 8px;
          align-items: center;
          animation: clubSymbolScroll 34s linear infinite;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          -webkit-transform: translate3d(0, 0, 0);
        }

        .club-symbol-open:hover .club-symbol-stream {
          animation-play-state: paused;
        }

        .club-symbol-stream.is-static {
          animation: none;
          will-change: auto;
        }

        .club-symbol-carousel-empty .club-symbol-open {
          display: grid;
          grid-template-columns: auto auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          min-height: 46px;
          padding: 6px 11px;
          color: rgba(255,255,255,.78);
        }

        .club-symbol-carousel-empty .club-symbol-open > strong {
          color: #b5ff4b;
          font-size: 8px;
          letter-spacing: .09em;
        }

        .club-symbol-carousel-empty .club-symbol-open > span {
          min-width: 0;
          overflow: hidden;
          color: rgba(255,255,255,.6);
          font-size: 8px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .club-symbol-carousel-empty .club-symbol-open > a {
          border: 1px solid rgba(122,231,255,.42);
          border-radius: 999px;
          padding: 7px 10px;
          color: #e9fcff;
          font-size: 7px;
          font-weight: 950;
          text-decoration: none;
          text-transform: uppercase;
        }

        .club-symbol-pill {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          min-width: 172px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          padding: 5px 11px 5px 7px;
          color: inherit;
          text-decoration: none;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), 0 10px 24px rgba(0,0,0,.22);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        .club-symbol-pill[aria-current="true"] {
          background: rgba(122,231,255,.16);
          box-shadow: inset 0 0 0 1px rgba(122,231,255,.8), 0 10px 24px rgba(0,0,0,.22);
        }

        .club-symbol-fixture-logos {
          display: inline-grid;
          grid-template-columns: 34px auto 34px;
          align-items: center;
          gap: 4px;
          flex: 0 0 auto;
        }

        .club-symbol-fixture-logos b {
          color: rgba(255,255,255,.7);
          font-size: 10px;
          font-weight: 1000;
          line-height: 1;
                  }

        .club-symbol-icon {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          place-items: center;
          overflow: visible;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }

        .club-symbol-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 3px 5px rgba(0,0,0,.42));
          -webkit-transform: translateZ(0);
        }

        .club-symbol-icon span {
          font-size: 9px;
          font-weight: 1000;          color: white;
          text-shadow: 0 1px 4px rgba(0,0,0,.7);
        }

        .club-symbol-copy {
          display: grid;
          gap: 1px;
          min-width: 0;
          text-align: left;
        }

        .club-symbol-copy strong {
          font-size: 10px;
          line-height: 1;
          font-weight: 1000;                  }

        .club-symbol-copy small {
          color: rgba(181,255,75,.84);
          font-size: 8px;
          font-weight: 1000;
          line-height: 1;
        }

        @keyframes clubSymbolScroll {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(-50%, 0, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .club-symbol-stream {
            animation: none;
          }
        }

        .arena-quick-dock {
          position: relative;
          z-index: 140;
          display: grid;
          width: min(218px, calc(100vw - 96px));
          gap: 7px;
          overflow: hidden;
          border-radius: 16px;
          padding: 8px;
          pointer-events: auto;
          background: rgba(2, 6, 13, .74);
          transition: width .18s ease, transform .18s ease, opacity .18s ease;
        }

        .arena-quick-dock.is-collapsed {
          width: min(154px, calc(100vw - 96px));
        }

        .arena-quick-dock::before,
        .arena-quick-dock::after {
          content: "";
          position: absolute;
          width: 120px;
          height: 62px;
          border-radius: 999px;
          filter: blur(24px);
          pointer-events: none;
        }

        .arena-quick-dock::before {
          left: -48px;
          top: -34px;
          background: rgba(122,231,255,.2);
        }

        .arena-quick-dock::after {
          right: -46px;
          bottom: -38px;
          background: rgba(181,255,75,.18);
        }

        .arena-quick-toggle,
        .arena-quick-links button,
        .arena-quick-links a {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          min-height: 40px;
          border-radius: 12px;
          background: rgba(255,255,255,.075);
          padding: 0 13px;
          color: rgba(255,255,255,.74);
          font-size: 8px;
          font-weight: 1000;                    box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
          text-decoration: none;
          transition: background .16s ease, color .16s ease, box-shadow .16s ease;
        }

        .arena-quick-toggle strong {
          color: #caff72;
          font-size: 15px;
          line-height: 1;
        }

        .arena-quick-menu-icon {
          width: 13px;
          height: 13px;
          flex: 0 0 auto;
          color: #caff72;
        }

        .arena-quick-links {
          display: grid;
          gap: 6px;
        }

        .arena-quick-dock.is-collapsed .arena-quick-links {
          display: none;
        }

        .arena-quick-toggle:hover,
        .arena-quick-links button:hover,
        .arena-quick-links button.is-active,
        .arena-quick-links a:hover {
          background: rgba(181,255,75,.18);
          color: #f3ffa8;
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.38), 0 0 18px rgba(181,255,75,.13);
        }

        .arena-quick-links .arena-quick-close-all {
          justify-content: center;
          border-color: rgba(255,255,255,.12);
          background: rgba(0,0,0,.32);
          color: rgba(255,255,255,.58);
        }

        .arena-start-menu {
          position: absolute;
          inset: 0;
          z-index: 180;
          display: grid;
          place-items: center;
          padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
          background: rgba(0,0,0,.36);
          backdrop-filter: blur(10px);
        }

        .arena-start-panel {
          width: min(880px, 100%);
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(2, 6, 13, .76);
          box-shadow: 0 34px 100px rgba(0,0,0,.46), inset 0 0 0 1px rgba(255,255,255,.05);
          backdrop-filter: blur(18px);
          padding: 16px;
        }

        .arena-start-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 14px;
          border-bottom: 1px solid rgba(255,255,255,.1);
          padding-bottom: 14px;
        }

        .arena-start-heading p,
        .arena-start-grid span {
          margin: 0;
          font-size: 9px;
          font-weight: 1000;                    color: rgba(181,255,75,.72);
        }

        .arena-start-heading h2 {
          margin: 6px 0 0;
          font-size: clamp(28px, 5vw, 54px);
          line-height: .82;
          font-weight: 1000;        }

        .arena-start-heading span {
          display: block;
          margin-top: 8px;
          max-width: 520px;
          color: rgba(255,255,255,.56);
          font-size: 12px;
          font-weight: 800;
          line-height: 1.5;
        }

        .arena-start-heading button {
          min-height: 40px;
          border-radius: 12px;
          padding: 0 14px;
          background: rgba(255,255,255,.08);
          color: rgba(255,255,255,.78);
          font-size: 9px;
          font-weight: 1000;                    box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
        }

        .arena-start-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }

        .arena-start-grid button {
          min-height: 112px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.11);
          background:
            radial-gradient(circle at 88% 10%, rgba(181,255,75,.13), transparent 34%),
            rgba(255,255,255,.045);
          padding: 14px;
          color: white;
          text-align: left;
          text-decoration: none;
          transition: border-color .16s ease, background .16s ease, transform .16s ease;
        }

        .arena-start-grid button:hover {
          border-color: rgba(181,255,75,.48);
          background:
            radial-gradient(circle at 88% 10%, rgba(181,255,75,.2), transparent 34%),
            rgba(181,255,75,.08);
          transform: translateY(-1px);
        }

        .arena-start-grid strong {
          display: block;
          margin-top: 8px;
          font-size: 18px;
          line-height: .95;
          font-weight: 1000;
                  }

        .arena-start-grid small {
          display: block;
          margin-top: 8px;
          color: rgba(255,255,255,.52);
          font-size: 11px;
          font-weight: 800;
          line-height: 1.45;
        }

        .arena-action-layer {
          position: absolute;
          inset: 0;
          z-index: 170;
          display: grid;
          place-items: center;
          padding: max(72px, calc(env(safe-area-inset-top) + 72px)) max(16px, env(safe-area-inset-right)) max(72px, calc(env(safe-area-inset-bottom) + 72px)) max(16px, env(safe-area-inset-left));
          pointer-events: none;
        }

        .arena-stage:has(.arena-action-panel-bench) .arena-action-layer {
          padding-bottom: max(124px, calc(env(safe-area-inset-bottom) + 124px));
        }

        .arena-stage:has(.arena-action-panel-market) .arena-action-layer {
          padding-bottom: max(116px, calc(env(safe-area-inset-bottom) + 116px));
        }

        .arena-action-panel {
          position: relative;
          width: min(1080px, 96vw);
          max-height: min(84dvh, 820px);
          overflow: hidden;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(2, 6, 13, .58);
          box-shadow: 0 34px 100px rgba(0,0,0,.46), inset 0 0 0 1px rgba(255,255,255,.05);
          backdrop-filter: blur(14px);
          padding: 16px;
          pointer-events: auto;
        }

        .arena-action-panel-bench {
          display: flex;
          flex-direction: column;
          width: min(1360px, 96vw);
          height: min(80dvh, 820px);
          max-height: min(80dvh, 820px);
          overflow: hidden;
          background: rgba(2, 6, 13, .52);
          scrollbar-color: rgba(181,255,75,.5) rgba(255,255,255,.08);
        }

        .arena-action-panel-market {
          display: flex;
          flex-direction: column;
          width: min(1220px, 100%);
          height: min(78dvh, 820px);
          max-height: min(78dvh, 820px);
          overflow: hidden;
          scrollbar-width: thin;
          scrollbar-color: rgba(181,255,75,.46) rgba(255,255,255,.08);
        }

        .arena-action-panel-market .arena-action-topline h2 {
          font-size: clamp(28px, 3.5vw, 44px);
          line-height: .9;
        }

        .arena-action-panel:has(.arena-card-ranking-panel) {
          overflow: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(181,255,75,.46) rgba(255,255,255,.08);
        }

        .arena-action-panel::before {
          content: "";
          position: absolute;
          inset: -1px;
          pointer-events: none;
          background:
            radial-gradient(circle at 8% 12%, rgba(122,231,255,.18), transparent 32%),
            radial-gradient(circle at 92% 88%, rgba(181,255,75,.15), transparent 34%);
          opacity: .95;
        }

        .arena-action-panel > * {
          position: relative;
          z-index: 1;
        }

        .arena-action-topline {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 14px;
          border-bottom: 1px solid rgba(255,255,255,.1);
          padding-bottom: 14px;
        }

        .arena-action-topline p {
          margin: 0;
          font-size: 9px;
          font-weight: 1000;                    color: rgba(181,255,75,.72);
        }

        .arena-action-topline h2 {
          margin: 6px 0 0;
          font-size: clamp(28px, 5vw, 56px);
          line-height: .82;
          font-weight: 1000;        }

        .arena-action-topline button,
        .arena-action-topline .arena-market-return,
        .bench-confirm button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          border-radius: 12px;
          background: rgba(181,255,75,.18);
          padding: 0 14px;
          color: #f0ff9f;
          font-size: 9px;
          font-weight: 1000;                    box-shadow: inset 0 0 0 1px rgba(181,255,75,.32);
          text-decoration: none;
        }

        .touchline-game.is-panel-standalone .arena-stage {
          background:
            radial-gradient(circle at 14% 10%, rgba(122,231,255,.16), transparent 31%),
            radial-gradient(circle at 86% 86%, rgba(181,255,75,.18), transparent 35%),
            linear-gradient(145deg, #071018 0%, #07120e 48%, #020608 100%);
        }

        .touchline-game.is-panel-standalone .arena-stage > :not(.arena-functional-layer) {
          display: none !important;
        }

        .touchline-game.is-panel-standalone .arena-functional-layer {
          position: absolute;
          inset: 0;
          display: block;
        }

        /* Standalone Market and Training pages are entry points too.  When a
           coach is required, make the first required step fill that surface
           instead of leaving a blocked page title peeking around the gate. */
        .touchline-game.is-panel-standalone .arena-coach-first-gate {
          inset: 10px;
        }

        .touchline-game.is-market-standalone .arena-functional-layer > :not(.arena-action-layer):not(.arena-coach-first-gate):not(.arena-coach-gated-content),
        .touchline-game.is-bench-standalone .arena-functional-layer > :not(.arena-action-layer):not(.arena-coach-first-gate):not(.arena-coach-gated-content),
        .touchline-game.is-market-standalone .arena-coach-gated-content > :not(.arena-action-layer),
        .touchline-game.is-bench-standalone .arena-coach-gated-content > :not(.arena-action-layer) {
          display: none !important;
        }

        .touchline-game.is-market-standalone .arena-action-layer,
        .touchline-game.is-bench-standalone .arena-action-layer {
          position: absolute;
          inset: 0;
          display: block;
          overflow: auto;
          padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
          background:
            linear-gradient(rgba(2,7,10,.3), rgba(2,7,10,.72)),
            radial-gradient(circle at 50% -10%, rgba(181,255,75,.12), transparent 36%);
          pointer-events: auto;
        }

        .touchline-game.is-market-standalone .arena-action-panel-market {
          width: min(1560px, 100%);
          min-height: calc(100dvh - max(36px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
          height: auto;
          max-height: none;
          margin: 0 auto;
          border-color: rgba(181,255,75,.22);
          background: rgba(2,8,11,.82);
          box-shadow: 0 40px 120px rgba(0,0,0,.55), inset 0 0 0 1px rgba(181,255,75,.06);
        }

        .touchline-game.is-market-standalone .arena-action-topline h2 {
          display: none;
        }

        .touchline-game.is-market-standalone .arena-action-topline {
          justify-content: flex-end;
          padding-bottom: 10px;
        }

        .touchline-game.is-market-standalone .arena-action-topline > div {
          display: none;
        }

        .touchline-game.is-market-standalone .arena-action-topline .arena-market-return,
        .touchline-game.is-market-standalone .arena-club-sections a,
        .touchline-game.is-market-standalone .team-builder-section-title a,
        .touchline-game.is-market-standalone .team-builder-club-hub {
          min-height: 44px;
        }

        .touchline-game.is-market-standalone .team-builder-market-search input,
        .touchline-game.is-market-standalone .team-builder-market-sort select {
          min-height: 44px;
        }

        .touchline-game.is-market-standalone .arena-action-panel-market .team-builder-shell {
          min-height: 720px;
          overflow: visible;
        }

        .touchline-game.is-bench-standalone .arena-action-panel-bench {
          width: min(1560px, 100%);
          min-height: calc(100dvh - max(36px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
          height: auto;
          max-height: none;
          margin: 0 auto;
          overflow: visible;
          border-color: rgba(181,255,75,.22);
          background: rgba(2,8,11,.82);
          box-shadow: 0 40px 120px rgba(0,0,0,.55), inset 0 0 0 1px rgba(181,255,75,.06);
        }

        .touchline-game.is-bench-standalone .arena-bench-board {
          overflow: visible;
        }

        .arena-standalone-bench-readiness {
          display: grid;
          width: min(720px, 100%);
          min-height: min(560px, calc(100dvh - 190px));
          align-content: center;
          justify-items: center;
          gap: 16px;
          margin: 0 auto;
          border: 1px solid rgba(181,255,75,.28);
          border-radius: 24px;
          background:
            radial-gradient(circle at 50% 0%, rgba(181,255,75,.13), transparent 42%),
            linear-gradient(145deg, rgba(6,22,16,.93), rgba(2,7,10,.92));
          padding: clamp(28px, 6vw, 56px);
          color: #f7fff0;
          text-align: center;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 28px 80px rgba(0,0,0,.42);
        }

        .arena-standalone-bench-readiness > span {
          color: #caff72;
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .16em;
        }

        .arena-standalone-bench-readiness h2 {
          max-width: 620px;
          margin: 0;
          font-size: clamp(28px, 5vw, 50px);
          line-height: .98;
          letter-spacing: -.045em;
        }

        .arena-standalone-bench-readiness p {
          max-width: 560px;
          margin: 0;
          color: rgba(244,255,239,.74);
          font-size: 15px;
          line-height: 1.65;
        }

        .arena-standalone-bench-readiness-counts {
          display: grid;
          width: min(380px, 100%);
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 4px;
        }

        .arena-standalone-bench-readiness-counts strong {
          display: grid;
          gap: 5px;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 15px;
          background: rgba(0,0,0,.2);
          padding: 14px 10px;
          color: #fff;
          font-size: 21px;
          font-weight: 1000;
          font-variant-numeric: tabular-nums;
        }

        .arena-standalone-bench-readiness-counts b { color: #b5ff4b; }

        .arena-standalone-bench-readiness-counts small {
          color: rgba(215,255,166,.78);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: .09em;
          text-transform: uppercase;
        }

        .arena-standalone-bench-readiness-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin-top: 2px;
        }

        .arena-standalone-bench-readiness-actions a {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(181,255,75,.32);
          border-radius: 999px;
          padding: 0 18px;
          color: #efffc4;
          font-size: 12px;
          font-weight: 950;
          text-decoration: none;
        }

        .arena-standalone-bench-readiness-actions a.is-primary {
          color: #071006;
          background: #b5ff4b;
        }

        .arena-standalone-bench-readiness-actions a:focus-visible {
          outline: 3px solid white;
          outline-offset: 4px;
        }

        .touchline-game.is-live-standalone .arena-functional-layer > :not(.arena-live-dock):not(.arena-live-card-spotlight):not(.arena-coach-gated-content),
        .touchline-game.is-live-standalone .arena-coach-gated-content > :not(.arena-live-dock):not(.arena-live-card-spotlight) {
          display: none !important;
        }

        .touchline-game.is-live-standalone .arena-live-dock,
        .touchline-game.is-live-standalone .arena-live-dock.is-open {
          position: absolute;
          inset: 0;
          z-index: 80;
          display: block;
          overflow: hidden;
          padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
          pointer-events: auto;
        }

        .touchline-game.is-live-standalone .arena-live-dock-panel {
          display: grid;
          grid-template-columns: minmax(190px, 235px) minmax(0, 1fr);
          grid-template-rows: auto minmax(0, 1fr);
          width: min(1500px, 100%);
          height: calc(100dvh - max(36px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
          min-height: 0;
          max-height: calc(100dvh - max(36px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
          margin: 0 auto;
          overflow: hidden;
          border-radius: 22px;
          background:
            radial-gradient(circle at 80% 15%, rgba(181,255,75,.1), transparent 32%),
            linear-gradient(145deg, rgba(7,30,33,.94), rgba(4,9,14,.98) 56%, rgba(16,26,13,.95));
          box-shadow: 0 40px 120px rgba(0,0,0,.65), inset 0 0 0 1px rgba(181,255,75,.07);
        }

        .touchline-game.is-live-standalone .arena-live-dock-head {
          grid-column: 1 / -1;
          min-height: 74px;
          padding: 14px 18px;
        }

        .touchline-game.is-live-standalone .arena-live-dock-title strong {
          font-size: 18px;
        }

        .touchline-game.is-live-standalone .arena-live-dock-title small {
          font-size: 10px;
        }

        .touchline-game.is-live-standalone .arena-live-dock-list {
          align-content: start;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          border-right: 1px solid rgba(255,255,255,.1);
          padding: 8px;
          scrollbar-gutter: stable;
        }

        .touchline-game.is-live-standalone .arena-live-dock-list > button {
          min-height: 62px;
          grid-template-columns: minmax(0, 1fr) 42px minmax(0, 1fr);
          border-radius: 13px;
          padding: 6px 7px;
        }

        .touchline-game.is-live-standalone .arena-live-dock-list > button .arena-live-dock-club:first-child {
          justify-items: start;
        }

        .touchline-game.is-live-standalone .arena-live-dock-list > button .arena-live-dock-club:last-child {
          justify-items: end;
        }

        .touchline-game.is-live-standalone .arena-live-dock-badge {
          width: 40px;
          height: 40px;
        }

        .touchline-game.is-live-standalone .arena-live-dock-badge img {
          width: 36px;
          height: 36px;
        }

        .touchline-game.is-live-standalone .arena-live-match-center,
        .touchline-game.is-live-standalone .arena-live-select-hint {
          min-height: 0;
          margin: 0;
          overflow: auto;
          overscroll-behavior: contain;
          border: 0;
          border-radius: 0;
          padding: clamp(14px, 2.4vw, 32px);
          background: transparent;
        }

        .touchline-game.is-live-standalone .arena-live-match-center {
          container-type: inline-size;
          grid-auto-rows: max-content;
          align-content: start;
          scrollbar-gutter: stable;
        }

        .touchline-game.is-live-standalone .arena-live-dock-close {
          width: 44px;
          height: 44px;
        }

        .touchline-game.is-live-standalone .arena-live-dock-close:focus-visible,
        .touchline-game.is-live-standalone .arena-live-dock-list > button:focus-visible,
        .touchline-game.is-live-standalone .arena-live-coach-card:focus-visible,
        .touchline-game.is-live-standalone .arena-player-spotlight-close:focus-visible {
          outline: 2px solid #b5ff4b;
          outline-offset: 2px;
        }

        .arena-live-match-score {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: clamp(8px, 3cqw, 38px);
          width: min(100%, 940px);
          min-height: clamp(104px, 14cqw, 150px);
          margin: 14px auto 0;
          overflow: hidden;
          border: 6px solid rgba(14,25,27,.98);
          border-radius: 22px;
          outline: 1px solid rgba(181,255,75,.34);
          padding: clamp(18px, 2.7cqw, 32px) clamp(12px, 3cqw, 38px) clamp(12px, 2.1cqw, 24px);
          background:
            repeating-linear-gradient(0deg, rgba(255,255,255,.022) 0 1px, transparent 1px 4px),
            radial-gradient(circle at 50% 48%, rgba(163,255,18,.13), transparent 34%),
            linear-gradient(120deg, rgba(4,20,21,.98), rgba(1,8,10,.99) 48%, rgba(5,23,20,.98));
          box-shadow:
            0 18px 34px rgba(0,0,0,.52),
            0 0 28px rgba(163,255,18,.12),
            inset 0 0 32px rgba(163,255,18,.06);
        }

        .arena-live-match-score::before,
        .arena-live-match-score::after {
          content: "";
          position: absolute;
          top: 10px;
          bottom: 10px;
          width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, transparent, rgba(181,255,75,.7), transparent);
          box-shadow: 0 0 12px rgba(163,255,18,.42);
        }

        .arena-live-match-score::before { left: 9px; }
        .arena-live-match-score::after { right: 9px; }

        .arena-live-match-score > .arena-live-match-team,
        .arena-live-match-score > .arena-live-score-centre,
        .arena-live-match-score > .arena-live-score-live {
          position: relative;
          z-index: 2;
        }

        .arena-live-score-sweep {
          position: absolute;
          top: -35%;
          bottom: -35%;
          left: -24%;
          z-index: 1;
          width: 16%;
          background: linear-gradient(90deg, transparent, rgba(244,255,230,.5), transparent);
          filter: blur(7px);
          opacity: 0;
          pointer-events: none;
          transform: skewX(-13deg);
          /* A repeated sweep obscured club names and made the scoreboard look
             like it was blinking in Safari. Keep the premium screen lighting
             in the board background instead of animating over live data. */
          animation: none;
        }

        .arena-live-score-live {
          position: absolute !important;
          top: clamp(7px, .9cqw, 11px);
          left: 50%;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(181,255,75,.58);
          border-radius: 999px;
          padding: clamp(3px, .55cqw, 5px) clamp(7px, .9cqw, 10px);
          color: #efffd5;
          background: rgba(163,255,18,.1);
          box-shadow: 0 0 12px rgba(163,255,18,.18), inset 0 0 9px rgba(163,255,18,.07);
          font-size: clamp(6px, .75cqw, 9px);
          font-style: normal;
          font-weight: 1000;
          letter-spacing: .08em;
          transform: translateX(-50%);
          animation: none;
        }

        .arena-live-score-live.is-live {
          animation: arenaLiveBeacon 1400ms ease-in-out infinite;
        }

        .arena-live-score-live::before {
          content: "";
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #b5ff4b;
          box-shadow: 0 0 8px rgba(181,255,75,.9);
        }

        .arena-live-match-kicker {
          display: block;
          width: max-content;
          margin: 0 auto;
          color: rgba(181,255,75,.86);
          font-size: 8px;
          letter-spacing: .22em;
        }

        .arena-live-match-team {
          display: grid;
          width: 100%;
          justify-items: center;
          gap: 8px;
          min-width: 0;
          text-align: center;
        }

        .arena-live-match-score > .arena-live-match-team:first-of-type {
          justify-items: start;
          padding-left: clamp(14px, 2cqw, 22px);
          text-align: left;
        }

        .arena-live-match-score > .arena-live-match-team:last-of-type {
          justify-items: end;
          padding-right: clamp(14px, 2cqw, 22px);
          text-align: right;
        }

        .arena-live-match-team img {
          width: clamp(40px, 6.4cqw, 82px);
          height: clamp(40px, 6.4cqw, 82px);
          border: 0;
          border-radius: 0;
          outline: 0;
          background: transparent;
          box-shadow: none;
          object-fit: contain;
          filter: drop-shadow(0 12px 18px rgba(0,0,0,.42));
        }

        .arena-live-match-team strong {
          display: block;
          width: 100%;
          max-width: min(100%, 260px);
          overflow: visible;
          color: #fff;
          font-size: clamp(9px, 1.6cqw, 16px);
          line-height: 1.08;
          text-wrap: balance;
          white-space: normal;
        }

        .touchline-game.is-live-standalone .arena-live-match-score > b {
          display: grid;
          min-width: clamp(66px, 10cqw, 118px);
          justify-items: center;
          gap: 6px;
          border: 0;
          background: transparent;
          padding: 0;
          font-size: clamp(20px, 3.4cqw, 38px);
          text-shadow: 0 0 24px rgba(181,255,75,.24);
          transform: translateY(clamp(7px, 1.2cqw, 13px));
        }

        .arena-live-score-centre > img {
          width: clamp(44px, 5.2vw, 68px);
          height: clamp(44px, 5.2vw, 68px);
          object-fit: contain;
          filter: drop-shadow(0 0 8px rgba(197,255,109,.55));
        }

        .arena-live-score-centre > span {
          color: #efffd4;
          font-size: clamp(30px, 5.2cqw, 58px);
          font-weight: 1000;
          line-height: .78;
          letter-spacing: -.08em;
          text-shadow: 0 0 28px rgba(181,255,75,.34), 0 4px 18px rgba(0,0,0,.72);
          white-space: nowrap;
        }

        .arena-live-score-centre > small {
          color: rgba(225,255,239,.68);
          font-size: clamp(8px, 1cqw, 11px);
          font-weight: 950;
          letter-spacing: .14em;
        }

        .arena-live-stadium {
          position: relative;
          margin-top: 12px;
          overflow: hidden;
          border: 1px solid rgba(181,255,75,.24);
          border-radius: 24px;
          padding: 10px clamp(8px, 1.6vw, 18px) 45px;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(181,255,75,.18), transparent 38%),
            linear-gradient(180deg, rgba(2,18,16,.98), rgba(1,8,10,.98));
          box-shadow: inset 0 0 70px rgba(0,0,0,.7), 0 24px 54px rgba(0,0,0,.36);
          isolation: isolate;
        }

        .arena-live-stadium::before,
        .arena-live-stadium::after {
          content: "";
          position: absolute;
          top: -30px;
          z-index: 0;
          width: 44%;
          height: 130px;
          background: radial-gradient(ellipse, rgba(233,255,239,.17), transparent 66%);
          filter: blur(7px);
          pointer-events: none;
        }

        .arena-live-stadium::before { left: -7%; transform: rotate(10deg); }
        .arena-live-stadium::after { right: -7%; transform: rotate(-10deg); }

        .arena-live-led-board {
          position: absolute;
          left: 4%;
          right: 4%;
          z-index: 4;
          height: 25px;
          overflow: hidden;
          border: 1px solid rgba(181,255,75,.48);
          border-radius: 5px;
          background: linear-gradient(180deg, rgba(18,57,31,.96), rgba(2,12,11,.98));
          color: #b5ff4b;
          box-shadow: 0 0 16px rgba(163,255,18,.26), inset 0 0 12px rgba(163,255,18,.14);
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: .22em;
          line-height: 23px;
          white-space: nowrap;
          text-shadow: 0 0 9px rgba(181,255,75,.72);
          transform: perspective(450px) rotateX(-8deg);
        }

        .arena-live-led-board-top {
          top: 10px;
          left: 4%;
          right: 4%;
          height: clamp(76px, 7.6vw, 94px);
          overflow: visible;
          border: 5px solid rgba(19,31,32,.98);
          border-radius: 11px;
          outline: 1px solid rgba(181,255,75,.44);
          background:
            repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 4px),
            radial-gradient(ellipse at 50% 50%, rgba(163,255,18,.12), transparent 68%),
            #020a0b;
          box-shadow:
            0 0 0 1px rgba(255,255,255,.06),
            0 8px 18px rgba(0,0,0,.72),
            0 0 24px rgba(163,255,18,.18),
            inset 0 0 22px rgba(163,255,18,.1);
          line-height: 1;
          transform: perspective(650px) rotateX(-4deg);
        }

        .arena-live-led-board-top::before,
        .arena-live-led-board-top::after {
          content: "";
          position: absolute;
          top: 100%;
          width: 9px;
          height: 22px;
          border: 1px solid rgba(255,255,255,.08);
          background: linear-gradient(90deg, #050a0b, #273133 50%, #050a0b);
          box-shadow: 0 5px 9px rgba(0,0,0,.5);
        }

        .arena-live-led-board-top::before { left: 14%; }
        .arena-live-led-board-top::after { right: 14%; }

        .arena-live-screen-content {
          position: relative;
          display: grid;
          grid-template-columns: auto minmax(0,1fr) auto;
          align-items: center;
          gap: clamp(8px, 1vw, 13px);
          width: 100%;
          height: 100%;
          overflow: hidden;
          border-radius: 6px;
          padding: 0 clamp(10px, 1.25vw, 17px);
        }

        .arena-live-screen-content::after {
          content: "";
          position: absolute;
          top: -35%;
          bottom: -35%;
          left: -24%;
          z-index: 5;
          width: 16%;
          background: linear-gradient(90deg, transparent, rgba(244,255,230,.48), transparent);
          filter: blur(7px);
          opacity: 0;
          pointer-events: none;
          transform: skewX(-13deg);
          animation: arenaLiveBoardSweep 6200ms 2800ms ease-in-out infinite;
        }

        .arena-live-screen-logo {
          position: relative;
          display: grid;
          width: clamp(48px, 5.8vw, 72px);
          aspect-ratio: 1;
          place-items: center;
          overflow: visible;
        }

        .arena-live-screen-logo > img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .arena-live-screen-logo-outline {
          opacity: 0;
          filter:
            saturate(1.2)
            brightness(.92)
            drop-shadow(0 0 5px rgba(197,255,109,.58))
            drop-shadow(0 0 11px rgba(163,255,18,.24));
          animation:
            arenaLiveLogoOutlineIgnition 2600ms cubic-bezier(.2,.78,.2,1) both,
            arenaLiveLogoOutlineAfterglow 3600ms 2600ms ease-in-out infinite;
        }

        .arena-live-screen-logo-core {
          animation:
            arenaLiveLogoIgnition 2600ms cubic-bezier(.14,.84,.18,1) both,
            arenaLiveLogoAfterglow 3600ms 2600ms ease-in-out infinite;
        }

        .arena-live-screen-content > span {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .arena-live-screen-content small {
          color: rgba(181,255,75,.68);
          font-size: clamp(6px, .68vw, 9px);
          font-weight: 1000;
          letter-spacing: .28em;
        }

        .arena-live-screen-content strong {
          overflow: hidden;
          color: #e9ffd0;
          font-size: clamp(20px, 1.9vw, 25px);
          font-weight: 1000;
          letter-spacing: -.012em;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-shadow: 0 0 10px rgba(181,255,75,.5);
        }

        .arena-live-screen-content em {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(181,255,75,.58);
          border-radius: 999px;
          padding: 7px 12px;
          color: #efffd5;
          background: rgba(163,255,18,.12);
          box-shadow: 0 0 12px rgba(163,255,18,.2), inset 0 0 10px rgba(163,255,18,.08);
          font-size: clamp(8px, .85vw, 11px);
          font-style: normal;
          font-weight: 1000;
          letter-spacing: .08em;
          animation: arenaLiveBeacon 1400ms ease-in-out infinite;
        }

        .arena-live-screen-content em::before {
          content: "";
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #b5ff4b;
          box-shadow: 0 0 8px rgba(181,255,75,.92);
        }

        @keyframes arenaLiveBoardSweep {
          0%, 36% { left: -24%; opacity: 0; }
          40% { opacity: .72; }
          68% { left: 112%; opacity: .72; }
          72%, 100% { left: 112%; opacity: 0; }
        }

        @keyframes arenaLiveLogoOutlineIgnition {
          0% {
            opacity: .08;
            filter: grayscale(1) brightness(.14) drop-shadow(0 0 0 transparent);
            transform: scale(.94);
          }
          42% {
            opacity: .42;
            filter: saturate(.72) brightness(.45) drop-shadow(0 0 5px rgba(197,255,109,.3));
          }
          74% {
            opacity: .82;
            filter: saturate(1.04) brightness(.78) drop-shadow(0 0 8px rgba(197,255,109,.64)) drop-shadow(0 0 18px rgba(163,255,18,.28));
          }
          100% {
            opacity: 1;
            filter: saturate(1.18) brightness(.9) drop-shadow(0 0 5px rgba(197,255,109,.58)) drop-shadow(0 0 11px rgba(163,255,18,.24));
            transform: scale(1);
          }
        }

        @keyframes arenaLiveLogoAfterglow {
          0%, 100% {
            filter: saturate(1.06) brightness(.86) drop-shadow(0 0 4px rgba(197,255,109,.42)) drop-shadow(0 0 8px rgba(163,255,18,.18));
            transform: scale(.985);
          }
          50% {
            filter: saturate(1.18) brightness(1.06) drop-shadow(0 0 6px rgba(225,255,177,.7)) drop-shadow(0 0 13px rgba(163,255,18,.3));
            transform: scale(1.015);
          }
        }

        @keyframes arenaLiveLogoOutlineAfterglow {
          0%, 100% {
            opacity: .72;
            filter: saturate(1.02) brightness(.7) drop-shadow(0 0 4px rgba(197,255,109,.32)) drop-shadow(0 0 8px rgba(163,255,18,.14));
          }
          50% {
            opacity: 1;
            filter: saturate(1.2) brightness(1) drop-shadow(0 0 6px rgba(225,255,177,.66)) drop-shadow(0 0 14px rgba(163,255,18,.28));
          }
        }

        @keyframes arenaLiveLogoIgnition {
          0% {
            filter: saturate(.55) brightness(.28) drop-shadow(0 0 0 rgba(197,255,109,0));
            transform: scale(.965);
          }
          42% {
            filter: saturate(.9) brightness(.62) drop-shadow(0 0 4px rgba(197,255,109,.38)) drop-shadow(0 0 12px rgba(163,255,18,.16));
          }
          74% {
            filter: saturate(1.12) brightness(.96) drop-shadow(0 0 7px rgba(197,255,109,.72)) drop-shadow(0 0 18px rgba(163,255,18,.34));
          }
          100% {
            filter: saturate(1.12) brightness(1.02) drop-shadow(0 0 5px rgba(197,255,109,.62)) drop-shadow(0 0 12px rgba(163,255,18,.26));
            transform: scale(1);
          }
        }

        @keyframes arenaLiveBeacon {
          0%, 100% { opacity: .48; filter: brightness(.62); }
          50% { opacity: 1; filter: brightness(1.42); }
        }

        .arena-live-visualizer {
          position: relative;
          z-index: 1;
          width: 100%;
          min-height: 0;
          aspect-ratio: 2200 / 1555;
          overflow: hidden;
          border: 1px solid rgba(221,255,226,.3);
          border-radius: 18px;
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.025),
            inset 0 -120px 160px rgba(0,0,0,.44),
            inset 0 0 75px rgba(0,0,0,.6),
            0 16px 36px rgba(0,0,0,.38),
            0 0 28px rgba(163,255,18,.07);
          backdrop-filter: blur(18px) saturate(.88);
          transform: perspective(1100px) rotateX(1.8deg);
          transform-origin: 50% 100%;
        }

        .arena-live-visualizer::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 1;
          background:
            radial-gradient(ellipse at 50% 48%, rgba(2,14,13,.04) 0 24%, rgba(0,7,8,.3) 69%, rgba(0,3,5,.68) 100%),
            linear-gradient(180deg, rgba(1,9,10,.18), transparent 28% 70%, rgba(1,8,9,.28)),
            linear-gradient(115deg, transparent 18%, rgba(255,255,255,.035) 43%, transparent 64%);
          pointer-events: none;
        }

        .arena-live-ball {
          position: absolute;
          left: 50%;
          top: 50%;
          z-index: 2;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 0 18px rgba(255,255,255,.86);
          transform: translate(-50%, -50%);
        }

        .arena-live-card-simulation {
          position: absolute;
          inset: 5%;
          z-index: 3;
          overflow: hidden;
          border-radius: 2px;
          pointer-events: none;
        }

        .arena-live-card-simulation:not(.is-lineup-ready) .arena-live-moving-card {
          visibility: hidden;
          opacity: 0;
          pointer-events: none;
        }

        .arena-live-card-simulation.is-lineup-ready .arena-live-moving-card {
          visibility: visible;
          opacity: 1;
        }

        .arena-live-match-center[data-live-products-ready="false"] .arena-live-coach-card {
          visibility: hidden;
          opacity: 0;
          pointer-events: none;
        }

        .arena-live-match-center[data-live-products-ready="true"] .arena-live-coach-card {
          visibility: visible;
          opacity: 1;
        }

        .arena-live-moving-card {
          position: absolute;
          left: var(--live-card-x);
          top: var(--live-card-y);
          width: clamp(27px, 3vw, 42px);
          aspect-ratio: 430 / 691;
          cursor: zoom-in;
          pointer-events: auto;
          touch-action: manipulation;
          transform: translate(-50%, -50%);
          transform-origin: 50% 82%;
          /* Keep the complete product stable until real tracking coordinates
             are available. Twenty-two animated GPU layers made Safari expose
             partial card internals and occasionally collapse cards into dots. */
          will-change: auto;
          animation: none;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          contain: layout;
          isolation: isolate;
        }

        /* The moving product keeps its approved visual size, while its button
           owns a reliable 44px touch target around the artwork. */
        .touchline-game.is-live-standalone .arena-live-moving-card {
          --live-card-art-width: clamp(27px, 3vw, 42px);
          display: grid;
          width: max(44px, var(--live-card-art-width));
          min-height: 44px;
          aspect-ratio: auto;
          place-items: center;
          contain: layout;
        }

        .touchline-game.is-live-standalone .arena-live-moving-card .arena-live-compact-card-product > .touchline-card-surface {
          width: var(--live-card-art-width) !important;
          min-width: var(--live-card-art-width) !important;
          max-width: var(--live-card-art-width) !important;
          flex: 0 0 var(--live-card-art-width) !important;
        }

        .arena-live-compact-card-product {
          position: relative;
          display: block;
          width: var(--live-card-art-width, 100%);
          aspect-ratio: 430 / 691;
          pointer-events: none;
        }

        .arena-live-compact-card-product > .touchline-card-surface {
          width: 100% !important;
          min-width: 100% !important;
          max-width: 100% !important;
          height: 100%;
          margin: 0 !important;
        }

        .arena-live-moving-card:focus-visible {
          border-radius: 5px;
          outline: 2px solid #b5ff4b;
          outline-offset: 3px;
        }

        .arena-live-moving-card::after {
          content: "";
          position: absolute;
          left: 16%;
          right: 16%;
          bottom: -5%;
          height: 10%;
          z-index: 1;
          border-radius: 0;
          background: transparent;
          filter: none;
        }

        .arena-live-moving-card.is-home {
          -webkit-filter: none;
          filter: none;
        }

        .arena-live-moving-card.is-away {
          -webkit-filter: none;
          filter: none;
        }

        .arena-live-moving-card .arena-live-compact-card-product > .touchline-card-surface {
          width: 100% !important;
          z-index: 1;
          pointer-events: none;
          opacity: 0;
          /* Do not promote all 22 cards to independent compositor layers.
             Safari was dropping and re-rasterising those layers, making
             complete cards disappear and reappear like flashing lights. */
          transform: none !important;
          -webkit-filter: none !important;
          filter: none !important;
          transition: none !important;
          will-change: auto !important;
          -webkit-backface-visibility: visible;
          backface-visibility: visible;
        }

        .arena-live-moving-card.is-card-ready .arena-live-compact-card-product > .touchline-card-surface {
          opacity: 1;
        }

        .arena-live-moving-card .arena-live-compact-card-product > .touchline-card-surface [data-touchline-card-frame="true"] {
          -webkit-filter: none !important;
          filter: none !important;
          transition: none !important;
          will-change: auto !important;
        }

        /* Twenty-two live cards deliberately stay on static paint layers.
           They retain the shared perimeter base stroke, but the travelling
           trace is disabled here so Safari never composites a new animated
           layer for every player. */
        .arena-live-moving-card .arena-live-compact-card-product > .touchline-card-surface :is([data-touchline-card-neon-trace-run="true"], [data-touchline-card-crest-trace-run="true"]),
        .arena-live-coach-card .arena-live-coach-card-art.touchline-card-surface :is([data-touchline-card-neon-trace-run="true"], [data-touchline-card-crest-trace-run="true"]) {
          animation: none !important;
          opacity: 0 !important;
          transition: none !important;
          will-change: auto !important;
        }

        .arena-live-lineup-status {
          position: absolute;
          left: 50%;
          top: 50%;
          border: 1px solid rgba(181,255,75,.3);
          border-radius: 999px;
          padding: 7px 11px;
          color: rgba(239,255,213,.82);
          background: rgba(2,10,12,.78);
          font-size: 8px;
          font-weight: 950;
          letter-spacing: .08em;
          pointer-events: none;
          transform: translate(-50%, -50%);
        }

        @keyframes arenaLiveCardMovement {
          0% {
            transform: translate(-50%, -50%) translate3d(var(--live-card-dx-start), var(--live-card-dy-start), 0);
          }
          45% {
            transform: translate(-50%, -50%) translate3d(0, 0, 0);
          }
          100% {
            transform: translate(-50%, -50%) translate3d(var(--live-card-dx), var(--live-card-dy), 0);
          }
        }

        .arena-live-technical-area {
          position: relative;
          z-index: 3;
          display: grid;
          grid-template-columns: minmax(0,1fr) auto minmax(0,1fr);
          align-items: center;
          gap: clamp(6px, 1.2vw, 14px);
          width: min(86%, 760px);
          margin: 7px auto 0;
          color: rgba(255,255,255,.78);
        }

        .arena-live-pitch-credit {
          position: absolute;
          right: 14px;
          bottom: 8px;
          z-index: 4;
          color: rgba(216,236,224,.42);
          font-size: 7px;
          font-weight: 700;
          letter-spacing: .02em;
          text-decoration: none;
          transition: color 160ms ease;
        }

        .arena-live-pitch-credit:hover,
        .arena-live-pitch-credit:focus-visible {
          color: rgba(225,255,239,.82);
        }

        .arena-live-coach-card {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: clamp(5px, .8vw, 10px);
          min-width: 0;
          min-height: 44px;
          border: 1px solid rgba(181,255,75,.18);
          border-radius: 9px 9px 3px 3px;
          padding: 4px 7px;
          background: linear-gradient(180deg, rgba(19,35,34,.92), rgba(3,11,13,.96));
          box-shadow: inset 0 1px rgba(255,255,255,.035), 0 7px 17px rgba(0,0,0,.28);
          cursor: zoom-in;
          outline: 0;
          overflow: visible;
          transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
        }

        .arena-live-coach-card:hover,
        .arena-live-coach-card:focus-visible {
          border-color: rgba(181,255,75,.48);
          background: linear-gradient(180deg, rgba(24,47,42,.96), rgba(3,13,14,.98));
          box-shadow: inset 0 1px rgba(255,255,255,.06), 0 10px 24px rgba(0,0,0,.38), 0 0 18px rgba(181,255,75,.08);
        }

        .arena-live-coach-card.is-away .arena-live-coach-card-art {
          grid-column: 2;
          grid-row: 1;
        }

        .arena-live-coach-card.is-away .arena-live-coach-copy {
          grid-column: 1;
          grid-row: 1;
          justify-items: end;
          text-align: right;
        }

        .arena-live-coach-card-art {
          width: clamp(35px, 3.9vw, 55px) !important;
          min-width: 35px;
          max-width: 55px;
          pointer-events: none;
        }

        .arena-live-coach-copy {
          display: grid;
          min-width: 0;
          align-content: center;
        }

        .arena-live-coach-copy > span,
        .arena-live-coach-copy > small {
          overflow: hidden;
          color: rgba(181,255,75,.66);
          font-size: 6px;
          font-weight: 900;
          letter-spacing: .08em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .arena-live-coach-copy > strong {
          overflow: hidden;
          margin-top: 2px;
          font-size: clamp(7px, .85vw, 10px);
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .arena-live-coach-copy > small {
          margin-top: 2px;
          color: rgba(255,255,255,.35);
          letter-spacing: 0;
          text-transform: none;
        }

        .arena-live-technical-area > b {
          color: rgba(255,255,255,.28);
          font-size: 6px;
          letter-spacing: .14em;
          writing-mode: vertical-rl;
        }

        @media (max-width: 900px) {
          .arena-live-coach-card-art {
            width: clamp(30px, 7.4vw, 42px) !important;
            min-width: 30px;
            max-width: 42px;
          }
        }

        @media (max-width: 900px) and (orientation: portrait) {
          .touchline-game.is-live-standalone .arena-live-dock,
          .touchline-game.is-live-standalone .arena-live-dock.is-open {
            padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
          }

          .touchline-game.is-live-standalone .arena-live-dock-panel {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto minmax(0, 1fr);
            width: 100%;
            height: calc(100dvh - max(16px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
            min-height: 0;
            max-height: calc(100dvh - max(16px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
            border-radius: 15px;
          }

          .touchline-game.is-live-standalone .arena-live-dock-list {
            display: flex;
            min-height: 94px;
            max-height: none;
            overflow-x: auto;
            overflow-y: hidden;
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,.1);
          }

          .touchline-game.is-live-standalone .arena-live-dock-list > button {
            width: min(190px, 56vw);
            min-width: min(190px, 56vw);
          }

          .touchline-game.is-live-standalone .arena-live-match-center {
            padding: 20px 14px 34px;
          }
        }

        @media (max-width: 760px) {
          .touchline-game.is-live-standalone .arena-live-dock,
          .touchline-game.is-live-standalone .arena-live-dock.is-open {
            padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
          }

          .touchline-game.is-live-standalone .arena-live-dock-panel {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto 1fr;
            width: 100%;
            height: calc(100dvh - max(16px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
            min-height: 0;
            max-height: calc(100dvh - max(16px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
            border-radius: 15px;
          }

          .touchline-game.is-live-standalone .arena-live-dock-list {
            display: flex;
            min-height: 94px;
            max-height: none;
            overflow-x: auto;
            overflow-y: hidden;
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,.1);
          }

          .touchline-game.is-live-standalone .arena-live-dock-list > button {
            width: min(190px, 56vw);
            min-width: min(190px, 56vw);
          }

          .touchline-game.is-live-standalone .arena-live-match-center {
            padding: 20px 14px 34px;
          }

          .arena-live-match-team img {
            width: clamp(38px, 10vw, 48px);
            height: clamp(38px, 10vw, 48px);
          }

          .arena-live-match-team strong {
            max-width: 32vw;
            font-size: clamp(9px, 2.8vw, 12px);
          }

          .arena-live-visualizer {
            min-height: 0;
            aspect-ratio: 2200 / 1555;
          }

          .arena-live-moving-card {
            width: clamp(30px, 7.8vw, 38px);
          }

          .touchline-game.is-live-standalone .arena-live-moving-card {
            --live-card-art-width: clamp(30px, 7.8vw, 38px);
            width: max(44px, var(--live-card-art-width));
          }

          .arena-live-stadium {
            margin-top: 8px;
            border-radius: 18px;
            padding: 7px 6px 43px;
          }

          .arena-live-led-board {
            left: 3%;
            right: 3%;
            font-size: 8px;
          }

          .arena-live-led-board-top {
            left: 2%;
            right: 2%;
            height: 74px;
          }

          .arena-live-screen-content {
            gap: 7px;
            padding: 0 9px;
          }

          .arena-live-screen-logo {
            width: 40px;
          }

          .arena-live-screen-content > span {
            gap: 2px;
          }

          .arena-live-screen-content small {
            font-size: 5px;
            letter-spacing: .18em;
          }

          .arena-live-screen-content strong {
            display: -webkit-box;
            overflow: hidden;
            font-size: 11px;
            letter-spacing: .015em;
            line-height: 1.25;
            text-overflow: clip;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }

          .arena-live-screen-content em {
            gap: 4px;
            padding: 5px 7px;
            font-size: 7px;
          }

          .arena-live-technical-area {
            width: 98%;
            gap: 3px;
          }

          .arena-live-coach-card {
            gap: 4px;
            padding: 3px 4px;
          }

          .arena-live-coach-copy > strong { font-size: 7px; }
          .arena-live-coach-copy > span,
          .arena-live-coach-copy > small { font-size: 5px; }

          .touchline-game.is-bench-standalone .arena-action-layer {
            padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(22px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
          }

          .touchline-game.is-bench-standalone .arena-action-panel-bench {
            width: 100%;
            min-height: calc(100dvh - 16px);
            border-radius: 16px;
            padding: 12px;
          }

          .touchline-game.is-bench-standalone .arena-club-sections {
            display: flex;
            justify-content: flex-start;
            gap: 6px;
            overflow-x: auto;
            padding: 5px;
            scroll-snap-type: x proximity;
            scrollbar-width: thin;
          }

          .touchline-game.is-bench-standalone .arena-club-sections a {
            min-width: 132px;
            flex: 0 0 auto;
            padding: 0 12px;
            scroll-snap-align: start;
          }

          .touchline-game.is-bench-standalone .training-center-head {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-rows: auto auto;
            gap: 7px 10px;
          }

          .touchline-game.is-bench-standalone .training-center-head > span {
            grid-column: 1;
            grid-row: 1;
            align-self: center;
          }

          .touchline-game.is-bench-standalone .training-center-head > strong {
            grid-column: 2;
            grid-row: 1;
            align-self: center;
          }

          .touchline-game.is-bench-standalone .training-center-coach {
            grid-column: 1 / -1;
            grid-row: 2;
            width: 100%;
            max-width: none;
            justify-self: stretch;
          }
        }

        /* Phones and tablets in short landscape need the same full Live page,
           not the desktop 235px rail squeezing the pitch into a sliver. */
        @media (max-width: 1100px) and (max-height: 560px) and (orientation: landscape) {
          .touchline-game.is-live-standalone .arena-live-dock,
          .touchline-game.is-live-standalone .arena-live-dock.is-open {
            padding: max(6px, env(safe-area-inset-top)) max(6px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left));
          }

          .touchline-game.is-live-standalone .arena-live-dock-panel {
            grid-template-columns: clamp(136px, 19vw, 168px) minmax(0, 1fr);
            grid-template-rows: 48px minmax(0, 1fr);
            width: 100%;
            height: calc(100dvh - max(12px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
            min-height: 0;
            max-height: calc(100dvh - max(12px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
            border-radius: 14px;
          }

          .touchline-game.is-live-standalone .arena-live-dock-head {
            grid-column: 1 / -1;
            grid-row: 1;
            min-height: 48px;
            padding: 4px 9px 4px 11px;
          }

          .touchline-game.is-live-standalone .arena-live-dock-title strong {
            font-size: 15px;
          }

          .touchline-game.is-live-standalone .arena-live-dock-title small {
            font-size: 8px;
          }

          .touchline-game.is-live-standalone .arena-live-dock-list {
            grid-column: 1;
            grid-row: 2;
            display: grid;
            min-height: 0;
            max-height: none;
            align-content: start;
            gap: 5px;
            overflow-x: hidden;
            overflow-y: auto;
            border-right: 1px solid rgba(255,255,255,.1);
            border-bottom: 0;
            padding: 6px;
            scroll-snap-type: y proximity;
            scrollbar-gutter: stable;
          }

          .touchline-game.is-live-standalone .arena-live-dock-list > button {
            width: 100%;
            min-width: 0;
            min-height: 50px;
            grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr);
            border-radius: 10px;
            padding: 4px 5px;
            scroll-snap-align: start;
          }

          .touchline-game.is-live-standalone .arena-live-dock-badge {
            width: 30px;
            height: 30px;
          }

          .touchline-game.is-live-standalone .arena-live-dock-badge img {
            width: 28px;
            height: 28px;
          }

          .touchline-game.is-live-standalone .arena-live-match-center,
          .touchline-game.is-live-standalone .arena-live-select-hint {
            grid-column: 2;
            grid-row: 2;
            min-height: 0;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: 7px 10px 16px;
            scroll-padding-block: 8px 18px;
            scrollbar-gutter: stable;
          }

          .touchline-game.is-live-standalone .arena-live-match-center {
            grid-auto-rows: max-content;
            align-content: start;
            justify-items: center;
          }

          .touchline-game.is-live-standalone .arena-live-match-kicker {
            margin-top: 0;
          }

          .touchline-game.is-live-standalone .arena-live-match-score {
            width: min(100%, 560px);
            min-height: 76px;
            margin-top: 2px;
            border-width: 4px;
            border-radius: 16px;
            padding: 11px 18px 8px;
          }

          .touchline-game.is-live-standalone .arena-live-match-team {
            gap: 3px;
          }

          .touchline-game.is-live-standalone .arena-live-match-team img {
            width: 34px;
            height: 34px;
          }

          .touchline-game.is-live-standalone .arena-live-match-team strong {
            font-size: 9px;
          }

          .touchline-game.is-live-standalone .arena-live-score-live {
            top: 4px;
            padding: 2px 7px;
            font-size: 6px;
          }

          .touchline-game.is-live-standalone .arena-live-score-centre > span {
            font-size: 30px;
          }

          .touchline-game.is-live-standalone .arena-live-score-centre > small {
            font-size: 7px;
          }

          .touchline-game.is-live-standalone .arena-live-stadium,
          .touchline-game.is-live-standalone .arena-live-match-tabs,
          .touchline-game.is-live-standalone .arena-live-match-center > p,
          .touchline-game.is-live-standalone .arena-live-match-center > small {
            width: min(100%, 560px);
          }

          .touchline-game.is-live-standalone .arena-live-stadium {
            flex: none;
            margin-top: 4px;
            border-radius: 16px;
            padding: 6px 8px 36px;
          }

          .touchline-game.is-live-standalone .arena-live-visualizer {
            width: 100%;
            height: auto;
            min-height: 0;
            aspect-ratio: 2200 / 1555;
          }

          .touchline-game.is-live-standalone .arena-live-technical-area {
            width: 96%;
            margin-top: 5px;
          }

          .touchline-game.is-live-standalone .arena-live-coach-card {
            min-height: 40px;
            padding: 3px 5px;
          }

          .touchline-game.is-live-standalone .arena-live-coach-card-art {
            width: 34px !important;
            min-width: 34px;
            max-width: 34px;
          }

          .touchline-game.is-live-standalone .arena-player-spotlight-panel {
            --live-short-spotlight-card-width: min(200px, calc((100dvh - 36px) * 430 / 691));
            width: min(calc(var(--live-short-spotlight-card-width) + 208px), calc(100vw - 24px));
            min-width: 0;
            max-height: calc(100dvh - 12px);
            grid-template-columns: minmax(150px, var(--live-short-spotlight-card-width)) minmax(130px, 1fr);
            align-items: center;
          }

          .touchline-game.is-live-standalone .arena-player-spotlight-card {
            grid-row: 1 / 3;
          }

          .touchline-game.is-live-standalone .arena-player-spotlight-close,
          .touchline-game.is-live-standalone .arena-coach-spotlight-panel > .arena-player-spotlight-close {
            top: 4px;
            right: 4px;
          }
        }

        .arena-club-sections {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 7px;
          margin-top: 10px;
          padding: 4px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 12px;
          background: rgba(0,0,0,.2);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.02);
        }

        .arena-club-sections button,
        .arena-club-sections a {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
          min-height: 34px;
          overflow: hidden;
          border-radius: 8px;
          background: rgba(255,255,255,.045);
          padding: 0 10px;
          color: rgba(255,255,255,.64);
          font-size: 8px;
          font-weight: 1000;
          text-align: center;
          text-decoration: none;
          text-overflow: ellipsis;
          white-space: nowrap;
          transition: background .16s ease, color .16s ease, box-shadow .16s ease;
        }

        .arena-club-sections button:hover,
        .arena-club-sections a:hover,
        .arena-club-sections button.is-active {
          background: rgba(181,255,75,.14);
          color: #f0ff9f;
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.26);
        }

        .arena-premium-grid,
        .arena-bench-board {
          margin-top: 14px;
        }

        .bench-list button,
        .arena-premium-grid article {
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(5,12,16,.22);
          color: white;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
          backdrop-filter: blur(10px);
        }

        .arena-premium-grid span,
        .bench-status,
        .bench-confirm > span,
        .bench-swap-preview > span {
          font-size: 8px;
          font-weight: 1000;                    color: rgba(122,231,255,.76);
        }

        .bench-list .bench-status {
          position: absolute;
          left: 12px;
          top: 12px;
          z-index: 2;
          border: 1px solid rgba(181,255,75,.24);
          border-radius: 999px;
          background: rgba(4,10,8,.64);
          padding: 6px 9px;
          color: #dfff95;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.04), 0 8px 18px rgba(0,0,0,.26);
          backdrop-filter: blur(10px);
        }

        .arena-bench-board {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
          gap: 16px;
          flex: 1 1 auto;
          min-height: 0;
          height: auto;
          overflow: hidden;
        }

        .bench-list-shell {
          min-height: 0;
          height: 100%;
          overflow: auto;
          padding-right: 6px;
          padding-bottom: 168px;
          scroll-padding-bottom: 168px;
          scroll-padding-top: 8px;
          scroll-snap-type: y proximity;
          overscroll-behavior: contain;
          scrollbar-color: rgba(181,255,75,.58) rgba(255,255,255,.08);
        }

        .bench-list > button,
        .bench-vault-list > button {
          scroll-snap-align: start;
          scroll-snap-stop: normal;
        }

        .bench-roster-summary {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 10px;
        }

        .bench-roster-summary span {
          display: grid;
          gap: 4px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.055);
          padding: 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
        }

        .bench-roster-summary small {
          color: rgba(122,231,255,.7);
          font-size: 8px;
          font-weight: 1000;                  }

        .bench-roster-summary strong {
          color: white;
          font-size: 18px;
          line-height: 1;
          font-weight: 1000;
        }

        .bench-rule-stack {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
          margin-bottom: 8px;
        }

        .bench-rule-stack span {
          display: grid;
          gap: 4px;
          border-radius: 13px;
          border: 1px solid rgba(122,231,255,.12);
          background: rgba(0,0,0,.22);
          padding: 9px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
        }

        .bench-rule-stack small {
          color: rgba(122,231,255,.66);
          font-size: 7px;
          font-weight: 1000;                  }

        .bench-rule-stack strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.76);
          font-size: 10px;
          line-height: 1;
          font-weight: 1000;
                  }

        .bench-formation-rule {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-radius: 14px;
          border: 1px solid rgba(181,255,75,.18);
          background: rgba(181,255,75,.075);
          padding: 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
        }

        .bench-formation-count {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 7px;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(0,0,0,.22);
          padding: 9px 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
        }

        .bench-formation-count span,
        .bench-formation-count strong {
          font-size: 8px;
          font-weight: 1000;                  }

        .bench-formation-count span {
          color: rgba(181,255,75,.72);
        }

        .bench-formation-count strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.58);
        }

        .bench-striker-note {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 7px;
          border-radius: 13px;
          border: 1px solid rgba(122,231,255,.14);
          background: rgba(0,0,0,.24);
          padding: 9px 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
        }

        .bench-striker-note span,
        .bench-striker-note strong {
          font-size: 8px;
          font-weight: 1000;                  }

        .bench-striker-note span {
          color: rgba(122,231,255,.78);
        }

        .bench-striker-note strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.58);
        }

        .bench-flow-guide {
          display: grid;
          grid-template-columns: auto repeat(3, minmax(0, 1fr));
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          border-radius: 14px;
          border: 1px solid rgba(181,255,75,.18);
          background:
            linear-gradient(90deg, rgba(181,255,75,.105), rgba(122,231,255,.06)),
            rgba(0,0,0,.22);
          padding: 9px 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
        }

        .bench-flow-guide span,
        .bench-flow-guide strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 8px;
          font-weight: 1000;                  }

        .bench-flow-guide span {
          color: rgba(181,255,75,.78);
        }

        .bench-flow-guide strong {
          border-radius: 999px;
          background: rgba(0,0,0,.26);
          padding: 6px 8px;
          color: rgba(255,255,255,.64);
          text-align: center;
        }

        .training-center-board {
          display: grid;
          gap: 8px;
          margin-top: 10px;
        }

        .substitution-flow {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
        }

        .substitution-flow span {
          display: flex;
          min-width: 0;
          min-height: 34px;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 10px;
          padding: 5px 8px;
          color: rgba(255,255,255,.5);
          background: rgba(2,8,8,.42);
          font-size: 7px;
          font-weight: 900;
        }

        .substitution-flow b {
          display: grid;
          width: 20px;
          height: 20px;
          flex: 0 0 auto;
          place-items: center;
          border-radius: 50%;
          color: #081006;
          background: rgba(255,255,255,.34);
          font-size: 8px;
        }

        .substitution-flow span.is-current,
        .substitution-flow span.is-done {
          border-color: rgba(163,255,18,.28);
          color: #efffc4;
          background: rgba(163,255,18,.07);
        }

        .substitution-flow span.is-current b,
        .substitution-flow span.is-done b { background: #a3ff12; }
        .substitution-flow span.is-done { opacity: .72; }

        .training-center-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          padding: 0 4px;
        }

        .training-center-head > strong {
          justify-self: end;
        }

        .training-center-head span,
        .training-center-head strong {
          font-size: 9px;
          font-weight: 1000;
        }

        .training-center-head span {
          color: rgba(181,255,75,.82);
        }

        .training-center-head strong {
          color: rgba(255,255,255,.68);
          font-variant-numeric: tabular-nums;
        }

        .training-center-coach {
          display: grid;
          grid-template-columns: 30px minmax(0, auto);
          align-items: center;
          gap: 7px;
          min-width: 0;
          border: 1px solid rgba(122,231,255,.18);
          border-radius: 8px;
          background: rgba(2,12,15,.44);
          padding: 4px 7px;
          box-shadow: inset 0 0 18px rgba(122,231,255,.035);
          color: inherit;
          cursor: pointer;
        }

        .training-center-coach.has-coach {
          grid-template-columns: 30px minmax(0, auto) auto;
        }

        .training-center-coach:hover,
        .training-center-coach:focus-visible {
          border-color: rgba(255,215,92,.56);
          outline: 0;
          box-shadow: inset 0 0 18px rgba(255,215,92,.06), 0 0 16px rgba(255,215,92,.14);
        }

        .training-center-coach-card {
          width: 26px;
          display: block;
        }

        .training-center-coach > svg {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          border: 1px solid rgba(122,231,255,.24);
          background: rgba(122,231,255,.07);
          color: rgba(122,231,255,.86);
          padding: 6px;
        }

        .training-center-coach > span {
          display: grid;
          gap: 1px;
          min-width: 0;
        }

        .training-center-coach small,
        .training-center-coach strong,
        .training-center-coach em {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-style: normal;
        }

        .training-center-coach small {
          color: rgba(181,255,75,.76);
          font-size: 6px;
          font-weight: 950;
        }

        .training-center-coach strong {
          max-width: 156px;
          color: rgba(255,255,255,.88);
          font-size: 8px;
          font-weight: 950;
        }

        .training-center-coach em {
          max-width: 126px;
          border-left: 1px solid rgba(255,255,255,.09);
          color: rgba(255,255,255,.48);
          padding-left: 7px;
          font-size: 6px;
          font-weight: 850;
        }

        .training-center-pitch {
          position: relative;
          width: min(100%, 720px);
          aspect-ratio: 105 / 68;
          justify-self: center;
          overflow: hidden;
          border-radius: 16px;
          isolation: isolate;
        }

        .training-center-pitch::before {
          content: none;
        }

        .training-center-halfway,
        .training-center-circle,
        .training-center-box,
        .training-center-goal {
          position: absolute;
          z-index: 0;
          border-color: rgba(255,255,255,.62);
          pointer-events: none;
        }

        .training-center-halfway {
          top: 4%;
          bottom: 4%;
          left: 50%;
          width: 1px;
          background: rgba(255,255,255,.62);
        }

        .training-center-circle {
          top: 50%;
          left: 50%;
          width: 18%;
          aspect-ratio: 1;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(255,255,255,.62);
          border-radius: 50%;
        }

        .training-center-box {
          top: 31%;
          width: 15%;
          height: 38%;
          border: 1px solid rgba(255,255,255,.62);
        }

        .training-center-box-left {
          left: 4%;
        }

        .training-center-box-right {
          right: 4%;
        }

        .training-center-goal {
          top: 40%;
          width: 2.5%;
          height: 20%;
          border: 1px solid rgba(255,255,255,.5);
        }

        .training-center-goal-left {
          left: 1.5%;
        }

        .training-center-goal-right {
          right: 1.5%;
        }

        .training-center-player {
          position: absolute;
          z-index: 2;
          display: grid;
          width: clamp(34px, 3.8vw, 50px);
          min-height: 0;
          gap: 3px;
          place-items: center;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          padding: 0;
          color: white;
          transform: translate(-50%, -50%);
          transition: filter .16s ease, transform .16s ease;
        }

        .training-center-player:hover,
        .training-center-player:focus-visible {
          border: 0;
          background: transparent;
          box-shadow: none;
          transform: translate(-50%, calc(-50% - 3px)) scale(1.04);
          filter: drop-shadow(0 10px 12px rgba(0,0,0,.42));
        }

        .training-center-player.is-target {
          filter: drop-shadow(0 0 10px rgba(181,255,75,.95));
        }

        .training-center-player-card {
          display: block;
          width: 100%;
          aspect-ratio: 430 / 691;
          overflow: visible;
          pointer-events: none;
        }

        .training-center-rendered-card {
          width: 100% !important;
          height: auto !important;
          min-width: 0 !important;
          transform: none !important;
        }

        .training-center-player-card > div,
        .training-center-player-card > div > div {
          background: transparent !important;
          box-shadow: none !important;
        }

        .training-center-player > strong {
          display: block;
          width: 150%;
          max-width: 82px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.9);
          font-size: 7px;
          line-height: 1;
          text-align: center;
          text-shadow: 0 2px 7px rgba(0,0,0,.95);
        }

        .bench-formation-rule span,
        .bench-formation-rule strong {
          font-size: 8px;
          font-weight: 1000;                  }

        .bench-formation-rule span {
          flex: 0 0 auto;
          color: #edff9b;
        }

        .bench-formation-rule strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.62);
        }

        .bench-group-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 10px 0 8px;
        }

        .bench-group-title span,
        .bench-group-title strong {
          font-size: 8px;
          font-weight: 1000;                  }

        .bench-group-title span {
          color: rgba(181,255,75,.78);
        }

        .bench-group-title strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.48);
        }

        .bench-group-title-vault {
          margin-top: 12px;
        }

        .bench-list {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px 12px;
          max-height: none;
          overflow: visible;
          padding: 4px 8px 30px 4px;
        }

        .quick-substitution-substituted-out {
          margin-top: 12px;
          border-top: 1px solid rgba(255,255,255,.08);
          padding-top: 2px;
        }

        .quick-substitution-substituted-out ul {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .quick-substitution-substituted-out li[data-substitution-status="substituted-out"] {
          display: grid;
          grid-template-columns: minmax(40px, 56px) minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          min-height: 88px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 13px;
          background: rgba(3,10,12,.26);
          padding: 7px;
          opacity: .42;
          pointer-events: none;
        }

        .quick-substitution-substituted-out .bench-player-card {
          width: min(52px, 100%);
          min-height: 76px;
          justify-self: center;
        }

        .quick-substitution-substituted-out li > span:last-child {
          display: grid;
          min-width: 0;
          gap: 4px;
        }

        .quick-substitution-substituted-out li > span:last-child strong,
        .quick-substitution-substituted-out li > span:last-child small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .quick-substitution-substituted-out li > span:last-child strong {
          color: rgba(255,255,255,.68);
          font-size: 10px;
          font-weight: 1000;
        }

        .quick-substitution-substituted-out li > span:last-child small {
          color: rgba(255,255,255,.44);
          font-size: 7px;
          font-weight: 850;
          line-height: 1.2;
          white-space: normal;
        }

        .bench-vault-list {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 6px;
          max-height: none;
          overflow: auto;
          padding: 2px 6px 4px 2px;
          scrollbar-color: rgba(122,231,255,.32) rgba(255,255,255,.07);
        }

        .bench-list button {
          display: grid;
          position: relative;
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, auto) auto;
          gap: 8px;
          min-height: 188px;
          place-items: center;
          align-content: start;
          border-color: rgba(255,255,255,.09);
          background: rgba(3,10,12,.34);
          box-shadow: none;
          backdrop-filter: blur(10px);
          padding: 10px 8px 8px;
          overflow: hidden;
          text-align: center;
          transition: border-color .16s ease, background .16s ease, transform .16s ease;
        }

        .bench-vault-list button {
          display: grid;
          gap: 3px;
          min-height: 92px;
          align-content: start;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(3,10,12,.3);
          padding: 5px 4px;
          color: rgba(255,255,255,.66);
          text-align: left;
          box-shadow: none;
          backdrop-filter: blur(9px);
          transition: border-color .16s ease, background .16s ease;
        }

        .bench-list button:hover,
        .bench-list button.is-active,
        .bench-vault-list button:hover,
        .bench-vault-list button.is-active {
          transform: translateY(-1px);
          border-color: rgba(181,255,75,.24);
          background: rgba(181,255,75,.055);
        }

        .bench-vault-list button.is-slot-locked {
          border-color: rgba(255,255,255,.07);
          background: rgba(3,10,12,.26);
          color: rgba(255,255,255,.42);
        }

        .bench-vault-list button.is-slot-locked .bench-player-card,
        .bench-vault-list button.is-slot-locked .bench-vault-copy {
          opacity: .55;
        }

        .bench-list button.is-formation-locked {
          border-color: rgba(255,255,255,.075);
          background: rgba(3,10,12,.3);
          color: rgba(255,255,255,.56);
        }

        .bench-list button.is-formation-locked .bench-player-card,
        .bench-list button.is-formation-locked .bench-card-copy {
          opacity: .62;
        }

        .bench-card-copy > strong,
        .bench-confirm > strong,
        .bench-swap-preview > strong,
        .arena-premium-grid strong {
          display: block;
          margin-top: 7px;
          font-size: 16px;
          line-height: .95;
          font-weight: 1000;
                  }

        .bench-player-card {
          position: relative;
          display: block;
          width: min(88px, 58%);
          height: auto;
          aspect-ratio: 430 / 691;
          min-height: 142px;
          overflow: visible;
          border-radius: 12px;
          border: 0;
          background: transparent;
          box-shadow: none;
          pointer-events: none;
        }

        .bench-rendered-card {
          width: 100% !important;
          height: auto !important;
          min-width: 0 !important;
          transform: none !important;
        }

        .bench-player-card > div,
        .bench-selected-card > div {
          background: transparent !important;
          box-shadow: none !important;
          filter: none !important;
        }

        .bench-player-card > div > div[aria-label] > div[aria-hidden="true"] {
          display: none !important;
        }

        .bench-player-card * {
          pointer-events: none;
        }

        .bench-card-copy {
          display: grid;
          min-width: 0;
          width: min(160px, 94%);
          align-content: center;
          justify-items: center;
          border-radius: 13px;
          background: transparent;
          padding: 0 6px;
          box-shadow: none;
          text-shadow: 0 2px 10px rgba(0,0,0,.85);
        }

        .bench-card-copy strong,
        .bench-vault-copy strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .bench-card-copy > strong {
          max-width: 100%;
          margin-top: 0;
          font-size: 11px;
          line-height: 1;
        }

        .bench-card-copy > small,
        .bench-card-copy > em {
          display: block;
          max-width: 100%;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.5);
          font-size: 8px;
          font-weight: 800;
          line-height: 1.2;
        }

        .bench-vault-lock {
          width: fit-content;
          border-radius: 999px;
          background: rgba(122,231,255,.11);
          padding: 4px 6px;
          color: rgba(122,231,255,.74);
          font-size: 8px;
          font-weight: 1000;
        }

        .bench-vault-list .bench-player-card-vault {
          width: min(46px, 100%);
          min-height: 74px;
          justify-self: center;
        }

        .bench-vault-copy {
          display: grid;
          min-width: 0;
          text-align: center;
        }

        .bench-vault-copy > strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
                  }

        .bench-vault-copy > small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.42);
          font-size: 8px;
          font-weight: 800;
        }

        .bench-list em {
          color: rgba(181,255,75,.72);
          font-style: normal;
        }

        .bench-status {
          width: fit-content;
          border-radius: 999px;
          background: rgba(122,231,255,.12);
          padding: 5px 7px;
          color: rgba(122,231,255,.86);
          box-shadow: inset 0 0 0 1px rgba(122,231,255,.18);
        }

        .bench-status-hot {
          background: rgba(181,255,75,.15);
          color: #edff9b;
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.3);
        }

        .bench-status-watch {
          background: rgba(255,205,97,.13);
          color: #ffe0a0;
          box-shadow: inset 0 0 0 1px rgba(255,205,97,.24);
        }

        .bench-status-risk {
          background: rgba(255,91,123,.13);
          color: #ffb3c3;
          box-shadow: inset 0 0 0 1px rgba(255,91,123,.24);
        }

        .bench-confirm {
          --selected-card-rgb: 181 255 75;
          display: grid;
          align-content: start;
          gap: 9px;
          min-height: 0;
          overflow: auto;
          border-radius: 16px;
          border: 1px solid rgb(var(--selected-card-rgb) / .22);
          background:
            radial-gradient(circle at 50% 0%, rgb(var(--selected-card-rgb) / .12), transparent 34%),
            rgba(5,12,16,.22);
          backdrop-filter: blur(10px);
          padding: 14px;
          scrollbar-width: thin;
          scrollbar-color: rgb(var(--selected-card-rgb) / .45) rgba(255,255,255,.08);
        }

        .bench-confirm:has(.touchline-card-surface[data-card-tier="ruby-red"]) { --selected-card-rgb: 239 68 68; }
        .bench-confirm:has(.touchline-card-surface[data-card-tier="sapphire-blue"]) { --selected-card-rgb: 56 189 248; }
        .bench-confirm:has(.touchline-card-surface[data-card-tier="amethyst-purple"]) { --selected-card-rgb: 168 85 247; }
        .bench-confirm:has(.touchline-card-surface[data-card-tier="radiant-gold"]) { --selected-card-rgb: 250 204 21; }
        .bench-confirm:has(.touchline-card-surface[data-card-tier="emerald-green"]) { --selected-card-rgb: 34 197 94; }
        .bench-confirm:has(.touchline-card-surface[data-card-tier="clear-diamond"]) { --selected-card-rgb: 224 242 254; }
        .bench-confirm:has(.touchline-card-surface[data-card-tier="diamond-gold"]) { --selected-card-rgb: 255 224 138; }

        .bench-selected-card {
          display: grid;
          width: min(244px, 84%, calc((100dvh - 360px) * 430 / 691));
          max-height: min(392px, calc(100dvh - 360px));
          aspect-ratio: 430 / 691;
          place-self: center;
          overflow: visible;
          border: 0;
          background: transparent;
          box-shadow: none;
        }

        .bench-confirm p,
        .arena-premium-grid p {
          margin: 0;
          color: rgba(255,255,255,.56);
          font-size: 12px;
          font-weight: 800;
          line-height: 1.55;
        }

        .bench-swap-preview {
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.055);
          padding: 12px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
        }

        .bench-swap-preview-out {
          border-color: rgba(255,255,255,.14);
          background: rgba(0,0,0,.22);
        }

        .bench-swap-preview > small {
          display: block;
          margin-top: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.52);
          font-size: 10px;
          font-weight: 850;
        }

        .bench-rule-warning {
          border-radius: 12px;
          border: 1px solid rgba(255,91,123,.22);
          background: rgba(255,91,123,.1);
          padding: 9px;
          color: #ffc0cb !important;
          font-size: 10px !important;
          line-height: 1.4 !important;
        }

        .bench-confirm button {
          width: 100%;
          margin-top: 2px;
        }

        .bench-confirm button,
        .bench-open-player-profile {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          text-align: center;
        }

        .bench-confirm button > svg,
        .bench-open-player-profile > svg {
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
        }

        .bench-open-player-profile {
          width: 100%;
          min-height: 40px;
          border-radius: 12px;
          background: rgba(122,231,255,.1);
          padding: 0 14px;
          color: #bfeeff;
          font-size: 9px;
          font-weight: 1000;
          text-decoration: none;
          box-shadow: inset 0 0 0 1px rgba(122,231,255,.28);
        }

        .bench-confirm button:disabled {
          cursor: not-allowed;
          opacity: .48;
        }

        .bench-confirm .bench-release-contract {
          border-color: rgba(255,205,97,.28);
          background: rgba(255,205,97,.11);
          color: #ffe0a0;
        }

        .bench-confirm .bench-release-target-contract {
          border-color: rgba(255,91,123,.3);
          background: rgba(255,91,123,.1);
          color: #ffc3ce;
        }

        .bench-contract-confirmation {
          display: grid;
          gap: 8px;
          border: 1px solid rgba(255,91,123,.3);
          border-radius: 12px;
          background: rgba(22,5,10,.72);
          padding: 10px;
        }

        .bench-contract-confirmation > div {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }

        .bench-contract-confirmation > div button:last-child {
          background: rgba(255,91,123,.2);
          color: #ffd4dc;
          box-shadow: inset 0 0 0 1px rgba(255,91,123,.34);
        }

        .arena-premium-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .arena-premium-grid article {
          min-height: 180px;
          padding: 16px;
        }

        .rumour-board {
          display: grid;
          gap: 12px;
          margin-top: 14px;
        }

        .rumour-toolbar {
          display: grid;
          grid-template-columns: minmax(150px, .9fr) minmax(180px, 1.2fr) auto;
          gap: 10px;
          align-items: end;
        }

        .rumour-toolbar label {
          display: grid;
          gap: 6px;
        }

        .rumour-toolbar label span,
        .rumour-status-row span,
        .rumour-empty span,
        .rumour-card-topline span {
          font-size: 8px;
          font-weight: 1000;                    color: rgba(122,231,255,.76);
        }

        .rumour-toolbar select,
        .rumour-toolbar input {
          min-height: 38px;
          min-width: 0;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 12px;
          background: rgba(0,0,0,.26);
          color: white;
          padding: 0 12px;
          font-size: 11px;
          font-weight: 850;
          outline: none;
        }

        .rumour-sort {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }

        .rumour-sort button,
        .rumour-card-topline button {
          min-height: 38px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 12px;
          background: rgba(255,255,255,.065);
          color: rgba(255,255,255,.82);
          font-size: 8px;
          font-weight: 1000;                  }

        .rumour-sort button.is-active,
        .rumour-card-topline button[aria-pressed="true"] {
          border-color: rgba(181,255,75,.36);
          background: rgba(181,255,75,.12);
          color: #edff9b;
        }

        .rumour-status-row,
        .rumour-empty,
        .rumour-card {
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 16px;
          background: rgba(5,12,16,.24);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
          backdrop-filter: blur(10px);
        }

        .rumour-status-row {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 4px 10px;
          align-items: center;
          padding: 12px 14px;
        }

        .rumour-status-row strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: white;
          font-size: 12px;
          font-weight: 1000;
                  }

        .rumour-status-row small {
          grid-column: 1 / -1;
          color: rgba(255,255,255,.58);
          font-size: 11px;
          font-weight: 750;
        }

        .rumour-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          max-height: min(45dvh, 430px);
          overflow: auto;
          padding-right: 3px;
        }

        .rumour-card {
          display: grid;
          gap: 9px;
          min-height: 168px;
          padding: 14px;
        }

        .rumour-card-live {
          border-color: rgba(181,255,75,.28);
        }

        .rumour-card-confirmed,
        .rumour-card-official {
          border-color: rgba(122,231,255,.3);
        }

        .rumour-card-topline {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
        }

        .rumour-card-topline button {
          min-height: 30px;
          padding: 0 10px;
        }

        .rumour-card strong,
        .rumour-empty strong {
          display: block;
          color: white;
          font-size: 17px;
          line-height: 1;
          font-weight: 1000;
                  }

        .rumour-card p,
        .rumour-empty p {
          margin: 0;
          color: rgba(255,255,255,.58);
          font-size: 12px;
          font-weight: 800;
          line-height: 1.45;
        }

        .rumour-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: auto;
        }

        .rumour-meta span {
          min-height: 24px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 999px;
          background: rgba(255,255,255,.06);
          padding: 5px 8px;
          color: rgba(255,255,255,.72);
          font-size: 9px;
          font-weight: 950;
                  }

        .rumour-meta .is-owned-card {
          border-color: rgba(181,255,75,.32);
          color: #edff9b;
        }

        .rumour-empty {
          padding: 16px;
        }

        .team-builder-shell {
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          flex: 1 1 auto;
          min-height: 0;
          gap: 12px;
          margin-top: 14px;
          overflow: hidden;
        }

        .arena-card-ranking-panel {
          display: grid;
          gap: 12px;
          margin-top: 14px;
        }

        .arena-ranking-hero,
        .arena-owner-table,
        .arena-owner-row,
        .arena-ranking-featured article,
        .arena-ranking-row {
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(5,12,16,.18);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035), 0 18px 42px rgba(0,0,0,.18);
          backdrop-filter: blur(10px);
        }

        .arena-ranking-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px;
        }

        .arena-ranking-hero div {
          display: grid;
          gap: 6px;
          min-width: 0;
        }

        .arena-ranking-hero-links {
          display: flex !important;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px !important;
        }

        .arena-ranking-hero span,
        .arena-ranking-row span {
          color: rgba(122,231,255,.78);
          font-size: 9px;
          font-weight: 1000;                  }

        .arena-ranking-hero strong {
          color: white;
          font-size: clamp(24px, 3vw, 42px);
          line-height: .92;
          font-weight: 1000;
                  }

        .arena-ranking-hero small {
          color: rgba(255,255,255,.62);
          font-size: 11px;
          font-weight: 850;
          line-height: 1.45;
        }

        .arena-ranking-hero a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          border-radius: 13px;
          border: 1px solid rgba(181,255,75,.38);
          background: linear-gradient(135deg, rgba(181,255,75,.18), rgba(0,0,0,.24));
          color: #efff9b;
          padding: 0 14px;
          text-decoration: none;
                    white-space: nowrap;
          font-size: 9px;
          font-weight: 1000;        }

        .arena-ranking-section-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 14px;
          padding: 4px 2px;
        }

        .arena-ranking-section-head span {
          color: #b6ff4d;
          font-size: 10px;
          font-weight: 1000;                  }

        .arena-ranking-section-head small {
          max-width: 620px;
          color: rgba(255,255,255,.62);
          font-size: 10px;
          font-weight: 850;
          line-height: 1.45;
          text-align: right;
        }

        .arena-owner-table {
          display: grid;
          gap: 10px;
          padding: 14px;
        }

        .arena-owner-table-list {
          display: grid;
          gap: 8px;
        }

        .arena-owner-row {
          display: grid;
          grid-template-columns: 48px minmax(0, 1.4fr) minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 10px;
          min-height: 54px;
          padding: 10px 12px;
          color: white;
          text-decoration: none;
        }

        .arena-owner-row span {
          color: rgba(122,231,255,.8);
          font-size: 10px;
          font-weight: 1000;        }

        .arena-owner-row strong,
        .arena-owner-row b,
        .arena-owner-row em {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-style: normal;
          font-weight: 1000;
        }

        .arena-owner-row small {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.58);
          font-size: 10px;
          font-weight: 850;
        }

        .arena-owner-row b {
          color: #efff9b;
        }

        .arena-owner-row em {
          color: rgba(255,255,255,.84);
        }

        .arena-ranking-featured {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .arena-ranking-featured article {
          position: relative;
          display: grid;
          grid-template-columns: minmax(86px, 124px) minmax(0, 1fr);
          gap: 10px;
          align-items: center;
          min-height: 178px;
          padding: 12px;
          overflow: hidden;
        }

        .arena-ranking-position {
          position: absolute;
          left: 10px;
          top: 10px;
          z-index: 2;
          border: 1px solid rgba(181,255,75,.26);
          border-radius: 999px;
          background: rgba(0,0,0,.42);
          padding: 5px 8px;
          color: #efff9b;
          font-size: 9px;
          font-weight: 1000;
        }

        .arena-ranking-card-render {
          width: min(118px, 100%) !important;
          height: auto !important;
          transform: none !important;
        }

        .arena-ranking-featured article strong {
          display: block;
          color: white;
          font-size: 18px;
          line-height: .95;
          font-weight: 1000;
                  }

        .arena-ranking-featured article small {
          display: block;
          margin-top: 8px;
          color: rgba(255,255,255,.58);
          font-size: 10px;
          font-weight: 850;
          line-height: 1.35;
                  }

        .arena-ranking-list {
          display: grid;
          gap: 7px;
          max-height: min(28dvh, 260px);
          overflow: auto;
          padding-right: 2px;
          scrollbar-width: thin;
        }

        .arena-ranking-row {
          display: grid;
          grid-template-columns: 48px minmax(0, 1.1fr) minmax(0, .9fr) auto auto;
          gap: 10px;
          align-items: center;
          min-height: 48px;
          padding: 10px 12px;
          color: white;
          text-decoration: none;
        }

        .arena-ranking-row strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          font-weight: 1000;
                  }

        .arena-ranking-row small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.56);
          font-size: 10px;
          font-weight: 850;
                  }

        .arena-ranking-row b,
        .arena-ranking-row em {
          border-radius: 999px;
          background: rgba(0,0,0,.18);
          padding: 7px 9px;
          font-size: 10px;
          font-style: normal;
          font-weight: 1000;
                    white-space: nowrap;
        }

        .arena-ranking-row b {
          color: #efff9b;
        }

        .team-builder-bank {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }

        .team-builder-bank span,
        .team-builder-clubs,
        .team-builder-roster,
        .team-builder-preview,
        .team-builder-empty {
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(5,12,16,.16);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
          backdrop-filter: blur(10px);
        }

        .team-builder-bank span {
          display: grid;
          gap: 4px;
          min-height: 64px;
          align-content: center;
          padding: 10px 12px;
        }

        .team-builder-bank small,
        .team-builder-section-title span,
        .team-builder-roster-head span,
        .team-builder-player-list small {
          font-size: 8px;
          font-weight: 1000;                    color: rgba(122,231,255,.78);
        }

        .team-builder-bank strong {
          font-size: 18px;
          line-height: 1;
          font-weight: 1000;
        }

        .team-builder-bank .touchline-tc-balance {
          display: flex;
          align-items: center;
          gap: 6px;
          font-variant-numeric: tabular-nums;
        }

        .team-builder-bank .touchline-card-value {
          display: block;
          color: #ffd75c;
          font-variant-numeric: tabular-nums;
        }

        .touchline-tc-balance b {
          font: inherit;
        }

        .touchline-tc-balance em {
          color: #ffd75c;
          font-size: .52em;
          font-style: normal;
          letter-spacing: .08em;
        }

        .team-builder-cart-dock {
          display: grid;
          grid-template-columns: auto minmax(160px, 1fr) auto minmax(150px, auto);
          gap: 12px;
          align-items: center;
          min-height: 62px;
          border: 1px solid rgba(122,231,255,.2);
          border-radius: 15px;
          background: rgba(4,12,16,.36);
          padding: 8px 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
          backdrop-filter: blur(12px);
        }

        .team-builder-cart-title {
          display: flex;
          gap: 8px;
          align-items: center;
          min-width: 112px;
        }

        .team-builder-cart-title > .team-builder-selected-mark {
          width: 28px;
          height: 23px;
          filter: drop-shadow(0 0 8px rgba(163,255,18,.5));
        }

        .team-builder-cart-title span,
        .team-builder-cart-totals span {
          display: grid;
          gap: 3px;
        }

        .team-builder-cart-title small,
        .team-builder-cart-totals small {
          color: rgba(122,231,255,.76);
          font-size: 7px;
          font-weight: 1000;
        }

        .team-builder-cart-title strong,
        .team-builder-cart-totals strong {
          color: white;
          font-size: 13px;
          line-height: 1;
          font-weight: 1000;
          font-variant-numeric: tabular-nums;
        }

        .team-builder-cart-totals .touchline-tc-total {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .team-builder-cart-items {
          display: flex;
          gap: 6px;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: thin;
        }

        .team-builder-cart-items > button {
          display: grid;
          grid-template-columns: minmax(0, auto) auto 14px;
          gap: 6px;
          align-items: center;
          flex: 0 0 auto;
          min-height: 35px;
          border: 1px solid rgba(181,255,75,.24);
          border-radius: 10px;
          background: rgba(181,255,75,.08);
          padding: 6px 8px;
          color: white;
        }

        .team-builder-cart-items > button span {
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 8px;
          font-weight: 950;
        }

        .team-builder-cart-items > button strong {
          color: #efff9b;
          font-size: 8px;
          white-space: nowrap;
        }

        .team-builder-cart-items > button svg {
          width: 13px;
          height: 13px;
          color: rgba(255,255,255,.62);
        }

        .team-builder-cart-empty {
          align-self: center;
          color: rgba(255,255,255,.48);
          font-size: 9px;
          font-weight: 850;
        }

        .team-builder-cart-totals {
          display: grid;
          grid-template-columns: repeat(2, auto);
          gap: 14px;
          padding: 0 4px;
        }

        .team-builder-cart-checkout {
          display: inline-flex;
          gap: 7px;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          border: 1px solid rgba(181,255,75,.4);
          border-radius: 11px;
          background: linear-gradient(135deg, rgba(181,255,75,.34), rgba(122,231,255,.12));
          padding: 8px 12px;
          color: #f4ffb0;
          font-size: 8px;
          font-weight: 1000;
          white-space: nowrap;
        }

        .team-builder-cart-checkout svg {
          width: 14px;
          height: 14px;
        }

        .team-builder-cart-checkout:disabled {
          border-color: rgba(255,255,255,.1);
          background: rgba(255,255,255,.04);
          color: rgba(255,255,255,.34);
          cursor: not-allowed;
        }

        .team-builder-board {
          display: grid;
          grid-template-columns: 238px 360px minmax(240px, 1fr);
          gap: 12px;
          min-height: 0;
          height: 100%;
        }

        .team-builder-clubs,
        .team-builder-roster,
        .team-builder-preview {
          min-height: 0;
          overflow: hidden;
          padding: 12px;
        }

        .team-builder-section-title {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .team-builder-section-title strong {
          display: block;
          margin-top: 5px;
          font-size: 13px;
          line-height: 1;
          font-weight: 1000;
                    color: rgba(255,255,255,.86);
        }

        .team-builder-section-title a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(181,255,75,.38);
          background: linear-gradient(135deg, rgba(181,255,75,.16), rgba(0,0,0,.22));
          color: #efff9b;
          padding: 0 12px;
          text-decoration: none;
                    white-space: nowrap;
          font-size: 8px;
          font-weight: 1000;        }

        .team-builder-club-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 7px;
          min-height: 0;
          max-height: none;
          overflow: auto;
          padding-right: 2px;
          scrollbar-width: thin;
        }

        .team-builder-club-grid button,
        .team-builder-player-list button {
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(0,0,0,.06);
          color: white;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.03);
          transition: border-color .16s ease, background .16s ease, transform .16s ease, box-shadow .16s ease;
        }

        .team-builder-club-grid button {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 8px;
          align-items: center;
          min-height: 54px;
          border-radius: 13px;
          padding: 8px;
          text-align: left;
        }

        .team-builder-club-grid button:hover,
        .team-builder-club-grid button.is-active,
        .team-builder-player-list button:hover,
        .team-builder-player-list button.is-selected,
        .team-builder-player-list button.is-in-field,
        .team-builder-player-list button.is-in-cart {
          transform: translateY(-1px);
          border-color: rgba(181,255,75,.42);
          background: rgba(181,255,75,.065);
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.12), 0 14px 30px rgba(0,0,0,.22);
        }

        .team-builder-club-logo {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          overflow: visible;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          color: white;
          font-size: 8px;
          font-weight: 1000;
        }

        .team-builder-club-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 3px 5px rgba(0,0,0,.42));
        }

        .team-builder-club-grid strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          line-height: 1;
          font-weight: 1000;                  }

        .team-builder-club-grid small {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.52);
          font-size: 9px;
          font-weight: 800;
          line-height: 1.2;
        }

        .team-builder-roster-head small {
          display: -webkit-box;
          min-height: 22px;
          margin-top: 4px;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          color: rgba(255,255,255,.52);
          font-size: 9px;
          font-weight: 800;
          line-height: 1.2;
          white-space: normal;
        }

        .team-builder-roster {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 10px;
        }

        .team-builder-roster-head {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,.1);
          padding-bottom: 10px;
        }

        .team-builder-roster-head .team-builder-club-logo {
          width: 44px;
          height: 44px;
        }

        .team-builder-roster-head strong {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 22px;
          line-height: .92;
          font-weight: 1000;
                  }

        .team-builder-club-hub {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(181,255,75,.36);
          padding: 0 12px;
          color: #eaffad;
          background: linear-gradient(135deg, rgba(181,255,75,.18), rgba(0,0,0,.24));
          text-decoration: none;
                    white-space: nowrap;
          font-size: 9px;
          font-weight: 1000;          box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
        }

        .team-builder-club-hub:hover {
          border-color: rgba(181,255,75,.7);
          background: linear-gradient(135deg, rgba(181,255,75,.28), rgba(122,231,255,.12));
        }

        .team-builder-player-list {
          display: grid;
          gap: 7px;
          min-height: 0;
          max-height: none;
          overflow: auto;
          padding-right: 2px;
          scrollbar-width: thin;
        }

        .team-builder-player-list button {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
          min-height: 58px;
          border-radius: 14px;
          padding: 9px 10px;
          text-align: left;
        }

        .team-builder-player-list .team-builder-action {
          display: none;
        }

        .team-builder-role {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border-radius: 11px;
          background: rgba(122,231,255,.12);
          color: rgba(225,250,255,.9);
          font-size: 9px;
          font-weight: 1000;          box-shadow: inset 0 0 0 1px rgba(122,231,255,.2);
        }

        .team-builder-player-copy {
          min-width: 0;
        }

        .team-builder-position-cap {
          display: block;
          margin-top: 4px;
          color: rgba(181,255,75,.68);
          font-size: 7px;
          font-style: normal;
          font-weight: 950;
          letter-spacing: .02em;
        }

        .team-builder-position-cap.is-full {
          color: #ff6f86;
        }

        .team-builder-player-copy strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          line-height: 1;
          font-weight: 1000;
                  }

        .team-builder-value,
        .team-builder-action {
          border-radius: 11px;
          padding: 8px 10px;
          font-size: 9px;
          font-weight: 1000;                    white-space: nowrap;
        }

        .team-builder-value {
          background: rgba(0,0,0,.18);
          color: rgba(255,255,255,.88);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.1);
        }

        .team-builder-action {
          background: rgba(181,255,75,.15);
          color: #efff9b;
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.28);
        }

        .team-builder-empty {
          padding: 16px;
          color: rgba(255,255,255,.7);
          font-size: 10px;
          font-weight: 1000;          line-height: 1.5;
                  }

        .team-builder-preview {
          display: grid;
          grid-template-columns: minmax(220px, 250px) minmax(0, 1fr);
          grid-template-rows: auto auto minmax(0, 1fr);
          gap: 10px 14px;
          align-items: stretch;
          justify-items: stretch;
        }

        .team-builder-preview-copy {
          grid-column: 2;
          grid-row: 1;
          justify-self: stretch;
          border-bottom: 1px solid rgba(255,255,255,.1);
          padding-bottom: 10px;
        }

        .team-builder-preview-copy span {
          display: block;
          font-size: 8px;
          font-weight: 1000;                    color: rgba(181,255,75,.78);
        }

        .team-builder-preview-copy strong {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 20px;
          line-height: .95;
          font-weight: 1000;
                  }

        .team-builder-preview-copy small {
          display: block;
          margin-top: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255,255,255,.56);
          font-size: 9px;
          font-weight: 900;                  }

        .team-builder-market-ledger {
          grid-column: 2;
          grid-row: 2;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
          justify-self: stretch;
        }

        .team-builder-market-ledger span {
          display: grid;
          gap: 4px;
          min-height: 54px;
          align-content: center;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(0,0,0,.18);
          padding: 9px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.035);
        }

        .team-builder-market-ledger small {
          color: rgba(122,231,255,.76);
          font-size: 7px;
          font-weight: 1000;                  }

        .team-builder-market-ledger strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: white;
          font-size: 14px;
          line-height: 1;
          font-weight: 1000;
        }

        .team-builder-preview-card {
          grid-column: 1;
          grid-row: 1 / 4;
          width: auto;
          height: min(100%, 338px);
          min-width: 0;
          min-height: 0;
          max-width: 100%;
          max-height: 100%;
          aspect-ratio: 430 / 691;
          align-self: center;
          justify-self: center;
          overflow: visible;
          background: transparent;
          box-shadow: none;
          filter: none;
        }

        .team-builder-preview-card > div {
          width: 100% !important;
          height: 100% !important;
          aspect-ratio: 430 / 691 !important;
          overflow: visible !important;
          clip-path: none !important;
          contain: none !important;
          background: transparent !important;
          box-shadow: none !important;
          filter: none !important;
          margin: 0 !important;
        }

        .team-builder-preview-card > div > div[aria-label] > div[aria-hidden="true"] {
          display: none !important;
        }

        .team-builder-send {
          grid-column: 2;
          grid-row: 3;
          align-self: end;
          width: 100%;
          min-height: 48px;
          border-radius: 13px;
          border: 1px solid rgba(181,255,75,.36);
          background: linear-gradient(135deg, rgba(181,255,75,.34), rgba(122,231,255,.12));
          color: #f4ffb0;
          font-size: 10px;
          font-weight: 1000;                    box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), 0 16px 34px rgba(0,0,0,.28);
        }

        .team-builder-send:disabled {
          border-color: rgba(255,255,255,.12);
          background: rgba(255,255,255,.045);
          color: rgba(255,255,255,.46);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
          cursor: not-allowed;
        }

        .field-player-layer {
          position: absolute;
          inset: 0;
          z-index: 12;
          pointer-events: none;
        }

        .field-player-layer.is-entry-hidden,
        .arena-coach-technical-area.is-entry-hidden {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        .field-player-layer.is-entry-ready,
        .arena-coach-technical-area.is-entry-ready {
          opacity: 1;
          visibility: visible;
          animation: arena-card-layer-reveal .42s cubic-bezier(.22, 1, .36, 1) both;
        }

        @keyframes arena-card-layer-reveal {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .arena-field-selection-clear-layer {
          position: absolute;
          inset: 0;
          z-index: 11;
          background: transparent;
          pointer-events: auto;
        }

        .arena-field-player {
          position: absolute;
          width: auto;
          padding: 0;
          border: 0;
          background: transparent;
          color: white;
          pointer-events: auto;
          touch-action: manipulation;
          cursor: pointer;
          transform: translate(-50%, -100%);
          transform-origin: 50% 100%;
          filter: drop-shadow(0 18px 20px rgba(0,0,0,.44));
          /* Camera coordinates must snap atomically. Animating top/left/height
             lets cards cross each other while the stadium loop changes. */
          transition: transform .16s ease, filter .16s ease;
        }

        /* Keep the approved compact card scale on the tactical pitch, but do
           not make a 27px-wide visual card a 27px-wide touch target. The
           transparent hit area gives every player the 44px target expected on
           touch devices without changing the official artwork, coordinates or
           spacing of the XI. */
        .arena-field-player::before {
          content: "";
          position: absolute;
          z-index: -1;
          left: 50%;
          bottom: 0;
          width: max(100%, 44px);
          height: max(100%, 44px);
          transform: translateX(-50%);
        }

        .arena-field-player[data-editing="true"] {
          cursor: grab;
          touch-action: none;
          transition: filter .12s ease;
        }

        .arena-field-player[data-editing="true"]:active {
          cursor: grabbing;
        }

        .arena-field-player.is-selected {
          --selected-card-rgb: 181 255 75;
          filter: drop-shadow(0 20px 24px rgba(0,0,0,.52)) drop-shadow(0 0 14px rgb(var(--selected-card-rgb) / .32));
        }

        .arena-field-player.is-selected:has(.touchline-card-surface[data-card-tier="ruby-red"]) { --selected-card-rgb: 239 68 68; }
        .arena-field-player.is-selected:has(.touchline-card-surface[data-card-tier="sapphire-blue"]) { --selected-card-rgb: 56 189 248; }
        .arena-field-player.is-selected:has(.touchline-card-surface[data-card-tier="amethyst-purple"]) { --selected-card-rgb: 168 85 247; }
        .arena-field-player.is-selected:has(.touchline-card-surface[data-card-tier="radiant-gold"]) { --selected-card-rgb: 250 204 21; }
        .arena-field-player.is-selected:has(.touchline-card-surface[data-card-tier="emerald-green"]) { --selected-card-rgb: 34 197 94; }
        .arena-field-player.is-selected:has(.touchline-card-surface[data-card-tier="clear-diamond"]) { --selected-card-rgb: 224 242 254; }
        .arena-field-player.is-selected:has(.touchline-card-surface[data-card-tier="diamond-gold"]) { --selected-card-rgb: 255 224 138; }

        /* A card glow must follow its real transparent frame rather than paint
           a rectangular light behind it. The filter follows the artwork alpha
           and each tier supplies its own living neon colour. */
        .arena-field-player,
        .arena-quick-sub-card,
        .arena-quick-sub-coach,
        .arena-quick-sub-confirmation-cards article {
          --arena-tier-neon-rgb: 181 255 75;
        }

        .arena-field-player:has(.touchline-card-surface[data-card-tier="ruby-red"]),
        .arena-quick-sub-card:has(.touchline-card-surface[data-card-tier="ruby-red"]),
        .arena-quick-sub-confirmation-cards article:has(.touchline-card-surface[data-card-tier="ruby-red"]) { --arena-tier-neon-rgb: 239 68 68; }
        .arena-field-player:has(.touchline-card-surface[data-card-tier="sapphire-blue"]),
        .arena-quick-sub-card:has(.touchline-card-surface[data-card-tier="sapphire-blue"]),
        .arena-quick-sub-confirmation-cards article:has(.touchline-card-surface[data-card-tier="sapphire-blue"]) { --arena-tier-neon-rgb: 56 189 248; }
        .arena-field-player:has(.touchline-card-surface[data-card-tier="amethyst-purple"]),
        .arena-quick-sub-card:has(.touchline-card-surface[data-card-tier="amethyst-purple"]),
        .arena-quick-sub-confirmation-cards article:has(.touchline-card-surface[data-card-tier="amethyst-purple"]) { --arena-tier-neon-rgb: 168 85 247; }
        .arena-field-player:has(.touchline-card-surface[data-card-tier="radiant-gold"]),
        .arena-quick-sub-card:has(.touchline-card-surface[data-card-tier="radiant-gold"]),
        .arena-quick-sub-confirmation-cards article:has(.touchline-card-surface[data-card-tier="radiant-gold"]) { --arena-tier-neon-rgb: 250 204 21; }
        .arena-field-player:has(.touchline-card-surface[data-card-tier="emerald-green"]),
        .arena-quick-sub-card:has(.touchline-card-surface[data-card-tier="emerald-green"]),
        .arena-quick-sub-confirmation-cards article:has(.touchline-card-surface[data-card-tier="emerald-green"]) { --arena-tier-neon-rgb: 34 197 94; }
        .arena-field-player:has(.touchline-card-surface[data-card-tier="clear-diamond"]),
        .arena-quick-sub-card:has(.touchline-card-surface[data-card-tier="clear-diamond"]),
        .arena-quick-sub-confirmation-cards article:has(.touchline-card-surface[data-card-tier="clear-diamond"]) { --arena-tier-neon-rgb: 224 242 254; }
        .arena-field-player:has(.touchline-card-surface[data-card-tier="diamond-gold"]),
        .arena-quick-sub-card:has(.touchline-card-surface[data-card-tier="diamond-gold"]),
        .arena-quick-sub-confirmation-cards article:has(.touchline-card-surface[data-card-tier="diamond-gold"]) { --arena-tier-neon-rgb: 255 224 138; }
        .arena-quick-sub-coach { --arena-tier-neon-rgb: 255 215 92; }

        @keyframes arena-tier-card-neon-pulse {
          from { filter: drop-shadow(0 8px 10px rgb(var(--arena-tier-neon-rgb) / .26)); }
          to { filter: drop-shadow(0 10px 17px rgb(var(--arena-tier-neon-rgb) / .72)); }
        }

        @media (hover: hover) and (pointer: fine) {
          .arena-field-player:not([data-editing="true"]):hover {
            transform: translate(-50%, -100%) scale(1.035);
            filter: drop-shadow(0 18px 20px rgba(0,0,0,.44));
          }

          .arena-field-player:not([data-editing="true"]):hover .arena-field-card,
          .arena-quick-sub-card:hover .arena-quick-sub-card-art,
          .arena-quick-sub-coach:hover > span,
          .arena-quick-sub-confirmation-cards article:hover > span {
            animation: arena-tier-card-neon-pulse 1.8s ease-in-out infinite alternate;
            will-change: filter;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .arena-field-player .arena-field-card,
          .arena-quick-sub-card .arena-quick-sub-card-art,
          .arena-quick-sub-coach > span,
          .arena-quick-sub-confirmation-cards article > span {
            animation: none !important;
            will-change: auto;
          }
        }

        .arena-field-player:focus-visible {
          outline: 1px solid rgba(181,255,75,.72);
          outline-offset: 5px;
        }

        .arena-field-player img {
          display: block;
          width: auto;
          height: 100%;
          max-width: none;
          user-select: none;
        }

        .arena-field-card {
          position: relative;
          display: block;
          height: 100%;
          aspect-ratio: 430 / 691;
          overflow: visible;
          border: 0;
          background: transparent;
          box-shadow: none;
          clip-path: none;
          contain: layout size;
          user-select: none;
        }

        .arena-field-card > div {
          width: 100% !important;
          height: 100% !important;
          aspect-ratio: 430 / 691 !important;
          overflow: visible !important;
          clip-path: none;
          margin: 0 !important;
        }

        /* Desktop-only readability: scale the complete match-points badge so
           the value and its smoked backing remain visually balanced. */
        @media (min-width: 1101px) {
          .arena-field-card [data-arena-match-points="true"] {
            top: -19px !important;
            transform: translateX(-50%) scale(1.2) !important;
            transform-origin: center bottom;
          }
        }

        .arena-player-spotlight {
          position: absolute;
          inset: 0;
          z-index: 240;
          display: grid;
          place-items: center;
          pointer-events: none;
        }

        .arena-live-card-spotlight {
          z-index: 250;
        }

        .arena-live-expanded-card {
          width: 100%;
          cursor: zoom-out;
          border-radius: 16px;
          outline: 0;
        }

        .arena-live-expanded-card:focus-visible {
          outline: 2px solid var(--spotlight-accent, #b5ff4b);
          outline-offset: 5px;
        }

        .arena-live-coach-spotlight-panel {
          display: grid;
          gap: 10px;
        }

        .arena-live-expanded-coach-card {
          width: 100%;
          border-radius: 18px;
          cursor: zoom-out;
          outline: 0;
        }

        .arena-live-expanded-coach-card:focus-visible {
          outline: 2px solid #b5ff4b;
          outline-offset: 5px;
        }

        .arena-live-coach-spotlight-card {
          width: 100%;
        }

        .arena-live-coach-spotlight-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid rgba(181,255,75,.2);
          border-radius: 12px;
          padding: 9px 12px;
          color: rgba(255,255,255,.72);
          background: rgba(4,13,15,.88);
          font-size: 9px;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .arena-live-coach-spotlight-meta span {
          color: #b5ff4b;
          font-weight: 900;
        }

        .arena-live-coach-spotlight-meta strong {
          overflow: hidden;
          text-align: right;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .arena-coach-spotlight {
          position: fixed;
          z-index: 1305;
          inset: 0;
          display: grid;
          place-items: center;
          isolation: isolate;
          overflow: hidden;
          pointer-events: none;
        }

        .arena-coach-spotlight > .arena-player-spotlight-backdrop {
          pointer-events: auto;
          background:
            radial-gradient(circle at 50% 47%, rgba(181,255,75,.12), transparent 30%),
            rgba(0,0,0,.88);
          backdrop-filter: blur(13px) saturate(.72);
        }

        .arena-coach-spotlight-panel {
          position: relative;
          z-index: 2;
          width: min(390px, calc(100vw - 32px), calc(66dvh * .6667));
          pointer-events: auto;
        }

        .arena-stage[data-coach-spotlight="open"] .field-player-layer,
        .arena-stage[data-coach-spotlight="open"] .arena-coach-technical-area,
        .arena-stage[data-coach-spotlight="open"] .arena-live-dock,
        .arena-stage[data-coach-spotlight="open"] .club-symbol-carousel,
        .arena-stage[data-card-spotlight="open"] .field-player-layer,
        .arena-stage[data-card-spotlight="open"] .arena-coach-technical-area,
        .arena-stage[data-card-spotlight="open"] .arena-live-dock,
        .arena-stage[data-card-spotlight="open"] .club-symbol-carousel {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        .arena-stage[data-card-spotlight="open"] .arena-live-moving-card {
          animation-play-state: paused !important;
        }

        .arena-stage:fullscreen .arena-coach-spotlight,
        .arena-stage:-webkit-full-screen .arena-coach-spotlight {
          position: fixed;
          z-index: 2147483646;
          transform: translateZ(0);
        }

        .arena-coach-spotlight-panel > .arena-player-spotlight-close {
          top: -8px;
          right: -8px;
        }

        .arena-stage:fullscreen .arena-player-spotlight,
        .arena-stage:-webkit-full-screen .arena-player-spotlight {
          position: fixed;
          z-index: 2147483630;
          transform: translateZ(0);
        }

        .arena-player-spotlight-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background:
            radial-gradient(circle at 50% 47%, rgba(181,255,75,.16), transparent 28%),
            rgba(0,0,0,.86);
          -webkit-backdrop-filter: blur(12px) saturate(.76);
          backdrop-filter: blur(12px) saturate(.76);
          pointer-events: auto;
        }

        /* WebKit can retain a composited snapshot of the moving pitch beneath a
           backdrop-filter. Live zoom must be a clean product view, never a
           translucent layer with player/coach ghosts behind the card. */
        .arena-live-card-spotlight > .arena-player-spotlight-backdrop {
          background:
            radial-gradient(circle at 50% 47%, rgba(181,255,75,.07), transparent 30%),
            rgba(0,0,0,.985);
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }

        .arena-player-spotlight-panel {
          position: relative;
          width: min(31vw, 420px);
          min-width: 260px;
          display: grid;
          gap: 8px;
          pointer-events: auto;
          filter: drop-shadow(0 30px 54px rgba(0,0,0,.62)) drop-shadow(0 0 28px rgba(181,255,75,.18));
          animation: arenaSpotlightIn .18s ease-out both;
        }

        .arena-player-spotlight-panel-with-details {
          width: min(860px, calc(100vw - 48px));
          grid-template-columns: minmax(260px, 380px) minmax(280px, 1fr);
          align-items: center;
          gap: 18px;
        }

        .arena-player-spotlight-product {
          display: grid;
          min-width: 0;
          gap: 8px;
        }

        .arena-player-spotlight-card {
          width: 100% !important;
          height: auto !important;
          aspect-ratio: 430 / 691 !important;
        }

        .arena-player-spotlight-meta,
        .arena-player-spotlight-contract {
          width: 100%;
          min-width: 0;
          border: 1px solid rgba(158,255,45,.42);
          border-radius: 11px;
          background:
            linear-gradient(135deg, rgba(48,84,22,.18), rgba(2,7,12,.94));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.08),
            0 0 18px rgba(158,255,45,.1);
        }

        .arena-player-spotlight-meta {
          min-height: 34px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 7px 10px;
        }

        .arena-player-spotlight-meta strong {
          color: #9eff2d;
          font-size: 9px;
          line-height: 1;
          font-weight: 1000;
        }

        .arena-player-spotlight-meta span {
          color: rgba(255,255,255,.7);
          font-size: 8px;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
        }

        .arena-player-spotlight-contract {
          min-height: 42px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          color: rgba(255,255,255,.92);
          text-decoration: none;
          transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
        }

        .arena-player-spotlight-contract span,
        .arena-player-spotlight-contract strong {
          font-size: 11px;
          line-height: 1;
          font-weight: 1000;
        }

        .arena-player-spotlight-contract strong {
          color: #9eff2d;
        }

        .arena-player-spotlight-contract:hover,
        .arena-player-spotlight-contract:focus-visible {
          transform: translateY(-1px);
          border-color: #9eff2d;
          outline: 0;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.11),
            0 0 24px rgba(158,255,45,.22);
        }

        .arena-player-spotlight-close {
          position: absolute;
          right: -18px;
          top: -18px;
          z-index: 5;
          display: grid;
          width: 42px;
          height: 42px;
          place-items: center;
          border-radius: 999px;
          border: 1px solid rgba(181,255,75,.42);
          background: linear-gradient(135deg, rgba(9,16,23,.9), rgba(35,62,51,.82));
          color: #f3ffa8;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.08), 0 16px 34px rgba(0,0,0,.4);
        }

        @keyframes arenaSpotlightIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .arena-field-placeholder {
          display: grid;
          width: calc(var(--player-height, 12vh) * .42);
          height: 100%;
          min-width: 34px;
          place-items: center;
          border-radius: 999px 999px 28px 28px;
          border: 1px solid rgba(181,255,75,.42);
          background:
            radial-gradient(circle at 50% 24%, rgba(181,255,75,.22), transparent 30%),
            linear-gradient(180deg, rgba(9,17,26,.9), rgba(2,7,14,.68));
          color: rgba(255,255,255,.88);
          font-size: 10px;
          font-weight: 1000;                    box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), 0 0 22px rgba(181,255,75,.16);
        }

        .player-ground-shadow {
          position: absolute;
          left: 50%;
          bottom: -2%;
          width: 48%;
          height: 5.5%;
          border-radius: 999px;
          transform: translateX(-50%);
          background: radial-gradient(ellipse, rgba(0,0,0,.52), transparent 70%);
          filter: blur(5px);
        }

        .player-name-tag {
          position: absolute;
          left: 50%;
          top: 0;
          transform: translate(-50%, calc(-100% - 6px));
          padding: 3px 7px;
          border-radius: 999px;
          background: rgba(3, 8, 15, .72);
          color: rgba(255,255,255,.88);
          font-size: 8px;
          font-weight: 1000;                    white-space: nowrap;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.14);
        }

        .field-editor-panel {
          position: absolute;
          z-index: 32;
          right: max(12px, env(safe-area-inset-right));
          top: calc(max(12px, env(safe-area-inset-top)) + 76px);
          width: clamp(248px, 24vw, 320px);
          border-radius: 18px;
          padding: 12px;
        }

        .editor-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .editor-heading span,
        .field-editor-panel label span,
        .editor-actions span {
          font-size: 8px;
          font-weight: 1000;                    color: rgba(181, 255, 75, .82);
        }

        .editor-heading strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 15px;
          line-height: 1;
          font-weight: 1000;
                  }

        .formation-presets {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-bottom: 8px;
        }

        .formation-presets button {
          min-height: 30px;
          border-radius: 9px;
          background: rgba(255,255,255,.08);
          color: rgba(255,255,255,.72);
          font-size: 8px;
          font-weight: 1000;                    box-shadow: inset 0 0 0 1px rgba(255,255,255,.1);
        }

        .formation-presets button strong {
          display: block;
          font: inherit;
        }

        .formation-presets button small {
          display: block;
          margin-top: 2px;
          color: rgba(255,255,255,.42);
          font-size: 6px;
          line-height: 1;
          text-transform: uppercase;
        }

        .formation-presets button.is-coming-soon {
          cursor: not-allowed;
          opacity: .48;
          filter: saturate(.25);
        }

        .formation-presets button.is-coming-soon:hover {
          background: rgba(255,255,255,.08);
          color: rgba(255,255,255,.72);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.1);
        }

        .formation-presets button.is-active,
        .formation-presets button:hover {
          background: rgba(181,255,75,.2);
          color: #ecff96;
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.48), 0 0 18px rgba(181,255,75,.14);
        }

        .formation-lock-note {
          display: grid;
          gap: 3px;
          margin-bottom: 8px;
          border-radius: 11px;
          background: rgba(122,231,255,.08);
          padding: 8px;
          box-shadow: inset 0 0 0 1px rgba(122,231,255,.14);
        }

        .formation-lock-note span {
          color: rgba(122,231,255,.86);
          font-size: 7px;
          font-weight: 1000;                  }

        .formation-lock-note strong {
          color: rgba(255,255,255,.84);
          font-size: 10px;
          font-weight: 1000;                  }

        .player-picker {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          max-height: 154px;
          overflow: auto;
          padding-right: 2px;
          scrollbar-width: thin;
        }

        .player-picker button,
        .editor-actions button {
          min-height: 30px;
          border-radius: 9px;
          background: rgba(255,255,255,.08);
          font-size: 8px;
          font-weight: 1000;                    color: rgba(255,255,255,.72);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.1);
        }

        .player-picker button.is-active,
        .editor-actions button:hover {
          background: rgba(181,255,75,.2);
          color: #ecff96;
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.48), 0 0 18px rgba(181,255,75,.14);
        }

        .field-editor-panel label {
          display: block;
          margin-top: 9px;
        }

        .field-editor-panel input {
          width: 100%;
          accent-color: #b5ff4b;
        }

        .formation-position-controls {
          display: grid;
          gap: 8px;
          margin-top: 9px;
          border-radius: 14px;
          background: rgba(0,0,0,.28);
          padding: 10px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
        }

        .formation-position-controls label {
          display: grid;
          grid-template-columns: 64px 1fr 28px;
          align-items: center;
          gap: 8px;
          margin: 0;
        }

        .formation-position-controls label strong {
          text-align: right;
          font-size: 10px;
          font-weight: 1000;
          color: #ecff96;
        }

        .formation-position-controls input {
          min-width: 0;
        }

        .formation-nudge-controls {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }

        .formation-nudge-controls button {
          min-height: 30px;
          border-radius: 9px;
          background: rgba(122,231,255,.09);
          color: rgba(235,250,255,.82);
          font-size: 8px;
          font-weight: 1000;                    box-shadow: inset 0 0 0 1px rgba(122,231,255,.16);
        }

        .formation-nudge-controls button:hover {
          background: rgba(122,231,255,.16);
          color: white;
        }

        .formation-position-controls input:disabled,
        .formation-nudge-controls button:disabled,
        .editor-actions button:disabled {
          cursor: not-allowed;
          opacity: .42;
        }

        .editor-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          align-items: center;
          margin-top: 10px;
        }

        .editor-actions span {
          grid-column: 1 / -1;
          color: rgba(122, 231, 255, .86);
        }

        .editor-empty-state {
          border-radius: 12px;
          border: 1px solid rgba(181,255,75,.18);
          background: rgba(181,255,75,.08);
          padding: 12px;
          color: rgba(255,255,255,.78);
          font-size: 9px;
          font-weight: 1000;          line-height: 1.45;
                  }

        @media (max-height: 760px) and (min-width: 761px) {
          .arena-action-panel-market {
            height: min(78dvh, 560px);
            max-height: min(78dvh, 560px);
            padding: 12px;
          }

          .arena-action-panel-market .arena-action-topline {
            align-items: center;
            padding-bottom: 10px;
          }

          .arena-action-panel-market .arena-action-topline h2 {
            margin-top: 4px;
            font-size: clamp(26px, 3.2vw, 38px);
            line-height: .9;
          }

          .arena-action-panel-market .arena-action-topline p {
            font-size: 8px;
          }

          .arena-action-panel-market .team-builder-shell {
            gap: 8px;
            margin-top: 10px;
          }

          .arena-action-panel-market .team-builder-bank {
            gap: 6px;
          }

          .arena-action-panel-market .team-builder-bank span {
            min-height: 44px;
            padding: 6px 9px;
          }

          .arena-action-panel-market .team-builder-bank strong {
            font-size: 15px;
          }

          .arena-action-panel-market .team-builder-board {
            grid-template-columns: 210px 340px minmax(290px, 1fr);
            gap: 10px;
          }

          .arena-action-panel-market .team-builder-clubs,
          .arena-action-panel-market .team-builder-roster,
          .arena-action-panel-market .team-builder-preview {
            padding: 10px;
          }

          .arena-action-panel-market .team-builder-club-grid button {
            min-height: 48px;
            padding: 7px;
          }

          .arena-action-panel-market .team-builder-roster-head {
            grid-template-columns: 36px minmax(0, 1fr) auto;
            gap: 8px;
            padding-bottom: 8px;
          }

          .arena-action-panel-market .team-builder-roster-head .team-builder-club-logo {
            width: 36px;
            height: 36px;
          }

          .arena-action-panel-market .team-builder-roster-head strong {
            display: -webkit-box;
            overflow: hidden;
            text-overflow: clip;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            font-size: 18px;
            line-height: .95;
          }

          .arena-action-panel-market .team-builder-club-hub {
            min-height: 32px;
            padding: 0 10px;
            font-size: 8px;
          }

          .arena-action-panel-market .team-builder-player-list button {
            min-height: 50px;
            padding: 7px 9px;
          }

          .arena-action-panel-market .team-builder-role {
            width: 32px;
            height: 32px;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-columns: minmax(190px, 230px) minmax(0, 1fr);
            grid-template-rows: auto auto minmax(0, 1fr);
            gap: 8px 12px;
          }

          .arena-action-panel-market .team-builder-preview-copy {
            padding-bottom: 7px;
          }

          .arena-action-panel-market .team-builder-preview-copy strong {
            display: -webkit-box;
            overflow: hidden;
            text-overflow: clip;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            font-size: 16px;
            line-height: 1;
          }

          .arena-action-panel-market .team-builder-market-ledger span {
            min-height: 44px;
            padding: 7px;
          }

          .arena-action-panel-market .team-builder-send {
            min-height: 40px;
          }

          .arena-action-panel-market .team-builder-preview-card {
            grid-column: 1;
            grid-row: 1 / 4;
            width: auto;
            height: min(100%, 305px);
            max-width: 100%;
            max-height: 100%;
            align-self: center;
          }

          .arena-action-panel-bench {
            height: min(84dvh, 760px);
            max-height: min(84dvh, 760px);
          }

          .arena-action-panel-bench .arena-action-topline {
            align-items: center;
            padding-bottom: 10px;
          }

          .arena-action-panel-bench .arena-action-topline h2 {
            font-size: clamp(30px, 4vw, 48px);
          }

          .arena-action-panel-bench .bench-roster-summary span,
          .arena-action-panel-bench .bench-rule-stack span {
            padding: 7px 8px;
          }

          .arena-action-panel-bench .bench-roster-summary strong {
            font-size: 15px;
          }

          .arena-action-panel-bench .bench-flow-guide {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .arena-action-panel-bench .bench-flow-guide span {
            display: none;
          }

          .arena-action-panel-bench .bench-list {
            gap: 7px 10px;
          }

          .arena-action-panel-bench .bench-list button {
            min-height: 166px;
            padding: 8px 6px 7px;
          }

          .arena-action-panel-bench .bench-player-card {
            width: min(78px, 54%);
            min-height: 126px;
          }

          .arena-action-panel-bench .bench-card-copy {
            width: min(148px, 94%);
            padding: 0 4px;
          }

          .arena-action-panel-bench .bench-vault-list button {
            min-height: 82px;
            padding: 4px 3px;
          }

          .arena-action-panel-bench .bench-vault-list .bench-player-card-vault {
            width: min(40px, 100%);
            min-height: 64px;
          }

          .arena-action-panel-bench .bench-vault-copy > strong {
            font-size: 8px;
          }

          .arena-action-panel-bench .bench-selected-card {
            width: min(210px, 78%, calc((100dvh - 320px) * 430 / 691));
            max-height: min(338px, calc(100dvh - 320px));
          }
        }

        @media (max-width: 760px) {
          .quick-substitution-substituted-out ul {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .game-hud {
            top: max(8px, env(safe-area-inset-top));
            left: max(4px, env(safe-area-inset-left));
            max-width: calc(100vw - 8px);
            gap: 6px;
            border-radius: 14px;
            padding: 5px;
            overflow: visible;
          }

          .language-switcher {
            width: 88px;
            flex-basis: 88px;
          }

          .language-trigger {
            min-height: 38px;
            grid-template-columns: 19px minmax(0, 1fr) 11px;
            gap: 4px;
            border-radius: 10px;
            padding: 4px 6px;
          }

          .language-flag {
            font-size: 16px;
          }

          .language-current-name {
            font-size: 7px;
          }

          .language-menu {
            right: 0;
            width: min(240px, calc(100vw - 12px));
            max-height: min(410px, calc(100dvh - 74px));
          }

          .hud-button {
            min-height: 34px;
            padding: 0 10px;
            border-radius: 10px;
            font-size: 8px;
          }

          .arena-ranking-section-head {
            align-items: start;
            flex-direction: column;
          }

          .arena-ranking-section-head small {
            text-align: left;
          }

          .arena-owner-row {
            grid-template-columns: 42px minmax(0, 1fr) auto;
            gap: 8px;
          }

          .arena-owner-row small,
          .arena-owner-row em {
            grid-column: 2 / -1;
          }

          .club-symbol-carousel {
            left: max(10px, env(safe-area-inset-left));
            right: max(10px, env(safe-area-inset-right));
            bottom: max(24px, calc(env(safe-area-inset-bottom) + 24px));
          }

          .club-symbol-open {
            grid-template-columns: auto 26px minmax(0, 1fr) 26px;
            gap: 7px;
            border-radius: 14px;
            padding: 7px;
          }

          .club-symbol-kicker {
            width: fit-content;
            padding: 6px 8px;
            font-size: 7px;
          }

          .club-symbol-match-centre {
            grid-column: 1 / -1;
            justify-self: start;
          }

          .club-symbol-pill {
            min-width: 96px;
            gap: 6px;
          }

          .club-symbol-icon {
            width: 30px;
            height: 30px;
          }

          .arena-quick-dock {
            width: min(206px, calc(100vw - 82px));
            border-radius: 14px;
            padding: 6px;
          }

          .arena-quick-dock.is-collapsed {
            width: min(142px, calc(100vw - 82px));
          }

          .arena-quick-toggle,
          .arena-quick-links button,
          .arena-quick-links a {
            min-height: 36px;
            border-radius: 10px;
            padding: 0 10px;
            font-size: 7px;
          }

          .arena-player-spotlight-panel {
            width: min(31vw, 330px);
            min-width: 220px;
          }

          .field-editor-panel {
            left: max(10px, env(safe-area-inset-left));
            right: auto;
            top: calc(max(12px, env(safe-area-inset-top)) + 132px);
            width: min(282px, calc(58vw - 10px));
            padding: 8px;
          }

          .formation-position-controls {
            padding: 8px;
          }

          .formation-position-controls label {
            grid-template-columns: 54px 1fr 24px;
            gap: 6px;
          }

          .formation-nudge-controls {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .arena-start-panel {
            border-radius: 16px;
            padding: 12px;
          }

          .arena-start-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .arena-start-grid {
            grid-template-columns: 1fr;
            max-height: min(58dvh, 520px);
            overflow: auto;
            padding-right: 2px;
          }

          .arena-start-grid button {
            min-height: 92px;
            padding: 12px;
          }

          .arena-action-layer {
            align-items: end;
            padding: max(164px, calc(env(safe-area-inset-top) + 164px)) 10px max(64px, calc(env(safe-area-inset-bottom) + 64px));
          }

          .arena-stage:has(.arena-action-panel-bench) .arena-action-layer {
            padding-bottom: max(116px, calc(env(safe-area-inset-bottom) + 116px));
          }

          .arena-action-panel {
            max-height: min(62dvh, 600px);
            border-radius: 16px;
            padding: 12px;
          }

          .arena-action-panel-bench {
            height: min(58dvh, 560px);
            max-height: min(58dvh, 560px);
            overflow: auto;
            overscroll-behavior: contain;
          }

          .arena-action-panel-market {
            height: min(68dvh, 640px);
            max-height: min(68dvh, 640px);
            overflow: auto;
            overscroll-behavior: contain;
          }

          .arena-action-topline {
            align-items: flex-start;
            flex-direction: column;
          }

          .arena-bench-board,
          .arena-premium-grid,
          .rumour-toolbar,
          .rumour-list,
          .team-builder-board {
            grid-template-columns: 1fr;
          }

          .arena-bench-board {
            flex: none;
            grid-template-rows: max-content max-content;
            height: auto;
            min-height: max-content;
            overflow: visible;
          }

          .bench-list {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .bench-list button {
            min-height: 158px;
            padding: 8px 5px 7px;
          }

          .bench-player-card {
            width: min(72px, 58%);
            min-height: 116px;
          }

          .bench-vault-list .bench-player-card-vault {
            width: min(38px, 100%);
            min-height: 61px;
          }

          .bench-list-shell {
            height: max-content;
            min-height: max-content;
            overflow: visible;
            padding-bottom: 10px;
            scroll-padding-bottom: 0;
          }

          .rumour-list {
            max-height: 34dvh;
          }

          .team-builder-bank {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .arena-action-panel-market .team-builder-shell {
            display: block;
            overflow: visible;
          }

          .team-builder-board {
            min-height: 0;
            height: auto;
            gap: 10px;
          }

          .arena-action-panel-market .team-builder-clubs,
          .arena-action-panel-market .team-builder-roster,
          .arena-action-panel-market .team-builder-preview {
            overflow: visible;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-columns: minmax(144px, 168px) minmax(0, 1fr);
            grid-template-rows: auto auto auto;
            align-items: center;
          }

          .team-builder-club-grid {
            grid-template-columns: 1fr;
            max-height: 24dvh;
            overflow: auto;
          }

          .team-builder-roster-head strong {
            font-size: 18px;
          }

          .team-builder-player-list {
            max-height: 30dvh;
            overflow: auto;
          }

          .team-builder-player-list button {
            grid-template-columns: 36px minmax(0, 1fr) auto;
            gap: 8px;
          }

          .team-builder-role {
            width: 32px;
            height: 32px;
          }

          .arena-action-panel-market .team-builder-preview-card {
            order: 2;
            grid-column: 1;
            grid-row: 2 / 4;
            width: min(148px, 48vw);
            height: auto;
            max-height: 238px;
          }

          .arena-action-panel-market .team-builder-preview-copy {
            order: 1;
            grid-column: 1 / -1;
          }

          .arena-action-panel-market .team-builder-market-ledger {
            order: 3;
            grid-column: 2;
          }

          .arena-action-panel-market .team-builder-send {
            order: 4;
            grid-column: 2;
            margin-bottom: 6px;
          }

          .team-builder-value {
            display: none;
          }

          .bench-list {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            max-height: none;
            overflow: auto;
            padding-right: 2px;
          }

          .bench-vault-list {
            grid-template-columns: repeat(5, minmax(0, 1fr));
            max-height: none;
          }

          .bench-vault-list button {
            min-height: 80px;
            padding: 4px 3px;
          }

          .bench-roster-summary {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
          }

          .bench-roster-summary span {
            padding: 8px;
          }

          .bench-roster-summary strong {
            font-size: 15px;
          }

          .bench-rule-stack {
            grid-template-columns: 1fr;
          }

          .bench-confirm {
            height: max-content;
            min-height: max-content;
            max-height: none;
            overflow: visible;
            padding: 12px;
          }

          .player-picker {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            max-height: 112px;
            gap: 5px;
          }

          .formation-presets {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .player-picker button,
          .editor-actions button,
          .formation-presets button {
            min-height: 25px;
            border-radius: 8px;
            font-size: 7px;
          }

          .field-editor-panel label {
            margin-top: 5px;
          }

          .player-name-tag {
            transform: translate(-50%, calc(-100% - 4px));
            font-size: 7px;
          }
        }

        @media (max-width: 460px) {
          .quick-substitution-substituted-out ul {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 1180px) and (orientation: landscape) {
          .game-hud {
            top: max(6px, env(safe-area-inset-top));
            left: max(4px, env(safe-area-inset-left));
            max-width: calc(100vw - 8px);
            gap: 4px;
            border-radius: 11px;
            padding: 4px;
          }

          .arena-quick-dock {
            width: min(172px, calc(100vw - 76px));
            gap: 4px;
            border-radius: 10px;
            padding: 4px;
          }

          .arena-quick-dock.is-collapsed {
            width: min(118px, calc(100vw - 76px));
          }

          .arena-quick-toggle,
          .arena-quick-links button,
          .arena-quick-links a {
            min-height: 40px;
            border-radius: 8px;
            padding: 0 9px;
            font-size: 7px;
          }

          .arena-player-spotlight-panel {
            width: min(56vw, 520px);
            min-width: 0;
            grid-template-columns: minmax(190px, 230px) minmax(150px, 1fr);
            align-items: center;
          }

          .arena-player-spotlight-card {
            grid-row: 1 / 3;
          }

          .arena-player-spotlight-meta {
            align-self: end;
            display: grid;
            justify-content: stretch;
          }

          .arena-player-spotlight-contract {
            align-self: start;
          }

          .arena-quick-toggle strong {
            font-size: 13px;
          }

          .language-switcher {
            width: 96px;
            flex-basis: 96px;
          }

          .language-trigger {
            min-height: 36px;
            grid-template-columns: 19px minmax(0, 1fr) 11px;
            gap: 4px;
            border-radius: 8px;
            padding: 3px 6px;
          }

          .language-flag {
            font-size: 16px;
          }

          .language-current-name {
            font-size: 7px;
          }

          .language-menu {
            width: min(210px, calc(100vw - 12px));
            max-height: min(330px, calc(100dvh - 58px));
            border-radius: 9px;
            padding: 6px;
          }

          .language-menu > button {
            min-height: 40px;
            grid-template-columns: 26px minmax(0, 1fr) auto;
            gap: 7px;
            border-radius: 7px;
            padding: 5px 8px;
          }

          .language-option-flag {
            font-size: 18px;
          }

          .arena-intro-replay-toggle,
          .arena-video-pause-toggle {
            top: max(58px, calc(env(safe-area-inset-top) + 50px));
            width: 32px;
            height: 32px;
            border-radius: 8px;
          }

          .arena-entry-skip-toggle {
            top: max(12px, calc(env(safe-area-inset-top) + 6px));
            right: max(10px, env(safe-area-inset-right));
            min-height: 38px;
            gap: 6px;
            padding: 0 12px;
            font-size: 8px;
          }

          .arena-entry-skip-toggle svg {
            width: 15px;
            height: 15px;
          }

          .arena-intro-replay-toggle {
            top: max(20px, calc(env(safe-area-inset-top) + 12px));
          }

          .arena-video-pause-toggle {
            top: max(20px, calc(env(safe-area-inset-top) + 12px));
            right: max(50px, calc(env(safe-area-inset-right) + 40px));
          }

          .arena-live-dock {
            top: max(96px, calc(env(safe-area-inset-top) + 88px));
            right: max(10px, env(safe-area-inset-right));
          }

          .arena-live-dock.is-collapsed {
            top: max(58px, calc(env(safe-area-inset-top) + 50px));
            right: max(50px, calc(env(safe-area-inset-right) + 40px));
          }

          .arena-live-dock-panel {
            width: min(238px, 32vw);
            max-height: calc(100dvh - 154px);
          }

          .arena-live-dock-trigger {
            width: 32px;
            height: 32px;
          }

          .arena-live-dock-head {
            min-height: 46px;
            padding: 6px 6px 6px 9px;
          }

          .arena-live-dock-close {
            width: 28px;
            height: 28px;
          }

          .arena-live-dock-list {
            gap: 4px;
            padding: 5px;
          }

          .arena-live-dock-list > button {
            min-height: 49px;
            grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr);
            padding: 5px;
          }

          .arena-live-dock-badge {
            width: 24px;
            height: 24px;
          }

          .arena-live-dock-badge img {
            width: 20px;
            height: 20px;
          }

          .arena-action-panel-market .team-builder-board {
            grid-template-columns:
              minmax(170px, .66fr)
              minmax(288px, 1.08fr)
              minmax(330px, 1.28fr);
            gap: 8px;
          }

          .arena-action-panel-market .team-builder-clubs,
          .arena-action-panel-market .team-builder-roster,
          .arena-action-panel-market .team-builder-preview {
            padding: 9px;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-columns: minmax(168px, 190px) minmax(0, 1fr);
            gap: 7px 10px;
          }

          .arena-action-panel-market .team-builder-preview-card {
            width: min(184px, 100%);
          }

          .arena-action-panel-market .team-builder-preview-copy {
            padding-bottom: 7px;
          }

          .arena-action-panel-market .team-builder-preview-copy strong {
            display: -webkit-box;
            overflow: hidden;
            text-overflow: clip;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            font-size: 15px;
            line-height: 1;
          }

          .arena-action-panel-market .team-builder-preview-copy small {
            white-space: normal;
            line-height: 1.15;
          }

          .arena-action-panel-market .team-builder-market-ledger span {
            min-height: 46px;
            padding: 6px;
          }

          .arena-action-panel-market .team-builder-market-ledger strong {
            font-size: 10px;
            font-variant-numeric: tabular-nums;
          }

          .arena-action-panel-market .team-builder-send {
            min-height: 38px;
            padding: 7px;
            font-size: 8px;
          }

          .arena-intro-replay-toggle svg,
          .arena-video-pause-toggle svg {
            width: 15px;
            height: 15px;
          }

          .arena-action-panel-bench .bench-rule-stack strong {
            display: -webkit-box;
            min-height: 18px;
            overflow: hidden;
            text-overflow: clip;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            font-size: 9px;
            line-height: 1;
          }

          .club-symbol-carousel {
            left: max(6px, env(safe-area-inset-left));
            right: max(6px, env(safe-area-inset-right));
            bottom: max(8px, calc(env(safe-area-inset-bottom) + 8px));
          }

          .club-symbol-open {
            grid-template-columns: auto 24px minmax(0, 1fr) 24px;
            gap: 7px;
            border-radius: 13px;
            padding: 4px 6px;
          }

          .club-symbol-kicker {
            padding: 5px 7px;
          }

          .club-symbol-kicker strong {
            font-size: 7px;
          }

          .club-symbol-kicker small {
            font-size: 5px;
          }

          .club-symbol-stream {
            gap: 6px;
          }

          .club-symbol-pill {
            min-width: 126px;
            gap: 5px;
            padding: 3px 7px 3px 4px;
          }

          .club-symbol-fixture-logos {
            grid-template-columns: 25px auto 25px;
            gap: 2px;
          }

          .club-symbol-icon {
            width: 25px;
            height: 25px;
          }

          .club-symbol-fixture-logos b,
          .club-symbol-copy strong {
            font-size: 7px;
          }

          .club-symbol-copy small {
            font-size: 6px;
          }

          .club-symbol-match-centre {
            grid-column: 1 / -1;
            justify-self: start;
          }
        }

        @media (max-width: 900px) and (orientation: landscape) {
          .arena-live-dock {
            top: max(88px, calc(env(safe-area-inset-top) + 80px));
            right: max(6px, env(safe-area-inset-right));
          }

          .arena-live-dock.is-collapsed {
            top: max(58px, calc(env(safe-area-inset-top) + 50px));
            right: max(46px, calc(env(safe-area-inset-right) + 40px));
          }

          .arena-live-dock-panel {
            width: min(214px, 34vw);
            max-height: calc(100dvh - 138px);
          }

          .arena-live-dock-head {
            min-height: 40px;
          }

          .arena-live-dock-title > svg {
            width: 15px;
            height: 15px;
          }

          .arena-live-dock-title strong {
            font-size: 9px;
          }

          .arena-live-dock-title small {
            font-size: 6px;
          }

          .arena-live-dock-close {
            width: 26px;
            height: 26px;
          }

          .arena-live-dock-list > button {
            min-height: 43px;
            grid-template-columns: minmax(0, 1fr) 38px minmax(0, 1fr);
            gap: 3px;
            padding: 4px;
          }

          .arena-live-dock-club {
            gap: 2px;
          }

          .arena-live-dock-badge {
            width: 21px;
            height: 21px;
          }

          .arena-live-dock-badge img {
            width: 17px;
            height: 17px;
          }

          .arena-live-dock-score {
            gap: 2px;
          }

          .arena-live-dock-score strong {
            font-size: 10px;
          }

          .arena-live-dock-score small,
          .arena-live-dock-club > strong {
            font-size: 5.5px;
          }

          .arena-stage:has(.arena-action-panel-bench) .arena-action-layer {
            padding: max(58px, calc(env(safe-area-inset-top) + 58px)) 8px max(48px, calc(env(safe-area-inset-bottom) + 48px));
          }

          .arena-action-panel-bench {
            height: calc(100dvh - 112px);
            max-height: calc(100dvh - 112px);
            border-radius: 13px;
            padding: 8px;
          }

          .arena-action-panel-bench .arena-action-topline {
            min-height: 34px;
            align-items: center;
            flex-direction: row;
            padding-bottom: 5px;
          }

          .arena-action-panel-bench .arena-action-topline p {
            display: none;
          }

          .arena-action-panel-bench .arena-action-topline h2 {
            font-size: 23px;
          }

          .arena-action-panel-bench .arena-action-topline button {
            min-height: 30px;
            padding: 0 10px;
            font-size: 7px;
          }

          .arena-action-panel-bench .arena-bench-board {
            grid-template-columns: minmax(0, 1fr) minmax(174px, 202px);
            gap: 8px;
          }

          .arena-action-panel-bench .bench-roster-summary,
          .arena-action-panel-bench .bench-rule-stack {
            display: none;
          }

          .arena-action-panel-bench .training-center-board {
            margin-top: 0;
          }

          .arena-action-panel-bench .training-center-head {
            min-height: 16px;
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 5px;
          }

          .arena-action-panel-bench .training-center-head > strong {
            grid-column: 2;
            grid-row: 1;
            justify-self: end;
          }

          .arena-action-panel-bench .training-center-head span,
          .arena-action-panel-bench .training-center-head strong {
            font-size: 7px;
          }

          .arena-action-panel-bench .training-center-coach {
            grid-column: 3;
            grid-row: 1;
            grid-template-columns: 18px minmax(0, 1fr);
            gap: 3px;
            justify-self: end;
            max-width: 108px;
            padding: 1px 3px;
          }

          .arena-action-panel-bench .training-center-coach-card {
            width: 18px;
          }

          .arena-action-panel-bench .training-center-coach > svg {
            width: 20px;
            height: 20px;
            padding: 5px;
          }

          .arena-action-panel-bench .training-center-coach small {
            font-size: 4px;
          }

          .arena-action-panel-bench .training-center-coach strong {
            max-width: 76px;
            font-size: 4.5px;
          }

          .arena-action-panel-bench .training-center-coach em {
            display: none;
          }

          .arena-action-panel-bench .training-center-pitch {
            width: min(100%, 290px);
            border-radius: 10px;
          }

          .arena-action-panel-bench .training-center-player {
            width: 26px;
          }

          .arena-action-panel-bench .training-center-player > strong {
            font-size: 5px;
          }

          .arena-action-panel-bench .bench-confirm {
            gap: 5px;
            border-radius: 11px;
            padding: 8px;
          }

          .arena-action-panel-bench .bench-confirm > p {
            display: none;
          }

          .arena-action-panel-bench .bench-confirm > strong {
            margin-top: 2px;
            font-size: 12px;
          }

          .arena-action-panel-bench .bench-selected-card {
            width: min(82px, 72%);
            max-height: 132px;
            border-radius: 10px;
          }

          .arena-action-panel-bench .bench-swap-preview {
            padding: 6px;
          }

          .arena-action-panel-bench .bench-swap-preview > strong {
            margin-top: 2px;
            font-size: 10px;
          }

          .arena-action-panel-bench .bench-swap-preview > small {
            margin-top: 3px;
            font-size: 7px;
          }

          .arena-action-panel-bench .bench-confirm button {
            min-height: 30px;
            padding: 6px;
            font-size: 7px;
          }

          .arena-action-panel-market .team-builder-board {
            grid-template-columns:
              minmax(166px, .72fr)
              minmax(282px, 1.15fr)
              minmax(242px, 1fr);
            gap: 7px;
          }

          .arena-action-panel-market .team-builder-clubs,
          .arena-action-panel-market .team-builder-roster,
          .arena-action-panel-market .team-builder-preview {
            padding: 8px;
          }

          .arena-action-panel-market .team-builder-roster-head {
            grid-template-columns: 28px minmax(0, 1fr) auto;
            gap: 6px;
          }

          .arena-action-panel-market .team-builder-roster-head .team-builder-club-logo {
            width: 28px;
            height: 28px;
          }

          .arena-action-panel-market .team-builder-roster-head strong {
            font-size: 15px;
          }

          .arena-action-panel-market .team-builder-club-hub {
            min-height: 28px;
            padding: 0 7px;
            font-size: 7px;
          }

          .arena-action-panel-market .team-builder-player-list button {
            min-height: 44px;
            padding: 5px 7px;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-columns: minmax(88px, 106px) minmax(0, 1fr);
            grid-template-rows: auto auto auto;
            gap: 5px 7px;
            align-items: center;
          }

          .arena-action-panel-market .team-builder-preview-card {
            grid-column: 1;
            grid-row: 1 / 4;
            width: min(98px, 100%);
            height: auto;
            max-height: 150px;
          }

          .arena-action-panel-market .team-builder-preview-copy,
          .arena-action-panel-market .team-builder-market-ledger,
          .arena-action-panel-market .team-builder-send {
            grid-column: 2;
          }

          .arena-action-panel-market .team-builder-preview-copy {
            grid-row: 1;
            padding-bottom: 4px;
          }

          .arena-action-panel-market .team-builder-preview-copy strong {
            display: -webkit-box;
            overflow: hidden;
            text-overflow: clip;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            font-size: 11px;
            line-height: 1;
          }

          .arena-action-panel-market .team-builder-preview-copy small {
            margin-top: 3px;
            overflow: hidden;
            text-overflow: clip;
            white-space: normal;
            font-size: 7px;
            line-height: 1.05;
          }

          .arena-action-panel-market .team-builder-market-ledger {
            grid-row: 2;
            gap: 3px;
          }

          .arena-action-panel-market .team-builder-market-ledger span {
            min-height: 38px;
            padding: 3px 2px;
          }

          .arena-action-panel-market .team-builder-market-ledger strong {
            overflow: visible;
            text-overflow: clip;
            font-size: 8px;
            font-variant-numeric: tabular-nums;
          }

          .arena-action-panel-market .team-builder-send {
            grid-row: 3;
            min-height: 30px;
            margin: 0;
            padding: 6px;
            font-size: 7px;
          }

          .arena-action-panel-market {
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            scroll-padding-bottom: 10px;
          }

          .arena-action-panel-market .team-builder-shell {
            flex: none;
            grid-template-rows: auto auto 168px;
            min-height: max-content;
            height: auto;
            overflow: visible;
          }

          .arena-action-panel-market .team-builder-board {
            min-height: 168px;
            height: 168px;
          }
        }

        /* TouchLine Market — premium exchange layout */
        .arena-market-subtitle {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 10px;
          color: rgba(255,255,255,.58);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .04em;
        }

        .arena-market-subtitle svg {
          width: 14px;
          height: 14px;
          color: #b5ff4b;
          filter: drop-shadow(0 0 6px rgba(181,255,75,.6));
        }

        .arena-market-test-policy {
          margin: 9px 0 0;
          padding: 9px 11px;
          border: 1px solid rgba(181,255,75,.34);
          border-radius: 12px;
          color: #eaffc9;
          background: rgba(119,255,36,.08);
          font-size: 11px;
          font-weight: 800;
          line-height: 1.45;
        }

        .arena-action-panel-market .team-builder-shell {
          grid-template-rows: auto auto auto minmax(540px, 1fr);
        }

        .arena-action-panel-market .team-builder-cart-dock {
          border-color: rgba(122,231,255,.3);
          background:
            linear-gradient(110deg, rgba(122,231,255,.08), transparent 28%),
            linear-gradient(135deg, rgba(3,12,15,.92), rgba(2,8,10,.84));
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.035),
            0 14px 34px rgba(0,0,0,.2),
            0 0 26px rgba(122,231,255,.06);
        }

        .arena-action-panel-market .team-builder-cart-dock.has-items {
          border-color: rgba(181,255,75,.4);
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.08), 0 0 28px rgba(181,255,75,.08);
        }

        .arena-action-panel-market .team-builder-board {
          grid-template-columns: minmax(180px, 210px) minmax(500px, 1fr) minmax(340px, 380px);
          min-height: 540px;
          height: 100%;
          gap: 12px;
        }

        .arena-action-panel-market .team-builder-clubs,
        .arena-action-panel-market .team-builder-roster,
        .arena-action-panel-market .team-builder-preview {
          border-color: rgba(255,255,255,.12);
          background:
            linear-gradient(145deg, rgba(122,231,255,.035), transparent 38%),
            rgba(3,10,12,.76);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.035),
            0 18px 44px rgba(0,0,0,.18);
          backdrop-filter: blur(18px);
        }

        .arena-action-panel-market .team-builder-roster {
          grid-template-rows: auto auto auto minmax(0, 1fr);
          gap: 8px;
        }

        .team-builder-market-tools {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 7px;
        }

        .team-builder-market-search {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: 16px minmax(0,1fr) auto;
          align-items: center;
          gap: 7px;
          min-height: 38px;
          border: 1px solid rgba(122,231,255,.2);
          border-radius: 11px;
          background: rgba(0,0,0,.27);
          padding: 0 10px;
          color: rgba(122,231,255,.76);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
        }

        .team-builder-market-search:focus-within {
          border-color: rgba(181,255,75,.46);
          box-shadow: inset 0 0 0 1px rgba(181,255,75,.08), 0 0 18px rgba(181,255,75,.08);
        }

        .team-builder-market-search > svg,
        .team-builder-market-sort > svg {
          width: 14px;
          height: 14px;
        }

        .team-builder-market-search input,
        .team-builder-market-sort select {
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: white;
          font: inherit;
          font-size: 9px;
          font-weight: 850;
        }

        .team-builder-market-search input::placeholder {
          color: rgba(255,255,255,.38);
        }

        .team-builder-market-search > button {
          display: grid;
          width: 24px;
          height: 24px;
          place-items: center;
          border: 0;
          border-radius: 7px;
          background: rgba(255,255,255,.06);
          color: rgba(255,255,255,.62);
        }

        .team-builder-market-search > button svg {
          width: 12px;
          height: 12px;
        }

        .team-builder-position-filters {
          display: flex;
          min-width: 0;
          gap: 4px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .team-builder-position-filters button {
          display: grid;
          align-content: center;
          justify-items: start;
          gap: 2px;
          flex: 0 0 auto;
          min-height: 38px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: rgba(255,255,255,.035);
          padding: 5px 9px;
          color: rgba(255,255,255,.52);
          font-size: 7px;
          font-weight: 1000;
        }

        .team-builder-position-filters button span,
        .team-builder-position-filters button small {
          display: block;
          line-height: 1.05;
        }

        .team-builder-position-filters button small {
          color: rgba(174,234,255,.72);
          font-size: 6.5px;
        }

        .team-builder-position-filters button.is-full {
          border-color: rgba(181,255,75,.26);
          color: rgba(223,255,135,.78);
        }

        .team-builder-position-filters button.is-locked,
        .team-builder-position-filters button:disabled {
          cursor: not-allowed;
          opacity: .42;
        }

        .team-builder-position-filters button.is-active {
          border-color: rgba(181,255,75,.42);
          background: rgba(181,255,75,.1);
          color: #efff9b;
          box-shadow: 0 0 14px rgba(181,255,75,.08);
        }

        .team-builder-market-sort {
          display: grid;
          grid-template-columns: 14px minmax(0,1fr);
          align-items: center;
          gap: 5px;
          min-width: 132px;
          min-height: 30px;
          border: 1px solid rgba(255,255,255,.11);
          border-radius: 8px;
          background: rgba(0,0,0,.22);
          padding: 0 8px;
          color: rgba(181,255,75,.72);
        }

        .team-builder-market-sort select {
          width: 100%;
          font-size: 7px;
          cursor: pointer;
        }

        .team-builder-market-results-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 20px;
          color: rgba(255,255,255,.5);
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .team-builder-market-results-head span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #b5ff4b;
          letter-spacing: .08em;
        }

        .team-builder-market-results-head i,
        .team-builder-preview-status i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #b5ff4b;
          box-shadow: 0 0 8px #b5ff4b;
          animation: market-live-pulse 1.8s ease-in-out infinite;
        }

        @keyframes market-live-pulse {
          50% { opacity: .42; box-shadow: 0 0 3px #b5ff4b; }
        }

        .arena-action-panel-market .team-builder-player-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-auto-rows: 94px;
          align-content: start;
          gap: 7px;
          padding: 2px 3px 3px 1px;
        }

        .arena-action-panel-market .team-builder-player-list > article {
          position: relative;
          display: grid;
          grid-template-rows: minmax(0,1fr) auto;
          min-height: 94px;
          min-width: 0;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--market-card-accent) 24%, rgba(255,255,255,.08));
          border-radius: 14px;
          background:
            radial-gradient(circle at 8% 10%, color-mix(in srgb, var(--market-card-accent) 15%, transparent), transparent 32%),
            rgba(2,8,10,.74);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.025);
          transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
        }

        .arena-action-panel-market .team-builder-player-list > article:hover,
        .arena-action-panel-market .team-builder-player-list > article.is-selected {
          z-index: 1;
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--market-card-accent) 68%, white 6%);
          box-shadow: 0 12px 28px rgba(0,0,0,.26), 0 0 18px color-mix(in srgb, var(--market-card-accent) 11%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--market-card-accent) 10%, transparent);
        }

        .arena-action-panel-market .team-builder-player-list > article.is-in-cart {
          border-color: rgba(181,255,75,.58);
          box-shadow: 0 0 18px rgba(181,255,75,.1), inset 0 0 0 1px rgba(181,255,75,.08);
        }

        .arena-action-panel-market .team-builder-player-select {
          display: grid;
          grid-template-columns: 34px minmax(0,1fr) auto;
          gap: 8px;
          align-items: center;
          min-height: 54px;
          border: 0;
          background: transparent;
          padding: 8px;
          color: white;
          text-align: left;
          box-shadow: none;
        }

        .arena-action-panel-market .team-builder-player-select:hover,
        .arena-action-panel-market .team-builder-player-select.is-selected {
          transform: none;
          border-color: transparent;
          background: transparent;
          box-shadow: none;
        }

        .arena-action-panel-market .team-builder-player-select .team-builder-role {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--market-card-accent) 14%, rgba(0,0,0,.28));
          color: color-mix(in srgb, var(--market-card-accent) 82%, white 18%);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--market-card-accent) 28%, transparent), 0 0 12px color-mix(in srgb, var(--market-card-accent) 8%, transparent);
        }

        .arena-action-panel-market .team-builder-player-copy strong {
          font-size: 12px;
        }

        .team-builder-listing-meta {
          display: grid;
          justify-items: end;
          gap: 4px;
        }

        .team-builder-listing-meta .team-builder-value {
          padding: 6px 7px;
          font-size: 7px;
        }

        .team-builder-listing-meta > small {
          color: rgba(255,255,255,.38);
          font-size: 6px;
          font-weight: 850;
          white-space: nowrap;
        }

        .arena-action-panel-market .team-builder-player-list > article > .team-builder-quick-buy {
          display: flex;
          min-height: 30px;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 0;
          border-top: 1px solid color-mix(in srgb, var(--market-card-accent) 18%, rgba(255,255,255,.07));
          border-radius: 0;
          background: color-mix(in srgb, var(--market-card-accent) 7%, rgba(255,255,255,.018));
          padding: 5px 8px;
          color: color-mix(in srgb, var(--market-card-accent) 78%, white 22%);
          font-size: 7px;
          font-weight: 1000;
          box-shadow: none;
        }

        .arena-action-panel-market .team-builder-player-list > article > .team-builder-quick-buy:hover:not(:disabled) {
          transform: none;
          background: color-mix(in srgb, var(--market-card-accent) 15%, rgba(255,255,255,.025));
          box-shadow: 0 -6px 16px color-mix(in srgb, var(--market-card-accent) 7%, transparent);
        }

        .team-builder-quick-buy svg {
          width: 11px;
          height: 11px;
        }

        .team-builder-quick-buy strong {
          margin-left: auto;
          color: white;
          font-size: 8px;
        }

        .team-builder-quick-buy:disabled {
          opacity: .42;
          cursor: not-allowed;
        }

        .arena-action-panel-market .team-builder-player-list > article.is-position-locked {
          border-color: rgba(255,82,112,.34);
          box-shadow: inset 0 0 0 1px rgba(255,82,112,.08);
        }

        .arena-action-panel-market .team-builder-preview {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto auto minmax(278px, 1fr) auto auto auto auto auto auto;
          gap: 10px;
          align-items: stretch;
          overflow: hidden;
        }

        .arena-action-panel-market .team-builder-preview-copy,
        .arena-action-panel-market .team-builder-market-ledger,
        .arena-action-panel-market .team-builder-preview-card,
        .arena-action-panel-market .team-builder-preview-card-meta,
        .arena-action-panel-market .team-builder-market-facts,
        .arena-action-panel-market .team-builder-profile-link,
        .arena-action-panel-market .team-builder-send,
        .arena-action-panel-market .team-builder-checkout-trust {
          grid-column: 1;
        }

        .arena-action-panel-market .team-builder-preview-copy {
          grid-row: 1;
          position: relative;
          padding-right: 58px;
        }

        .team-builder-preview-status {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 5px;
          color: #b5ff4b;
          font-size: 6px;
          font-weight: 1000;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .arena-action-panel-market .team-builder-preview-copy > b {
          position: absolute;
          top: 2px;
          right: 0;
          border: 1px solid rgba(181,255,75,.38);
          border-radius: 9px;
          background: rgba(181,255,75,.1);
          padding: 7px 8px;
          color: #efff9b;
          font-size: 10px;
          font-weight: 1000;
          box-shadow: 0 0 16px rgba(181,255,75,.08);
        }

        .arena-action-panel-market .team-builder-market-ledger {
          grid-row: 2;
        }

        .arena-action-panel-market .team-builder-preview-card {
          grid-row: 3;
          width: min(230px, 82%);
          height: auto;
          max-height: 372px;
          align-self: center;
        }

        .team-builder-preview-card-meta {
          grid-row: 4;
          display: flex;
          min-height: 28px;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 9px;
          padding: 5px 9px;
          color: rgba(255,255,255,.66);
          background: rgba(2,10,10,.9);
          font-size: 8px;
          font-weight: 900;
        }

        .team-builder-preview-card-meta strong {
          color: var(--market-preview-tier-accent, #b5ff4b);
        }

        .team-builder-preview-card-meta span {
          text-align: right;
        }

        .arena-action-panel-market .team-builder-player-dossier {
          grid-row: 3;
          min-height: 46px;
          border-color: rgba(181,255,75,.22);
          background: linear-gradient(135deg, rgba(181,255,75,.1), rgba(3,13,14,.9));
          font-size: 9px;
        }

        .team-builder-market-facts {
          grid-row: 5;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }

        .team-builder-market-facts span {
          min-width: 0;
          border: 1px solid rgba(181,255,75,.14);
          border-radius: 9px;
          padding: 7px 8px;
          background: linear-gradient(145deg, rgba(181,255,75,.07), rgba(3,13,14,.92));
        }

        .team-builder-market-facts span:last-child {
          grid-column: 1 / -1;
        }

        .team-builder-market-facts small,
        .team-builder-market-facts strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .team-builder-market-facts small {
          margin-bottom: 3px;
          color: rgba(255,255,255,.48);
          font-size: 6px;
          font-weight: 900;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .team-builder-market-facts strong {
          color: #f4ffd3;
          font-size: 8px;
          font-weight: 1000;
        }

        .team-builder-position-warning {
          grid-row: 6;
          border: 1px solid rgba(255,82,112,.28);
          border-radius: 9px;
          padding: 8px 9px;
          color: #ffd4dc;
          background: linear-gradient(135deg, rgba(255,82,112,.12), rgba(3,12,14,.88));
          font-size: 8px;
          font-weight: 950;
          line-height: 1.35;
        }

        .team-builder-profile-link {
          grid-row: 7;
          display: flex;
          min-height: 32px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(118,225,255,.26);
          border-radius: 9px;
          color: #bcefff;
          background: rgba(4,20,24,.82);
          font-size: 8px;
          font-weight: 950;
          text-decoration: none;
        }

        .arena-action-panel-market .team-builder-send {
          grid-row: 8;
          position: sticky;
          bottom: 0;
          z-index: 3;
          min-height: 42px;
          align-self: stretch;
          box-shadow: 0 -12px 26px rgba(2,8,10,.74), 0 0 24px rgba(181,255,75,.12);
        }

        .team-builder-checkout-trust {
          grid-row: 9;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: rgba(255,255,255,.42);
          font-size: 7px;
          font-weight: 850;
        }

        .team-builder-checkout-trust svg {
          width: 11px;
          height: 11px;
          color: rgba(181,255,75,.72);
        }

        @media (min-width: 761px) {
          .touchline-game.is-market-standalone .arena-action-panel-market {
            height: auto;
            max-height: none;
            overflow: visible;
          }

          .touchline-game.is-market-standalone .arena-action-panel-market .team-builder-preview {
            position: sticky;
            top: 12px;
            align-self: start;
            max-height: calc(100svh - 28px);
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
          }
        }

        @media (max-width: 1180px) and (orientation: landscape) {
          .arena-action-panel-market .team-builder-shell {
            grid-template-rows: auto auto auto minmax(480px, 1fr);
          }

          .arena-action-panel-market .team-builder-board {
            grid-template-columns: minmax(150px, .48fr) minmax(390px, 1.34fr) minmax(280px, .78fr);
            min-height: 480px;
            height: 100%;
          }

          .arena-action-panel-market .team-builder-clubs,
          .arena-action-panel-market .team-builder-roster,
          .arena-action-panel-market .team-builder-preview {
            padding: 8px;
          }

          .arena-action-panel-market .team-builder-player-list {
            grid-template-columns: repeat(2, minmax(0,1fr));
            max-height: none;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto minmax(230px,1fr) auto auto auto auto auto auto;
          }

          .arena-action-panel-market .team-builder-preview-card {
            grid-column: 1;
            grid-row: 3;
            width: min(190px, 78%);
            max-height: 310px;
          }

          .arena-action-panel-market .team-builder-preview-copy,
          .arena-action-panel-market .team-builder-market-ledger,
          .arena-action-panel-market .team-builder-preview-card-meta,
          .arena-action-panel-market .team-builder-market-facts,
          .arena-action-panel-market .team-builder-position-warning,
          .arena-action-panel-market .team-builder-profile-link,
          .arena-action-panel-market .team-builder-send {
            grid-column: 1;
          }

          .arena-action-panel-market .team-builder-preview-copy { grid-row: 1; }
          .arena-action-panel-market .team-builder-market-ledger { grid-row: 2; }
          .arena-action-panel-market .team-builder-preview-card-meta { grid-row: 4; }
          .arena-action-panel-market .team-builder-market-facts { grid-row: 5; }
          .arena-action-panel-market .team-builder-position-warning { grid-row: 6; }
          .arena-action-panel-market .team-builder-profile-link { grid-row: 7; }
          .arena-action-panel-market .team-builder-send { grid-row: 8; }
          .arena-action-panel-market .team-builder-checkout-trust { grid-row: 9; }
        }

        @media (max-width: 760px) {
          .touchline-game.is-market-standalone .arena-club-sections {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .arena-action-panel-market .team-builder-club-grid::-webkit-scrollbar-thumb {
            border-radius: 999px;
            background: rgba(181,255,75,.5);
          }

          .arena-action-panel-market .team-builder-shell {
            display: grid;
            grid-template-rows: auto auto auto auto;
            width: 100%;
            min-width: 0;
            max-width: 100%;
          }

          .arena-action-panel-market .team-builder-bank,
          .arena-action-panel-market .team-builder-cart-dock,
          .arena-action-panel-market .team-builder-board,
          .arena-action-panel-market .team-builder-clubs,
          .arena-action-panel-market .team-builder-roster,
          .arena-action-panel-market .team-builder-preview {
            width: 100%;
            min-width: 0;
            max-width: 100%;
          }

          .arena-action-panel-market .team-builder-cart-dock {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
          }

          .arena-action-panel-market .team-builder-cart-title {
            min-width: 0;
          }

          .arena-action-panel-market .team-builder-cart-items {
            grid-column: 1 / -1;
            grid-row: 2;
            min-width: 0;
          }

          .arena-action-panel-market .team-builder-cart-empty {
            white-space: normal;
          }

          .arena-action-panel-market .team-builder-cart-totals {
            grid-column: 2;
            grid-row: 1;
            gap: 8px;
            padding: 0;
          }

          .arena-action-panel-market .team-builder-cart-checkout {
            grid-column: 1 / -1;
            grid-row: 3;
            width: 100%;
          }

          .arena-action-panel-market .team-builder-board {
            grid-template-columns: 1fr;
            height: auto;
          }

          .arena-action-panel-market .team-builder-club-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            max-height: 280px;
            overflow-y: auto;
          }

          .arena-action-panel-market .team-builder-player-list {
            grid-template-columns: 1fr;
            max-height: 42dvh;
          }
        }

        @media (max-height: 760px) and (min-width: 761px) {
          .arena-action-panel-market {
            overflow-x: hidden;
            overflow-y: auto;
          }

          .arena-action-panel-market .team-builder-shell {
            flex: none;
            grid-template-rows: auto auto auto minmax(560px, auto);
            min-height: max-content;
            height: auto;
            overflow: visible;
          }

          .arena-action-panel-market .team-builder-board {
            min-height: 560px;
            height: 560px;
          }

          .arena-action-panel-market .team-builder-roster-head {
            min-height: 46px;
          }

          .arena-action-panel-market .team-builder-market-search {
            min-height: 32px;
          }

          .arena-action-panel-market .team-builder-position-filters button,
          .arena-action-panel-market .team-builder-market-sort {
            min-height: 26px;
          }

          .arena-action-panel-market .team-builder-player-list {
            grid-auto-rows: 92px;
          }

          .arena-action-panel-market .team-builder-player-list > article {
            min-height: 92px;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-rows: auto auto minmax(250px,1fr) auto auto auto;
            gap: 8px;
          }

          .arena-action-panel-market .team-builder-preview-card {
            width: min(210px, 80%);
            max-height: 340px;
          }

          .arena-action-panel-market .team-builder-market-ledger span {
            min-height: 36px;
            padding: 4px;
          }

          .arena-action-panel-market .team-builder-send {
            min-height: 32px;
          }
        }

        @media (orientation: landscape) and (min-width: 600px) and (max-width: 900px) and (max-height: 520px) {
          .arena-action-panel-market .team-builder-board {
            grid-template-columns: clamp(100px, 15.2vw, 128px) minmax(0, 1fr) clamp(150px, 23.2vw, 196px);
            gap: clamp(6px, 1vw, 8px);
            width: 100%;
            min-width: 0;
            height: 560px;
          }

          .arena-action-panel-market .team-builder-clubs,
          .arena-action-panel-market .team-builder-roster,
          .arena-action-panel-market .team-builder-preview {
            min-width: 0;
            padding: 7px;
          }

          .arena-action-panel-market .team-builder-club-list {
            gap: 5px;
          }

          .arena-action-panel-market .team-builder-club-list button {
            grid-template-columns: 26px minmax(0, 1fr);
            gap: 5px;
            min-height: 42px;
            padding: 5px;
          }

          .arena-action-panel-market .team-builder-club-list img {
            width: 26px;
            height: 26px;
          }

          .arena-action-panel-market .team-builder-roster-head {
            min-height: 42px;
          }

          .arena-action-panel-market .team-builder-roster-head .team-builder-club-logo {
            width: 28px;
            height: 28px;
          }

          .arena-action-panel-market .team-builder-player-select {
            grid-template-columns: 28px minmax(0, 1fr) auto;
            gap: 6px;
            padding: 6px;
          }

          .arena-action-panel-market .team-builder-player-select .team-builder-role {
            width: 28px;
            height: 28px;
          }

          .arena-action-panel-market .team-builder-player-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            max-height: none;
          }

          .arena-action-panel-market .team-builder-player-copy strong {
            display: -webkit-box;
            overflow: hidden;
            font-size: 10px;
            line-height: 1.05;
            white-space: normal;
            text-overflow: clip;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }

          .arena-action-panel-market .team-builder-listing-meta {
            gap: 2px;
          }

          .arena-action-panel-market .team-builder-listing-meta > small {
            display: none;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-rows: auto auto minmax(220px, 1fr) auto auto;
          }

          .arena-action-panel-market .team-builder-preview-card {
            width: min(150px, 86%);
            max-height: 262px;
          }

          .arena-action-panel-market .team-builder-preview-copy {
            padding-right: 42px;
          }

          .arena-action-panel-market .team-builder-preview-copy > b {
            padding: 5px 6px;
            font-size: 8px;
          }
        }

        /* Market Transfer — stable premium layout shared by desktop, tablet and mobile. */
        .arena-action-panel-market {
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .arena-action-panel-market .team-builder-shell {
          grid-template-rows: auto auto auto auto;
          min-height: 0;
          height: auto;
          overflow: visible;
          gap: 12px;
        }

        .arena-action-panel-market .team-builder-board {
          grid-template-areas: "clubs roster";
          grid-template-columns: minmax(210px, 250px) minmax(0, 1fr);
          min-height: 630px;
          height: auto;
          gap: 12px;
        }

        .arena-action-panel-market .team-builder-clubs { grid-area: clubs; }
        .arena-action-panel-market .team-builder-roster { grid-area: roster; }

        .arena-action-panel-market .team-builder-clubs,
        .arena-action-panel-market .team-builder-roster {
          min-width: 0;
          backdrop-filter: blur(9px);
          -webkit-backdrop-filter: blur(9px);
        }

        .arena-action-panel-market .team-builder-club-grid button {
          min-height: 70px;
          grid-template-columns: 46px minmax(0, 1fr);
          padding: 10px;
        }

        .arena-action-panel-market .team-builder-club-logo { width: 46px; height: 46px; }

        .arena-action-panel-market .team-builder-club-grid strong,
        .arena-action-panel-market .team-builder-section-title strong {
          font-size: 13px;
        }

        .arena-action-panel-market .team-builder-club-grid small,
        .arena-action-panel-market .team-builder-section-title span {
          font-size: 10px;
        }

        .arena-action-panel-market .team-builder-market-search input,
        .arena-action-panel-market .team-builder-market-sort select {
          font-size: 12px;
        }

        .arena-action-panel-market .team-builder-position-filters button {
          min-height: 36px;
          padding-inline: 11px;
          font-size: 10px;
        }

        .arena-action-panel-market .team-builder-market-sort {
          min-height: 36px;
        }

        .arena-action-panel-market .team-builder-market-results-head,
        .arena-action-panel-market .team-builder-preview-status {
          font-size: 10px;
        }

        .arena-action-panel-market .team-builder-player-list {
          grid-auto-rows: auto;
          overflow-x: hidden;
        }

        .arena-action-panel-market .team-builder-player-list > article {
          min-height: 0;
        }

        .arena-action-panel-market .team-builder-player-select {
          grid-template-columns: 1fr;
          grid-template-rows: auto auto;
          min-height: 0;
          gap: 8px;
          padding: 9px;
        }

        .arena-action-panel-market .team-builder-profile-link {
          order: 6;
          flex: 0 0 auto;
        }

        .arena-action-panel-market .team-builder-send {
          order: 7;
          flex: 0 0 auto;
        }

        .arena-action-panel-market .team-builder-checkout-trust {
          order: 8;
          flex: 0 0 auto;
        }

        .arena-action-panel-market .team-builder-preview-copy > b {
          font-size: 12px;
        }

        .arena-action-panel-market .team-builder-preview-copy strong {
          font-size: 20px;
          line-height: 1.05;
        }

        .arena-action-panel-market .team-builder-preview-copy small,
        .arena-action-panel-market .team-builder-preview-card-meta,
        .arena-action-panel-market .team-builder-market-facts small,
        .arena-action-panel-market .team-builder-checkout-trust {
          font-size: 9px;
        }

        .arena-action-panel-market .team-builder-market-facts strong,
        .arena-action-panel-market .team-builder-profile-link {
          font-size: 11px;
        }

        .arena-action-panel-market .team-builder-profile-link,
        .arena-action-panel-market .team-builder-send {
          min-height: 44px;
        }

        .arena-action-panel-market .team-builder-roster.is-refreshing,
        .arena-action-panel-market .team-builder-preview.is-refreshing {
          position: relative;
          pointer-events: none;
        }

        .arena-action-panel-market .team-builder-roster.is-refreshing::after,
        .arena-action-panel-market .team-builder-preview.is-refreshing::after {
          content: attr(data-refresh-label);
          position: absolute;
          z-index: 8;
          top: 10px;
          right: 10px;
          border: 1px solid rgba(181,255,75,.3);
          border-radius: 999px;
          padding: 7px 10px;
          background: rgba(3,14,12,.92);
          color: #dfff87;
          font-size: 9px;
          font-weight: 950;
          box-shadow: 0 0 16px rgba(181,255,75,.08);
        }

        .team-builder-confirm-layer {
          position: fixed;
          z-index: 1200;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(0,5,7,.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .team-builder-confirm-dialog {
          position: relative;
          width: min(520px, 100%);
          max-height: min(720px, calc(100dvh - 40px));
          overflow-y: auto;
          border: 1px solid rgba(181,255,75,.42);
          border-radius: 22px;
          padding: 22px;
          background:
            radial-gradient(circle at 12% 0, rgba(181,255,75,.14), transparent 34%),
            linear-gradient(145deg, rgba(5,22,20,.98), rgba(1,8,11,.99));
          color: white;
          box-shadow: 0 30px 90px rgba(0,0,0,.62), 0 0 40px rgba(181,255,75,.08), inset 0 0 0 1px rgba(255,255,255,.04);
        }

        .team-builder-confirm-close {
          position: absolute;
          top: 14px;
          right: 14px;
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 12px;
          background: rgba(255,255,255,.04);
          color: white;
        }

        .team-builder-confirm-head {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-right: 48px;
        }

        .team-builder-confirm-head span,
        .team-builder-confirm-head small,
        .team-builder-confirm-head strong {
          display: block;
        }

        .team-builder-confirm-head small {
          color: #aeeaff;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .team-builder-confirm-head strong {
          margin-top: 4px;
          font-size: 24px;
          line-height: 1.05;
        }

        .team-builder-confirm-players {
          display: grid;
          gap: 7px;
          margin-top: 18px;
        }

        .team-builder-confirm-players > span,
        .team-builder-confirm-totals > div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 12px;
          padding: 10px 12px;
          background: rgba(255,255,255,.025);
        }

        .team-builder-confirm-players b,
        .team-builder-confirm-players strong {
          font-size: 13px;
        }

        .team-builder-confirm-totals {
          display: grid;
          gap: 7px;
          margin: 14px 0 0;
        }

        .team-builder-confirm-totals dt {
          color: rgba(255,255,255,.58);
          font-size: 12px;
          font-weight: 800;
        }

        .team-builder-confirm-totals dd {
          margin: 0;
          color: #efff9b;
          font-size: 14px;
          font-weight: 1000;
        }

        .team-builder-confirm-actions {
          display: grid;
          grid-template-columns: 1fr 1.45fr;
          gap: 9px;
          margin-top: 18px;
        }

        .team-builder-confirm-actions button {
          display: flex;
          min-height: 48px;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 13px;
          background: rgba(255,255,255,.04);
          color: white;
          font-size: 12px;
          font-weight: 950;
        }

        .team-builder-confirm-actions button.is-primary {
          border-color: rgba(181,255,75,.58);
          background: linear-gradient(135deg, #89d931, #c7ff56);
          color: #071006;
          box-shadow: 0 12px 26px rgba(181,255,75,.16);
        }

        .team-builder-replacement-warning {
          margin: 18px 0 0;
          border: 1px solid rgba(255,190,76,.24);
          border-radius: 12px;
          padding: 12px;
          background: rgba(255,154,46,.08);
          color: rgba(255,244,210,.82);
          font-size: 12px;
          font-weight: 760;
          line-height: 1.5;
        }

        .team-builder-replacement-list {
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }

        .team-builder-replacement-list > button {
          display: flex;
          min-height: 58px;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 13px;
          padding: 10px 12px;
          background: rgba(255,255,255,.035);
          color: white;
          text-align: left;
        }

        .team-builder-replacement-list > button:hover:not(:disabled),
        .team-builder-replacement-list > button:focus-visible {
          border-color: rgba(181,255,75,.52);
          background: rgba(181,255,75,.08);
        }

        .team-builder-replacement-list span,
        .team-builder-replacement-list strong,
        .team-builder-replacement-list small {
          display: block;
        }

        .team-builder-replacement-list strong {
          font-size: 13px;
        }

        .team-builder-replacement-list small {
          margin-top: 3px;
          color: rgba(255,255,255,.54);
          font-size: 10px;
        }

        .team-builder-replacement-list b {
          color: #dfff87;
          font-size: 10px;
          text-align: right;
        }

        @media (max-width: 1040px) {
          .arena-action-panel-market .team-builder-board {
            grid-template-areas:
              "clubs preview"
              "roster roster";
            grid-template-columns: minmax(220px, .72fr) minmax(330px, 1.28fr);
            min-height: 0;
          }

          .arena-action-panel-market .team-builder-club-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            max-height: 360px;
          }

          .arena-action-panel-market .team-builder-player-list {
            max-height: none;
            overflow: visible;
          }
        }

        @media (max-width: 760px) {
          .arena-action-panel-market .team-builder-shell {
            gap: 10px;
          }

          .arena-action-panel-market .team-builder-bank {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .arena-action-panel-market .team-builder-bank > span:last-child {
            grid-column: 1 / -1;
          }

          .arena-action-panel-market .team-builder-bank small {
            font-size: 10px;
          }

          .arena-action-panel-market .team-builder-bank strong {
            font-size: 17px;
          }

          .arena-action-panel-market .team-builder-cart-dock {
            grid-template-columns: minmax(0, 1fr);
            padding: 11px;
          }

          .arena-action-panel-market .team-builder-cart-title,
          .arena-action-panel-market .team-builder-cart-items,
          .arena-action-panel-market .team-builder-cart-totals,
          .arena-action-panel-market .team-builder-cart-checkout {
            grid-column: 1;
            width: 100%;
          }

          .arena-action-panel-market .team-builder-cart-title { grid-row: 1; }
          .arena-action-panel-market .team-builder-cart-items { grid-row: 2; }
          .arena-action-panel-market .team-builder-cart-totals {
            grid-row: 3;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            justify-content: stretch;
          }
          .arena-action-panel-market .team-builder-cart-checkout { grid-row: 4; min-height: 46px; }

          .arena-action-panel-market .team-builder-board {
            grid-template-areas:
              "clubs"
              "preview"
              "roster";
            grid-template-columns: minmax(0, 1fr);
            min-height: 0;
            height: auto;
            gap: 10px;
          }

          .arena-action-panel-market .team-builder-clubs,
          .arena-action-panel-market .team-builder-roster,
          .arena-action-panel-market .team-builder-preview {
            padding: 12px;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }

          .arena-action-panel-market .team-builder-club-grid {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: minmax(132px, 42vw);
            grid-template-columns: none;
            gap: 7px;
            max-height: none;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 2px 2px 8px;
            scroll-snap-type: x proximity;
            scrollbar-width: thin;
            scrollbar-color: rgba(181,255,75,.5) rgba(255,255,255,.06);
          }

          .arena-action-panel-market .team-builder-club-grid::-webkit-scrollbar {
            display: block;
            height: 4px;
          }

          .arena-action-panel-market .team-builder-club-grid button {
            min-height: 58px;
            scroll-snap-align: start;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-rows: auto auto auto auto auto auto auto auto;
          }

          .arena-action-panel-market .team-builder-preview-card {
            width: min(280px, 88vw);
            min-height: 0;
          }

          .arena-action-panel-market .team-builder-market-ledger span {
            min-height: 50px;
          }

          .arena-action-panel-market .team-builder-preview-copy strong {
            font-size: 22px;
          }

          .arena-action-panel-market .team-builder-player-list {
            grid-template-columns: minmax(0, 1fr);
            grid-auto-rows: auto;
            max-height: none;
            overflow: visible;
          }

          .arena-action-panel-market .team-builder-player-list > article {
            min-height: 112px;
          }

          .arena-action-panel-market .team-builder-player-select {
            min-height: 76px;
            grid-template-columns: 40px minmax(0, 1fr);
            grid-template-rows: auto auto;
            align-content: center;
          }

          .arena-action-panel-market .team-builder-player-select .team-builder-role {
            grid-column: 1;
            grid-row: 1 / 3;
          }

          .arena-action-panel-market .team-builder-player-copy {
            grid-column: 2;
            grid-row: 1;
          }

          .arena-action-panel-market .team-builder-listing-meta {
            grid-column: 2;
            grid-row: 2;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 8px;
          }

          .arena-action-panel-market .team-builder-player-list > article > .team-builder-quick-buy {
            min-height: 44px;
            font-size: 12px;
          }

          .arena-action-panel-market .team-builder-player-copy strong {
            font-size: 15px;
          }

          .arena-action-panel-market .team-builder-player-copy small,
          .arena-action-panel-market .team-builder-listing-meta > small,
          .arena-action-panel-market .team-builder-listing-meta .team-builder-value {
            font-size: 10px;
          }

          .arena-action-panel-market .team-builder-market-search,
          .arena-action-panel-market .team-builder-market-sort,
          .arena-action-panel-market .team-builder-position-filters button {
            min-height: 44px;
          }

          .team-builder-confirm-layer {
            align-items: end;
            padding: 10px;
          }

          .team-builder-confirm-dialog {
            width: 100%;
            max-height: calc(100dvh - 20px);
            border-radius: 22px 22px 14px 14px;
            padding: 20px 16px 16px;
          }
        }

        @media (orientation: landscape) and (min-width: 600px) and (max-width: 900px) and (max-height: 520px) {
          .arena-action-panel-market .team-builder-board {
            grid-template-areas:
              "clubs preview"
              "roster roster";
            grid-template-columns: minmax(260px, .85fr) minmax(320px, 1.15fr);
            min-height: 0;
            height: auto;
          }

          .arena-action-panel-market .team-builder-club-grid {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: 132px;
            grid-template-columns: none;
            max-height: none;
            overflow-x: auto;
            overflow-y: hidden;
          }

          .arena-action-panel-market .team-builder-preview {
            grid-template-rows: auto auto auto auto auto auto auto auto;
          }

          .arena-action-panel-market .team-builder-preview-card {
            width: min(210px, 60vw);
            max-height: none;
          }

          .arena-action-panel-market .team-builder-player-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-auto-rows: auto;
            max-height: none;
            overflow: visible;
          }
        }

        /* Market Transfer — short landscape/mobile audit pass.
           Keep this after the older responsive rules: iPhone/Safari landscape
           has very little vertical space, so the useful market area must appear
           before the user scrolls through a full desktop-style header stack. */
        @media (orientation: landscape) and (min-width: 600px) and (max-width: 940px) and (max-height: 540px) {
          .touchline-game.is-market-standalone .arena-action-layer {
            padding: max(6px, env(safe-area-inset-top)) max(7px, env(safe-area-inset-right)) max(7px, env(safe-area-inset-bottom)) max(7px, env(safe-area-inset-left));
          }

          .touchline-game.is-market-standalone .arena-action-panel-market {
            padding: 8px;
            border-radius: 16px;
          }

          .touchline-game.is-market-standalone .arena-action-topline {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            padding-bottom: 4px;
          }

          .touchline-game.is-market-standalone .arena-action-topline p,
          .touchline-game.is-market-standalone .arena-market-subtitle {
            display: none;
          }

          .touchline-game.is-market-standalone .arena-action-topline h2 {
            margin: 0;
            font-size: clamp(22px, 4vw, 30px);
            line-height: .86;
          }

          .touchline-game.is-market-standalone .arena-action-topline .arena-market-return {
            min-height: 30px;
            border-radius: 10px;
            padding: 0 10px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .arena-club-sections {
            display: flex;
            gap: 5px;
            margin-top: 5px;
            overflow-x: auto;
            padding: 3px;
            scrollbar-width: none;
          }

          .touchline-game.is-market-standalone .arena-club-sections::-webkit-scrollbar {
            display: none;
          }

          .touchline-game.is-market-standalone .arena-club-sections a {
            flex: 0 0 auto;
            min-height: 26px;
            padding: 0 9px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .team-builder-shell {
            gap: 6px;
            margin-top: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-bank {
            display: none;
          }

          .touchline-game.is-market-standalone .team-builder-cart-dock {
            grid-template-columns: auto minmax(0, 1fr) auto auto;
            min-height: 34px;
            gap: 5px;
            border-radius: 10px;
            padding: 4px 6px;
          }

          .touchline-game.is-market-standalone .team-builder-cart-dock.is-empty {
            grid-template-columns: auto minmax(0, 1fr) auto;
          }

          .touchline-game.is-market-standalone .team-builder-cart-dock.is-empty .team-builder-cart-items {
            display: none;
          }

          .touchline-game.is-market-standalone .team-builder-cart-title {
            min-width: 72px;
            gap: 5px;
          }

          .touchline-game.is-market-standalone .team-builder-cart-title > .team-builder-selected-mark {
            width: 20px;
            height: 17px;
          }

          .touchline-game.is-market-standalone .team-builder-cart-title small,
          .touchline-game.is-market-standalone .team-builder-cart-totals small,
          .touchline-game.is-market-standalone .team-builder-cart-empty {
            font-size: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-cart-title strong,
          .touchline-game.is-market-standalone .team-builder-cart-totals strong {
            font-size: 10px;
          }

          .touchline-game.is-market-standalone .team-builder-cart-checkout {
            min-height: 28px;
            border-radius: 9px;
            padding: 0 9px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .team-builder-board {
            grid-template-areas:
              "clubs clubs"
              "roster preview";
            grid-template-columns: minmax(188px, .68fr) minmax(292px, 1fr);
            gap: 7px;
            min-height: 0;
          }

          .touchline-game.is-market-standalone .team-builder-clubs,
          .touchline-game.is-market-standalone .team-builder-roster,
          .touchline-game.is-market-standalone .team-builder-preview {
            padding: 7px;
            border-radius: 13px;
          }

          .touchline-game.is-market-standalone .team-builder-section-title {
            margin-bottom: 4px;
          }

          .touchline-game.is-market-standalone .team-builder-clubs .team-builder-section-title {
            display: none;
          }

          .touchline-game.is-market-standalone .team-builder-section-title span {
            display: none;
          }

          .touchline-game.is-market-standalone .team-builder-section-title strong {
            margin-top: 0;
            font-size: 9px;
          }

          .touchline-game.is-market-standalone .team-builder-section-title a {
            min-height: 26px;
            padding: 0 9px;
            font-size: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid {
            grid-auto-flow: column;
            grid-auto-columns: minmax(104px, 18vw);
            grid-template-columns: none;
            gap: 5px;
            max-height: none;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 1px 2px 1px 1px;
            scroll-snap-type: x proximity;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid button {
            grid-template-columns: 24px minmax(0, 1fr);
            min-height: 34px;
            gap: 5px;
            border-radius: 10px;
            padding: 5px;
            scroll-snap-align: start;
          }

          .touchline-game.is-market-standalone .team-builder-club-logo {
            width: 24px;
            height: 24px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid strong {
            font-size: 9px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid small {
            margin-top: 2px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .team-builder-roster {
            gap: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-roster-head {
            grid-template-columns: 26px minmax(0, 1fr) auto;
            gap: 6px;
            min-height: 30px;
            padding-bottom: 4px;
          }

          .touchline-game.is-market-standalone .team-builder-roster-head .team-builder-club-logo {
            width: 26px;
            height: 26px;
          }

          .touchline-game.is-market-standalone .team-builder-roster-head span {
            font-size: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-roster-head small {
            display: none;
          }

          .touchline-game.is-market-standalone .team-builder-roster-head strong {
            margin-top: 1px;
            font-size: 13px;
          }

          .touchline-game.is-market-standalone .team-builder-club-hub {
            min-height: 24px;
            border-radius: 9px;
            padding: 0 8px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .team-builder-market-tools {
            grid-template-columns: minmax(0, 1fr) auto auto;
            gap: 5px;
          }

          .touchline-game.is-market-standalone .team-builder-market-search {
            grid-column: 1 / -1;
            min-height: 26px;
            border-radius: 9px;
            padding: 0 8px;
          }

          .touchline-game.is-market-standalone .team-builder-market-search input {
            font-size: 9px;
          }

          .touchline-game.is-market-standalone .team-builder-position-filters button,
          .touchline-game.is-market-standalone .team-builder-market-sort {
            min-height: 24px;
          }

          .touchline-game.is-market-standalone .team-builder-market-sort {
            min-width: 112px;
            border-radius: 9px;
          }

          .touchline-game.is-market-standalone .team-builder-market-results-head {
            min-height: 14px;
            font-size: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-player-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-auto-rows: minmax(74px, auto);
            gap: 5px;
            max-height: 288px;
            overflow-y: auto;
          }

          .touchline-game.is-market-standalone .team-builder-player-list > article {
            min-height: 74px;
            border-radius: 12px;
          }

          .touchline-game.is-market-standalone .team-builder-player-select {
            grid-template-columns: 28px minmax(0, 1fr);
            grid-template-rows: auto auto;
            min-height: 45px;
            gap: 5px;
            padding: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-player-select .team-builder-role {
            grid-row: 1 / 3;
            width: 26px;
            height: 26px;
            border-radius: 8px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .team-builder-player-copy strong {
            font-size: 10px;
          }

          .touchline-game.is-market-standalone .team-builder-player-copy small,
          .touchline-game.is-market-standalone .team-builder-position-cap {
            font-size: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-listing-meta {
            grid-column: 2;
            grid-row: 2;
            align-items: start;
            justify-items: start;
            gap: 2px;
          }

          .touchline-game.is-market-standalone .team-builder-listing-meta .team-builder-value {
            padding: 4px 5px;
            font-size: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-listing-meta > small {
            display: none;
          }

          .touchline-game.is-market-standalone .team-builder-player-list > article > .team-builder-quick-buy {
            min-height: 25px;
            padding: 4px 6px;
            font-size: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-preview {
            position: sticky;
            top: 6px;
            max-height: calc(100svh - 14px);
            overflow-y: auto;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
            gap: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-preview-copy {
            padding-right: 48px;
          }

          .touchline-game.is-market-standalone .team-builder-preview-status {
            margin-bottom: 3px;
            font-size: 5px;
          }

          .touchline-game.is-market-standalone .team-builder-preview-copy > b {
            padding: 5px 6px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .team-builder-preview-copy strong {
            font-size: 16px;
          }

          .touchline-game.is-market-standalone .team-builder-preview-copy small,
          .touchline-game.is-market-standalone .team-builder-preview-card-meta,
          .touchline-game.is-market-standalone .team-builder-market-facts small,
          .touchline-game.is-market-standalone .team-builder-checkout-trust {
            font-size: 6px;
          }

          .touchline-game.is-market-standalone .team-builder-preview-card {
            width: min(148px, 48vw);
          }

          .touchline-game.is-market-standalone .team-builder-market-ledger {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 4px;
          }

          .touchline-game.is-market-standalone .team-builder-market-ledger span,
          .touchline-game.is-market-standalone .team-builder-market-facts span {
            min-height: 32px;
            border-radius: 9px;
            padding: 5px 6px;
          }

          .touchline-game.is-market-standalone .team-builder-market-ledger strong,
          .touchline-game.is-market-standalone .team-builder-market-facts strong {
            font-size: 8px;
          }

          .touchline-game.is-market-standalone .team-builder-send,
          .touchline-game.is-market-standalone .team-builder-profile-link {
            min-height: 30px;
            border-radius: 9px;
            font-size: 7px;
          }
        }

        /* Block 5 — Portal mobile: keep navigation compact so the first
           player list is reachable without crossing a desktop-sized hero. */
        @media (max-width: 760px) and (orientation: portrait) {
          .touchline-game.is-market-standalone .arena-action-layer {
            padding:
              max(10px, env(safe-area-inset-top))
              max(10px, env(safe-area-inset-right))
              max(14px, env(safe-area-inset-bottom))
              max(10px, env(safe-area-inset-left));
          }

          .touchline-game.is-market-standalone .arena-action-panel-market {
            min-height: calc(100dvh - max(24px, env(safe-area-inset-top) + env(safe-area-inset-bottom)));
            border-radius: 16px;
            padding: 12px;
          }

          .touchline-game.is-market-standalone .arena-action-topline {
            align-items: center;
            gap: 10px;
            padding-bottom: 10px;
          }

          .touchline-game.is-market-standalone .arena-action-topline p,
          .touchline-game.is-market-standalone .arena-market-subtitle {
            display: none;
          }

          .touchline-game.is-market-standalone .arena-action-topline h2 {
            margin: 0;
            font-size: clamp(30px, 9vw, 38px);
            line-height: .88;
          }

          .touchline-game.is-market-standalone .arena-action-topline .arena-market-return {
            min-height: 36px;
            flex: 0 0 auto;
            border-radius: 10px;
            padding: 0 10px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .arena-club-sections {
            display: flex;
            gap: 5px;
            margin-top: 8px;
            overflow-x: auto;
            overscroll-behavior-x: contain;
            padding: 3px;
            scrollbar-width: none;
          }

          .touchline-game.is-market-standalone .arena-club-sections::-webkit-scrollbar {
            display: none;
          }

          .touchline-game.is-market-standalone .arena-club-sections a {
            min-height: 32px;
            flex: 0 0 auto;
            padding: 0 10px;
            font-size: 7px;
          }

          .touchline-game.is-market-standalone .team-builder-shell {
            gap: 10px;
            margin-top: 10px;
          }

          .touchline-game.is-market-standalone .team-builder-bank {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: minmax(138px, 62vw);
            grid-template-columns: none;
            gap: 7px;
            overflow-x: auto;
            overscroll-behavior-x: contain;
            padding-bottom: 2px;
            scrollbar-width: none;
          }

          .touchline-game.is-market-standalone .team-builder-bank::-webkit-scrollbar {
            display: none;
          }

          .touchline-game.is-market-standalone .team-builder-bank span {
            min-height: 76px;
            padding: 10px;
          }
        }

        /* The product zoom is shared by Arena and Live. Keep these rules after
           legacy spotlight breakpoints so older compact-card layouts cannot
           collapse the details panel or place it over the official card. */
        @media (max-width: 760px) {
          .arena-player-spotlight-panel.arena-player-spotlight-panel-with-details {
            width: min(390px, calc(100vw - 28px));
            min-width: 0;
            max-height: calc(100dvh - 28px);
            grid-template-columns: minmax(0, 1fr);
            align-items: start;
            gap: 12px;
            overflow-x: hidden;
            overflow-y: auto;
            padding: 4px;
            scrollbar-width: thin;
          }

          .arena-player-spotlight-panel-with-details .arena-player-spotlight-product {
            width: min(290px, 100%);
            margin-inline: auto;
          }

          .arena-player-spotlight-panel-with-details .arena-player-spotlight-card {
            grid-row: auto;
          }
        }

        @media (orientation: landscape) and (max-height: 520px) {
          .arena-player-spotlight-panel.arena-player-spotlight-panel-with-details {
            width: min(900px, calc(100vw - 40px));
            min-width: 0;
            max-height: calc(100dvh - 24px);
            grid-template-columns: minmax(190px, calc((100dvh - 44px) * .6223)) minmax(280px, 1fr);
            align-items: center;
            gap: 14px;
            overflow-x: hidden;
            overflow-y: auto;
            padding: 4px;
          }

          /* Keep the close action fully inside the short visual viewport.
             The desktop offset is intentionally decorative, but at 320 px
             tall it would place the top 6 px outside WebKit's usable area. */
          .arena-player-spotlight-panel-with-details .arena-player-spotlight-close {
            top: 4px;
            right: 4px;
          }

          .arena-player-spotlight-panel-with-details .arena-player-spotlight-product {
            width: 100%;
            margin: 0;
          }

          .arena-player-spotlight-panel-with-details .arena-player-spotlight-card {
            grid-row: auto;
          }
        }

        /* Block 6 — The Arena remains a full-screen product in short landscape
           viewports. Keep all navigation reachable, while taking the least
           possible space away from the pitch and the official cards. */
        @media (max-width: 900px) and (max-height: 520px) and (orientation: landscape) {
          .game-hud {
            top: max(4px, env(safe-area-inset-top));
            left: max(4px, env(safe-area-inset-left));
            gap: 3px;
            padding: 3px;
          }

          .arena-quick-dock {
            width: min(156px, calc(100vw - 68px));
            gap: 3px;
            border-radius: 9px;
            padding: 3px;
          }

          .arena-quick-dock.is-collapsed {
            width: min(108px, calc(100vw - 68px));
          }

          .arena-quick-toggle,
          .arena-quick-links button,
          .arena-quick-links a {
            min-height: 32px;
            border-radius: 7px;
            padding: 0 7px;
            font-size: 6px;
          }

          .arena-quick-toggle strong {
            font-size: 11px;
          }

          .arena-quick-dock.is-collapsed {
            width: 38px;
          }

          .arena-quick-dock.is-collapsed .arena-quick-toggle {
            justify-content: center;
            min-height: 32px;
            padding: 0;
          }

          .arena-quick-dock.is-collapsed .arena-quick-toggle > span {
            position: absolute;
            width: 1px;
            height: 1px;
            margin: -1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
          }

          .arena-quick-dock.is-collapsed .arena-quick-toggle strong {
            display: none;
          }

          .arena-quick-dock.is-collapsed .arena-quick-menu-icon {
            width: 16px;
            height: 16px;
          }

          .language-switcher {
            width: 84px;
            flex-basis: 84px;
          }

          .language-trigger {
            min-height: 32px;
            grid-template-columns: 17px minmax(0, 1fr) 9px;
            gap: 3px;
            border-radius: 7px;
            padding: 3px 5px;
          }

          .language-flag {
            font-size: 14px;
          }

          .language-current-name {
            font-size: 6px;
          }

          .club-symbol-carousel {
            left: max(4px, env(safe-area-inset-left));
            right: max(4px, env(safe-area-inset-right));
            bottom: max(4px, calc(env(safe-area-inset-bottom) + 4px));
          }

          .club-symbol-open {
            gap: 5px;
            border-radius: 10px;
            padding: 3px 5px;
            grid-template-columns: auto 44px minmax(0, 1fr) 44px auto;
          }

          .club-symbol-kicker {
            padding: 4px 6px;
          }

          .club-symbol-kicker strong {
            font-size: 6px;
          }

          .club-symbol-kicker small {
            font-size: 4px;
          }

          .club-symbol-stream {
            gap: 4px;
          }

          .club-symbol-pill {
            min-width: 108px;
            gap: 4px;
            padding: 2px 5px 2px 3px;
          }

          .club-symbol-fixture-logos {
            grid-template-columns: 20px auto 20px;
            gap: 2px;
          }

          .club-symbol-icon {
            width: 20px;
            height: 20px;
          }

          .club-symbol-fixture-logos b,
          .club-symbol-copy strong {
            font-size: 6px;
          }

          .club-symbol-copy small {
            font-size: 5px;
          }

          .club-symbol-kicker,
          .club-symbol-arrow,
          .club-symbol-match-centre,
          .arena-quick-toggle,
          .arena-quick-links button,
          .arena-quick-links a,
          .language-trigger {
            min-height: 44px;
          }

          .club-symbol-arrow { width: 44px; height: 44px; font-size: 20px; }
          .club-symbol-match-centre { gap: 5px; padding: 0 10px; font-size: 7px; }

          .arena-empty-roster-recovery {
            top: max(8px, env(safe-area-inset-top));
            right: max(74px, calc(env(safe-area-inset-right) + 68px));
            left: auto;
            width: min(390px, calc(100vw - 190px));
            max-height: calc(100dvh - 72px);
            overflow-y: auto;
            padding: 12px;
          }

          .arena-empty-roster-recovery h2 { font-size: 22px; }
          .arena-empty-roster-recovery p { font-size: 9px; }
          .arena-empty-roster-recovery > div { flex-wrap: nowrap; }
          .arena-empty-roster-recovery a { width: auto; min-height: 44px; }

          .touchline-game.is-market-standalone .team-builder-section-title a,
          .touchline-game.is-market-standalone .team-builder-club-grid button,
          .touchline-game.is-market-standalone .team-builder-club-hub,
          .touchline-game.is-market-standalone .team-builder-market-search,
          .touchline-game.is-market-standalone .team-builder-market-search > button,
          .touchline-game.is-market-standalone .team-builder-position-filters button,
          .touchline-game.is-market-standalone .team-builder-market-sort,
          .touchline-game.is-market-standalone .team-builder-player-select,
          .touchline-game.is-market-standalone .team-builder-quick-buy {
            min-height: 44px;
          }
        }

        /* Market Transfer — human walkthrough correction.
           The account summary stays available at the top, the club/player
           workspace has one readable hierarchy, and names are never reduced
           to fragments merely to keep a decorative three-column layout. */
        .touchline-game.is-market-standalone .arena-action-panel-market > .team-builder-bank {
          position: sticky;
          z-index: 30;
          top: 0;
          display: grid;
          margin-top: 8px;
          padding: 6px;
          border: 1px solid rgba(181,255,75,.22);
          border-radius: 16px;
          background: rgba(3,13,11,.96);
          box-shadow: 0 12px 28px rgba(0,0,0,.32), inset 0 1px rgba(255,255,255,.04);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .touchline-game.is-market-standalone .team-builder-board {
          scroll-margin-top: 94px;
        }

        .touchline-game.is-market-standalone .team-builder-section-title > div {
          min-width: 0;
        }

        @media (min-width: 1181px) {
          .touchline-game.is-market-standalone .team-builder-board {
            grid-template-areas: "clubs roster preview";
            grid-template-columns: minmax(360px, 36%) minmax(0, 64%);
            gap: 14px;
          }

          .touchline-game.is-market-standalone .team-builder-player-list {
            grid-template-columns: minmax(0, 1fr);
            grid-auto-rows: minmax(104px, auto);
          }

          .touchline-game.is-market-standalone .team-builder-player-list > article {
            min-height: 104px;
          }

          .touchline-game.is-market-standalone .team-builder-player-select {
            grid-template-columns: 42px minmax(180px, 1fr) minmax(128px, auto);
            min-height: 64px;
            padding: 10px 12px;
          }

          .touchline-game.is-market-standalone .team-builder-player-copy strong {
            display: block;
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
            font-size: 16px;
            line-height: 1.12;
          }

          .touchline-game.is-market-standalone .team-builder-listing-meta {
            min-width: 128px;
            text-align: right;
          }

          .touchline-game.is-market-standalone .team-builder-listing-meta > * {
            max-width: none;
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
          }

          .touchline-game.is-market-standalone .team-builder-player-list > article > .team-builder-quick-buy {
            min-height: 40px;
            padding-inline: 12px;
          }

          .touchline-game.is-market-standalone .team-builder-preview-card {
            width: min(210px, 76%);
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .touchline-game.is-market-standalone .team-builder-board {
            grid-template-areas:
              "clubs"
              "roster";
            grid-template-columns: minmax(0, 1fr);
          }

          .touchline-game.is-market-standalone .team-builder-club-grid {
            display: grid;
            grid-auto-flow: column;
            grid-auto-columns: minmax(150px, 1fr);
            grid-template-columns: none;
            max-height: none;
            overflow-x: auto;
            overflow-y: hidden;
            padding-bottom: 7px;
          }

          .touchline-game.is-market-standalone .team-builder-player-list {
            grid-template-columns: minmax(0, 1fr);
          }

          .touchline-game.is-market-standalone .team-builder-player-copy strong {
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
            font-size: 14px;
          }
        }

        @media (max-width: 760px) {
          .touchline-game.is-market-standalone .arena-action-panel-market {
            overflow: visible;
          }

          .touchline-game.is-market-standalone .arena-action-panel-market > .team-builder-bank {
            top: -1px;
            grid-auto-flow: row;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            margin-top: 6px;
            padding: 5px;
            overflow: hidden;
          }

          .touchline-game.is-market-standalone .arena-action-panel-market > .team-builder-bank > span {
            min-height: 62px;
            padding: 8px;
          }

          .touchline-game.is-market-standalone .arena-action-panel-market > .team-builder-bank > span:nth-child(2),
          .touchline-game.is-market-standalone .arena-action-panel-market > .team-builder-bank > span:nth-child(5) {
            display: none;
          }

          .touchline-game.is-market-standalone .team-builder-board {
            grid-template-areas:
              "clubs"
              "roster"
              "preview";
            scroll-margin-top: 86px;
          }

          .touchline-game.is-market-standalone .team-builder-player-copy strong {
            overflow: visible;
            text-overflow: clip;
            white-space: normal;
          }

          .touchline-game.is-market-standalone .team-builder-market-tools {
            grid-template-columns: minmax(0, 1fr);
          }

          .touchline-game.is-market-standalone .team-builder-position-filters,
          .touchline-game.is-market-standalone .team-builder-market-sort {
            grid-column: 1;
            width: 100%;
            min-width: 0;
          }

          .touchline-game.is-market-standalone .team-builder-position-filters button {
            flex: 0 0 auto;
            min-width: 92px;
            justify-items: center;
            text-align: center;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .team-builder-market-results-head i,
          .team-builder-preview-status i {
            animation: none;
          }

          .arena-video,
          .game-hud,
          .arena-live-dock,
          .club-symbol-carousel,
          .field-player-layer,
          .arena-coach-technical-area,
          .arena-entry-skip-toggle,
          .arena-live-screen-logo-outline,
          .arena-live-screen-logo-core,
          .arena-live-screen-content::after,
          .arena-live-screen-content em,
          .arena-live-score-sweep,
          .arena-live-score-live,
          .arena-live-moving-card {
            animation: none !important;
            transition-duration: 1ms !important;
          }
        }

        /* Gold accessibility pass: the compact Arena HUD and matchweek rail
           keep their visual density, but every genuine action retains a
           WCAG-sized touch target on phones, tablets and short landscape. */
        .arena-quick-toggle,
        .arena-quick-links button,
        .arena-quick-links a,
        .language-trigger,
        .club-symbol-kicker,
        .club-symbol-pill,
        .club-symbol-match-centre {
          min-height: 44px;
        }

        .club-symbol-kicker,
        .club-symbol-arrow {
          min-width: 44px;
        }

        .club-symbol-arrow {
          width: 44px;
          height: 44px;
        }

        .club-symbol-open {
          grid-template-columns: auto 44px minmax(0, 1fr) 44px auto;
        }

        @media (max-width: 900px) and (max-height: 520px) and (orientation: landscape) {
          .arena-quick-dock.is-collapsed {
            width: 52px;
            min-width: 52px;
          }

          .arena-quick-dock.is-collapsed .arena-quick-toggle {
            min-width: 44px;
            min-height: 44px;
          }

          /* This is deliberately last: earlier compact HUD rules used a
             second row for Match Centre, which obscured too much of the
             pitch on a short landscape phone. */
          .club-symbol-open {
            grid-template-columns: auto 44px minmax(0, 1fr) 44px 44px;
            padding-block: 4px;
          }

          .club-symbol-match-centre {
            grid-column: auto;
            justify-self: stretch;
            width: 44px;
            min-width: 44px;
            padding: 0;
          }

          .club-symbol-match-centre > span {
            position: absolute;
            width: 1px;
            height: 1px;
            margin: -1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
          }
        }

        @media (min-width: 901px) and (max-width: 1180px) and (orientation: landscape) {
          .club-symbol-open {
            grid-template-columns: auto 44px minmax(0, 1fr) 44px 44px;
            padding-block: 4px;
          }

          .club-symbol-match-centre {
            grid-column: auto;
            justify-self: stretch;
            width: 44px;
            min-width: 44px;
            padding: 0;
          }

          .club-symbol-match-centre > span {
            position: absolute;
            width: 1px;
            height: 1px;
            margin: -1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
          }
        }

        /* Market Transfer desktop composition — keep this at the end of the
           stylesheet. Earlier responsive Arena rules serve other panels and
           used to collapse the premium gallery back to one empty-looking row. */
        @media (min-width: 1181px) {
          /* Market is a document-length catalogue, not the fixed-height
             line-up editor used by the other Arena panels.  Keep every
             gallery item in normal flow; a later card must extend the page,
             never be hidden behind the roster's old editor boundary. */
          .touchline-game.is-market-standalone .arena-action-panel-market,
          .touchline-game.is-market-standalone .arena-action-panel-market .team-builder-shell,
          .touchline-game.is-market-standalone .team-builder-board,
          .touchline-game.is-market-standalone .team-builder-roster,
          .touchline-game.is-market-standalone .team-builder-player-list {
            height: auto !important;
            min-height: max-content !important;
            max-height: none !important;
            overflow: visible !important;
          }

          .touchline-game.is-market-standalone .team-builder-board {
            grid-template-areas: "clubs roster";
            grid-template-columns: minmax(360px, 36%) minmax(0, 64%);
            gap: 24px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid {
            gap: 12px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid button {
            min-height: 86px;
            grid-template-columns: 64px minmax(0, 1fr);
            gap: 14px;
            border-radius: 16px;
            padding: 11px 13px;
          }

          .touchline-game.is-market-standalone .team-builder-club-logo {
            width: 64px;
            height: 64px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid strong {
            font-size: 16px;
          }

          .touchline-game.is-market-standalone .team-builder-club-grid small {
            font-size: 11px;
          }

          .touchline-game.is-market-standalone .team-builder-player-list {
            /* Keep two or three complete cards in view.  A flexible 320px
               track avoids stretching two results into oversized tiles. */
            grid-template-columns: repeat(auto-fit, minmax(260px, 320px));
            justify-content: start;
            grid-auto-rows: auto;
            gap: 20px;
            padding: 8px;
            align-items: start;
          }

          .touchline-game.is-market-standalone .team-builder-player-list > article {
            /* Earlier Arena editor CSS made this a two-row fixed editor
               cell. A Market item is a complete product card, so let its
               artwork, caption and signing action define one natural row. */
            display: block !important;
            grid-template-rows: none;
            height: auto;
            min-height: 0;
            overflow: visible !important;
            align-self: start;
            border-radius: 20px;
          }

          /* The base Arena builder is a fixed-height editor.  Market is a
             scrolling catalogue, so it must never crop the lower half of an
             otherwise complete card. */
          .touchline-game.is-market-standalone .team-builder-board {
            height: auto;
          }

          .touchline-game.is-market-standalone .team-builder-roster {
            display: block;
            height: auto;
            overflow: visible;
          }

          .touchline-game.is-market-standalone .team-builder-player-select {
            padding: 18px 18px 12px;
          }

          .touchline-game.is-market-standalone .team-builder-gallery-card {
            /* 430px × .56 = 240.8px: the slot and rendered art therefore
               share the same aspect/height instead of leaving a clipped or
               seemingly blank lower band below the card. */
            width: min(100%, 241px);
            min-height: 0;
            aspect-ratio: 430 / 691;
            /* 30% smaller than the former .8 desktop treatment. */
            --touchline-card-static-scale: .56;
          }

          .touchline-game.is-market-standalone .team-builder-gallery-card > .touchline-card-surface {
            width: 100% !important;
            height: 100% !important;
            aspect-ratio: 430 / 691;
          }

          .touchline-game.is-market-standalone .team-builder-gallery-caption strong {
            font-size: 17px;
          }

          .touchline-game.is-market-standalone .team-builder-gallery-caption small {
            font-size: 12px;
          }

          .touchline-game.is-market-standalone .team-builder-card-sign {
            min-height: 48px;
            margin: 0 18px 18px;
            width: calc(100% - 36px);
            border-radius: 14px;
            font-size: 13px;
          }
        }

        /* The Market gallery owns a fixed-ratio card canvas.  Keep that
           canvas in normal document flow: earlier Arena editor rules used
           short grid rows and visible overflow, which let the 430×691 art
           paint over the next catalogue item. */
        .touchline-game.is-market-standalone .team-builder-player-list {
          grid-auto-rows: max-content !important;
          align-items: start;
        }

        .touchline-game.is-market-standalone .team-builder-player-list > article,
        .touchline-game.is-market-standalone .team-builder-player-list > article.is-market-pending,
        .touchline-game.is-market-standalone .team-builder-player-list > article.is-position-locked {
          display: flex !important;
          min-width: 0;
          min-height: 0 !important;
          height: auto !important;
          flex-direction: column;
          isolation: isolate;
          /* hidden is used rather than clip for the older WebKit builds
             we still support in the Market audience. */
          overflow: hidden !important;
        }

        .touchline-game.is-market-standalone .team-builder-player-select {
          display: flex;
          min-width: 0;
          flex: 0 0 auto;
          flex-direction: column;
          align-items: stretch;
        }

        .touchline-game.is-market-standalone .team-builder-gallery-card {
          display: block;
          flex: 0 0 auto;
          align-self: center;
          max-width: 100%;
          overflow: hidden;
        }

        /* A Market card zoom belongs to the visual viewport, not to the
           document-length catalogue.  This keeps both the product and its
           close control reachable on a 390px phone. */
        .touchline-game.is-market-standalone .team-builder-card-spotlight {
          position: fixed;
          inset: 0;
          min-height: 100dvh;
          overflow: hidden;
        }

        /* backdrop-filter establishes a containing block for fixed descendants
           in WebKit. Suspend only the Market panel blur while its card zoom is
           open so the spotlight is anchored to the visual viewport. */
        .touchline-game.is-market-standalone .arena-action-panel-market.has-market-spotlight {
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }

        @media (min-width: 1181px) {
          .touchline-game.is-market-standalone .team-builder-gallery-card {
            width: 241px;
            height: 387px;
          }
        }

        @media (min-width: 761px) and (max-width: 1180px) {
          .touchline-game.is-market-standalone .team-builder-gallery-card {
            width: 215px;
            height: 345px;
          }
        }

        @media (max-width: 760px) {
          .touchline-game.is-market-standalone .team-builder-player-list {
            grid-template-columns: minmax(0, 1fr);
          }

          .touchline-game.is-market-standalone .team-builder-gallery-card {
            width: 170px;
            height: 273px;
          }

          .touchline-game.is-market-standalone .team-builder-card-spotlight .arena-player-spotlight-close {
            position: fixed;
            top: max(12px, env(safe-area-inset-top));
            right: max(12px, env(safe-area-inset-right));
          }
        }
      `}</style>
    </main>
  );
}
