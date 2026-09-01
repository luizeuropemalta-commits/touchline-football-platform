"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Heart, Share2, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  touchlineArenaClubTemplateForTierPreview,
  touchlineCardTierPalette,
  touchlineArenaTierForKey,
  type TouchlineCardTierKey,
} from "@/lib/touchlineArena/card-rules";
import { normalizeTouchlineCountryCode3, touchlineCountryFlagUrl } from "@/lib/touchlineArena/country-flags";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { touchlinePlayerProfileHref } from "@/lib/touchlineArena/player-links";
import { touchlineShirtNumberPaletteForClub } from "@/lib/touchlineArena/shirt-number-colors";
import { TouchlineClubCrestPerimeterTrace } from "@/components/touchline/cards/TouchlineClubCrestPerimeterTrace";
import { TouchlineCardPerimeterTrace } from "@/components/touchline/cards/TouchlineCardPerimeterTrace";
import { TouchlineShirtNumber } from "@/components/touchline/cards/TouchlineShirtNumber";
import {
  formatTouchlineMarketValueEur,
  formatTouchlinePublicShirtNumber,
  type TouchlinePublicEditorialCardPresentation,
} from "@/lib/touchlineArena/editorial-card-profile";
import masterCardLayout from "@/public/touchlineArena/card-layouts/master-shirt-back-layout.json";
import type { TouchlineCardReviewPresentation } from "@/lib/touchlineArena/card-review-state";
import {
  touchlineCardStatAppliesToPosition,
  type TouchlineCardStatId,
} from "@/lib/touchlineArena/position-aware-card-stats";

const CARD_W = 430;
const CARD_H = 691;
const CARD_ASPECT_RATIO = `${CARD_W} / ${CARD_H}`;
const DEFAULT_CLUB_TEMPLATE_URL = "/touchlineArena/cards/templates/clubs/Manchester%20City/market-tiers/diamond-gold.png";
const CARD_TEMPLATE_ASSET_VERSION = "2026-07-21-1";
const TOUCHLINE_NEUTRAL_CARD_ACCENT = "#94a3b8";
const LIVE_COMPACT_CLUB_TEMPLATE_ROOT = "/touchlineArena/cards/templates/live-compact/clubs/";
const ZOOM_CLUB_TEMPLATE_ROOT = "/touchlineArena/cards/templates/zoom/clubs/";
const MASTER_CARD_LAYOUT_SAVE_URL = "/api/touchline-arena/card-layout-master";
const CLUB_CREST_VISUAL_SCALE = 0.8;
const SHIRT_NAME_BASE_PADDING = 24;
const SHIRT_NAME_CREST_GAP = 8;
// The shirt name is a primary identifier, including on the small cards used in
// the pitch and ClubHub. Keep its readable size in one place rather than
// allowing individual views to make the name smaller.
const SHIRT_NAME_READABILITY_MULTIPLIER = 1.2;
const MIN_SHIRT_NAME_HORIZONTAL_SCALE = 0.78;

export function touchlineLiveCompactFrameUrl(sourceUrl: string) {
  const unversionedUrl = sourceUrl.split("?")[0];
  const clubTemplateRoot = "/touchlineArena/cards/templates/clubs/";
  if (!unversionedUrl.startsWith(clubTemplateRoot)) return unversionedUrl;
  return `${LIVE_COMPACT_CLUB_TEMPLATE_ROOT}${unversionedUrl.slice(clubTemplateRoot.length).replace(/\.png$/i, ".webp")}?v=${CARD_TEMPLATE_ASSET_VERSION}`;
}

export function touchlineZoomFrameUrl(sourceUrl: string) {
  const unversionedUrl = sourceUrl.split("?")[0];
  const clubTemplateRoot = "/touchlineArena/cards/templates/clubs/";
  if (!unversionedUrl.startsWith(clubTemplateRoot)) return unversionedUrl;
  return `${ZOOM_CLUB_TEMPLATE_ROOT}${unversionedUrl.slice(clubTemplateRoot.length).replace(/\.png$/i, ".webp")}?v=${CARD_TEMPLATE_ASSET_VERSION}`;
}

function touchlineRuntimeCrestUrl(sourceUrl: string) {
  if (!sourceUrl.includes("/touchlineArena/shared/club-logos/2026-27/ui-512/")) return sourceUrl;
  return `${sourceUrl
    .replace("/touchlineArena/shared/club-logos/2026-27/ui-512/", "/touchlineArena/shared/club-logos/2026-27/live-160/")
    .replace(/\.png$/i, ".webp")}?v=${CARD_TEMPLATE_ASSET_VERSION}`;
}

type EditableBlock =
  | "backName"
  | "backNumber"
  | "shirtClub"
  | "clubCrest"
  | "flag"
  | "points"
  | "marketValue"
  | "cardPrice"
  | "name"
  | "touchlineLogo"
  | "touchlinePremier"
  | "profileAction"
  | "shareAction"
  | "followAction"
  | "likeAction"
  | "statGol"
  | "statAst"
  | "statDef"
  | "statCs"
  | "statCar";

type CardFieldLayout = { x: number; y: number; scale: number };
type CardLayout = Record<EditableBlock, CardFieldLayout>;
type RemovalMarker = { x: number; y: number };
type DragState = { key: EditableBlock; startX: number; startY: number; originX: number; originY: number };
/**
 * Compact-card icon contract: GOL=goals, AST=assists, DEF=the canonical
 * five-fact defensive score, CS=clean sheets, and the paired card
 * icon=yellow/red cards. Additional allowlisted facts serve overlay/profile
 * detail without assigning a false meaning to an existing icon.
 */
type MatchStatId = TouchlineCardStatId;
type MasterLockState = "checking" | "unlocked" | "locked" | "readonly" | "error";

const DEFAULT_CARD_LAYOUT = masterCardLayout.layout as CardLayout;

const FIELD_SIZE: Record<EditableBlock, { width: number; height: number }> = {
  backName: { width: 214, height: 34 },
  backNumber: { width: 144, height: 105 },
  // The previous 28px mask clipped short names such as "GABRIEL" vertically.
  // This taller field keeps the exact same centre line while giving the 20%
  // readability increase room to render without touching the shirt number.
  shirtClub: { width: 246, height: 42 },
  clubCrest: { width: 42, height: 42 },
  flag: { width: 74, height: 60 },
  points: { width: 82, height: 58 },
  marketValue: { width: 108, height: 58 },
  cardPrice: { width: 104, height: 58 },
  name: { width: 322, height: 50 },
  touchlineLogo: { width: 46, height: 46 },
  touchlinePremier: { width: 176, height: 20 },
  profileAction: { width: 118, height: 34 },
  shareAction: { width: 118, height: 34 },
  followAction: { width: 118, height: 34 },
  likeAction: { width: 118, height: 34 },
  statGol: { width: 54, height: 104 },
  statAst: { width: 54, height: 104 },
  statDef: { width: 54, height: 104 },
  statCs: { width: 54, height: 104 },
  statCar: { width: 54, height: 104 },
};

const FIELD_LABELS: Partial<Record<EditableBlock, string>> = {
  backNumber: "Shirt number",
  shirtClub: "Player name",
  clubCrest: "Club crest",
  flag: "Flag",
  marketValue: "Market value",
  cardPrice: "Card price",
  name: "Legacy club text",
  touchlineLogo: "Logo TL",
  touchlinePremier: "TouchLine England League Stats",
  profileAction: "Profile button",
  shareAction: "Share button",
  followAction: "Follow button",
  likeAction: "Like button",
  statGol: "GOL",
  statAst: "AST",
  statDef: "DEF",
  statCs: "CS",
  statCar: "CAR",
};

const FIELD_LABELS_PT_BR: Partial<Record<EditableBlock, string>> = {
  backNumber: "Número da camisa",
  shirtClub: "Nome do jogador",
  clubCrest: "Escudo do clube",
  flag: "Bandeira",
  marketValue: "Rating total",
  cardPrice: "Valor de mercado",
  name: "Texto antigo do clube",
  touchlineLogo: "Logo TL",
  touchlinePremier: "Estatísticas da TouchLine England League",
  profileAction: "Botão Perfil",
  shareAction: "Botão Compartilhar",
  followAction: "Botão Seguir",
  likeAction: "Botão Curtir",
  statGol: "GOL",
  statAst: "AST",
  statDef: "DEF",
  statCs: "SG",
  statCar: "CAR",
};

export type TouchlineEliteExactPlayer = {
  sportmonksPlayerId: string;
  /** Canonical TouchLine UUID used only for protected exact-record actions. */
  canonicalPlayerId?: string | null;
  overall: string | number;
  shirtNumber?: string | number | null;
  role: string;
  position: string;
  flagUrl?: string | null;
  countryCode3: string;
  name: string;
  clubName: string;
  clubLogoUrl?: string | null;
  leagueName: string;
  leagueLogoUrl?: string | null;
  marketValue: string | null;
  marketValueSource?: "provider" | "verified-cache" | "provisional-fallback" | "unavailable" | null;
  /** Explicit canonical public state; absent keeps the established legacy path. */
  marketValueState?: "verified" | "provisional" | "pending" | "unavailable" | "error" | null;
  classificationState?: "verified" | "provisional" | "pending" | "unavailable" | "error" | null;
  cardTier?: TouchlineCardTierKey | null;
  cardPriceVersion?: string | null;
  /** Legacy compatibility field. It is never public game-card authority. */
  cardPriceAuthority?: "active-contract";
  /** Explicit public-safe editorial tier/price; no valuation is carried here. */
  editorialCard?: TouchlinePublicEditorialCardPresentation | null;
  /** A real player may render an intentional neutral card while editorial data is incomplete. */
  cardReview?: TouchlineCardReviewPresentation;
  updatedAt: string;
  age: string | number;
  height: string;
  foot: string;
  contract: string;
  nationality: string;
  stadiumName?: string | null;
  avatarImageUrl?: string | null;
  avatarStatus?: string | null;
  sourcePhotoUrl?: string | null;
  frameUrl?: string | null;
  cardTemplateUrl?: string | null;
  avatarImageScale?: number;
  avatarObjectPosition?: string;
  /** Legacy audit-only converted score. It is never rendered on a player card. */
  fantasyPoints?: string | number | null;
  /** Audited sum of valid Sportmonks match ratings across appearances. */
  totalRating?: string | number | null;
  /** Latest Sportmonks rating for the selected/current fixture. */
  matchRating?: string | number | null;
  /** Legacy audit-only converted score. It is never rendered on a player card. */
  matchFantasyPoints?: string | number | null;
  /** Cumulative TouchLine England league statistics, kept separate from points. */
  seasonStats?: Partial<Record<MatchStatId, string | number | null>>;
  /** @deprecated Use seasonStats. Kept temporarily for legacy Arena payloads. */
  matchStats?: Partial<Record<MatchStatId, string | number | null>>;
  /** Legacy audit-only converted-score explanation. It is never rendered. */
  matchPointContributions?: readonly Readonly<{
    role: "primary" | "assist" | "fact";
    ruleCode?: string;
    eventType: string;
    minute: number | null;
    quantity?: number;
    unitPoints?: number;
    points: number;
    factValue?: number;
    detail?: string;
  }>[];
  formationPlayerId?: string;
};

export type TouchlineEliteExactCardPlayer = TouchlineEliteExactPlayer;

export type TouchlineEliteExactCardLabels = {
  nationality: string;
  totalRating: string;
  /** Legacy caller compatibility; ignored by the active player card. */
  points?: string;
  /** Legacy caller compatibility; ignored by the active player card. */
  totalPoints?: string;
  /** @deprecated Caller compatibility; the visual card now shows market value. */
  cardPrice?: string;
  marketValue?: string;
  currentClub?: string;
  yellowRedCards: string;
  yellowCard: string;
  redCard: string;
  yellowCards: string;
  redCards: string;
  profileAction: string;
  shareAction: string;
};

const DEFAULT_CARD_LABELS: TouchlineEliteExactCardLabels = {
  nationality: "Nat",
  totalRating: "Total rating",
  marketValue: "Market value",
  currentClub: "Current Club",
  yellowRedCards: "Yellow and red cards",
  yellowCard: "Yellow card",
  redCard: "Red card",
  yellowCards: "Yellow cards",
  redCards: "Red cards",
  profileAction: "Profile",
  shareAction: "Share",
};

function localizedCardLabels(locale: string | null): TouchlineEliteExactCardLabels {
  if (locale === "pt-BR") {
    return {
      nationality: "País",
      totalRating: "Nota total",
      marketValue: "Valor de mercado",
      currentClub: "Clube atual",
      yellowRedCards: "Cartões amarelo e vermelho",
      yellowCard: "Cartão amarelo",
      redCard: "Cartão vermelho",
      yellowCards: "Cartões amarelos",
      redCards: "Cartões vermelhos",
      profileAction: "Perfil",
      shareAction: "Compartilhar",
    };
  }

  return DEFAULT_CARD_LABELS;
}

function localeFromPlayerProfileHref(href?: string) {
  const queryStart = href?.indexOf("?") ?? -1;
  if (queryStart < 0) return null;
  return new URLSearchParams(href?.slice(queryStart + 1)).get("lang");
}

type Props = {
  player: TouchlineEliteExactPlayer;
  className?: string;
  isLoading?: boolean;
  showAvatarGuide?: boolean;
  avatarImageFit?: "contain" | "cover";
  isEditable?: boolean;
  layoutStorageKey?: string;
  persistLayoutToMaster?: boolean;
  ignoreStoredLayout?: boolean;
  startUnlocked?: boolean;
  isRemovalMarkerEnabled?: boolean;
  markerStorageKey?: string;
  labels?: Partial<TouchlineEliteExactCardLabels>;
  imageLoading?: "eager" | "lazy";
  /**
   * A known compact width can be rendered atomically on the server, avoiding
   * a transparent card while the client ResizeObserver initializes.
   */
  initialRenderScale?: number;
  /** CSS-owned public compact scale; it avoids a blank first paint. */
  staticRenderScale?: number;
  /**
   * Static social capture cannot depend on hydration to fit a long canonical
   * name inside the shirt mask. This opt-in seeds the same conservative fit
   * before the client-side canvas measurement refines it.
   */
  ensureStaticNameFit?: boolean;
  optimizeForLiveCompact?: boolean;
  runtimeLocaleOverride?: string | null;
  subscribeToRanking?: boolean;
  enableInteractiveNeon?: boolean;
  showCardActions?: boolean;
  showProfileAction?: boolean;
  /** Shows only the current Sportmonks rating above an Arena card. */
  showMatchRating?: boolean;
  /** Legacy caller compatibility; renders only the Sportmonks rating. */
  showMatchPoints?: boolean;
  rankingMode?: "live" | "preview";
  playerProfileHref?: string;
  onShare?: () => void;
  showSocialMetrics?: boolean;
  forceNeonActive?: boolean;
  /**
   * Market inventory has already authenticated this physical card and its
   * tier.  It may show the artwork as a selection preview before the separate
   * public editorial profile exists.  This never supplies a price, a CTA, or
   * a published state, and must not be used by roster/public card surfaces.
   */
  allowVisualInventoryPreview?: boolean;
  followerCount?: number;
  likeCount?: number;
};

function compactSocialCount(value: number, locale: string | null) {
  return new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

function demoSocialCount(seed: string, minimum: number, range: number) {
  const hash = [...seed].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 17);
  return minimum + (hash % range);
}

function abs(left: number, top: number, width: number, height: number, zIndex = 1): React.CSSProperties {
  return { position: "absolute", left, top, width, height, zIndex };
}

function normalizeLayout(input?: Partial<Record<EditableBlock, Partial<CardFieldLayout>>> | null): CardLayout {
  const next = { ...DEFAULT_CARD_LAYOUT } as CardLayout;

  for (const key of Object.keys(DEFAULT_CARD_LAYOUT) as EditableBlock[]) {
    const stored = input?.[key];
    const fallback = DEFAULT_CARD_LAYOUT[key];
    const maxScale = key === "clubCrest" ? 4 : 1.85;
    next[key] = {
      x: Number.isFinite(stored?.x) ? Number(stored?.x) : fallback.x,
      y: Number.isFinite(stored?.y) ? Number(stored?.y) : fallback.y,
      scale: Math.max(0.55, Math.min(maxScale, Number.isFinite(stored?.scale) ? Number(stored?.scale) : fallback.scale)),
    };
  }

  return withAlignedStatRuler(next);
}

function layoutsEqual(a: CardLayout, b: CardLayout) {
  return (Object.keys(DEFAULT_CARD_LAYOUT) as EditableBlock[]).every((key) => {
    const first = a[key];
    const second = b[key];
    return first.x === second.x && first.y === second.y && first.scale === second.scale;
  });
}

function isBundledDefaultLayout(layout: CardLayout) {
  return layoutsEqual(layout, normalizeLayout());
}

function repairLegacyLayout(layout: CardLayout) {
  let next = layout;

  if (next.touchlineLogo.y > 430 || next.touchlinePremier.y < 412 || next.touchlinePremier.y > 430 || next.touchlinePremier.scale < 0.95) {
    next = {
      ...next,
      touchlineLogo: DEFAULT_CARD_LAYOUT.touchlineLogo,
      touchlinePremier: DEFAULT_CARD_LAYOUT.touchlinePremier,
    };
  }

  if (next.backName.y >= 315 && next.shirtClub.y >= 300) {
    next = {
      ...next,
      shirtClub: DEFAULT_CARD_LAYOUT.shirtClub,
    };
  }

  return next;
}

function isLegacyNameAboveNumberLayout(layout: CardLayout) {
  return layout.backName.y < 260 && layout.shirtClub.y > 300;
}

function isSavedLowerNameLayout(layout: CardLayout) {
  return layout.backName.y >= 315 && layout.backName.y <= 390 && layout.backNumber.y >= 200 && layout.backNumber.y <= 270;
}

function fitShirtBackNameSize(text: string) {
  const clean = text.trim();
  if (clean.length > 28) return 11;
  if (clean.length > 22) return 14;
  if (clean.length > 18) return 17;
  if (clean.length > 15) return 19;
  if (clean.length > 12) return 21;
  if (clean.length > 9 || clean.includes(" ")) return 23;
  return 31;
}

function initialStaticShirtNameFit(text: string) {
  const clean = text.trim();
  return {
    size: fitShirtBackNameSize(clean) * SHIRT_NAME_READABILITY_MULTIPLIER,
    // Long names use the same minimum horizontal scale already enforced by
    // the measured client fit. Short names preserve the canonical geometry.
    horizontalScale: clean.length > 9 ? MIN_SHIRT_NAME_HORIZONTAL_SCALE : 1,
  };
}

function shirtNameSafePadding(layout: CardLayout, hasClubCrest: boolean) {
  const base = { left: SHIRT_NAME_BASE_PADDING, right: SHIRT_NAME_BASE_PADDING };
  if (!hasClubCrest) return base;

  const shirt = layout.shirtClub || DEFAULT_CARD_LAYOUT.shirtClub;
  const crest = layout.clubCrest || DEFAULT_CARD_LAYOUT.clubCrest;
  const shirtWidth = FIELD_SIZE.shirtClub.width * shirt.scale;
  const shirtHeight = FIELD_SIZE.shirtClub.height * shirt.scale;
  const crestOuterWidth = FIELD_SIZE.clubCrest.width * crest.scale;
  const crestOuterHeight = FIELD_SIZE.clubCrest.height * crest.scale;
  const crestWidth = crestOuterWidth * CLUB_CREST_VISUAL_SCALE;
  const crestHeight = crestOuterHeight * CLUB_CREST_VISUAL_SCALE;
  const crestLeft = crest.x + ((crestOuterWidth - crestWidth) / 2);
  const crestTop = crest.y + ((crestOuterHeight - crestHeight) / 2);
  const crestRight = crestLeft + crestWidth;
  const crestBottom = crestTop + crestHeight;
  const shirtRight = shirt.x + shirtWidth;
  const shirtBottom = shirt.y + shirtHeight;
  const overlapsVertically = crestTop < shirtBottom && crestBottom > shirt.y;
  const overlapsHorizontally = crestLeft < shirtRight && crestRight > shirt.x;

  if (!overlapsVertically || !overlapsHorizontally) return base;

  const maximumSafePadding = Math.max(SHIRT_NAME_BASE_PADDING, shirtWidth - 56);
  const crestCentre = crestLeft + (crestWidth / 2);
  const shirtCentre = shirt.x + (shirtWidth / 2);

  if (crestCentre >= shirtCentre) {
    const symmetricPadding = Math.min(
      maximumSafePadding,
      Math.max(base.right, shirtRight - crestLeft + SHIRT_NAME_CREST_GAP),
    );
    return { left: symmetricPadding, right: symmetricPadding };
  }

  const symmetricPadding = Math.min(
    maximumSafePadding,
    Math.max(base.left, crestRight - shirt.x + SHIRT_NAME_CREST_GAP),
  );
  return { left: symmetricPadding, right: symmetricPadding };
}

function valueDisplaySize(value: string) {
  const length = value.trim().length;
  if (length >= 7) return 17;
  if (length >= 5) return 20;
  return 22;
}

function isLegacyTemplateUrl(value?: string | null) {
  const url = String(value || "");
  return (
    url.includes("/touchlineArena/cards/templates/player-card-") ||
    url.includes("/touchlineArena/cards/market-frames/") ||
    url.includes("/touchlineArena/cards/templates/manchester-city-shirt-back-card.png")
  );
}

function cleanCardTemplateUrl(value?: string | null) {
  const url = String(value || "").trim();
  if (!url || isLegacyTemplateUrl(url)) return null;
  return url;
}

function countryFlagFallback(countryCode3: string) {
  const code = normalizeTouchlineCountryCode3(countryCode3);
  const flagUrl = touchlineCountryFlagUrl(code);
  if (flagUrl) return <img src={flagUrl} alt={code} draggable={false} style={{ width: 52, height: 34, objectFit: "cover", borderRadius: 4, boxShadow: "0 0 10px rgba(255,255,255,.22), 0 3px 12px rgba(0,0,0,.55)" }} />;
  if (code === "ENG") {
    return (
      <div role="img" aria-label={code} style={{ position: "relative", width: 52, height: 34, overflow: "hidden", borderRadius: 4, background: "#fff", boxShadow: "0 0 10px rgba(255,255,255,.22), 0 3px 12px rgba(0,0,0,.55)" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 14, height: 6, background: "#cf142b" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 23, width: 6, background: "#cf142b" }} />
      </div>
    );
  }

  return (
    <div role="img" aria-label={code} style={{ width: 52, height: 34, borderRadius: 4, border: "1px solid rgba(255,255,255,.24)", background: "linear-gradient(135deg, rgba(255,255,255,.20), rgba(255,255,255,.04))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 950 }}>
      {code}
    </div>
  );
}

function backName(playerName: string) {
  return playerName.trim().replace(/\s+/g, " ");
}

const LOOSE_STAT_FIELDS: Array<{ key: EditableBlock; label: string; statId: MatchStatId; src: string }> = [
  { key: "statGol", label: "GOL", statId: "goals", src: "ball" },
  { key: "statAst", label: "AST", statId: "assists", src: "boot" },
  { key: "statDef", label: "DEF", statId: "defense", src: "defense" },
  { key: "statCs", label: "CS", statId: "cleanSheets", src: "clean-sheet" },
];

function FootballBallStatIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width={size} height={size} fill="none">
      <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 10.2 4.7 3.4-1.8 5.5h-5.8l-1.8-5.5 4.7-3.4Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
      <path d="m16 3.5v6.7M27.9 12l-7.2 1.6M23.4 25.9l-4.5-6.8M8.6 25.9l4.5-6.8M4.1 12l7.2 1.6M10.6 5l-4.1 5.4M21.4 5l4.1 5.4M7.1 22.8l-2.3-6.3M24.9 22.8l2.3-6.3M12.3 27.7h7.4" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  );
}

function FootballBootStatIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width={size} height={size} fill="none">
      <path d="M7.1 7.2v7.2c0 2.1-1.2 3.8-3.2 5.4l2.6 5h17.9c2.4 0 3.9-1.2 3.9-3.2 0-1.7-1-2.7-3-3l-6.5-1.2c-3.5-.7-5.7-3.5-6.8-8.6L7.1 7.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m11.8 10.2 4.3-1.4M12.7 13.2l4.5-1.5M14.2 16l4.2-1.4M8.1 24.8v2M13.4 24.8v2M22.7 24.8v2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

function CleanSheetStatIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width={size} height={size} fill="none">
      <path d="M5 25V7h22v18M5 25h22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 24V11h14v13M9 15h14M9 19h14M13.7 11v13M18.3 11v13" stroke="currentColor" strokeWidth="1.05" opacity=".72" />
      <path d="m12.1 18.2 2.5 2.5 5.6-6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PremiumStatIcon({ icon, label, size }: { icon: string; label: string; size: number }) {
  const common = {
    width: size,
    height: size,
    color: "rgba(241,248,255,.96)",
    filter: "drop-shadow(0 3px 7px rgba(0,0,0,.72)) drop-shadow(0 0 4px rgba(186,230,253,.22))",
  } satisfies React.CSSProperties;

  return (
    <span role="img" aria-label={label} style={{ ...common, display: "grid", placeItems: "center" }}>
      {icon === "ball" ? <FootballBallStatIcon size={size} /> : null}
      {icon === "boot" ? <FootballBootStatIcon size={size} /> : null}
      {icon === "defense" ? <ShieldCheck aria-hidden="true" width={size} height={size} strokeWidth={1.8} /> : null}
      {icon === "clean-sheet" ? <CleanSheetStatIcon size={size} /> : null}
    </span>
  );
}

type LooseStatKey = "statGol" | "statAst" | "statDef" | "statCs" | "statCar";
const LOOSE_STAT_KEYS: LooseStatKey[] = ["statGol", "statAst", "statDef", "statCs", "statCar"];
const CANONICAL_STAT_RULER: Record<LooseStatKey, CardFieldLayout> = {
  statGol: { x: 32, y: 403, scale: 1.6 },
  statAst: { x: 102, y: 403, scale: 1.6 },
  statDef: { x: 172, y: 403, scale: 1.6 },
  statCs: { x: 242, y: 403, scale: 1.6 },
  statCar: { x: 312, y: 403, scale: 1.6 },
};

function withAlignedStatRuler(layout: CardLayout) {
  return LOOSE_STAT_KEYS.reduce(
    (next, key) => ({
      ...next,
      [key]: CANONICAL_STAT_RULER[key],
    }),
    layout,
  );
}

function readStoredLayout(layoutStorageKey?: string) {
  if (!layoutStorageKey || typeof window === "undefined") return normalizeLayout();
  try {
    const stored = window.localStorage.getItem(layoutStorageKey);
    const backup = window.localStorage.getItem(`${layoutStorageKey}:backup`);
    const storedLayout = stored ? repairLegacyLayout(normalizeLayout(JSON.parse(stored))) : null;
    const backupLayout = backup ? repairLegacyLayout(normalizeLayout(JSON.parse(backup))) : null;

    if (storedLayout && backupLayout && isLegacyNameAboveNumberLayout(storedLayout) && isSavedLowerNameLayout(backupLayout)) {
      return backupLayout;
    }

    if (storedLayout && isLegacyNameAboveNumberLayout(storedLayout)) {
      return normalizeLayout();
    }

    if (storedLayout && backupLayout && isBundledDefaultLayout(storedLayout) && !isBundledDefaultLayout(backupLayout)) {
      return backupLayout;
    }

    return storedLayout || backupLayout || normalizeLayout();
  } catch {
    return normalizeLayout();
  }
}

function readStoredMarkers(markerStorageKey?: string) {
  if (!markerStorageKey || typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(markerStorageKey);
    return stored ? (JSON.parse(stored) as RemovalMarker[]) : [];
  } catch {
    return [];
  }
}

function readStoredLock(layoutStorageKey?: string) {
  return Boolean(layoutStorageKey && typeof window !== "undefined" && window.localStorage.getItem(`${layoutStorageKey}:locked`) === "1");
}

function isEditableBlock(value?: string): value is EditableBlock {
  return Boolean(value && value in DEFAULT_CARD_LAYOUT);
}

export function touchlineCardMetricText(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  const text = String(value ?? "").trim();
  return text || "—";
}

function statCount(
  player: TouchlineEliteExactPlayer,
  statId: MatchStatId,
  legacyStatId?: MatchStatId,
  missingValue = "—",
) {
  if (!touchlineCardStatAppliesToPosition(statId, player.position || player.role)) return missingValue;
  const value =
    player.seasonStats?.[statId]
    ?? (legacyStatId ? player.seasonStats?.[legacyStatId] : undefined)
    ?? player.matchStats?.[statId]
    ?? (legacyStatId ? player.matchStats?.[legacyStatId] : undefined);
  const text = touchlineCardMetricText(value);
  return text === "—" ? missingValue : text;
}

function marketTierGlow(tierKey: string) {
  if (tierKey === "diamond-gold" || tierKey === "clear-diamond") return "rgba(255,244,214,.62)";
  if (tierKey === "emerald-green") return "rgba(34,197,94,.66)";
  if (tierKey === "radiant-gold") return "rgba(250,204,21,.54)";
  if (tierKey === "amethyst-purple") return "rgba(168,85,247,.60)";
  if (tierKey === "sapphire-blue") return "rgba(56,189,248,.58)";
  return "rgba(248,113,113,.52)";
}

export function TouchlineEliteExactCard({
  player,
  className,
  isEditable = false,
  layoutStorageKey,
  persistLayoutToMaster = false,
  ignoreStoredLayout = false,
  startUnlocked = false,
  isRemovalMarkerEnabled = false,
  markerStorageKey,
  labels,
  imageLoading = "eager",
  initialRenderScale,
  staticRenderScale,
  ensureStaticNameFit = false,
  optimizeForLiveCompact = false,
  runtimeLocaleOverride = null,
  subscribeToRanking = true,
  enableInteractiveNeon = true,
  showCardActions = false,
  showProfileAction = true,
  showMatchRating = false,
  showMatchPoints = false,
  rankingMode = "live",
  playerProfileHref,
  onShare,
  showSocialMetrics = true,
  forceNeonActive = false,
  allowVisualInventoryPreview = false,
  followerCount,
  likeCount,
}: Props) {
  const effectiveShowMatchRating = showMatchRating || showMatchPoints;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const shirtNameMaskRef = useRef<HTMLDivElement | null>(null);
  const shouldUseStoredLayout = isEditable && !ignoreStoredLayout;
  const hasStaticRenderScale = typeof staticRenderScale === "number" && Number.isFinite(staticRenderScale);
  const [scale, setScale] = useState(() => {
    if (hasStaticRenderScale) return Math.max(0, Math.min(1, staticRenderScale));
    if (typeof initialRenderScale !== "number" || !Number.isFinite(initialRenderScale)) return 0;
    return Math.max(0, Math.min(1, initialRenderScale));
  });
  const [layout, setLayout] = useState<CardLayout>(() => normalizeLayout());
  const [removalMarkers, setRemovalMarkers] = useState<RemovalMarker[]>([]);
  const [isLayoutLocked, setIsLayoutLocked] = useState(false);
  const [masterLayoutStatus, setMasterLayoutStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [masterLockState, setMasterLockState] = useState<MasterLockState>(() => persistLayoutToMaster ? "checking" : "unlocked");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [runtimeLocaleFromUrl, setRuntimeLocaleFromUrl] = useState<string | null>(null);
  const runtimeLocale = runtimeLocaleOverride ?? localeFromPlayerProfileHref(playerProfileHref) ?? runtimeLocaleFromUrl;
  const [useWebKitCompactPaintScale, setUseWebKitCompactPaintScale] = useState(false);
  const initialShirtPlayerName = backName(player.name);
  const [shirtPlayerNameFit, setShirtPlayerNameFit] = useState(() => (
    ensureStaticNameFit
      ? initialStaticShirtNameFit(initialShirtPlayerName)
      : { size: 31 * SHIRT_NAME_READABILITY_MULTIPLIER, horizontalScale: 1 }
  ));
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isNeonActive, setIsNeonActive] = useState(false);
  const neonInstanceId = useId();
  const didSkipInitialLayoutWriteRef = useRef(false);
  const baseFollowerCount = followerCount ?? demoSocialCount(player.sportmonksPlayerId, 12_400, 975_000);
  const baseLikeCount = likeCount ?? demoSocialCount(`${player.sportmonksPlayerId}:card`, 840, 84_000);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate editor-only local state after SSR without changing the public card markup. */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldUseStoredLayout) {
      setLayout(readStoredLayout(layoutStorageKey));
      setIsLayoutLocked(startUnlocked ? false : readStoredLock(layoutStorageKey));
    }
    if (markerStorageKey) setRemovalMarkers(readStoredMarkers(markerStorageKey));
  }, [layoutStorageKey, markerStorageKey, shouldUseStoredLayout, startUnlocked]);

  useLayoutEffect(() => {
    if (runtimeLocaleOverride || typeof window === "undefined") return;
    setRuntimeLocaleFromUrl(new URLSearchParams(window.location.search).get("lang"));
  }, [runtimeLocaleOverride]);

  useLayoutEffect(() => {
    if (!optimizeForLiveCompact || typeof navigator === "undefined") return;
    const userAgent = navigator.userAgent;
    const isWebKitEngine =
      /\bAppleWebKit\//.test(userAgent)
      && !/\b(?:Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(userAgent);
    setUseWebKitCompactPaintScale(isWebKitEngine);
  }, [optimizeForLiveCompact]);

  useLayoutEffect(() => {
    if (!enableInteractiveNeon || isEditable || effectiveShowMatchRating || typeof window === "undefined") return;

    function clearWhenAnotherCardIsSelected(event: Event) {
      const selectedId = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (selectedId && selectedId !== neonInstanceId) setIsNeonActive(false);
    }

    function clearWhenPointerLeavesTheCard(event: PointerEvent) {
      const shell = shellRef.current;
      if (shell && event.target instanceof Node && !shell.contains(event.target)) setIsNeonActive(false);
    }

    window.addEventListener("touchline-card-neon-select", clearWhenAnotherCardIsSelected);
    document.addEventListener("pointerdown", clearWhenPointerLeavesTheCard);
    return () => {
      window.removeEventListener("touchline-card-neon-select", clearWhenAnotherCardIsSelected);
      document.removeEventListener("pointerdown", clearWhenPointerLeavesTheCard);
    };
  }, [effectiveShowMatchRating, enableInteractiveNeon, isEditable, neonInstanceId]);

  useLayoutEffect(() => {
    if (!persistLayoutToMaster || typeof window === "undefined") {
      setMasterLockState("unlocked");
      return;
    }

    const controller = new AbortController();
    setMasterLockState("checking");
    fetch(MASTER_CARD_LAYOUT_SAVE_URL, { method: "GET", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { ok?: boolean; locked?: boolean; writable?: boolean };
        if (!response.ok || !result.ok) throw new Error("Could not read master card lock.");
        if (result.locked) {
          setMasterLockState("locked");
          setIsLayoutLocked(true);
          return;
        }
        if (result.writable === false) {
          setMasterLockState("readonly");
          setIsLayoutLocked(true);
          return;
        }
        setMasterLockState("unlocked");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMasterLockState("error");
      });

    return () => controller.abort();
  }, [persistLayoutToMaster]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useLayoutEffect(() => {
    const element = shellRef.current;
    if (!element) return;

    const resize = () => {
      const width = element.getBoundingClientRect().width || CARD_W;
      setScale(Math.min(1, width / CARD_W));
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!shouldUseStoredLayout || !startUnlocked || !layoutStorageKey || typeof window === "undefined") return;
    if (persistLayoutToMaster && masterLockState !== "unlocked") return;
    window.localStorage.removeItem(`${layoutStorageKey}:locked`);
    queueMicrotask(() => setIsLayoutLocked(false));
  }, [layoutStorageKey, masterLockState, persistLayoutToMaster, shouldUseStoredLayout, startUnlocked]);

  useLayoutEffect(() => {
    if (!shouldUseStoredLayout) return;
    if (!layoutStorageKey || typeof window === "undefined") return;
    if (!didSkipInitialLayoutWriteRef.current) {
      didSkipInitialLayoutWriteRef.current = true;
      return;
    }

    const serializedLayout = JSON.stringify(layout);
    const currentLayout = window.localStorage.getItem(layoutStorageKey);
    if (currentLayout && currentLayout !== serializedLayout) {
      window.localStorage.setItem(`${layoutStorageKey}:backup`, currentLayout);
    }
    window.localStorage.setItem(layoutStorageKey, serializedLayout);
    window.dispatchEvent(new CustomEvent("touchline-card-layout-change", { detail: { key: layoutStorageKey, layout } }));
  }, [layout, layoutStorageKey, shouldUseStoredLayout]);

  useLayoutEffect(() => {
    if (!shouldUseStoredLayout) return;
    if (!layoutStorageKey || typeof window === "undefined") return;

    function syncLayout(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.key !== layoutStorageKey) return;
      const next = detail.layout ? normalizeLayout(detail.layout) : normalizeLayout();
      setLayout((current) => (layoutsEqual(current, next) ? current : next));
    }

    window.addEventListener("touchline-card-layout-change", syncLayout);
    return () => window.removeEventListener("touchline-card-layout-change", syncLayout);
  }, [layoutStorageKey, shouldUseStoredLayout]);

  useLayoutEffect(() => {
    if (!markerStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(markerStorageKey, JSON.stringify(removalMarkers));
  }, [removalMarkers, markerStorageKey]);

  const countryCode3 = normalizeTouchlineCountryCode3(player.countryCode3);
  const shirtNumber = formatTouchlinePublicShirtNumber(player.shirtNumber ?? player.overall) ?? "";
  const totalRatingText = player.totalRating === null || player.totalRating === undefined || player.totalRating === ""
    ? "—"
    : touchlineCardMetricText(player.totalRating);
  const cardLabels = { ...localizedCardLabels(runtimeLocale), ...labels };
  // A game card exists only after the server-owned publication policy has
  // attached a published presentation. The authenticated Market can opt into
  // a visual-only inventory preview below; it never turns that preview into a
  // public publication or commercial authority.
  const editorialCard = player.editorialCard ?? null;
  const reviewRequired = !editorialCard && player.cardReview?.state === "REVIEW_REQUIRED";
  const editorialTier = editorialCard
    ? touchlineArenaTierForKey(editorialCard.tierKey)
    : null;
  // An already-signed player is a narrow, frozen exception to public
  // publication. Its contract recorded the tier at signing time, so Arena can
  // keep rendering the owned card without consulting valuation data or treating
  // the player as a newly published commercial card.
  const contractedTier = !editorialTier && player.cardPriceAuthority === "active-contract"
    ? touchlineArenaTierForKey(player.cardTier)
    : null;
  const inventoryPreviewTier = !editorialTier && !contractedTier && allowVisualInventoryPreview
    ? touchlineArenaTierForKey(player.cardTier)
    : null;
  const marketTier = editorialTier ?? contractedTier ?? inventoryPreviewTier;
  // The selected artwork is only used by a published card. An asset cannot
  // turn an unpublished football player into a game card.
  const assignedVisualTemplateUrl = cleanCardTemplateUrl(player.cardTemplateUrl);
  const marketValueText = editorialCard?.marketValueEur !== undefined
    ? formatTouchlineMarketValueEur(editorialCard.marketValueEur, runtimeLocale ?? undefined)
    : player.marketValueState === "verified" && player.marketValue
      ? player.marketValue
      : null;
  const hasPublishedCardProfile = Boolean(editorialCard);
  const compactPrimaryLabel = cardLabels.totalRating;
  const compactPrimaryValue = totalRatingText;
  const compactSecondaryLabel = hasPublishedCardProfile || reviewRequired
    ? editorialCard?.marketValueState === "provisional"
      ? (runtimeLocale === "pt-BR" ? "Valor provisório" : "Provisional value")
      : (cardLabels.marketValue ?? (runtimeLocale === "pt-BR" ? "Valor de mercado" : "Market value"))
    : (runtimeLocale === "pt-BR" ? "POSIÇÃO" : "POSITION");
  const compactSecondaryValue = hasPublishedCardProfile
    ? marketValueText ?? (runtimeLocale === "pt-BR" ? "PENDENTE" : "PENDING")
    : reviewRequired
      ? (runtimeLocale === "pt-BR" ? "PENDENTE" : "PENDING")
      : player.position;
  const preseasonMissingValue = "—";
  const matchRatingText = player.matchRating === null || player.matchRating === undefined || player.matchRating === ""
    ? preseasonMissingValue
    : touchlineCardMetricText(player.matchRating);
  const totalRatingSize = valueDisplaySize(compactPrimaryValue);
  const marketValueSize = valueDisplaySize(compactSecondaryValue);
  const cardTemplateUrl = reviewRequired
    ? null
    : marketTier
    ? touchlineArenaClubTemplateForTierPreview(player.clubName, marketTier.key) || assignedVisualTemplateUrl
    : assignedVisualTemplateUrl;
  const versionedCardTemplateUrl = cardTemplateUrl
    ? `${cardTemplateUrl}${cardTemplateUrl.includes("?") ? "&" : "?"}v=${CARD_TEMPLATE_ASSET_VERSION}`
    : null;
  const tierGlow = marketTier ? marketTierGlow(marketTier.key) : "rgba(148,163,184,.52)";
  const cardPriceVersion = TOUCHLINE_CARD_PRICE_TABLE_VERSION;
  const localPlayerFlagUrl = player.flagUrl?.startsWith("/") ? player.flagUrl : null;
  const flagImageUrl = touchlineCountryFlagUrl(countryCode3) || localPlayerFlagUrl;
  const shirtPlayerName = initialShirtPlayerName;
  const shirtClubScale = layout.shirtClub?.scale || DEFAULT_CARD_LAYOUT.shirtClub.scale;
  const resolvedClub = useMemo(() => findTouchLineClub(player.clubName), [player.clubName]);
  const localPlayerClubLogoUrl = player.clubLogoUrl?.startsWith("/") ? player.clubLogoUrl : null;
  // An explicit local asset can be a view-specific derivative (for example,
  // the 160 px Live crest). The canonical 512 px crest remains the fallback.
  const resolvedClubLogoUrl = touchlineRuntimeCrestUrl(localPlayerClubLogoUrl || resolvedClub?.logoUrl || "");
  const cardTraceColor = marketTier
    ? touchlineCardTierPalette(marketTier.key).accent
    : TOUCHLINE_NEUTRAL_CARD_ACCENT;
  const shirtNamePadding = shirtNameSafePadding(layout, Boolean(resolvedClubLogoUrl));
  const numberPalette = touchlineShirtNumberPaletteForClub(player.clubName);
  const textPalette = {
    fill: numberPalette.fill,
    outline: numberPalette.outline,
  };
  useLayoutEffect(() => {
    const mask = shirtNameMaskRef.current;
    if (!mask || typeof document === "undefined") return;

    let active = true;
    const fitNameInsideShirt = () => {
      if (!active) return;
      const initialSize = fitShirtBackNameSize(shirtPlayerName) * shirtClubScale * SHIRT_NAME_READABILITY_MULTIPLIER;
      const availableWidth = Math.max(1, mask.clientWidth - shirtNamePadding.left - shirtNamePadding.right);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        setShirtPlayerNameFit({ size: initialSize, horizontalScale: 1 });
        return;
      }
      context.font = `950 ${initialSize}px "Bebas Neue", "Anton", Impact, Inter, sans-serif`;
      const measuredWidth = Math.max(1, context.measureText(shirtPlayerName.toUpperCase()).width);
      const availableScale = Math.min(1, (availableWidth * 0.97) / measuredWidth);
      // Preserve the promised vertical size whenever possible. Very long names
      // are condensed horizontally first; only then is their type reduced.
      const horizontalScale = Math.max(MIN_SHIRT_NAME_HORIZONTAL_SCALE, availableScale);
      const fittedSize = availableScale < MIN_SHIRT_NAME_HORIZONTAL_SCALE
        ? initialSize * (availableScale / MIN_SHIRT_NAME_HORIZONTAL_SCALE)
        : initialSize;
      setShirtPlayerNameFit({
        size: Number(Math.max(3.5, fittedSize).toFixed(2)),
        horizontalScale: Number(horizontalScale.toFixed(3)),
      });
    };

    fitNameInsideShirt();
    document.fonts?.ready.then(fitNameInsideShirt).catch(() => undefined);
    const observer = new ResizeObserver(fitNameInsideShirt);
    observer.observe(mask);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [shirtClubScale, shirtNamePadding.left, shirtNamePadding.right, shirtPlayerName]);
  const canEditLayout = isEditable
    && !isLayoutLocked
    && (!persistLayoutToMaster || masterLockState === "unlocked");
  const clubHubSlug = resolvedClub?.slug ?? null;
  const clubHubHref = clubHubSlug ? `/touchline-clubs/${clubHubSlug}` : null;
  const shirtNumberOutlineWidth = clubHubSlug === "manchester-city" && shirtNumber === "9" ? 2.1 : 1.45;
  const editorHeight = isEditable ? 302 : 0;
  const helperTop = CARD_H * scale + editorHeight + 8;
  const editableMarker: React.CSSProperties = canEditLayout ? { cursor: "move", touchAction: "none", userSelect: "none" } : {};
  const shouldShowCardActions = isEditable || showCardActions;

  function cardFrameImage() {
    if (!versionedCardTemplateUrl) {
      return (
        <div
          data-touchline-card-frame="neutral"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            border: "2px solid rgba(148,163,184,.72)",
            borderRadius: 22,
            background: "linear-gradient(152deg, rgba(71,85,105,.82), rgba(15,23,42,.98) 62%, rgba(30,41,59,.96))",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08), inset 0 0 42px rgba(0,0,0,.5)",
          }}
        />
      );
    }
    const liveCompactFrameUrl = touchlineLiveCompactFrameUrl(versionedCardTemplateUrl);
    const zoomFrameUrl = touchlineZoomFrameUrl(versionedCardTemplateUrl);
    const liveCompactFallbackUrl = touchlineLiveCompactFrameUrl(DEFAULT_CLUB_TEMPLATE_URL);
    const zoomFallbackUrl = touchlineZoomFrameUrl(DEFAULT_CLUB_TEMPLATE_URL);
    const handleFrameError = (image: HTMLImageElement, fallbackUrl: string) => {
      if (image.src.endsWith(fallbackUrl)) return;
      image.srcset = "";
      image.src = fallbackUrl;
    };
    const frameStyle = {
      position: "absolute",
      inset: 0,
      width: CARD_W,
      height: CARD_H,
      objectFit: "contain",
      objectPosition: "center",
      zIndex: 1,
      pointerEvents: "none",
      userSelect: "none",
    } as const;

    if (optimizeForLiveCompact) {
      return (
        <img
          data-touchline-card-frame="true"
          data-live-card-asset="frame"
          src={liveCompactFrameUrl}
          alt=""
          draggable={false}
          loading={imageLoading}
          decoding="sync"
          fetchPriority="high"
          onError={(event) => handleFrameError(event.currentTarget, liveCompactFallbackUrl)}
          style={frameStyle}
        />
      );
    }

    return (
      <img
        data-touchline-card-frame="true"
        data-live-card-asset="frame"
        data-card-delivery="zoom-optimized"
        src={zoomFrameUrl}
        alt=""
        draggable={false}
        loading={imageLoading}
        decoding="async"
        onError={(event) => handleFrameError(event.currentTarget, zoomFallbackUrl)}
        style={frameStyle}
      />
    );
  }

  function clubCrestImage() {
    const crestStyle = {
      width: `${CLUB_CREST_VISUAL_SCALE * 100}%`,
      height: `${CLUB_CREST_VISUAL_SCALE * 100}%`,
      objectFit: "contain",
      pointerEvents: "none",
      userSelect: "none",
    } as const;

    return (
      <span data-touchline-card-crest-trace-host="true">
        <TouchlineClubCrestPerimeterTrace />
        <img
          src={resolvedClubLogoUrl}
          alt={`${player.clubName} crest`}
          draggable={false}
          loading={imageLoading}
          data-club-crest-visual-scale={CLUB_CREST_VISUAL_SCALE}
          data-touchline-card-crest="true"
          data-live-card-asset="crest"
          style={crestStyle}
        />
      </span>
    );
  }

  function editableStyle(key: EditableBlock, zIndex: number): React.CSSProperties {
    const position = layout[key] || DEFAULT_CARD_LAYOUT[key];
    const size = FIELD_SIZE[key];
    const fieldScale = position.scale || 1;
    return { ...abs(position.x, position.y, size.width * fieldScale, size.height * fieldScale, zIndex), ...editableMarker };
  }

  function fieldScale(key: EditableBlock) {
    return layout[key]?.scale || DEFAULT_CARD_LAYOUT[key].scale;
  }

  function resolvedPlayerProfileHref() {
    if (playerProfileHref) return playerProfileHref;
    return touchlinePlayerProfileHref(
      player,
      runtimeLocale,
      rankingMode === "preview" && marketTier ? { previewTier: marketTier.key } : undefined,
    );
  }

  function resolvedClubHubHref() {
    if (!clubHubHref) return null;
    return runtimeLocale
      ? `${clubHubHref}?lang=${encodeURIComponent(runtimeLocale)}`
      : clubHubHref;
  }

  async function sharePlayerCard() {
    if (typeof window === "undefined") return;

    const relativeUrl = resolvedPlayerProfileHref();
    const absoluteUrl = new URL(relativeUrl, window.location.origin).toString();
    const shareData = {
      title: `${player.name} | TouchLine Arena`,
      text: `${player.name} - ${player.clubName}`,
      url: absoluteUrl,
    };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard?.writeText(absoluteUrl);
  }

  function updateFieldScale(key: EditableBlock, nextScale: number) {
    if (!canEditLayout) return;
    const maxScale = key === "clubCrest" ? 4 : 1.85;
    setLayout((current) => ({
      ...current,
      [key]: { ...(current[key] || DEFAULT_CARD_LAYOUT[key]), scale: Math.max(0.55, Math.min(maxScale, nextScale)) },
    }));
  }

  function resetLayout() {
    if (!canEditLayout) return;
    setLayout(normalizeLayout());
  }

  function alignStatRuler() {
    if (!canEditLayout) return;
    setLayout((current) => withAlignedStatRuler(current));
  }

  function startLayoutEditing() {
    if (persistLayoutToMaster && masterLockState !== "unlocked") return;
    if (layoutStorageKey && typeof window !== "undefined") {
      window.localStorage.removeItem(`${layoutStorageKey}:locked`);
    }
    setIsLayoutLocked(false);
  }

  function persistLayoutLocally(lockAfterSave = true) {
    if (!layoutStorageKey || typeof window === "undefined") return;
    window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
    if (lockAfterSave) {
      window.localStorage.setItem(`${layoutStorageKey}:locked`, "1");
    } else {
      window.localStorage.removeItem(`${layoutStorageKey}:locked`);
    }
    window.dispatchEvent(new CustomEvent("touchline-card-layout-change", { detail: { key: layoutStorageKey, layout } }));
  }

  async function saveLayoutAsMaster() {
    if (!canEditLayout || typeof window === "undefined") return;

    if (persistLayoutToMaster) {
      const confirmed = window.confirm(
        runtimeLocale === "pt-BR"
          ? "Salvar este layout como o novo padrão de todos os cards TouchLine? Você poderá continuar editando e salvar outro padrão depois."
          : "Save this layout as the new standard for every TouchLine card? You can keep editing and save another standard later.",
      );
      if (!confirmed) return;

      setMasterLayoutStatus("saving");
      try {
        const response = await fetch(MASTER_CARD_LAYOUT_SAVE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout, storageKey: layoutStorageKey || null }),
        });
        const result = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(result?.error || "Could not save master card layout.");
        }

        persistLayoutLocally(false);
        setDragState(null);
        setIsLayoutLocked(false);
        setMasterLockState("unlocked");
        setMasterLayoutStatus("saved");
        window.setTimeout(() => setMasterLayoutStatus("idle"), 2400);
      } catch {
        setMasterLayoutStatus("error");
      }
      return;
    }

    persistLayoutLocally();
    setDragState(null);
    setIsLayoutLocked(true);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canEditLayout) return;
    const key = event.currentTarget.dataset.cardField;
    if (!isEditableBlock(key)) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = layout[key] || DEFAULT_CARD_LAYOUT[key];
    setDragState({ key, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const active = dragState;
    if (!active) return;

    const size = FIELD_SIZE[active.key];
    const activeScale = layout[active.key]?.scale || 1;
    const nextX = active.originX + (event.clientX - active.startX) / scale;
    const nextY = active.originY + (event.clientY - active.startY) / scale;
    setLayout((current) => ({
      ...current,
      [active.key]: {
        x: Math.round(Math.max(0, Math.min(CARD_W - size.width * activeScale, nextX))),
        y: Math.round(Math.max(0, Math.min(CARD_H - size.height * activeScale, nextY))),
        scale: current[active.key]?.scale || activeScale,
      },
    }));
  }

  function handlePointerEnd() {
    setDragState(null);
  }

  function dragAttrs(key: EditableBlock) {
    if (!canEditLayout) return {};

    return {
      "data-card-field": key,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
    };
  }

  function addRemovalMarker(event: React.PointerEvent<HTMLDivElement>) {
    if (!isRemovalMarkerEnabled) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * CARD_W);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * CARD_H);
    setRemovalMarkers((current) => [...current, { x, y }].slice(-12));
  }

  const shirtTextOutline = [
    `-0.7px -0.7px 0 ${textPalette.outline}`,
    `0 -0.7px 0 ${textPalette.outline}`,
    `0.7px -0.7px 0 ${textPalette.outline}`,
    `-0.7px 0 0 ${textPalette.outline}`,
    `0.7px 0 0 ${textPalette.outline}`,
    `-0.7px 0.7px 0 ${textPalette.outline}`,
    `0 0.7px 0 ${textPalette.outline}`,
    `0.7px 0.7px 0 ${textPalette.outline}`,
  ].join(", ");
  const shellExtraHeight = editorHeight + (isRemovalMarkerEnabled ? 72 : 0);

  // Real football data is rendered by its profile/roster consumers. Only the
  // authenticated Market receives the explicitly opt-in inventory preview;
  // a valid frozen contract may also render its already-owned artwork. All
  // other card surfaces remain fail-closed until publication.
  if (!editorialCard && !contractedTier && !allowVisualInventoryPreview && !reviewRequired) return null;

  return (
    <div
      ref={shellRef}
      className={["touchline-card-surface", className].filter(Boolean).join(" ")}
      data-card-tier={marketTier?.key ?? "neutral"}
      data-card-editorial-state={reviewRequired ? "review_required" : editorialCard ? "published" : "unpublished"}
      data-card-motion={isEditable ? "false" : "true"}
      data-card-neon="permanent-tier-art"
      data-neon-active={forceNeonActive || isNeonActive ? "true" : "false"}
      onClick={(event) => {
        // Arena owns one exclusive selection. Its cards must not keep a second,
        // independent neon state after another athlete is selected.
        if (!enableInteractiveNeon || isEditable) return;
        const interactive = (event.target as HTMLElement).closest("a,button");
        if (interactive && event.currentTarget.contains(interactive)) return;
        const nextNeonState = !isNeonActive;
        setIsNeonActive(nextNeonState);
        if (nextNeonState) {
          window.dispatchEvent(new CustomEvent("touchline-card-neon-select", { detail: { id: neonInstanceId } }));
        }
      }}
      style={{
        width: `min(${CARD_W}px, 100%)`,
        aspectRatio: shellExtraHeight ? undefined : CARD_ASPECT_RATIO,
        height: shellExtraHeight ? CARD_H * scale + shellExtraHeight : undefined,
        position: "relative",
        margin: "0 auto",
        maxWidth: "100%",
        overflow: "visible",
        contain: shellExtraHeight ? undefined : "layout size",
        "--touchline-card-frame-color": cardTraceColor,
        "--touchline-club-crest-color": resolvedClub?.accent ?? cardTraceColor,
      } as React.CSSProperties}
    >
      <TouchlineCardPerimeterTrace />
      {reviewRequired ? (
        <div
          aria-label={runtimeLocale === "pt-BR" ? "Card requer revisão" : "Card review required"}
          style={{
            position: "absolute", left: "50%", top: -13, zIndex: 92,
            transform: "translateX(-50%)", whiteSpace: "nowrap", borderRadius: 999,
            border: "1px solid rgba(226,232,240,.45)", background: "rgba(15,23,42,.92)",
            boxShadow: "0 8px 20px rgba(0,0,0,.38)", color: "#e2e8f0",
            padding: "4px 8px", fontSize: 8, lineHeight: 1, fontWeight: 950,
            letterSpacing: ".08em", textTransform: "uppercase",
          }}
        >
          {runtimeLocale === "pt-BR" ? "Card requer revisão" : "Card review required"}
        </div>
      ) : null}
      {effectiveShowMatchRating ? (
        <div
          aria-label={`${runtimeLocale === "pt-BR" ? "Nota da partida" : "Match rating"}: ${matchRatingText}`}
          data-arena-match-rating="true"
          style={{
            position: "absolute",
            left: "50%",
            top: -16,
            width: "max-content",
            minWidth: 24,
            height: 16,
            zIndex: 70,
            transform: "translateX(-50%)",
            pointerEvents: "none",
            overflow: "visible",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0,
            padding: "1px 5px",
            border: "1px solid rgba(255,255,255,.18)",
            borderRadius: 5,
            background: "linear-gradient(180deg, rgba(18,22,24,.78), rgba(2,5,7,.86))",
            boxShadow: "0 6px 14px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.12)",
            backdropFilter: "blur(7px)",
            color: "#fff",
            fontWeight: 950,
            whiteSpace: "nowrap",
          }}
        >
          <strong
            style={{
              minWidth: 0,
              color: "rgba(255,255,255,.92)",
              fontSize: 9,
              lineHeight: 1,
              textAlign: "center",
              textShadow: "0 1px 2px rgba(0,0,0,.8)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {matchRatingText}
          </strong>
        </div>
      ) : null}
      <div
        data-card-price-version={cardPriceVersion}
        data-market-value={marketValueText ?? "unavailable"}
        data-card-tier={marketTier?.key ?? "neutral"}
        data-card-live-scale-mode={
          optimizeForLiveCompact
            ? (useWebKitCompactPaintScale ? "atomic-transform" : "atomic-layout")
            : undefined
        }
        style={{
          width: CARD_W,
          height: CARD_H,
          position: "absolute",
          left: 0,
          top: 0,
          /* Chromium retains the approved layout-zoom rendering. WebKit uses
             a post-layout paint scale so its minimum text metrics cannot grow
             compact labels independently from the frame. Full-card and zoom
             presentations remain on their existing transform path. */
          zoom: hasStaticRenderScale
            ? undefined
            : optimizeForLiveCompact && !useWebKitCompactPaintScale
              ? scale
              : undefined,
          transform: hasStaticRenderScale
            ? `scale(var(--touchline-card-static-scale, ${scale}))`
            : optimizeForLiveCompact
              ? (useWebKitCompactPaintScale ? `scale(${scale})` : "none")
              : `scale(${scale})`,
          transformOrigin: "top left",
          opacity: hasStaticRenderScale || scale > 0 ? 1 : 0,
          overflow: "hidden",
          background: "transparent",
          WebkitTextSizeAdjust: "none",
          textSizeAdjust: "none",
          isolation: "isolate",
          filter: reviewRequired ? "grayscale(1) contrast(1.06)" : undefined,
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          textTransform: "uppercase",
        }}
        aria-label={`${player.name} TouchLine card${player.totalRating === null || player.totalRating === undefined ? "" : `, total rating ${touchlineCardMetricText(player.totalRating)}`}`}
        data-total-rating={player.totalRating === null || player.totalRating === undefined ? undefined : touchlineCardMetricText(player.totalRating)}
      >
        {cardFrameImage()}
        <div
          ref={shirtNameMaskRef}
          {...dragAttrs("shirtClub")}
          data-shirt-name-mask="true"
          style={{
            ...editableStyle("shirtClub", 10),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            boxSizing: "border-box",
            overflow: "hidden",
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: shirtNamePadding.left,
            paddingRight: shirtNamePadding.right,
            clipPath: "polygon(9% 0, 91% 0, 100% 100%, 0 100%)",
          }}
        >
          <div
            data-shirt-name={shirtPlayerName}
            data-full-player-name={shirtPlayerName}
            data-static-name-fit={ensureStaticNameFit ? "true" : undefined}
            aria-label={shirtPlayerName}
            style={{
              display: "block",
              width: "100%",
              maxWidth: "100%",
              // The parent shirt mask owns clipping. Keep the fitted glyph run
              // visible here because scaleX is applied after layout; clipping
              // this inner box first cut long canonical names even when the
              // transformed text fitted safely inside the shirt mask.
              overflow: "visible",
              textOverflow: "clip",
              whiteSpace: "nowrap",
              fontFamily: '"Bebas Neue", "Anton", Impact, Inter, sans-serif',
              fontSize: shirtPlayerNameFit.size,
              lineHeight: `${shirtPlayerNameFit.size + 2}px`,
              fontWeight: 950,
              letterSpacing: "-.015em",
              textAlign: "center",
              textTransform: "uppercase",
              color: textPalette.fill,
              textShadow: shirtTextOutline,
              WebkitTextStroke: "0",
              transform: shirtPlayerNameFit.horizontalScale === 1 ? undefined : `scaleX(${shirtPlayerNameFit.horizontalScale})`,
              transformOrigin: "center",
            }}
          >
            {shirtPlayerName}
          </div>
        </div>

        <div
          {...dragAttrs("backNumber")}
          style={{
            ...editableStyle("backNumber", 11),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <TouchlineShirtNumber
            value={shirtNumber}
            fill={numberPalette.fill}
            outline={numberPalette.outline}
            outlineWidth={shirtNumberOutlineWidth}
          />
        </div>

        {resolvedClubLogoUrl ? (
          <div
            {...dragAttrs("clubCrest")}
            style={{
              ...editableStyle("clubCrest", 13),
              display: "grid",
              placeItems: "center",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "50%",
                top: -13,
                transform: "translateX(-50%)",
                color: "#fff",
                fontFamily: '"Bebas Neue", "Anton", Impact, Inter, sans-serif',
                fontSize: 8.5,
                lineHeight: "9px",
                fontWeight: 950,
                letterSpacing: 0,
                textTransform: "uppercase",
                textAlign: "center",
                textShadow: "0 0 5px rgba(184,255,70,.24), 0 1px 4px rgba(0,0,0,.9)",
                whiteSpace: "nowrap",
                padding: "2px 7px 3px",
                borderRadius: 5,
                border: "1px solid rgba(255,255,255,.10)",
                background: "linear-gradient(180deg, rgba(15,20,23,.58), rgba(2,5,8,.76))",
                boxShadow: "0 4px 10px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.06)",
                backdropFilter: "blur(3px)",
                pointerEvents: "none",
              }}
            >
              {cardLabels.currentClub}
            </span>
            {clubHubHref && !isEditable && showProfileAction ? (
              <a
                href={resolvedClubHubHref() || clubHubHref}
                aria-label={`Open ${player.clubName} Club Hub`}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                {clubCrestImage()}
              </a>
            ) : (
              clubCrestImage()
            )}
          </div>
        ) : null}

        <div {...dragAttrs("flag")} style={{ ...editableStyle("flag", 21), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, ...editableMarker }}>
          <div style={{ minWidth: 48 * fieldScale("flag"), textAlign: "center", color: "rgba(255,255,255,.84)", fontSize: 10 * fieldScale("flag"), lineHeight: `${12 * fieldScale("flag")}px`, fontWeight: 950, letterSpacing: 0, textShadow: "0 2px 8px rgba(0,0,0,.8)" }}>{cardLabels.nationality}</div>
          {flagImageUrl ? <img data-live-card-asset="flag" src={flagImageUrl} alt={countryCode3} draggable={false} loading={imageLoading} style={{ width: 52 * fieldScale("flag"), height: 34 * fieldScale("flag"), objectFit: "cover", borderRadius: 4, boxShadow: "0 0 10px rgba(255,255,255,.22), 0 3px 12px rgba(0,0,0,.55)" }} /> : countryFlagFallback(countryCode3)}
          <div style={{ minWidth: 48 * fieldScale("flag"), textAlign: "center", color: "#fff", fontSize: 11 * fieldScale("flag"), lineHeight: `${13 * fieldScale("flag")}px`, fontWeight: 950, letterSpacing: 0, textShadow: "0 2px 8px rgba(0,0,0,.8)" }}>{countryCode3}</div>
        </div>

        <div
          {...dragAttrs("marketValue")}
          data-live-card-compact-detail="true"
          style={{
            ...editableStyle("marketValue", 23),
            borderRadius: 12,
            border: "1px solid rgba(125,211,252,.18)",
            background: "linear-gradient(180deg, rgba(2,6,16,.54), rgba(0,0,0,.86))",
            boxShadow: "0 0 14px rgba(56,189,248,.10), inset 0 1px 0 rgba(255,255,255,.08)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 6px",
          }}
        >
          <div style={{ color: "rgba(226,246,255,.76)", fontSize: 8 * fieldScale("marketValue"), lineHeight: `${10 * fieldScale("marketValue")}px`, fontWeight: 950, letterSpacing: 0, textTransform: "uppercase", whiteSpace: "nowrap" }}>{compactPrimaryLabel}</div>
          <div data-card-total-rating="true" style={{ marginTop: 4, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#fff", fontSize: totalRatingSize * fieldScale("marketValue"), lineHeight: `${(totalRatingSize + 2) * fieldScale("marketValue")}px`, fontWeight: 950, letterSpacing: 0, textShadow: "0 2px 10px rgba(0,0,0,.72)" }}>{compactPrimaryValue}</div>
        </div>

        <div
          {...dragAttrs("cardPrice")}
          data-live-card-compact-detail="true"
          data-card-market-value-panel="true"
          style={{
            ...editableStyle("cardPrice", 23),
            borderRadius: 12,
            border: "1px solid rgba(250,204,21,.20)",
            background: "linear-gradient(180deg, rgba(2,6,16,.54), rgba(0,0,0,.86))",
            boxShadow: "0 0 14px rgba(250,204,21,.12), inset 0 1px 0 rgba(255,255,255,.08)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 6px",
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3 * fieldScale("cardPrice"), color: "rgba(254,240,138,.88)", fontSize: 8 * fieldScale("cardPrice"), lineHeight: `${10 * fieldScale("cardPrice")}px`, fontWeight: 950, letterSpacing: 0, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            <span>{compactSecondaryLabel}</span>
          </div>
          <div style={{ marginTop: 4, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#fff", fontSize: marketValueSize * fieldScale("cardPrice"), lineHeight: `${(marketValueSize + 2) * fieldScale("cardPrice")}px`, fontWeight: 950, letterSpacing: 0, textShadow: "0 2px 10px rgba(0,0,0,.72)" }}>{compactSecondaryValue}</div>
        </div>

        <div
          {...dragAttrs("touchlineLogo")}
          data-live-card-compact-detail="true"
          style={{
            ...editableStyle("touchlineLogo", 24),
            display: "grid",
            placeItems: "center",
          }}
        >
          <img data-live-card-asset="brand" src="/touchlineArena/brand/tl-shield-lime.svg" alt="TL" draggable={false} loading={imageLoading} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none", filter: "drop-shadow(0 0 8px rgba(163,255,18,.52)) drop-shadow(0 3px 8px rgba(0,0,0,.70))" }} />
        </div>

        <div
          {...dragAttrs("touchlinePremier")}
          data-live-card-compact-detail="true"
          style={{
            ...editableStyle("touchlinePremier", 31),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff7f3",
            fontSize: 8.5 * fieldScale("touchlinePremier"),
            lineHeight: `${10 * fieldScale("touchlinePremier")}px`,
            fontWeight: 950,
            letterSpacing: 0,
            textAlign: "center",
            textTransform: "uppercase",
            textShadow: "0 0 12px rgba(184,255,70,.36), 0 2px 12px rgba(0,0,0,.86)",
          }}
        >
          {runtimeLocale === "pt-BR" ? "Estatísticas da TouchLine England League" : "TouchLine England League Stats"}
        </div>

        {shouldShowCardActions ? (
          <>
            {showProfileAction ? <div
              {...dragAttrs("profileAction")}
              style={{
                ...editableStyle("profileAction", 34),
                borderRadius: 7,
                border: "1px solid rgba(190,242,100,.34)",
                background: "linear-gradient(180deg, rgba(23,35,26,.92), rgba(3,10,7,.96))",
                boxShadow: "0 6px 18px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.08)",
                overflow: "hidden",
              }}
            >
              <a
                href={!isEditable ? resolvedPlayerProfileHref() : undefined}
                aria-label={`${cardLabels.profileAction}: ${player.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) {
                    event.preventDefault();
                  }
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  color: "#f7fee7",
                  textDecoration: "none",
                  fontSize: 11,
                  lineHeight: "13px",
                  fontWeight: 950,
                  letterSpacing: 0,
                  cursor: isEditable ? "move" : "pointer",
                }}
              >
                <UserRound aria-hidden="true" size={14} strokeWidth={2.2} />
                <span>{cardLabels.profileAction}</span>
              </a>
            </div> : null}

            <div
              {...dragAttrs("shareAction")}
              style={{
                ...editableStyle("shareAction", 34),
                borderRadius: 7,
                border: "1px solid rgba(125,211,252,.30)",
                background: "linear-gradient(180deg, rgba(13,28,40,.92), rgba(2,8,16,.96))",
                boxShadow: "0 6px 18px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.08)",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                aria-label={`${cardLabels.shareAction}: ${player.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) return;
                  if (onShare) {
                    onShare();
                    return;
                  }
                  void sharePlayerCard().catch(() => undefined);
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  border: 0,
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  color: "#eff6ff",
                  padding: 0,
                  font: "inherit",
                  fontSize: cardLabels.shareAction.length > 8 ? 9 : 11,
                  lineHeight: "13px",
                  fontWeight: 950,
                  letterSpacing: 0,
                  textTransform: "uppercase",
                  cursor: isEditable ? "move" : "pointer",
                }}
              >
                <Share2 aria-hidden="true" size={14} strokeWidth={2.2} />
                <span>{cardLabels.shareAction}</span>
              </button>
            </div>
          </>
        ) : null}

        {showSocialMetrics ? (
          <>
            <div
              {...dragAttrs("followAction")}
              aria-label={runtimeLocale === "pt-BR" ? "Botão Seguir editável" : "Editable Follow button"}
              data-social-card-mask="true"
              style={{
                ...editableStyle("followAction", 42),
                textTransform: "none",
              }}
            >
              <button
                type="button"
                aria-pressed={isFollowing}
                aria-label={`${isFollowing ? (runtimeLocale === "pt-BR" ? "Seguindo" : "Following") : (runtimeLocale === "pt-BR" ? "Seguir" : "Follow")} ${player.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) return;
                  setIsFollowing((current) => !current);
                }}
                style={{ width: "100%", height: "100%", display: "flex", minWidth: 0, alignItems: "center", justifyContent: "center", gap: 7, border: `1px solid ${isFollowing ? tierGlow : "rgba(255,255,255,.18)"}`, background: isFollowing ? `linear-gradient(135deg, ${tierGlow}, rgba(4,9,14,.92) 72%)` : "linear-gradient(180deg, rgba(15,22,30,.88), rgba(2,6,11,.96))", boxShadow: isFollowing ? `0 0 6px ${tierGlow}, 0 0 15px ${tierGlow}, inset 0 1px 0 rgba(255,255,255,.18)` : "0 6px 14px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.08)", clipPath: "polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%)", color: "#fff", cursor: isEditable ? "move" : "pointer", padding: "0 12px", fontSize: 11 * fieldScale("followAction"), fontWeight: 950 }}
              >
                <UserPlus aria-hidden="true" size={15 * fieldScale("followAction")} strokeWidth={2.5} />
                <span>{compactSocialCount(baseFollowerCount + (isFollowing ? 1 : 0), runtimeLocale)}</span>
              </button>
            </div>

            <div
              {...dragAttrs("likeAction")}
              aria-label={runtimeLocale === "pt-BR" ? "Botão Curtir editável" : "Editable Like button"}
              data-social-card-mask="true"
              style={{
                ...editableStyle("likeAction", 42),
                textTransform: "none",
              }}
            >
              <button
                type="button"
                aria-pressed={isLiked}
                aria-label={isLiked ? (runtimeLocale === "pt-BR" ? "Remover curtida" : "Unlike card") : (runtimeLocale === "pt-BR" ? "Curtir card" : "Like card")}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) return;
                  setIsLiked((current) => !current);
                }}
                style={{ width: "100%", height: "100%", display: "flex", minWidth: 0, alignItems: "center", justifyContent: "center", gap: 7, border: `1px solid ${isLiked ? tierGlow : "rgba(255,255,255,.18)"}`, background: isLiked ? `linear-gradient(135deg, ${tierGlow}, rgba(4,9,14,.92) 72%)` : "linear-gradient(180deg, rgba(15,22,30,.88), rgba(2,6,11,.96))", boxShadow: isLiked ? `0 0 6px ${tierGlow}, 0 0 15px ${tierGlow}, inset 0 1px 0 rgba(255,255,255,.18)` : "0 6px 14px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.08)", clipPath: "polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%)", color: "#fff", cursor: isEditable ? "move" : "pointer", padding: "0 12px", fontSize: 11 * fieldScale("likeAction"), fontWeight: 950 }}
              >
                <Heart aria-hidden="true" size={15 * fieldScale("likeAction")} strokeWidth={2.5} fill={isLiked ? "currentColor" : "none"} />
                <span>{compactSocialCount(baseLikeCount + (isLiked ? 1 : 0), runtimeLocale)}</span>
              </button>
            </div>
          </>
        ) : null}

        {LOOSE_STAT_FIELDS.map((stat) => (
          <div
            key={stat.key}
            {...dragAttrs(stat.key)}
            data-live-card-compact-detail="true"
            style={{
              ...editableStyle(stat.key, 25),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3 * fieldScale(stat.key),
            }}
          >
            <PremiumStatIcon icon={stat.src} label={stat.label} size={28 * fieldScale(stat.key)} />
            <div
              style={{
                minWidth: 26 * fieldScale(stat.key),
                height: 17 * fieldScale(stat.key),
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.18)",
                background: "linear-gradient(180deg, rgba(5,8,14,.86), rgba(0,0,0,.94))",
                boxShadow: "0 2px 8px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10 * fieldScale(stat.key),
                lineHeight: `${12 * fieldScale(stat.key)}px`,
                fontWeight: 950,
                letterSpacing: 0,
                textShadow: "0 1px 6px rgba(0,0,0,.86)",
              }}
            >
              {statCount(player, stat.statId, undefined, preseasonMissingValue)}
            </div>
          </div>
        ))}

        <div
          {...dragAttrs("statCar")}
          data-live-card-compact-detail="true"
          style={{
            ...editableStyle("statCar", 25),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4 * fieldScale("statCar"),
          }}
        >
          <span role="img" aria-label={cardLabels.yellowRedCards} style={{ position: "relative", width: 30 * fieldScale("statCar"), height: 27 * fieldScale("statCar"), filter: "drop-shadow(0 3px 7px rgba(0,0,0,.70))" }}>
            {([
              { label: cardLabels.yellowCard, color: "#facc15", left: 2, rotate: -5 },
              { label: cardLabels.redCard, color: "#ef4444", left: 13, rotate: 5 },
            ]).map((discipline) => (
              <span
                key={discipline.label}
                aria-label={discipline.label}
                style={{
                  position: "absolute",
                  left: discipline.left * fieldScale("statCar"),
                  top: 2 * fieldScale("statCar"),
                  width: 13 * fieldScale("statCar"),
                  height: 20 * fieldScale("statCar"),
                  borderRadius: 2 * fieldScale("statCar"),
                  border: `${1.8 * fieldScale("statCar")}px solid ${discipline.color}`,
                  background: "transparent",
                  boxShadow: `inset 0 0 0 ${0.7 * fieldScale("statCar")}px rgba(255,255,255,.28), 0 0 ${4 * fieldScale("statCar")}px ${discipline.color}33`,
                  transform: `rotate(${discipline.rotate}deg)`,
                }}
              />
            ))}
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", alignItems: "center", gap: 3 * fieldScale("statCar") }}>
            {([
              { id: "yellowCards" as const, legacyId: "cards" as const, label: cardLabels.yellowCards, color: "#facc15" },
              { id: "redCards" as const, label: cardLabels.redCards, color: "#ef4444" },
            ]).map((discipline) => (
              <div
                key={discipline.id}
                aria-label={discipline.label}
                style={{
                  minWidth: 20 * fieldScale("statCar"),
                  height: 17 * fieldScale("statCar"),
                  borderRadius: 999,
                  border: `${0.9 * fieldScale("statCar")}px solid ${discipline.color}99`,
                  background: "linear-gradient(180deg, rgba(5,8,14,.86), rgba(0,0,0,.94))",
                  boxShadow: `0 2px 8px rgba(0,0,0,.55), inset 0 1px 0 ${discipline.color}24`,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9 * fieldScale("statCar"),
                  lineHeight: `${11 * fieldScale("statCar")}px`,
                  fontWeight: 950,
                  letterSpacing: 0,
                  textShadow: "0 1px 6px rgba(0,0,0,.86)",
                }}
              >
                {statCount(
                  player,
                  discipline.id,
                  "legacyId" in discipline ? discipline.legacyId : undefined,
                  preseasonMissingValue,
                )}
              </div>
            ))}
          </div>
        </div>

        {isRemovalMarkerEnabled ? (
          <div onPointerDown={addRemovalMarker} style={{ position: "absolute", inset: 0, zIndex: 145, cursor: "crosshair", touchAction: "none" }}>
            {removalMarkers.map((marker, index) => (
              <div key={`${marker.x}-${marker.y}-${index}`} style={{ position: "absolute", left: marker.x - 10, top: marker.y - 10, width: 20, height: 20, borderRadius: 999, border: "2px solid rgba(255,255,255,.95)", background: "rgba(255,0,42,.62)", boxShadow: "0 0 14px rgba(255,0,42,.8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 950 }}>
                {index + 1}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {isEditable ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: CARD_H * scale + 12,
            zIndex: 200,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(3,7,18,.92)",
            boxShadow: "0 18px 48px rgba(0,0,0,.42)",
            padding: 10,
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 950, letterSpacing: 0, textTransform: "none", color: "rgba(255,255,255,.72)" }}>
                {runtimeLocale === "pt-BR" ? "Editor do Card Mestre" : "Card Master editor"}
              </div>
              <div style={{ marginTop: 3, fontSize: 9, fontWeight: 850, letterSpacing: 0, textTransform: "none", color: isLayoutLocked ? "rgba(190,242,100,.92)" : "rgba(255,255,255,.52)" }}>
                {masterLockState === "checking"
                  ? (runtimeLocale === "pt-BR" ? "Preparando o editor" : "Preparing editor")
                  : masterLockState === "locked"
                    ? (runtimeLocale === "pt-BR" ? "PADRÃO PROTEGIDO" : "STANDARD PROTECTED")
                    : masterLockState === "readonly"
                      ? (runtimeLocale === "pt-BR" ? "SOMENTE LEITURA NO SITE PUBLICADO" : "READ ONLY ON THE PUBLISHED SITE")
                      : masterLockState === "error"
                      ? (runtimeLocale === "pt-BR" ? "Editor protegido até a verificação voltar" : "Editor protected until verification returns")
                      : isLayoutLocked
                        ? (runtimeLocale === "pt-BR" ? "Layout bloqueado" : "Layout locked")
                        : (runtimeLocale === "pt-BR" ? "Arraste as informações e ajuste os tamanhos" : "Drag information and adjust sizes")}
              </div>
              {persistLayoutToMaster ? (
                <div style={{ marginTop: 4, fontSize: 8, fontWeight: 900, letterSpacing: 0, textTransform: "none", color: masterLayoutStatus === "saved" ? "rgba(190,242,100,.86)" : masterLayoutStatus === "error" ? "rgba(248,113,113,.86)" : "rgba(255,255,255,.42)" }}>
                  {masterLayoutStatus === "saving"
                    ? (runtimeLocale === "pt-BR" ? "Salvando o padrão mestre" : "Saving master standard")
                    : masterLayoutStatus === "saved"
                      ? (runtimeLocale === "pt-BR" ? "Padrão atualizado em todos os cards. A edição continua ativa." : "Standard updated across every card. Editing remains active.")
                      : masterLayoutStatus === "error"
                        ? (runtimeLocale === "pt-BR" ? "O padrão não foi salvo. Tente novamente." : "The standard was not saved. Try again.")
                        : masterLockState === "locked"
                          ? (runtimeLocale === "pt-BR" ? "O padrão está protegido" : "The standard is protected")
                          : masterLockState === "readonly"
                            ? (runtimeLocale === "pt-BR" ? "O padrão só pode ser editado e salvo no ambiente local protegido" : "The standard can only be edited and saved in the protected local environment")
                          : (runtimeLocale === "pt-BR" ? "Cada salvamento atualiza o padrão de todos os cards" : "Each save updates the standard for every card")}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 }}>
              <button type="button" onClick={startLayoutEditing} disabled={persistLayoutToMaster && masterLockState !== "unlocked"} style={{ borderRadius: 6, border: "1px solid rgba(103,232,249,.32)", background: isLayoutLocked ? "rgba(103,232,249,.16)" : "rgba(255,255,255,.07)", color: persistLayoutToMaster && masterLockState !== "unlocked" ? "rgba(255,255,255,.34)" : "#fff", padding: "6px 8px", fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: "none" }}>
                {runtimeLocale === "pt-BR" ? "Editar" : "Edit"}
              </button>
              <button type="button" onClick={saveLayoutAsMaster} disabled={!canEditLayout || masterLayoutStatus === "saving"} style={{ borderRadius: 6, border: "1px solid rgba(190,242,100,.48)", background: canEditLayout ? "linear-gradient(135deg, rgba(77,124,15,.72), rgba(34,197,94,.24))" : "rgba(255,255,255,.06)", boxShadow: canEditLayout ? "0 0 16px rgba(163,230,53,.18)" : "none", color: canEditLayout ? "#f7fee7" : "rgba(255,255,255,.34)", padding: "6px 8px", fontSize: 9, fontWeight: 950, letterSpacing: 0, textTransform: "none" }}>
                {runtimeLocale === "pt-BR" ? "SALVAR COMO PADRÃO" : "SAVE AS STANDARD"}
              </button>
              <button type="button" onClick={alignStatRuler} disabled={!canEditLayout} style={{ borderRadius: 6, border: "1px solid rgba(250,204,21,.30)", background: "rgba(250,204,21,.12)", color: canEditLayout ? "#fff" : "rgba(255,255,255,.35)", padding: "6px 8px", fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: "none" }}>
                {runtimeLocale === "pt-BR" ? "Alinhar estatísticas" : "Align stats"}
              </button>
              <button type="button" onClick={resetLayout} disabled={!canEditLayout} style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.08)", color: canEditLayout ? "#fff" : "rgba(255,255,255,.35)", padding: "6px 8px", fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: "none" }}>
                {runtimeLocale === "pt-BR" ? "Restaurar" : "Restore"}
              </button>
            </div>
          </div>
          <div style={{ marginTop: 9, maxHeight: 212, overflowY: "scroll", paddingRight: 4 }}>
            {(Object.keys(FIELD_LABELS) as EditableBlock[]).map((key) => (
              <label key={key} style={{ display: "grid", gridTemplateColumns: "104px 1fr 42px", alignItems: "center", gap: 8, borderTop: "1px solid rgba(255,255,255,.08)", padding: "9px 0" }}>
                <span style={{ color: "rgba(255,255,255,.68)", fontSize: 10, fontWeight: 900, letterSpacing: 0, textTransform: "none" }}>{runtimeLocale === "pt-BR" ? FIELD_LABELS_PT_BR[key] : FIELD_LABELS[key]}</span>
                <input type="range" min="0.55" max={key === "clubCrest" ? "4" : "1.85"} step="0.01" value={fieldScale(key)} disabled={!canEditLayout} onChange={(event) => updateFieldScale(key, Number(event.target.value))} style={{ width: "100%", accentColor: "#ff4050", opacity: canEditLayout ? 1 : 0.45 }} />
                <span style={{ color: "#fff", textAlign: "right", fontSize: 10, fontWeight: 900 }}>{Math.round(fieldScale(key) * 100)}%</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {isRemovalMarkerEnabled ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: helperTop, marginTop: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(0,0,0,.58)", padding: "8px 10px", color: "rgba(255,255,255,.72)", fontSize: 9, fontWeight: 850, letterSpacing: 0, lineHeight: "14px", textTransform: "none" }}>
          <div>Marque os pontos da borda para remover</div>
          <div style={{ marginTop: 4, color: "#fff" }} data-removal-markers={JSON.stringify(removalMarkers)}>
            {removalMarkers.length ? removalMarkers.map((marker, index) => `${index + 1}: ${marker.x},${marker.y}`).join(" / ") : "Nenhum ponto marcado"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TouchlineEliteExactCard;
