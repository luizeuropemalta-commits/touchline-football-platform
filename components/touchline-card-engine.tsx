"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  Shield,
  Sparkles,
  Star,
  Trophy,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { buildTdiePlayerIdentity, type TdiePlayerIdentity } from "@/lib/tdie/player-identity";
import { TouchlineEntityAvatar, type TouchlineEntityAvatarProps } from "@/components/touchline-entity-avatar";
import { playerInitials } from "@/lib/player-normalization";
import { getTouchlinePlayerTier, parseTouchlineMarketValue, type TouchlinePlayerTier } from "@/lib/player-tier";
import { cn } from "@/lib/utils";

export type TouchlineCardTier = TouchlinePlayerTier;

export type TouchlineCardLiveState =
  | "idle"
  | "live_match"
  | "goal"
  | "assist"
  | "yellow_card"
  | "red_card"
  | "substitution"
  | "injury"
  | "suspension"
  | "clean_sheet"
  | "player_of_the_match";

export type TouchlinePlayerCardContext =
  | "profile"
  | "search"
  | "dashboard"
  | "transfer"
  | "live"
  | "club"
  | "agent"
  | "competition"
  | "notification"
  | "watchlist"
  | "scouting"
  | "comparison";

export type TouchlinePlayerCardModel = {
  id?: string;
  name: string;
  tdieIdentity?: TdiePlayerIdentity | null;
  tdieImageUrl?: string | null;
  photoUrl?: string | null;
  avatarUrl?: string | null;
  sourceImageUrl?: string | null;
  sourceImageProvider?: string | null;
  sourceImageLicenseStatus?: string | null;
  sourceImageFetchedAt?: string | null;
  touchlineAvatarUrl?: string | null;
  avatarRenderStatus?: "rendered" | "fallback" | "missing_source" | null;
  avatarRenderVersion?: string | null;
  avatarSourceHash?: string | null;
  avatarRenderType?: "touchline_branded_render" | "touchline_initials_fallback" | null;
  nationality?: string | null;
  position?: string | null;
  currentClub?: string | null;
  officialMarketValue?: number | string | null;
  officialMarketValueLabel?: string | null;
  marketValue?: number | string | null;
  currency?: string | null;
  clubBadgeUrl?: string | null;
  leagueBadgeUrl?: string | null;
  shirtNumber?: string | number | null;
  lastUpdated?: string | null;
  competition?: string | null;
  league?: string | null;
  href?: string;
  externalHref?: string;
  liveState?: TouchlineCardLiveState;
  context?: TouchlinePlayerCardContext;
  initials?: string | null;
  age?: string | number | null;
  currentCoach?: string | null;
  currentAgent?: string | null;
  contractStatus?: string | null;
  currentForm?: string | null;
  availability?: string | null;
  livePoints?: number | null;
  statusLabel?: string | null;
  syncStatus?: string | null;
  fantasyAsset?: boolean;
  ovr?: string | number | null;
  potential?: string | number | null;
};

export type TouchlinePlayerCardVariant = "showcase" | "compact" | "list";

export type TouchlineIdentityEntityType = "club" | "agent" | "agency" | "coach" | "scout" | "academy" | "investor";

export type TouchlineIdentityCardModel = {
  id?: string;
  type: TouchlineIdentityEntityType;
  name: string;
  initials?: string;
  imageUrl?: string | null;
  sourceImageUrl?: string | null;
  sourceImageProvider?: string | null;
  sourceImageLicenseStatus?: string | null;
  sourceImageFetchedAt?: string | null;
  touchlineAvatarUrl?: string | null;
  avatarRenderStatus?: "rendered" | "fallback" | "missing_source" | null;
  avatarRenderVersion?: string | null;
  avatarSourceHash?: string | null;
  avatarRenderType?: "touchline_branded_render" | "touchline_initials_fallback" | null;
  transfermarktId?: string | null;
  href?: string;
  externalHref?: string;
  status?: string | null;
  country?: string | null;
  league?: string | null;
  subtitle?: string | null;
  valueLabel?: string | null;
  metricLabel?: string | null;
  metricValue?: string | number | null;
  secondaryMetricLabel?: string | null;
  secondaryMetricValue?: string | number | null;
  linkedPlayers?: Array<{
    id?: string | null;
    name?: string | null;
    initials?: string | null;
    href?: string | null;
    photoUrl?: string | null;
    status?: string | null;
    transfermarktId?: string | null;
  }>;
};

const tierMeta: Record<
  TouchlineCardTier,
  {
    label: string;
    accent: string;
    soft: string;
    rgb: string;
    border: string;
    glow: string;
    chip: string;
    name: string;
  }
> = {
  bronze: {
    label: "Bronze",
    accent: "#d97824",
    soft: "#ffb16a",
    rgb: "217,120,36",
    border: "from-[#7d3516] via-[#ffbf7a] to-[#a34b1d]",
    glow: "shadow-[0_0_52px_rgba(217,120,36,.28)]",
    chip: "border-orange-300/40 bg-orange-300/15 text-orange-100",
    name: "text-orange-200",
  },
  silver: {
    label: "Silver",
    accent: "#dfe7f2",
    soft: "#ffffff",
    rgb: "223,231,242",
    border: "from-[#7c8797] via-white to-[#aeb9c7]",
    glow: "shadow-[0_0_52px_rgba(223,231,242,.26)]",
    chip: "border-slate-100/45 bg-white/12 text-white",
    name: "text-slate-100",
  },
  gold: {
    label: "Gold",
    accent: "#f6c84c",
    soft: "#ffe89a",
    rgb: "246,200,76",
    border: "from-[#9b6f14] via-[#fff0a6] to-[#d7a526]",
    glow: "shadow-[0_0_60px_rgba(246,200,76,.34)]",
    chip: "border-[#f6c84c]/50 bg-[#f6c84c]/20 text-[#ffe89a]",
    name: "text-[#f6c84c]",
  },
  blue_diamond: {
    label: "Blue Diamond",
    accent: "#48d7ff",
    soft: "#b9f3ff",
    rgb: "72,215,255",
    border: "from-[#0c5d82] via-[#b9f3ff] to-[#1097ce]",
    glow: "shadow-[0_0_64px_rgba(72,215,255,.34)]",
    chip: "border-cyan-300/50 bg-cyan-300/20 text-cyan-100",
    name: "text-cyan-100",
  },
  purple_diamond: {
    label: "Purple Diamond",
    accent: "#d65cff",
    soft: "#f7d8ff",
    rgb: "214,92,255",
    border: "from-[#4c116f] via-[#f7d8ff] to-[#a531ff]",
    glow: "shadow-[0_0_76px_rgba(214,92,255,.48)]",
    chip: "border-fuchsia-300/50 bg-fuchsia-300/20 text-fuchsia-100",
    name: "text-fuchsia-100",
  },
};

const noisyValues = new Set([
  "open",
  "value open",
  "data not available",
  "not available",
  "unavailable",
  "undefined",
  "null",
  "sync",
  "sync pending",
  "tdie fallback",
  "tdie premium fallback",
  "profile data open",
  "no club linked",
]);

function cleanText(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (noisyValues.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function displayName(value?: string | null) {
  return cleanText(value)?.toUpperCase() ?? "";
}

function compactPosition(value?: string | null) {
  const clean = cleanText(value);
  if (!clean) return "POS";
  const normalized = clean.toUpperCase();
  if (normalized.includes("GOALKEEPER")) return "GK";
  if (normalized.includes("LEFT WINGER")) return "LW";
  if (normalized.includes("RIGHT WINGER")) return "RW";
  if (normalized.includes("CENTRE-FORWARD") || normalized.includes("CENTER-FORWARD") || normalized.includes("STRIKER")) return "ST";
  if (normalized.includes("ATTACKING MIDFIELD")) return "CAM";
  if (normalized.includes("DEFENSIVE MIDFIELD")) return "CDM";
  if (normalized.includes("CENTRE-BACK") || normalized.includes("CENTER-BACK")) return "CB";
  if (normalized.includes("LEFT-BACK")) return "LB";
  if (normalized.includes("RIGHT-BACK")) return "RB";
  const words = normalized
    .replace(/[^A-Z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3);
  return words.map((word) => word[0]).join("").slice(0, 3);
}

function longPosition(value?: string | null) {
  return cleanText(value)?.toUpperCase() ?? "";
}

function countryCode(value?: string | null) {
  const clean = cleanText(value);
  if (!clean) return "";
  const normalized = clean.toLowerCase();
  if (normalized.includes("brazil") || normalized.includes("brasil")) return "BRA";
  if (normalized.includes("portugal")) return "POR";
  if (normalized.includes("argentina")) return "ARG";
  if (normalized.includes("spain") || normalized.includes("espanha")) return "ESP";
  if (normalized.includes("france")) return "FRA";
  if (normalized.includes("england")) return "ENG";
  if (normalized.includes("germany")) return "GER";
  if (normalized.includes("italy")) return "ITA";
  return clean
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "-");
}

function countryFlag(value?: string | null) {
  const clean = cleanText(value);
  if (!clean) return null;
  const code = countryCode(clean);
  const flags: Record<string, string> = {
    ARG: "🇦🇷",
    BRA: "🇧🇷",
    ENG: "🏴",
    ESP: "🇪🇸",
    FRA: "🇫🇷",
    GER: "🇩🇪",
    ITA: "🇮🇹",
    POR: "🇵🇹",
  };
  return flags[code] ?? null;
}

function formatCompactDate(value?: string | null) {
  const clean = cleanText(value);
  if (!clean) return "";
  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return clean.slice(0, 16);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseMarketNumber(value?: number | string | null) {
  return parseTouchlineMarketValue(value);
}

function resolveOfficialMarketValue(player: TouchlinePlayerCardModel) {
  return (
    parseMarketNumber(player.officialMarketValue) ??
    parseMarketNumber(player.officialMarketValueLabel) ??
    parseMarketNumber(player.marketValue ?? null)
  );
}

export function getTouchlinePlayerCardTier(officialMarketValue?: number | string | null): TouchlineCardTier {
  return getTouchlinePlayerTier(officialMarketValue);
}

export function formatOfficialMarketValue(officialMarketValue?: number | string | null, currency = "EUR", fallback?: string | null) {
  const label = cleanText(fallback);
  if (label) return label.replace(/ Last update:.*/i, "").trim();
  const value = parseMarketNumber(officialMarketValue);
  if (value === null) return "";
  const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  if (value >= 1_000_000_000) return `${symbol}${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`;
  return `${symbol}${value.toLocaleString()}`;
}

function resolvePlayerIdentity(player: TouchlinePlayerCardModel): TdiePlayerIdentity {
  const resolvedMarketValue = resolveOfficialMarketValue(player);

  return player.tdieIdentity ?? buildTdiePlayerIdentity({
    name: player.name,
    playerSource: "touchline-card",
    playerSourceId: player.id ?? player.name,
    position: cleanText(player.position),
    nationality: cleanText(player.nationality),
    clubName: cleanText(player.currentClub),
    marketValue: resolvedMarketValue,
    currency: cleanText(player.currency) ?? "EUR",
    shirtNumber: cleanText(player.shirtNumber),
    sourceUpdatedAt: cleanText(player.lastUpdated),
  });
}

function resolveGeneratedArtworkUrl(player: TouchlinePlayerCardModel, identity = resolvePlayerIdentity(player)) {
  if (identity.renderMode === "generated_artwork" && identity.artworkUrl) return identity.artworkUrl;
  return null;
}

function validImageUrl(value?: string | null) {
  const clean = cleanText(value);
  if (!clean) return null;
  if (/transfermarkt-logo|tm-logo|default|socialmedia|\/icons?\//i.test(clean)) return null;
  return clean;
}

export function TouchlineAvatarFallback({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("relative grid h-full w-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,.24),rgba(163,255,18,.08)_42%,rgba(0,0,0,.94))]", className)}>
      <span className="absolute inset-0 bg-[linear-gradient(118deg,transparent_24%,rgba(255,255,255,.14)_42%,transparent_58%)] opacity-50" />
      <span className="absolute inset-x-[18%] bottom-[12%] h-[42%] rounded-t-full bg-[linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.035))]" />
      <span className="absolute left-1/2 top-[19%] size-[24%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,.3),rgba(12,16,22,.98)_70%)] shadow-[0_0_22px_rgba(34,211,238,.18)]" />
      <span className="relative z-10 font-display text-[clamp(1rem,4vw,1.7rem)] font-black uppercase italic text-cyan-100/70">
        {playerInitials(name)}
      </span>
    </span>
  );
}

export function TouchlinePlayerAvatar({
  player,
  size = "md",
  className,
}: {
  player: Pick<
    TouchlinePlayerCardModel,
    | "name"
    | "photoUrl"
    | "avatarUrl"
    | "tdieImageUrl"
    | "sourceImageUrl"
    | "sourceImageProvider"
    | "sourceImageLicenseStatus"
    | "sourceImageFetchedAt"
    | "touchlineAvatarUrl"
    | "avatarRenderStatus"
    | "avatarRenderVersion"
    | "avatarSourceHash"
    | "avatarRenderType"
    | "marketValue"
    | "officialMarketValue"
  >;
  size?: "sm" | "md" | "lg" | "card";
  className?: string;
}) {
  return (
    <TouchlineEntityAvatar
      entityType="player"
      name={player.name}
      sourceImageUrl={player.sourceImageUrl ?? player.avatarUrl ?? player.photoUrl ?? player.tdieImageUrl}
      sourceImageProvider={player.sourceImageProvider}
      sourceImageLicenseStatus={player.sourceImageLicenseStatus}
      sourceImageFetchedAt={player.sourceImageFetchedAt}
      touchlineAvatarUrl={player.touchlineAvatarUrl}
      avatarRenderStatus={player.avatarRenderStatus}
      avatarRenderVersion={player.avatarRenderVersion}
      avatarSourceHash={player.avatarSourceHash}
      avatarRenderType={player.avatarRenderType}
      marketValue={player.officialMarketValue ?? player.marketValue}
      size={size}
      className={className}
    />
  );
}

type IdentityAvatarEntity = Pick<
  TouchlineIdentityCardModel,
  | "name"
  | "imageUrl"
  | "sourceImageUrl"
  | "sourceImageProvider"
  | "sourceImageLicenseStatus"
  | "sourceImageFetchedAt"
  | "touchlineAvatarUrl"
  | "avatarRenderStatus"
  | "avatarRenderVersion"
  | "avatarSourceHash"
  | "avatarRenderType"
>;

function TouchlineIdentityAvatar({
  entity,
  entityType,
  size = "md",
  className,
}: {
  entity: IdentityAvatarEntity;
  entityType: TouchlineEntityAvatarProps["entityType"];
  size?: TouchlineEntityAvatarProps["size"];
  className?: string;
}) {
  return (
    <TouchlineEntityAvatar
      entityType={entityType}
      name={entity.name}
      sourceImageUrl={entity.sourceImageUrl ?? entity.imageUrl}
      sourceImageProvider={entity.sourceImageProvider}
      sourceImageLicenseStatus={entity.sourceImageLicenseStatus}
      sourceImageFetchedAt={entity.sourceImageFetchedAt}
      touchlineAvatarUrl={entity.touchlineAvatarUrl}
      avatarRenderStatus={entity.avatarRenderStatus}
      avatarRenderVersion={entity.avatarRenderVersion}
      avatarSourceHash={entity.avatarSourceHash}
      avatarRenderType={entity.avatarRenderType}
      size={size}
      className={className}
    />
  );
}

export function TouchlineClubAvatar(props: { club: IdentityAvatarEntity; size?: TouchlineEntityAvatarProps["size"]; className?: string }) {
  return <TouchlineIdentityAvatar entity={props.club} entityType="club" size={props.size} className={props.className} />;
}

export function TouchlineAgentAvatar(props: { agent: IdentityAvatarEntity; size?: TouchlineEntityAvatarProps["size"]; className?: string }) {
  return <TouchlineIdentityAvatar entity={props.agent} entityType="agent" size={props.size} className={props.className} />;
}

export function TouchlineAgencyAvatar(props: { agency: IdentityAvatarEntity; size?: TouchlineEntityAvatarProps["size"]; className?: string }) {
  return <TouchlineIdentityAvatar entity={props.agency} entityType="agency" size={props.size} className={props.className} />;
}

const officialPlayerCardClip =
  "polygon(50% 0,87.5% 6.2%,97.4% 18%,97.4% 74.8%,86.6% 88.6%,50% 100%,13.4% 88.6%,2.6% 74.8%,2.6% 18%,12.5% 6.2%)";

const officialPlayerCardInnerClip =
  "polygon(50% 2.6%,85.6% 8.3%,94.5% 19.2%,94.5% 73.6%,83.6% 86.5%,50% 96.2%,16.4% 86.5%,5.5% 73.6%,5.5% 19.2%,14.4% 8.3%)";

function TdiePremiumPortrait({
  player,
  tier,
  identity,
}: {
  player: TouchlinePlayerCardModel;
  tier: TouchlineCardTier;
  identity: TdiePlayerIdentity;
}) {
  const theme = tierMeta[tier];
  const generatedArtwork = resolveGeneratedArtworkUrl(player, identity);
  const photo = validImageUrl(player.avatarUrl) ?? validImageUrl(player.photoUrl) ?? validImageUrl(player.tdieImageUrl);

  if (generatedArtwork) {
    return (
      <img
        src={generatedArtwork}
        alt=""
        className="absolute left-1/2 top-[5.7%] z-20 h-[51.5%] w-[86%] -translate-x-1/2 object-contain drop-shadow-[0_34px_78px_rgba(0,0,0,.94)]"
        style={{
          WebkitMaskImage: "linear-gradient(180deg,#000 0 79%,rgba(0,0,0,.86) 88%,transparent 100%)",
          maskImage: "linear-gradient(180deg,#000 0 79%,rgba(0,0,0,.86) 88%,transparent 100%)",
        }}
      />
    );
  }

  if (photo) {
    return (
      <div className="absolute left-1/2 top-[7%] z-20 h-[49.5%] w-[82%] -translate-x-1/2 overflow-hidden">
        <div
          className="touchline-card-stadium-pulse absolute inset-x-[-26%] bottom-[-28%] h-[124%] rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle at 50% 56%, rgba(${theme.rgb},.64), transparent 69%)` }}
        />
        <TouchlineEntityAvatar
          entityType="player"
          name={player.name}
          sourceImageUrl={player.sourceImageUrl ?? player.avatarUrl ?? player.photoUrl ?? player.tdieImageUrl}
          sourceImageProvider={player.sourceImageProvider}
          sourceImageLicenseStatus={player.sourceImageLicenseStatus}
          sourceImageFetchedAt={player.sourceImageFetchedAt}
          touchlineAvatarUrl={player.touchlineAvatarUrl}
          avatarRenderStatus={player.avatarRenderStatus ?? "rendered"}
          avatarRenderVersion={player.avatarRenderVersion}
          avatarSourceHash={player.avatarSourceHash}
          avatarRenderType={player.avatarRenderType ?? "touchline_branded_render"}
          marketValue={player.officialMarketValue ?? player.marketValue}
          tier={tier}
          size="card"
          className="absolute inset-x-[7%] top-[1%] h-[94%] rounded-t-[44%] border-0 bg-transparent shadow-[0_38px_88px_rgba(0,0,0,.9)] [&>img]:left-1/2 [&>img]:top-[3%] [&>img]:h-[48%] [&>img]:w-[46%] [&>img]:-translate-x-1/2 [&>img]:object-contain"
        />
        <div
          className="absolute inset-x-[4%] bottom-[1%] h-px opacity-90"
          style={{ background: `linear-gradient(90deg,transparent,${theme.accent},transparent)` }}
        />
      </div>
    );
  }

  return (
    <div className="absolute left-1/2 top-[7%] z-20 h-[49.5%] w-[82%] -translate-x-1/2 overflow-hidden">
      <div
        className="touchline-card-stadium-pulse absolute inset-x-[-18%] bottom-[-20%] h-[106%] rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle at 50% 42%, rgba(${theme.rgb},.7), transparent 64%)` }}
      />
      <div
        className="absolute inset-x-[-10%] top-[18%] h-[32%] opacity-70"
        style={{
          background: `repeating-radial-gradient(ellipse at center, rgba(${theme.rgb},.34) 0 1px, transparent 2px 18px)`,
          transform: "perspective(520px) rotateX(58deg)",
        }}
      />
      <div
        className="absolute left-1/2 top-[1%] h-[13%] w-[42%] -translate-x-1/2 rounded-[50%] blur-[3px]"
        style={{ background: `radial-gradient(ellipse at center, rgba(${theme.rgb},.82), transparent 68%)` }}
      />
      <div
        className="absolute left-[5%] right-[5%] top-[30%] h-[24%] rounded-[50%] border-t opacity-80"
        style={{ borderColor: `rgba(${theme.rgb},.72)`, boxShadow: `0 -18px 38px rgba(${theme.rgb},.2)` }}
      />
      <div
        className="absolute left-1/2 top-[37%] h-[50%] w-[72%] -translate-x-1/2 bg-[linear-gradient(160deg,rgba(255,232,158,.12),rgba(10,12,13,.97)_26%,rgba(0,0,0,1))]"
        style={{
          clipPath: "polygon(2% 100%,8% 66%,20% 45%,34% 28%,43% 20%,57% 20%,66% 28%,80% 45%,92% 66%,98% 100%)",
          boxShadow: `inset 0 0 0 1px rgba(${theme.rgb},.16),0 -16px 54px rgba(0,0,0,.82),0 0 28px rgba(${theme.rgb},.12)`,
        }}
      />
      <div
        className="absolute left-1/2 top-[34.5%] h-[14%] w-[18%] -translate-x-1/2 bg-[#040606]"
        style={{
          clipPath: "polygon(28% 0,72% 0,80% 100%,20% 100%)",
          boxShadow: `0 0 18px rgba(${theme.rgb},.16)`,
        }}
      />
      <div
        className="absolute left-1/2 top-[8%] h-[34%] w-[31%] -translate-x-1/2 bg-[#020403]"
        style={{
          clipPath: "polygon(11% 18%,18% 8%,31% 3%,42% 6%,50% 2%,58% 6%,69% 3%,82% 8%,89% 18%,90% 52%,78% 83%,61% 100%,39% 100%,22% 83%,10% 52%)",
          boxShadow: `0 0 0 1px rgba(${theme.rgb},.24),0 0 0 2px rgba(255,235,169,.08),0 20px 48px rgba(0,0,0,.96),0 0 40px rgba(${theme.rgb},.34)`,
        }}
      />
      <div className="absolute left-[32%] top-[20.5%] h-[13%] w-[4%] rounded-full bg-[#050606] shadow-[0_0_14px_rgba(255,235,169,.08)]" />
      <div className="absolute right-[32%] top-[20.5%] h-[13%] w-[4%] rounded-full bg-[#050606] shadow-[0_0_14px_rgba(255,235,169,.08)]" />
      <div className="absolute left-1/2 top-[42%] h-px w-[34%] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,235,169,.5),transparent)] opacity-90" />
      <div
        className="absolute inset-x-[4%] bottom-[1%] h-px opacity-90"
        style={{ background: `linear-gradient(90deg,transparent,${theme.accent},transparent)` }}
      />
    </div>
  );
}

function ClubMark({
  player,
  tier,
  size = "sm",
  className,
}: {
  player: TouchlinePlayerCardModel;
  tier: TouchlineCardTier;
  size?: TouchlineEntityAvatarProps["size"];
  className?: string;
}) {
  const theme = tierMeta[tier];
  const badge = cleanText(player.clubBadgeUrl);

  if (badge) {
    return (
      <TouchlineEntityAvatar
        entityType="club"
        name={player.currentClub ?? "Club"}
        sourceImageUrl={badge}
        sourceImageProvider={player.sourceImageProvider ?? "registered_source"}
        sourceImageLicenseStatus="source_tracked"
        avatarRenderStatus="rendered"
        avatarRenderVersion="runtime-css-v1"
        avatarRenderType="touchline_branded_render"
        tier={tier}
        size={size}
        chrome="clean"
        showTierIcon={false}
        className={className}
      />
    );
  }

  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-xl border bg-black/60", size === "md" ? "size-16" : "size-11", className)}
      style={{ borderColor: `rgba(${theme.rgb},.42)`, boxShadow: `0 0 24px rgba(${theme.rgb},.14)` }}
    >
      <Shield className="size-6" style={{ color: theme.accent }} />
    </span>
  );
}

function PositionStrip({ player, tier }: { player: TouchlinePlayerCardModel; tier: TouchlineCardTier }) {
  const theme = tierMeta[tier];
  const nationality = cleanText(player.nationality);
  const flag = countryFlag(nationality);
  const code = nationality ? countryCode(nationality) : null;
  return (
    <div className="absolute left-[8.7%] top-[9.5%] z-30 w-[17%] pb-3">
      <p
        className="font-display text-[clamp(1.08rem,3.8vw,1.75rem)] font-black uppercase leading-[.88]"
        style={{ color: theme.soft, textShadow: `0 0 24px rgba(${theme.rgb},.22)` }}
      >
        {compactPosition(player.position)}
      </p>
      <p className="mt-1 max-w-[4.8rem] truncate text-[.42rem] font-black uppercase tracking-[.14em] text-white/58">
        {longPosition(player.position)}
      </p>
      {nationality ? (
        <>
          <div className="mt-3 h-px w-[78%]" style={{ background: `linear-gradient(90deg,rgba(${theme.rgb},.62),transparent)` }} />
          {flag ? (
            <div className="mt-2 inline-flex min-w-[2.65rem] items-center justify-center rounded-md border border-white/10 bg-black/62 px-2 py-1 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_12px_24px_rgba(0,0,0,.34)]">
              {flag}
            </div>
          ) : null}
          {code ? (
            <p className="mt-1.5 inline-flex min-w-[2.65rem] justify-center rounded-md border border-[rgba(var(--tier-rgb),.32)] bg-black/55 px-2 py-1 text-[.58rem] font-black uppercase tracking-[.08em]" style={{ color: theme.soft }}>
              {code}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function TierBadge({ tier }: { tier: TouchlineCardTier }) {
  const theme = tierMeta[tier];
  const icon = tier === "purple_diamond" ? "◆" : tier === "blue_diamond" ? "◇" : "●";
  return (
    <div className="absolute right-[8%] top-[9%] z-40 flex flex-col items-end gap-2">
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[.58rem] font-black uppercase tracking-[.1em]"
        style={{ background: "rgba(0,0,0,.58)", borderColor: `rgba(${theme.rgb},.55)`, color: theme.soft, boxShadow: `0 0 22px rgba(${theme.rgb},.24), inset 0 1px 0 rgba(255,255,255,.1)` }}
      >
        <span
          className="grid size-3 place-items-center text-[.62rem] leading-none"
          style={{ color: theme.accent, textShadow: `0 0 12px rgba(${theme.rgb},.65)` }}
          aria-hidden="true"
        >
          {icon}
        </span>
        {theme.label}
      </span>
      <span className="relative grid size-9 place-items-center text-[.58rem] font-black uppercase" style={{ color: theme.accent }}>
        <span
          className="absolute inset-0 [clip-path:polygon(50%_0,100%_28%,82%_100%,18%_100%,0_28%)] border"
          style={{ borderColor: theme.accent, boxShadow: `0 0 18px rgba(${theme.rgb},.18)` }}
        />
        TL
      </span>
    </div>
  );
}

function LiveIndicator({ state }: { state?: TouchlineCardLiveState }) {
  const isLive = state && state !== "idle";
  if (!isLive) return null;

  return (
    <span className="absolute right-[7.5%] top-[20.5%] z-40 inline-flex items-center gap-1.5 rounded-full border border-lime-300/25 bg-lime-300/10 px-2 py-1 text-[.55rem] font-black uppercase tracking-[.12em] text-lime-100">
      <span className="size-1.5 animate-pulse rounded-full bg-lime-300" />
      Live
    </span>
  );
}

function BottomData({ player, tier }: { player: TouchlinePlayerCardModel; tier: TouchlineCardTier }) {
  const theme = tierMeta[tier];
  const club = cleanText(player.currentClub);
  const league = cleanText(player.league ?? player.competition);
  const resolvedMarketValue = resolveOfficialMarketValue(player);
  const market = formatOfficialMarketValue(resolvedMarketValue, player.currency ?? "EUR", player.officialMarketValueLabel);
  const hasMarket = Boolean(market);
  const shirt = cleanText(player.shirtNumber);
  const updated = cleanText(player.lastUpdated) ? formatCompactDate(player.lastUpdated) : null;
  const hasUpdated = Boolean(updated);

  return (
    <div className="absolute inset-x-[8%] bottom-[11.4%] z-40">
      <div className="grid grid-cols-[1fr_.72fr] overflow-hidden rounded-[.58rem] border border-[rgba(var(--tier-rgb),.36)] bg-black/84 shadow-[inset_0_1px_0_rgba(255,226,141,.12),0_-14px_38px_rgba(0,0,0,.42)] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5 border-r border-[rgba(var(--tier-rgb),.28)] px-3 py-3">
          <ClubMark player={player} tier={tier} />
          <div className="min-w-0">
            <p className="text-[.5rem] font-black uppercase tracking-[.16em]" style={{ color: theme.soft }}>
              Club
            </p>
            {club ? <p className="mt-1 text-sm font-black uppercase leading-tight text-white">{club}</p> : null}
            {league ? <p className="mt-1 truncate text-[.58rem] font-bold uppercase text-white/55">{league}</p> : null}
          </div>
        </div>
        <div className="px-3 py-3">
          <p className="text-[.5rem] font-black uppercase tracking-[.16em]" style={{ color: theme.soft }}>
            Market Value
          </p>
          {hasMarket ? <p className="mt-1 text-lg font-black text-white">{market}</p> : null}
          {hasUpdated ? <p className="mt-1 truncate text-[.46rem] font-black uppercase tracking-[.1em] text-white/42">Updated {updated}</p> : null}
        </div>
      </div>

      {
        <div
          className="absolute left-1/2 top-[calc(100%-1px)] grid size-12 -translate-x-1/2 place-items-center rounded-b-[.8rem] border border-t-0 bg-black text-lg font-black"
          style={{ borderColor: `rgba(${theme.rgb},.64)`, color: theme.soft, boxShadow: `0 0 24px rgba(${theme.rgb},.2)` }}
        >
          {shirt ?? ""}
        </div>
      }
    </div>
  );
}

function TouchlineLogo({ tier }: { tier: TouchlineCardTier }) {
  const theme = tierMeta[tier];
  return (
    <div className="absolute inset-x-0 bottom-[2.2%] z-50 flex items-center justify-center gap-2">
      <span
        className="grid size-8 place-items-center rounded-md border text-sm font-black"
        style={{ borderColor: `rgba(${theme.rgb},.72)`, color: theme.soft }}
      >
        TL
      </span>
      <div>
        <p className="font-display text-base font-black uppercase leading-none tracking-[.02em]" style={{ color: theme.accent }}>
          Touchline
        </p>
        <p className="text-[.42rem] font-black uppercase tracking-[.42em] text-white/36">Football Platform</p>
      </div>
    </div>
  );
}

function CrystalKohinoorFrame() {
  return null;
}

function OfficialTouchlinePlayerCard({
  player,
  variant,
  className,
}: {
  player: TouchlinePlayerCardModel;
  variant: TouchlinePlayerCardVariant;
  className?: string;
}) {
  const resolvedMarketValue = resolveOfficialMarketValue(player);
  const tier = getTouchlinePlayerCardTier(resolvedMarketValue);
  const theme = tierMeta[tier];
  const identity = resolvePlayerIdentity(player);
  const isCompact = variant === "compact" || variant === "list";
  const nationality = cleanText(player.nationality);
  const flag = countryFlag(nationality);
  const code = nationality ? countryCode(nationality) : null;
  const club = cleanText(player.currentClub);
  const league = cleanText(player.league ?? player.competition);
  const market = formatOfficialMarketValue(resolvedMarketValue, player.currency ?? "EUR", player.officialMarketValueLabel);
  const updated = cleanText(player.lastUpdated) ? formatCompactDate(player.lastUpdated) : null;
  const shirt = cleanText(player.shirtNumber);
  const tierCoin = tier === "purple_diamond" || tier === "blue_diamond" ? "◆" : "●";
  const isCrystalDiamond = tier === "purple_diamond";
  const crystalMaterial = {
    aura:
      "radial-gradient(circle at 50% 7%, rgba(247,216,255,.92), transparent 18%), radial-gradient(circle at 80% 27%, rgba(104,231,255,.34), transparent 31%), radial-gradient(circle at 22% 69%, rgba(214,92,255,.5), transparent 43%), radial-gradient(circle at 50% 91%, rgba(165,49,255,.46), transparent 30%)",
    frame:
      "linear-gradient(136deg,#190026 0%,#4e087d 5%,#f7d8ff 8.5%,#b942ff 12%,#2b0d56 20%,#07030d 38%,#13021f 52%,#4c1bdc 64%,#76ecff 69%,#ff8cff 76%,#f7d8ff 82%,#7f23ee 90%,#190026 100%)",
    interior:
      "radial-gradient(circle at 50% 9%,rgba(247,216,255,.2),transparent 17%),radial-gradient(ellipse at 50% 36%,rgba(214,92,255,.22),transparent 43%),radial-gradient(circle at 76% 28%,rgba(104,231,255,.13),transparent 26%),linear-gradient(180deg,rgba(20,6,30,.08),rgba(10,4,18,.24) 42%,rgba(0,0,0,.9) 76%)",
    facets:
      "linear-gradient(116deg,transparent 0 16%,rgba(247,216,255,.34) 17%,transparent 21% 50%,rgba(214,92,255,.24) 52%,transparent 57%),linear-gradient(34deg,transparent 0 31%,rgba(104,231,255,.18) 33%,transparent 38%),linear-gradient(145deg,transparent 0 42%,rgba(255,114,246,.2) 44%,transparent 48%)",
    edgeLine: "linear-gradient(90deg,transparent,rgba(214,92,255,.72),#f7d8ff,rgba(104,231,255,.58),rgba(214,92,255,.72),transparent)",
    frameFacets:
      "linear-gradient(32deg,transparent 0 9%,rgba(255,255,255,.72) 10%,transparent 13% 83%,rgba(255,255,255,.5) 85%,transparent 88%),linear-gradient(148deg,transparent 0 15%,rgba(104,231,255,.34) 16%,transparent 20% 58%,rgba(255,140,255,.44) 60%,transparent 64%),linear-gradient(90deg,transparent 0 47%,rgba(247,216,255,.36) 50%,transparent 53%)",
  };
  const cardStyle = {
    "--tier": theme.accent,
    "--tier-rgb": theme.rgb,
    "--tier-deep": tier === "purple_diamond" ? "#250036" : tier === "blue_diamond" ? "#031e2b" : tier === "gold" ? "#241501" : tier === "silver" ? "#242a32" : "#4a210b",
    "--tier-soft": tier === "purple_diamond" ? "#f7d8ff" : tier === "blue_diamond" ? "#b9f3ff" : tier === "gold" ? "#ffe081" : tier === "silver" ? "#e4ebf5" : "#ffd3a4",
  } as CSSProperties;

  return (
    <article
      className={cn(
        "touchline-player-card group relative mx-auto isolate aspect-[494/794] w-full overflow-visible",
        isCompact ? "max-w-[330px]" : "max-w-[430px]",
        className,
      )}
      style={cardStyle}
      aria-label={`${player.name} Touchline player card`}
    >
      <div
        className={cn("absolute blur-2xl", isCrystalDiamond ? "inset-[5%] opacity-0" : "inset-[-2.6%] opacity-80")}
        style={{
          clipPath: isCrystalDiamond ? "ellipse(44% 48% at 50% 53%)" : officialPlayerCardClip,
          background: isCrystalDiamond
            ? crystalMaterial.aura
            : `radial-gradient(circle at 50% 18%, rgba(${theme.rgb},.52), transparent 44%), radial-gradient(circle at 50% 86%, rgba(${theme.rgb},.32), transparent 52%)`,
        }}
      />
      <div
        className={cn(
          "absolute overflow-hidden p-[3px]",
          isCrystalDiamond
            ? "bottom-[6.2%] left-[9.6%] right-[9.6%] top-[8.6%] drop-shadow-[0_18px_58px_rgba(0,0,0,.62)]"
            : "inset-0 drop-shadow-[0_34px_90px_rgba(0,0,0,.82)]",
        )}
        style={{
          clipPath: isCrystalDiamond ? "polygon(50% 0,92% 7%,100% 18%,100% 77%,86% 91%,50% 100%,14% 91%,0 77%,0 18%,8% 7%)" : officialPlayerCardClip,
          padding: isCrystalDiamond ? 0 : undefined,
          background: isCrystalDiamond
            ? "transparent"
            : "linear-gradient(136deg,#6d3d05 0%,var(--tier) 7%,#fff0a8 10%,#704108 14%,#090704 25%,#050607 58%,#2d1b04 73%,var(--tier) 84%,#fff0a8 89%,#5b3305 94%,#110902 100%)",
          boxShadow: isCrystalDiamond
            ? "0 0 48px rgba(214,92,255,.3), 0 0 88px rgba(93,33,255,.22)"
            : `0 0 0 1px rgba(${theme.rgb},.58), 0 0 34px rgba(${theme.rgb},.4), inset 0 0 0 1px rgba(255,241,184,.28)`,
        }}
      >
        <div
          className="relative h-full overflow-hidden bg-[#02070b]"
          style={{
            clipPath: isCrystalDiamond
              ? "polygon(50% 4.5%,82% 11.8%,91% 23%,91% 73.8%,79% 87.2%,50% 95.2%,21% 87.2%,9% 73.8%,9% 23%,18% 11.8%)"
              : officialPlayerCardInnerClip,
            boxShadow: `inset 0 0 0 1px rgba(${theme.rgb},.5), inset 0 0 0 2px rgba(255,255,255,.06), inset 0 40px 82px rgba(${theme.rgb},.12), inset 0 -88px 130px rgba(0,0,0,.92)`,
          }}
        >
          {!isCrystalDiamond ? (
            <img
              src="/touchline-card-base-gold.png"
              alt=""
              className="absolute inset-[-8%] h-[116%] w-[116%] object-cover opacity-30 blur-[10px] saturate-125"
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              background: isCrystalDiamond
                ? crystalMaterial.interior
                : "radial-gradient(circle_at_50%_9%,rgba(255,236,169,.20),transparent_16%),radial-gradient(ellipse_at_50%_36%,rgba(244,190,67,.22),transparent_38%),linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.2)_42%,rgba(0,0,0,.9)_76%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-[.34]"
            style={{
              backgroundImage: isCrystalDiamond
                ? crystalMaterial.facets
                : "linear-gradient(116deg,transparent 0 22%,rgba(255,224,129,.2) 23%,transparent 25% 56%,rgba(255,224,129,.16) 58%,transparent 60%),linear-gradient(25deg,transparent 0 38%,rgba(255,224,129,.16) 39%,transparent 41%)",
            }}
          />
          {isCrystalDiamond ? (
            <div className="pointer-events-none absolute inset-[4.5%] opacity-65 [background-image:linear-gradient(54deg,transparent_0_45%,rgba(247,216,255,.46)_47%,transparent_51%),linear-gradient(128deg,transparent_0_38%,rgba(104,231,255,.24)_41%,transparent_45%),linear-gradient(22deg,transparent_0_58%,rgba(255,114,246,.22)_60%,transparent_64%),radial-gradient(circle_at_68%_10%,rgba(255,255,255,.78)_0_1px,transparent_3px),radial-gradient(circle_at_18%_72%,rgba(214,92,255,.76)_0_1px,transparent_3px)]" />
          ) : null}
          <div className="absolute inset-0 opacity-[.18] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.7)_1px,transparent_0)] [background-size:18px_18px]" />
          <div className="absolute left-[8%] right-[8%] top-[34%] h-[1px] opacity-80" style={{ background: isCrystalDiamond ? crystalMaterial.edgeLine : "linear-gradient(90deg,transparent,var(--tier),white,var(--tier),transparent)" }} />
          <div className="absolute left-[8%] right-[8%] top-[56.2%] h-[1px] opacity-90" style={{ background: isCrystalDiamond ? crystalMaterial.edgeLine : "linear-gradient(90deg,transparent,var(--tier),white,var(--tier),transparent)" }} />
          <div className="absolute left-[8%] right-[8%] top-[69.5%] h-[1px] opacity-90" style={{ background: isCrystalDiamond ? crystalMaterial.edgeLine : "linear-gradient(90deg,transparent,var(--tier),white,var(--tier),transparent)" }} />
          <div className="absolute bottom-[12.5%] left-[8%] right-[8%] h-[1px] opacity-80" style={{ background: isCrystalDiamond ? crystalMaterial.edgeLine : "linear-gradient(90deg,transparent,var(--tier),white,var(--tier),transparent)" }} />
          <div className="absolute bottom-[12.5%] left-1/2 h-[15%] w-px -translate-x-1/2 bg-[linear-gradient(180deg,var(--tier),transparent)] opacity-80" />
        </div>
        {isCrystalDiamond ? <CrystalKohinoorFrame /> : null}
      </div>

      {isCrystalDiamond ? (
        <img
          src="/touchline-assets/touchline-purple-crystal-border-only.png"
          alt=""
          className="pointer-events-none absolute bottom-0 left-[-6.5%] right-[-6.5%] top-0 z-[25] h-full w-[113%] object-fill drop-shadow-[0_0_18px_rgba(214,92,255,.34)]"
        />
      ) : null}

      <TdiePremiumPortrait player={player} tier={tier} identity={identity} />

      <div className="absolute left-[11.4%] top-[14.8%] z-30 flex w-[18%] flex-col items-center text-center">
        {shirt ? (
          <p className="font-display text-[clamp(1.55rem,4.9vw,2.42rem)] font-black uppercase leading-none text-[#ffd35c] drop-shadow-[0_2px_8px_rgba(0,0,0,.9)]">
            {shirt}
          </p>
        ) : null}
        <p className="mt-0.5 text-[.46rem] font-black uppercase leading-tight tracking-[.06em] text-white/84">{longPosition(player.position)}</p>
      </div>

      <div className="absolute left-[11.4%] top-[25.6%] z-30 flex w-[18%] flex-col items-center text-center">
        <div className="grid h-8 w-14 place-items-center text-[2.08rem] leading-none drop-shadow-[0_0_12px_rgba(0,0,0,.85)]">
          {flag ?? ""}
        </div>
        <div className="grid h-5 place-items-center text-base font-black uppercase leading-none tracking-[.08em] text-white drop-shadow-[0_0_12px_rgba(0,0,0,.92)]">
          {code ?? ""}
        </div>
      </div>

      <div
        className="absolute inset-x-[8%] top-[55.8%] z-30 px-4 py-3 text-center"
      >
        <h3
          className="font-display text-[clamp(1.48rem,5vw,2.5rem)] font-black uppercase leading-none tracking-[.02em] drop-shadow-[0_2px_0_rgba(0,0,0,.9)]"
          style={{
            color: isCrystalDiamond ? "#f1d5ff" : "#ffd35c",
            textShadow: isCrystalDiamond ? "0 0 18px rgba(184,92,255,.72),0 0 34px rgba(122,43,224,.48)" : "0 0 18px rgba(244,190,67,.36)",
          }}
        >
          {displayName(player.name)}
        </h3>
      </div>

      <div className="absolute left-[16.5%] top-[69.2%] z-30 flex w-[24%] flex-col items-center justify-center overflow-hidden text-center">
        <ClubMark player={player} tier={tier} size="md" className="shadow-none drop-shadow-[0_0_6px_rgba(var(--tier-rgb),.28)]" />
        {league ? <p className="mt-1.5 max-w-full text-center text-[.46rem] font-bold uppercase leading-tight tracking-[.04em] text-white/68">{league}</p> : null}
      </div>

      <div className="absolute left-[58%] top-[69.8%] z-30 w-[26%] -translate-x-1/2 px-1 text-center">
        <p className="text-[.58rem] font-black uppercase tracking-[.06em] text-[#f4be43]">Market Value</p>
        {market ? <p className="mt-1 text-[clamp(.9rem,3.35vw,1.32rem)] font-black leading-none text-white">{market}</p> : null}
        {updated ? <p className="mt-1 text-[.4rem] font-black uppercase leading-tight tracking-[.08em] text-white/70">Updated {updated}</p> : null}
      </div>

    </article>
  );

  return (
    <article
      className={cn(
        "touchline-player-card group relative mx-auto isolate aspect-[.69/1] w-full overflow-visible",
        isCompact ? "max-w-[330px]" : "max-w-[430px]",
        className,
      )}
      style={cardStyle}
      aria-label={`${player.name} Touchline player card`}
    >
      <div
        className="pointer-events-none absolute inset-[-7%] blur-2xl"
        style={{
          clipPath: officialPlayerCardClip,
          background: `radial-gradient(circle at 50% 45%, rgba(${theme.rgb},.42), transparent 65%), radial-gradient(circle at 50% 86%, rgba(${theme.rgb},.2), transparent 58%)`,
        }}
      />
      <div
        className="absolute inset-0 overflow-hidden p-[3px]"
        style={{
          clipPath: officialPlayerCardClip,
          background:
            "linear-gradient(138deg, #3a2303 0%, var(--tier) 7%, #fff0a8 11%, var(--tier-deep) 22%, #050608 42%, var(--tier-deep) 63%, var(--tier) 83%, #4b2d04 91%, #140b01 100%)",
          boxShadow: `0 0 0 1px rgba(${theme.rgb},.5), 0 0 42px rgba(${theme.rgb},.32), 0 34px 90px rgba(0,0,0,.88)`,
        }}
      >
        <div className="touchline-card-border-sweep pointer-events-none absolute inset-[-22%] z-10 bg-[linear-gradient(112deg,transparent_28%,rgba(255,226,141,.62)_42%,transparent_57%)] opacity-25" />
        <div
          className="relative h-full overflow-hidden bg-[#020405]"
          style={{
            clipPath: officialPlayerCardInnerClip,
            boxShadow: `inset 0 0 0 1px rgba(${theme.rgb},.42), inset 0 0 0 2px rgba(255,255,255,.06), inset 0 42px 96px rgba(${theme.rgb},.12), inset 0 -96px 128px rgba(0,0,0,.9)`,
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_57%_20%,rgba(var(--tier-rgb),.28),transparent_34%),radial-gradient(circle_at_50%_39%,rgba(255,210,94,.08),transparent_39%),linear-gradient(135deg,rgba(255,210,94,.08),transparent_22%,rgba(var(--tier-rgb),.1)_48%,transparent_62%)]" />
          <div className="touchline-card-stadium-pulse absolute inset-x-[6%] top-[4%] h-[45%] rounded-full bg-[radial-gradient(circle,rgba(var(--tier-rgb),.34),transparent_66%)] blur-2xl" />
          <div className="absolute inset-0 opacity-[.38] [background-image:linear-gradient(116deg,transparent_0_22%,rgba(255,224,129,.18)_23%,transparent_25%_56%,rgba(var(--tier-rgb),.26)_58%,transparent_60%),linear-gradient(25deg,transparent_0_38%,rgba(255,224,129,.12)_39%,transparent_41%),radial-gradient(circle_at_76%_26%,rgba(255,230,150,.42)_0_1px,transparent_2px),radial-gradient(circle_at_18%_36%,rgba(255,230,150,.34)_0_1px,transparent_2px)]" />
          <div className="touchline-card-surface-sweep pointer-events-none absolute inset-[-18%] z-10 bg-[linear-gradient(116deg,transparent_30%,rgba(255,224,129,.13)_44%,rgba(var(--tier-rgb),.15)_48%,transparent_60%)] opacity-55" />
          <div className="absolute inset-0 opacity-[.13] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,230,150,.32)_1px,transparent_0)] [background-size:18px_18px]" />
          <div className="absolute inset-x-[4.8%] top-[3.8%] h-[2px] rounded-full bg-[linear-gradient(90deg,transparent,var(--tier),#fff0a8,var(--tier),transparent)] opacity-95 shadow-[0_0_26px_rgba(var(--tier-rgb),.85)]" />
          <div className="absolute -left-1 top-[8%] h-[74%] w-[11px] rounded-full bg-[linear-gradient(180deg,transparent,var(--tier),transparent)] opacity-78 blur-[1px]" />
          <div className="absolute -right-1 top-[8%] h-[74%] w-[11px] rounded-full bg-[linear-gradient(180deg,transparent,var(--tier),transparent)] opacity-78 blur-[1px]" />
          <div className="absolute left-[30%] top-[6%] h-[46%] w-[42%] rounded-full bg-black/18" />

          <PositionStrip player={player} tier={tier} />
          <TierBadge tier={tier} />
          <LiveIndicator state={player.liveState} />
          <TdiePremiumPortrait player={player} tier={tier} identity={identity} />

          <div className="absolute inset-x-[8%] top-[54.5%] z-40 border-y border-[rgba(var(--tier-rgb),.58)] bg-black/88 px-4 py-3 text-center shadow-[0_-14px_34px_rgba(0,0,0,.5),0_14px_34px_rgba(0,0,0,.5)] backdrop-blur-md">
            <h3
              className="truncate font-display text-[clamp(1.62rem,5.2vw,2.9rem)] font-black uppercase leading-[.9] tracking-[.03em] drop-shadow-[0_2px_0_rgba(0,0,0,.75)]"
              style={{ color: theme.soft, textShadow: `0 0 24px rgba(${theme.rgb},.3)` }}
            >
              {displayName(player.name)}
            </h3>
          </div>

          <BottomData player={player} tier={tier} />
          <TouchlineLogo tier={tier} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-[2rem] opacity-0 transition duration-300 group-hover:opacity-100">
        <div className="touchline-card-hover-sheen absolute inset-0 bg-[linear-gradient(115deg,transparent_20%,rgba(255,255,255,.22)_45%,transparent_62%)] blur-sm" />
      </div>
      <style>{`
        .touchline-card-border-sweep {
          animation: touchline-card-border-sweep 6.8s ease-in-out infinite;
          transform: translateX(-42%) rotate(10deg);
        }
        .touchline-card-surface-sweep {
          animation: touchline-card-surface-sweep 7.4s ease-in-out infinite;
          transform: translateX(-36%);
        }
        .touchline-card-stadium-pulse {
          animation: touchline-card-stadium-pulse 5.8s ease-in-out infinite;
        }
        .touchline-card-hover-sheen {
          animation: touchline-card-surface-sweep 4s ease-in-out infinite;
        }
        @keyframes touchline-card-border-sweep {
          0%, 30% { transform: translateX(-54%) rotate(10deg); opacity: .08; }
          48% { opacity: .48; }
          72%, 100% { transform: translateX(54%) rotate(10deg); opacity: .1; }
        }
        @keyframes touchline-card-surface-sweep {
          0%, 34% { transform: translateX(-44%); opacity: .04; }
          52% { opacity: .72; }
          78%, 100% { transform: translateX(44%); opacity: .05; }
        }
        @keyframes touchline-card-stadium-pulse {
          0%, 100% { opacity: .68; filter: saturate(1); }
          50% { opacity: 1; filter: saturate(1.24); }
        }
      `}</style>
    </article>
  );
}

function PlayerCardInner({ player, variant, className }: { player: TouchlinePlayerCardModel; variant: TouchlinePlayerCardVariant; className?: string }) {
  if (variant === "list") return <TouchlinePlayerListCard player={player} className={className} />;
  return <OfficialTouchlinePlayerCard player={player} variant={variant} className={className} />;
}

export function TouchlinePlayerCard({
  player,
  variant = "compact",
  className,
}: {
  player: TouchlinePlayerCardModel;
  variant?: TouchlinePlayerCardVariant;
  className?: string;
}) {
  const inner = <PlayerCardInner player={player} variant={variant} className={className} />;
  if (!player.href) return inner;
  return (
    <Link href={player.href} className="block">
      {inner}
    </Link>
  );
}

function TouchlinePlayerListCard({
  player,
  className,
}: {
  player: TouchlinePlayerCardModel;
  className?: string;
}) {
  const market = formatOfficialMarketValue(player.officialMarketValue ?? player.marketValue, player.currency ?? "EUR", player.officialMarketValueLabel);
  const position = cleanText(player.position) ?? "Role pending";
  const club = cleanText(player.currentClub) ?? "Club pending";
  const nationality = cleanText(player.nationality);
  const status = cleanText(player.statusLabel ?? player.syncStatus) ?? "Touchline synced";

  return (
    <article
      className={cn(
        "group relative flex h-full min-w-0 gap-3 overflow-hidden rounded-3xl border border-white/10 bg-white/[.04] p-3 text-white transition duration-300 hover:border-cyan-300/30 hover:bg-cyan-300/[.055]",
        className,
      )}
      aria-label={`${player.name} Touchline player result`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,.12),transparent_32%),linear-gradient(115deg,transparent,rgba(255,255,255,.045),transparent)]" />
      <TouchlinePlayerAvatar player={player} size="md" className="relative z-10" />
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black uppercase italic tracking-[-.04em] text-white">{player.name}</h3>
            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {position} · {club}{nationality ? ` · ${nationality}` : ""}
            </p>
          </div>
          {player.fantasyAsset ? (
            <span className="shrink-0 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-2.5 py-1 text-[7px] font-black uppercase tracking-[.12em] text-[#caff72]">
              Fantasy Asset
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-2xl border border-amber-300/15 bg-amber-300/[.055] px-3 py-2">
            <p className="text-[7px] font-black uppercase tracking-[.14em] text-amber-200/70">Value</p>
            <p className="mt-0.5 truncate text-xs font-black text-amber-100">{market}</p>
          </div>
          <div className="min-w-0 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.055] px-3 py-2">
            <p className="text-[7px] font-black uppercase tracking-[.14em] text-cyan-200/70">Status</p>
            <p className="mt-0.5 truncate text-xs font-black text-cyan-100">{status}</p>
          </div>
        </div>
        {(player.ovr || player.potential) ? (
          <p className="mt-2 truncate text-[8px] font-black uppercase tracking-[.14em] text-slate-500">
            {player.ovr ? `OVR ${player.ovr}` : ""}{player.ovr && player.potential ? " · " : ""}{player.potential ? `POT ${player.potential}` : ""}
          </p>
        ) : null}
      </div>
      <ArrowRight className="relative z-10 mt-1 size-4 shrink-0 text-white/35 transition group-hover:text-cyan-200" />
    </article>
  );
}

export function TouchlinePlayerGrid({
  players,
  variant = "compact",
  className,
  cardClassName,
}: {
  players: TouchlinePlayerCardModel[];
  variant?: TouchlinePlayerCardVariant;
  className?: string;
  cardClassName?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {players.map((player) => (
        <TouchlinePlayerCard key={player.id ?? player.name} player={player} variant={variant} className={cardClassName} />
      ))}
    </div>
  );
}

const entityMeta: Record<
  TouchlineIdentityEntityType,
  {
    label: string;
    icon: typeof Building2;
    accent: string;
    glow: string;
    badge: string;
  }
> = {
  club: {
    label: "Club",
    icon: Building2,
    accent: "text-cyan-200",
    glow: "shadow-[0_0_30px_rgba(34,211,238,.12)]",
    badge: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  },
  agent: {
    label: "Agent",
    icon: UserRoundCheck,
    accent: "text-lime-200",
    glow: "shadow-[0_0_30px_rgba(163,230,53,.12)]",
    badge: "border-lime-300/25 bg-lime-300/10 text-lime-100",
  },
  agency: {
    label: "Agency",
    icon: UsersRound,
    accent: "text-lime-200",
    glow: "shadow-[0_0_30px_rgba(163,230,53,.12)]",
    badge: "border-lime-300/25 bg-lime-300/10 text-lime-100",
  },
  coach: {
    label: "Coach",
    icon: Trophy,
    accent: "text-amber-200",
    glow: "shadow-[0_0_30px_rgba(251,191,36,.12)]",
    badge: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  },
  scout: {
    label: "Scout",
    icon: Sparkles,
    accent: "text-cyan-200",
    glow: "shadow-[0_0_30px_rgba(34,211,238,.12)]",
    badge: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  },
  academy: {
    label: "Academy",
    icon: Star,
    accent: "text-violet-200",
    glow: "shadow-[0_0_30px_rgba(196,181,253,.12)]",
    badge: "border-violet-300/25 bg-violet-300/10 text-violet-100",
  },
  investor: {
    label: "Investor",
    icon: Shield,
    accent: "text-emerald-200",
    glow: "shadow-[0_0_30px_rgba(52,211,153,.12)]",
    badge: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  },
};

function TouchlineIdentityArtwork({ entity }: { entity: TouchlineIdentityCardModel }) {
  const entityType = entity.type === "club" || entity.type === "agent" || entity.type === "agency" ? entity.type : "agency";
  return <TouchlineIdentityAvatar entity={entity} entityType={entityType} size="lg" />;
}

export function TouchlineIdentityCard({
  entity,
  className,
}: {
  entity: TouchlineIdentityCardModel;
  className?: string;
}) {
  const meta = entityMeta[entity.type];
  const Icon = meta.icon;
  const content = (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[.045] p-4 text-white transition duration-300 hover:border-cyan-300/35 hover:bg-cyan-300/[.055]",
        meta.glow,
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(117,232,255,.12),transparent_32%),linear-gradient(115deg,transparent,rgba(255,255,255,.055),transparent)] opacity-70" />
      <div className="relative z-10 flex gap-4">
        <TouchlineIdentityArtwork entity={entity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[.14em]", meta.badge)}>
              {meta.label}
            </span>
            {entity.transfermarktId ? (
              <span className="rounded-full border border-[#9cff2e]/25 bg-[#9cff2e]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-[#d8ff9a]">
                TM ID {entity.transfermarktId}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 line-clamp-2 font-display text-2xl font-black uppercase italic tracking-[-.06em] text-white">{entity.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs font-black uppercase tracking-[.1em] text-white/55">
            {cleanText(entity.subtitle) ?? cleanText(entity.league) ?? cleanText(entity.country) ?? "Touchline identity"}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {entity.metricLabel || entity.metricValue ? (
              <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/35">{entity.metricLabel ?? "Metric"}</p>
                <p className="mt-1 text-lg font-black text-white">{entity.metricValue ?? "Pending"}</p>
              </div>
            ) : null}
            {entity.secondaryMetricLabel || entity.secondaryMetricValue ? (
              <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/35">{entity.secondaryMetricLabel ?? "Metric"}</p>
                <p className="mt-1 text-lg font-black text-white">{entity.secondaryMetricValue ?? "Pending"}</p>
              </div>
            ) : null}
          </div>
        </div>
        <Icon className={cn("mt-2 size-5 shrink-0 opacity-70", meta.accent)} />
      </div>

      {entity.linkedPlayers?.length ? (
        <div className="relative z-10 mt-5 grid gap-2 sm:grid-cols-2">
          {entity.linkedPlayers.slice(0, 10).map((player) => {
            const playerContent = (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/35 p-3 transition hover:border-cyan-300/30">
                <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#f6c84c]/20 bg-[radial-gradient(circle_at_50%_0%,rgba(246,200,76,.24),rgba(8,10,14,.88)_58%,rgba(0,0,0,.95))]">
                  <span className="absolute inset-x-2 bottom-1.5 h-6 rounded-t-full bg-[linear-gradient(180deg,rgba(255,232,154,.22),rgba(255,255,255,.06))]" />
                  <span className="absolute left-1/2 top-2 size-4 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_50%_18%,rgba(255,232,154,.42),rgba(13,16,20,.92)_70%)] shadow-[0_0_18px_rgba(246,200,76,.25)]" />
                  <span className="absolute inset-0 bg-[linear-gradient(118deg,transparent_24%,rgba(255,255,255,.12)_42%,transparent_58%)] opacity-25" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black uppercase italic text-white">{player.name ?? "Linked player"}</p>
                  <p className="truncate text-[10px] font-black uppercase tracking-[.12em] text-white/42">
                    {player.transfermarktId ? `TM ID ${player.transfermarktId}` : "Touchline profile"}
                    {player.status ? ` · ${player.status}` : ""}
                  </p>
                </div>
                <ArrowRight className="size-4 text-white/35" />
              </div>
            );
            return player.href ? (
              <Link key={player.id ?? player.name} href={player.href} className="block">
                {playerContent}
              </Link>
            ) : (
              <div key={player.id ?? player.name}>{playerContent}</div>
            );
          })}
        </div>
      ) : null}

      {entity.externalHref ? (
        <a
          href={entity.externalHref}
          target="_blank"
          rel="noreferrer"
          className="relative z-10 mt-4 inline-flex items-center gap-2 rounded-full border border-[#9cff2e]/25 bg-[#9cff2e]/10 px-4 py-2 text-xs font-black uppercase tracking-[.14em] text-[#d8ff9a]"
        >
          External reference
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </article>
  );

  if (!entity.href) return content;
  return (
    <Link href={entity.href} className="block">
      {content}
    </Link>
  );
}

export function TouchlineClubIdentityCard(props: Omit<Parameters<typeof TouchlineIdentityCard>[0], "entity"> & { entity: Omit<TouchlineIdentityCardModel, "type"> }) {
  return <TouchlineIdentityCard {...props} entity={{ ...props.entity, type: "club" }} />;
}

export function TouchlineAgentIdentityCard(props: Omit<Parameters<typeof TouchlineIdentityCard>[0], "entity"> & { entity: Omit<TouchlineIdentityCardModel, "type"> }) {
  return <TouchlineIdentityCard {...props} entity={{ ...props.entity, type: "agent" }} />;
}

export function TouchlineCoachIdentityCard(props: Omit<Parameters<typeof TouchlineIdentityCard>[0], "entity"> & { entity: Omit<TouchlineIdentityCardModel, "type"> }) {
  return <TouchlineIdentityCard {...props} entity={{ ...props.entity, type: "coach" }} />;
}
