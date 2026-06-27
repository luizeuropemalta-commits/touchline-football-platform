import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  ExternalLink,
  HeartPulse,
  Shield,
  Sparkles,
  Star,
  Trophy,
  UserRoundCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import { buildTdiePlayerIdentity, type TdiePlayerIdentity } from "@/lib/tdie/player-identity";
import { cn } from "@/lib/utils";

export type TouchlineCardTier = "bronze" | "silver" | "gold";

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
  initials?: string;
  tdieIdentity?: TdiePlayerIdentity | null;
  tdieImageUrl?: string | null;
  nationality?: string | null;
  position?: string | null;
  age?: number | null;
  currentClub?: string | null;
  currentCoach?: string | null;
  currentAgent?: string | null;
  officialMarketValue?: number | null;
  officialMarketValueLabel?: string | null;
  currency?: string | null;
  contractStatus?: string | null;
  currentForm?: string | number | null;
  availability?: string | null;
  competition?: string | null;
  league?: string | null;
  href?: string;
  externalHref?: string;
  liveState?: TouchlineCardLiveState;
  livePoints?: string | number | null;
  context?: TouchlinePlayerCardContext;
};

type TouchlinePlayerCardVariant = "showcase" | "compact" | "list";

export type TouchlineIdentityEntityType = "club" | "agent" | "agency" | "coach" | "scout" | "academy" | "investor";

export type TouchlineIdentityCardModel = {
  id?: string;
  type: TouchlineIdentityEntityType;
  name: string;
  initials?: string;
  imageUrl?: string | null;
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

const tierMeta: Record<TouchlineCardTier, { label: string; border: string; glow: string; text: string; chip: string }> = {
  bronze: {
    label: "Bronze",
    border: "from-orange-800/55 via-amber-200/60 to-orange-950/55",
    glow: "shadow-[0_0_34px_rgba(251,146,60,.18)]",
    text: "text-orange-200",
    chip: "border-orange-300/25 bg-orange-300/[.08] text-orange-200",
  },
  silver: {
    label: "Silver",
    border: "from-slate-500/55 via-white/80 to-slate-800/55",
    glow: "shadow-[0_0_34px_rgba(226,232,240,.18)]",
    text: "text-slate-100",
    chip: "border-slate-200/25 bg-slate-200/[.08] text-slate-100",
  },
  gold: {
    label: "Gold",
    border: "from-amber-700/55 via-yellow-200/90 to-amber-950/55",
    glow: "shadow-[0_0_42px_rgba(251,191,36,.24)]",
    text: "text-amber-200",
    chip: "border-amber-300/35 bg-amber-300/[.1] text-amber-200",
  },
};

const DATA_NOT_AVAILABLE = "Data not available";

function dataLabel(value?: string | number | null, fallback = DATA_NOT_AVAILABLE) {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : fallback;
  }
  return fallback;
}

function cardStatusLabel(value?: string | number | null, fallback = DATA_NOT_AVAILABLE) {
  const label = dataLabel(value, fallback);
  const normalized = label.toLowerCase();

  if (normalized === "sync" || normalized === "live sync") return "Pending";
  if (normalized === "no injury synced") return fallback;
  if (normalized.includes("pending official data sync")) return "Pending";
  if (normalized.includes("sync pending")) return "Pending";

  return label;
}

function compactDataLabel(value?: string | number | null, fallback = "Not available") {
  const label = cardStatusLabel(value, fallback);
  if (label === DATA_NOT_AVAILABLE) return fallback;
  return label;
}

function cleanVisualLabel(value?: string | number | null, fallback = "Touchline") {
  const label = cardStatusLabel(value, fallback);
  const normalized = label.toLowerCase();

  if (
    label === DATA_NOT_AVAILABLE ||
    normalized.includes("unavailable") ||
    normalized.includes("not available") ||
    normalized.includes("official data pending") ||
    normalized.includes("data pending")
  ) {
    return fallback;
  }

  return label;
}

function marketVisualLabel(value?: string | number | null) {
  const label = dataLabel(value, "Value pending");
  const normalized = label.toLowerCase();

  if (
    normalized === "open" ||
    normalized === "value open" ||
    normalized.includes("data not available") ||
    normalized.includes("not available") ||
    normalized.includes("pending")
  ) {
    return "Value pending";
  }

  return label;
}

const liveStateMeta: Record<TouchlineCardLiveState, { label: string; icon: typeof Activity; className: string }> = {
  idle: { label: "Match ready", icon: Sparkles, className: "border-cyan-300/20 bg-cyan-300/[.06] text-cyan-200" },
  live_match: { label: "Live match", icon: Activity, className: "border-[#a3ff12]/25 bg-[#a3ff12]/[.08] text-[#b7ff45]" },
  goal: { label: "Goal", icon: Trophy, className: "border-[#a3ff12]/35 bg-[#a3ff12]/[.12] text-[#b7ff45]" },
  assist: { label: "Assist", icon: Zap, className: "border-cyan-300/30 bg-cyan-300/[.1] text-cyan-200" },
  yellow_card: { label: "Yellow card", icon: AlertTriangle, className: "border-amber-300/35 bg-amber-300/[.12] text-amber-200" },
  red_card: { label: "Red card", icon: AlertTriangle, className: "border-rose-400/35 bg-rose-400/[.12] text-rose-200" },
  substitution: { label: "Entered match", icon: Activity, className: "border-blue-300/30 bg-blue-300/[.1] text-blue-200" },
  injury: { label: "Injury alert", icon: HeartPulse, className: "border-rose-300/30 bg-rose-300/[.1] text-rose-200" },
  suspension: { label: "Suspended", icon: Shield, className: "border-orange-300/30 bg-orange-300/[.1] text-orange-200" },
  clean_sheet: { label: "Clean sheet", icon: Shield, className: "border-cyan-300/30 bg-cyan-300/[.1] text-cyan-200" },
  player_of_the_match: { label: "POTM", icon: Star, className: "border-amber-300/35 bg-amber-300/[.12] text-amber-200" },
};

function CardEngineLivePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.15em] text-[#b7ff45]">
      <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" />
      {children}
    </span>
  );
}

function CardEngineMeter({ value, color = "cyan" }: { value: number; color?: "cyan" | "lime" | "gold" }) {
  const colors = {
    cyan: "from-blue-500 to-cyan-300 shadow-[0_0_8px_rgba(34,211,238,.45)]",
    lime: "from-emerald-500 to-[#a3ff12] shadow-[0_0_8px_rgba(163,255,18,.4)]",
    gold: "from-amber-600 to-amber-300",
  };

  return (
    <div className="h-1 overflow-hidden rounded-full bg-white/[.07]">
      <div
        className={cn(
          "relative h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out after:absolute after:right-0 after:top-1/2 after:size-1 after:-translate-y-1/2 after:rounded-full after:bg-white after:shadow-[0_0_7px_white]",
          colors[color],
        )}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function identityInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function resolvePlayerIdentity(player: TouchlinePlayerCardModel): TdiePlayerIdentity {
  return player.tdieIdentity ?? buildTdiePlayerIdentity({
    playerSource: player.context ?? "touchline-card-engine",
    playerSourceId: player.id ?? player.name,
    provider: "touchline",
    providerPlayerId: player.id ?? null,
    name: player.name,
    clubName: player.currentClub,
    position: player.position,
    nationality: player.nationality,
    marketValue: player.officialMarketValue,
    currency: player.currency ?? "EUR",
  });
}

function resolveTdieArtworkUrl(player: TouchlinePlayerCardModel, identity = resolvePlayerIdentity(player)) {
  if (identity.renderMode !== "generated_artwork") return null;
  return identity.artworkUrl ?? player.tdieImageUrl ?? null;
}

function entityMeta(type: TouchlineIdentityEntityType) {
  const map = {
    club: {
      label: "Club identity",
      icon: Building2,
      chip: "border-[#a3ff12]/25 bg-[#a3ff12]/[.08] text-[#caff72]",
      glow: "shadow-[0_0_34px_rgba(163,255,18,.16)]",
      fallback: "Premium Club Identity Coming Soon",
    },
    agent: {
      label: "Agent identity",
      icon: UserRoundCheck,
      chip: "border-cyan-300/25 bg-cyan-300/[.08] text-cyan-100",
      glow: "shadow-[0_0_34px_rgba(34,211,238,.14)]",
      fallback: "TDIE Executive Identity",
    },
    agency: {
      label: "Agency identity",
      icon: UsersRound,
      chip: "border-cyan-300/25 bg-cyan-300/[.08] text-cyan-100",
      glow: "shadow-[0_0_34px_rgba(34,211,238,.14)]",
      fallback: "TDIE Agency Identity",
    },
    coach: {
      label: "Coach identity",
      icon: Trophy,
      chip: "border-amber-300/25 bg-amber-300/[.08] text-amber-100",
      glow: "shadow-[0_0_34px_rgba(251,191,36,.14)]",
      fallback: "Premium Coach Identity Coming Soon",
    },
    scout: {
      label: "Scout identity",
      icon: Shield,
      chip: "border-cyan-300/25 bg-cyan-300/[.08] text-cyan-100",
      glow: "shadow-[0_0_34px_rgba(34,211,238,.12)]",
      fallback: "Premium Scout Identity Coming Soon",
    },
    academy: {
      label: "Academy identity",
      icon: Star,
      chip: "border-[#a3ff12]/25 bg-[#a3ff12]/[.08] text-[#caff72]",
      glow: "shadow-[0_0_34px_rgba(163,255,18,.13)]",
      fallback: "Premium Academy Identity Coming Soon",
    },
    investor: {
      label: "Investor identity",
      icon: Sparkles,
      chip: "border-amber-300/25 bg-amber-300/[.08] text-amber-100",
      glow: "shadow-[0_0_34px_rgba(251,191,36,.13)]",
      fallback: "Premium Investor Identity Coming Soon",
    },
  };
  return map[type];
}

export function TouchlineIdentityArtwork({
  entity,
  className,
}: {
  entity: TouchlineIdentityCardModel;
  className?: string;
}) {
  const meta = entityMeta(entity.type);
  const Icon = meta.icon;
  const initials = entity.initials ?? identityInitials(entity.name);

  return (
    <div className={cn("relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[.055]", className)}>
      {entity.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entity.imageUrl} alt={entity.name} className="h-full w-full object-contain p-1.5 saturate-[1.04] contrast-[1.05]" />
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_30%,rgba(34,211,238,.22),transparent_58%),linear-gradient(145deg,rgba(163,255,18,.10),transparent)]" />
          <Icon size={18} className="absolute right-2 top-2 text-cyan-200/55" />
          <span className="relative font-display text-xl font-black italic text-cyan-100">{initials}</span>
        </>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,.16)_46%,transparent_58%)] opacity-45" />
    </div>
  );
}

export function getTouchlinePlayerCardTier(officialMarketValue?: number | null): TouchlineCardTier {
  if (typeof officialMarketValue === "number" && officialMarketValue >= 50_000_000) return "gold";
  if (typeof officialMarketValue === "number" && officialMarketValue >= 5_000_000) return "silver";
  return "bronze";
}

export function formatOfficialMarketValue(officialMarketValue?: number | null, currency = "EUR", fallback?: string | null) {
  if (typeof officialMarketValue !== "number") return fallback ?? DATA_NOT_AVAILABLE;

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(officialMarketValue);
}

function IdentityArtwork({ player, tier, compact = false }: { player: TouchlinePlayerCardModel; tier: TouchlineCardTier; compact?: boolean }) {
  const identity = resolvePlayerIdentity(player);
  const artworkUrl = resolveTdieArtworkUrl(player, identity);
  const initials = identity.initials || player.initials || player.name.slice(0, 2).toUpperCase();
  const identityLabel = identity.status === "generated" ? "Touchline identity" : "Touchline card";
  const positionLabel = cleanVisualLabel(player.position ?? identity.positionLabel, "Role pending");
  const clubLabel = cleanVisualLabel(player.currentClub ?? identity.clubLabel, "Club pending");
  const nationLabel = cleanVisualLabel(player.nationality, "Nation pending");
  const tierStyle = tierMeta[tier];

  return (
    <div className={cn("tdie-identity-stage pitch-grid relative mx-auto overflow-hidden rounded-[1.65rem] border border-white/10 bg-[#061019]", compact ? "h-44" : "h-72", identity.accent.glow)}>
      <div className={cn("absolute -left-16 -top-20 z-[1] size-48 rounded-full blur-3xl", tier === "gold" ? "bg-amber-300/20" : tier === "silver" ? "bg-slate-100/14" : "bg-orange-300/16")} />
      <div className="absolute inset-x-6 bottom-2 z-[1] h-20 rounded-full bg-cyan-300/18 blur-2xl" />
      <div className="absolute inset-x-12 top-6 z-[1] h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
      <div className="absolute left-4 top-4 z-[4] flex items-center gap-2">
        <span className={cn("rounded-full border px-2.5 py-1 text-[7px] font-black uppercase tracking-[.16em]", tierStyle.chip)}>{tierStyle.label}</span>
        <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[.06] px-2.5 py-1 text-[7px] font-black uppercase tracking-[.16em] text-cyan-100">Card</span>
      </div>
      {artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artworkUrl}
          alt={player.name}
          className="card-photo relative z-[1] h-full w-full object-cover object-top saturate-[.98] contrast-[1.12] [mask-image:linear-gradient(to_bottom,black_76%,transparent_100%)]"
        />
      ) : (
        <div className={cn("relative z-[1] grid h-full place-items-center overflow-hidden bg-gradient-to-br", identity.accent.primary)}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_24%,rgba(255,255,255,.22),transparent_28%),linear-gradient(115deg,transparent_0%,rgba(255,255,255,.14)_46%,transparent_58%)]" />
          <div className="absolute inset-x-8 top-12 z-[1] h-28 rounded-full border border-white/10 bg-white/[.035] blur-xl" />
          <div className="absolute bottom-0 left-1/2 h-32 w-[78%] -translate-x-1/2 rounded-[999px_999px_0_0] border border-cyan-200/15 bg-black/25 blur-sm" />
          <div className="tdie-avatar-silhouette">
            <div className="absolute left-1/2 top-[18%] z-10 size-16 -translate-x-1/2 rounded-full border border-white/15 bg-black/20 shadow-[0_0_24px_rgba(255,255,255,.1)]" />
            <div className="absolute left-1/2 top-[38%] z-10 h-28 w-32 -translate-x-1/2 rounded-[3rem_3rem_1.5rem_1.5rem] border border-white/10 bg-black/25" />
            <div className="absolute inset-x-0 top-[45%] z-10 text-center">
              <p className={cn("card-rating font-display text-5xl font-black italic tracking-[-.08em]", identity.accent.text)}>{initials}</p>
              <p className="mx-auto mt-2 max-w-32 truncate text-[7px] font-black uppercase tracking-[.16em] text-white/55">{positionLabel}</p>
            </div>
          </div>
          <div className="absolute bottom-16 left-4 right-4 z-[3] rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-center backdrop-blur-md">
            <p className="truncate text-[8px] font-black uppercase tracking-[.18em] text-white/70">{clubLabel}</p>
            <p className="mt-1 truncate text-[7px] font-bold uppercase tracking-[.18em] text-cyan-200/70">{nationLabel}</p>
          </div>
        </div>
      )}
      <div className="absolute inset-0 z-[3] bg-gradient-to-t from-[#07111b] via-transparent to-transparent" />
      <div className="absolute bottom-4 left-4 z-[4]">
        <CardEngineLivePill>{identityLabel}</CardEngineLivePill>
      </div>
      <div className={cn("absolute right-4 top-4 z-[4] rounded-xl border px-2.5 py-1 text-[8px] font-black uppercase tracking-[.16em]", tierStyle.chip)}>
        Touchline
      </div>
      <div className="card-edge" />
    </div>
  );
}

function PrestigeBorder({ tier, liveState }: { tier: TouchlineCardTier; liveState: TouchlineCardLiveState }) {
  const isEvent = liveState !== "idle";

  return (
    <div className="tdie-prestige-border pointer-events-none absolute inset-0 rounded-[2rem] p-px">
      <div className={cn("h-full rounded-[2rem] bg-gradient-to-br opacity-80", tierMeta[tier].border)} />
      <div className={cn("absolute inset-0 rounded-[2rem] bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,.28)_42%,transparent_55%)] opacity-45", isEvent && "animate-pulse")} />
    </div>
  );
}

function LiveStatusBadge({ state, points }: { state: TouchlineCardLiveState; points?: string | number | null }) {
  const meta = liveStateMeta[state];
  const Icon = meta.icon;

  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[8px] font-black uppercase tracking-[.16em]", meta.className)}>
      <Icon size={12} />
      {meta.label}
      {points ? <span className="rounded-full bg-black/25 px-2 py-0.5 text-white">+{points}</span> : null}
    </div>
  );
}

function PlayerCardInner({ player, variant, className }: { player: TouchlinePlayerCardModel; variant: TouchlinePlayerCardVariant; className?: string }) {
  const tier = getTouchlinePlayerCardTier(player.officialMarketValue);
  const marketValue = marketVisualLabel(formatOfficialMarketValue(player.officialMarketValue, player.currency ?? "EUR", player.officialMarketValueLabel));
  const liveState = player.liveState ?? "idle";
  const identity = resolvePlayerIdentity(player);
  const isCompact = variant === "compact";
  const isList = variant === "list";
  const tierStyle = tierMeta[tier];
  const positionLabel = compactDataLabel(player.position, "Role pending");
  const clubLabel = compactDataLabel(player.currentClub, "Club pending");
  const nationLabel = compactDataLabel(player.nationality, "Nation pending");
  const hasMarketValue = typeof player.officialMarketValue === "number";

  if (isList) {
    const artworkUrl = resolveTdieArtworkUrl(player, identity);
    const listInitials = identity.initials || player.initials || player.name.slice(0, 2).toUpperCase();

    return (
      <div className={cn("relative overflow-hidden rounded-[1.35rem] bg-[#07111b] p-[1px]", tierMeta[tier].glow, className)}>
        <PrestigeBorder tier={tier} liveState={liveState} />
        <div className="relative z-10 flex min-w-0 items-center gap-4 rounded-[1.35rem] border border-white/[.08] bg-white/[.035] p-3">
          <div className={cn("relative size-16 shrink-0 overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045]", identity.accent.glow)}>
            {artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artworkUrl} alt={player.name} className="h-full w-full object-cover object-top" />
            ) : (
              <div className={cn("grid h-full place-items-center bg-gradient-to-br text-lg font-black", identity.accent.primary, identity.accent.text)}>{listInitials}</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider", tierStyle.chip)}>{tierStyle.label}</span>
              <LiveStatusBadge state={liveState} points={player.livePoints} />
            </div>
            <p className="mt-2 truncate text-base font-black uppercase italic tracking-[-.04em] text-white">{player.name}</p>
            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {positionLabel} · {clubLabel} · {nationLabel}
            </p>
          </div>
          <div className="hidden min-w-[120px] text-right sm:block">
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Official value</p>
            <p className="mt-1 text-sm font-black text-[#a3ff12]">{hasMarketValue ? marketValue : "Value pending"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("player-card relative overflow-hidden rounded-[2rem] bg-[#07111b] p-[1px]", tierMeta[tier].glow, isCompact ? "min-h-[360px]" : "min-h-[540px]", className)}>
      <PrestigeBorder tier={tier} liveState={liveState} />
      <div className="relative z-10 h-full overflow-hidden rounded-[2rem] border border-white/[.08] bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,.18),transparent_24%),radial-gradient(circle_at_18%_18%,rgba(34,211,238,.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,.058),rgba(255,255,255,.015))] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={cn("card-rating font-display font-black uppercase leading-none", tierStyle.text, isCompact ? "text-4xl" : "text-5xl")}>{tierStyle.label}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[.25em] text-cyan-300">{positionLabel}</p>
          </div>
          <div className="rounded-2xl border border-white/[.08] bg-black/25 px-3 py-2 text-right">
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Official</p>
            <p className="max-w-32 truncate text-sm font-black text-[#a3ff12]">{hasMarketValue ? marketValue : "Value pending"}</p>
          </div>
        </div>

        <div className={cn("mt-5", isCompact && "mt-4")}>
          <IdentityArtwork player={player} tier={tier} compact={isCompact} />
        </div>

        <div className="mt-5 text-center">
          <p className={cn("truncate font-black uppercase italic tracking-[-.05em] text-white", isCompact ? "text-lg" : "text-2xl")}>{player.name}</p>
          <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">
            {clubLabel} · {nationLabel}
          </p>
        </div>

        <div className="mt-4 flex justify-center">
          <LiveStatusBadge state={liveState} points={player.livePoints} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[.08] pt-5">
          <div className="rounded-2xl bg-white/[.04] p-3 text-center">
            <p className="text-[8px] font-black uppercase text-slate-500">Form</p>
            <p className="mt-1 text-lg font-black text-cyan-300">{cardStatusLabel(player.currentForm, "Ready")}</p>
          </div>
          <div className="rounded-2xl bg-white/[.04] p-3 text-center">
            <p className="text-[8px] font-black uppercase text-slate-500">Age</p>
            <p className="mt-1 text-lg font-black text-white">{player.age ?? "—"}</p>
          </div>
          <div className="rounded-2xl bg-white/[.04] p-3 text-center">
            <p className="text-[8px] font-black uppercase text-slate-500">Status</p>
            <p className="mt-1 truncate text-lg font-black text-[#a3ff12]">{cardStatusLabel(player.availability, "Ready")}</p>
          </div>
        </div>

        {!isCompact ? (
          <div className="mt-4 grid gap-2 text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <p>Coach</p>
              <p className="mt-1 truncate text-sm font-black normal-case tracking-normal text-white">{cardStatusLabel(player.currentCoach, "Pending")}</p>
            </div>
            <div className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <p>Agent</p>
              <p className="mt-1 truncate text-sm font-black normal-case tracking-normal text-cyan-200">{cardStatusLabel(player.currentAgent, "Pending")}</p>
            </div>
            <div className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <p>League</p>
              <p className="mt-1 truncate text-sm font-black normal-case tracking-normal text-white">{cardStatusLabel(player.league, "Pending")}</p>
            </div>
            <div className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <p>Contract</p>
              <p className="mt-1 truncate text-sm font-black normal-case tracking-normal text-amber-200">{cardStatusLabel(player.contractStatus, "Pending")}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[8px] font-bold uppercase tracking-wider text-slate-600">
              <span>Card readiness</span>
              <span>{hasMarketValue ? "100%" : "72%"}</span>
            </div>
            <CardEngineMeter value={hasMarketValue ? 100 : 72} color={tier === "gold" ? "gold" : tier === "silver" ? "cyan" : "lime"} />
          </div>
        )}
      </div>
    </div>
  );
}

export function TouchlinePlayerCard({
  player,
  variant = "showcase",
  className,
}: {
  player: TouchlinePlayerCardModel;
  variant?: TouchlinePlayerCardVariant;
  className?: string;
}) {
  const inner = <PlayerCardInner player={player} variant={variant} className={className} />;

  if (player.href) {
    return (
      <Link href={player.href} className="block min-w-0">
        {inner}
      </Link>
    );
  }

  return inner;
}

export function TouchlineIdentityCard({
  entity,
  className,
}: {
  entity: TouchlineIdentityCardModel;
  className?: string;
}) {
  const meta = entityMeta(entity.type);
  const linkedPlayers = entity.linkedPlayers ?? [];
  const approved = linkedPlayers.filter((player) => player.status === "approved").length;
  const suggested = linkedPlayers.length - approved;

  const inner = (
    <div className={cn("relative overflow-hidden rounded-[1.6rem] bg-[#07111b] p-[1px]", meta.glow, className)}>
      <div className="absolute inset-0 rounded-[1.6rem] bg-gradient-to-br from-cyan-300/35 via-white/10 to-[#a3ff12]/25 opacity-60" />
      <div className="relative z-10 overflow-hidden rounded-[1.6rem] border border-white/[.08] bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02))] p-4">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,.08)_45%,transparent_56%)] opacity-45" />
        <div className="relative flex min-w-0 items-start gap-4">
          <TouchlineIdentityArtwork entity={entity} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[.14em]", meta.chip)}>{meta.label}</span>
              {entity.transfermarktId ? (
                <span className="rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[.14em] text-[#caff72]">
                  TM ID {entity.transfermarktId}
                </span>
              ) : null}
            </div>
            <p className="mt-2 truncate text-base font-black uppercase italic tracking-[-.04em] text-white">{entity.name}</p>
            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {entity.subtitle ?? entity.status ?? meta.fallback}
            </p>
          </div>
        </div>

        <div className="relative mt-4 grid gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[.06] bg-black/20 px-3 py-2">
            <p>{entity.metricLabel ?? "Linked"}</p>
            <p className="mt-1 truncate text-sm text-cyan-100">{entity.metricValue ?? linkedPlayers.length}</p>
          </div>
          <div className="rounded-2xl border border-white/[.06] bg-black/20 px-3 py-2">
            <p>{entity.secondaryMetricLabel ?? "Verified"}</p>
            <p className="mt-1 truncate text-sm text-[#a3ff12]">{entity.secondaryMetricValue ?? approved}</p>
          </div>
          <div className="rounded-2xl border border-white/[.06] bg-black/20 px-3 py-2">
            <p>Status</p>
            <p className="mt-1 truncate text-sm text-amber-200">{cardStatusLabel(entity.status ?? (suggested ? `${suggested} suggested` : "Official data pending"))}</p>
          </div>
        </div>

        {linkedPlayers.length ? (
          <div className="relative mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {linkedPlayers.slice(0, 12).map((player, index) => {
              const playerInitials = player.initials ?? identityInitials(player.name ?? "Player");
              const content = (
                <div className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/[.06] bg-black/20 p-2 transition hover:border-cyan-300/20 hover:bg-cyan-300/[.05]">
                  <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[.08] bg-black/30">
                    <span className="text-[10px] font-black text-cyan-300/75">{playerInitials}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black uppercase italic text-white group-hover:text-cyan-100">{player.name ?? "Player"}</p>
                    <p className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-wider text-slate-600">
                      TM ID {player.transfermarktId ?? "open"} · {player.status === "approved" ? "verified" : "suggested"}
                    </p>
                  </div>
                </div>
              );

              if (player.href) {
                return (
                  <Link key={`${player.id ?? player.name ?? "player"}-${index}`} href={player.href}>
                    {content}
                  </Link>
                );
              }

              return <div key={`${player.id ?? player.name ?? "player"}-${index}`}>{content}</div>;
            })}
          </div>
        ) : (
          <div className="relative mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-200">
              {entity.type === "club" ? "Official data pending" : "Premium identity ready"}
            </p>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">
              {entity.type === "club"
                ? "Touchline shows the club identity now. Official squad and trophy data will appear when approved football data is available."
                : "Touchline can display public linked profiles here while keeping representation and business status separate."}
            </p>
          </div>
        )}

        <div className="relative mt-4 flex flex-wrap gap-2">
          {entity.href ? (
            <Link href={entity.href} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/[.08] px-4 text-[9px] font-black uppercase tracking-wider text-cyan-100 transition hover:border-cyan-200/45 hover:bg-cyan-300/[.12]">
              Open Profile <ArrowRight size={12} />
            </Link>
          ) : null}
          {entity.externalHref ? (
            <a href={entity.externalHref} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-wider text-[#caff72]">
              Transfermarkt <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (entity.href) {
    return (
      <div className="block min-w-0">
        {inner}
      </div>
    );
  }

  return inner;
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
