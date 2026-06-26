import Link from "next/link";
import { Activity, AlertTriangle, HeartPulse, Shield, Sparkles, Star, Trophy, Zap } from "lucide-react";
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

export function getTouchlinePlayerCardTier(officialMarketValue?: number | null): TouchlineCardTier {
  if (typeof officialMarketValue === "number" && officialMarketValue >= 50_000_000) return "gold";
  if (typeof officialMarketValue === "number" && officialMarketValue >= 5_000_000) return "silver";
  return "bronze";
}

export function formatOfficialMarketValue(officialMarketValue?: number | null, currency = "EUR", fallback?: string | null) {
  if (typeof officialMarketValue !== "number") return fallback ?? "Value open";

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(officialMarketValue);
}

function IdentityArtwork({ player, tier, compact = false }: { player: TouchlinePlayerCardModel; tier: TouchlineCardTier; compact?: boolean }) {
  return (
    <div className={cn("relative mx-auto overflow-hidden rounded-[1.65rem] border border-cyan-300/10 bg-cyan-300/[.035]", compact ? "h-36" : "h-56")}>
      <div className="absolute inset-x-10 bottom-5 h-12 rounded-full bg-cyan-300/20 blur-2xl" />
      {player.tdieImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={player.tdieImageUrl}
          alt={player.name}
          className="h-full w-full object-cover object-top saturate-[.95] contrast-[1.08] [mask-image:linear-gradient(to_bottom,black_72%,transparent_100%)]"
        />
      ) : (
        <div className="grid h-full place-items-center text-6xl font-black text-cyan-300/30">{player.initials ?? player.name.slice(0, 2).toUpperCase()}</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-transparent" />
      <div className="absolute bottom-4 left-4">
        <CardEngineLivePill>TDIE identity</CardEngineLivePill>
      </div>
      <div className={cn("absolute right-4 top-4 rounded-xl border px-2.5 py-1 text-[8px] font-black uppercase tracking-[.16em]", tierMeta[tier].chip)}>
        {tierMeta[tier].label}
      </div>
    </div>
  );
}

function PrestigeBorder({ tier, liveState }: { tier: TouchlineCardTier; liveState: TouchlineCardLiveState }) {
  const isEvent = liveState !== "idle";

  return (
    <div className="pointer-events-none absolute inset-0 rounded-[2rem] p-px">
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
  const marketValue = formatOfficialMarketValue(player.officialMarketValue, player.currency ?? "EUR", player.officialMarketValueLabel);
  const liveState = player.liveState ?? "idle";
  const isCompact = variant === "compact";
  const isList = variant === "list";

  if (isList) {
    return (
      <div className={cn("relative overflow-hidden rounded-[1.35rem] bg-[#07111b] p-[1px]", tierMeta[tier].glow, className)}>
        <PrestigeBorder tier={tier} liveState={liveState} />
        <div className="relative z-10 flex min-w-0 items-center gap-4 rounded-[1.35rem] border border-white/[.08] bg-white/[.035] p-3">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045]">
            {player.tdieImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.tdieImageUrl} alt={player.name} className="h-full w-full object-cover object-top" />
            ) : (
              <div className="grid h-full place-items-center text-lg font-black text-cyan-300">{player.initials ?? player.name.slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider", tierMeta[tier].chip)}>{tierMeta[tier].label}</span>
              <LiveStatusBadge state={liveState} points={player.livePoints} />
            </div>
            <p className="mt-2 truncate text-base font-black uppercase italic tracking-[-.04em] text-white">{player.name}</p>
            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {player.position ?? "Position open"} · {player.currentClub ?? "Club open"} · {player.nationality ?? "Nation open"}
            </p>
          </div>
          <div className="hidden min-w-[120px] text-right sm:block">
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Official value</p>
            <p className="mt-1 text-sm font-black text-[#a3ff12]">{marketValue}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[2rem] bg-[#07111b] p-[1px]", tierMeta[tier].glow, isCompact ? "min-h-[330px]" : "min-h-[460px]", className)}>
      <PrestigeBorder tier={tier} liveState={liveState} />
      <div className="relative z-10 h-full overflow-hidden rounded-[2rem] border border-white/[.08] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015))] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={cn("font-display font-black uppercase leading-none", tierMeta[tier].text, isCompact ? "text-4xl" : "text-5xl")}>{tierMeta[tier].label}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[.25em] text-cyan-300">{player.position ?? "Position open"}</p>
          </div>
          <div className="rounded-2xl border border-white/[.08] bg-black/25 px-3 py-2 text-right">
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Official</p>
            <p className="max-w-32 truncate text-sm font-black text-[#a3ff12]">{marketValue}</p>
          </div>
        </div>

        <div className={cn("mt-5", isCompact && "mt-4")}>
          <IdentityArtwork player={player} tier={tier} compact={isCompact} />
        </div>

        <div className="mt-5 text-center">
          <p className={cn("truncate font-black uppercase italic tracking-[-.05em] text-white", isCompact ? "text-lg" : "text-2xl")}>{player.name}</p>
          <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">
            {player.currentClub ?? "Club open"} · {player.nationality ?? "Nation open"}
          </p>
        </div>

        <div className="mt-4 flex justify-center">
          <LiveStatusBadge state={liveState} points={player.livePoints} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[.08] pt-5">
          <div className="rounded-2xl bg-white/[.04] p-3 text-center">
            <p className="text-[8px] font-black uppercase text-slate-500">Form</p>
            <p className="mt-1 text-lg font-black text-cyan-300">{player.currentForm ?? "Open"}</p>
          </div>
          <div className="rounded-2xl bg-white/[.04] p-3 text-center">
            <p className="text-[8px] font-black uppercase text-slate-500">Age</p>
            <p className="mt-1 text-lg font-black text-white">{player.age ?? "—"}</p>
          </div>
          <div className="rounded-2xl bg-white/[.04] p-3 text-center">
            <p className="text-[8px] font-black uppercase text-slate-500">Status</p>
            <p className="mt-1 truncate text-lg font-black text-[#a3ff12]">{player.availability ?? "Ready"}</p>
          </div>
        </div>

        {!isCompact ? (
          <div className="mt-4 grid gap-2 text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <p>Coach</p>
              <p className="mt-1 truncate text-sm font-black normal-case tracking-normal text-white">{player.currentCoach ?? "Open"}</p>
            </div>
            <div className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <p>Agent</p>
              <p className="mt-1 truncate text-sm font-black normal-case tracking-normal text-cyan-200">{player.currentAgent ?? "Open"}</p>
            </div>
            <div className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <p>League</p>
              <p className="mt-1 truncate text-sm font-black normal-case tracking-normal text-white">{player.league ?? "Open"}</p>
            </div>
            <div className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <p>Contract</p>
              <p className="mt-1 truncate text-sm font-black normal-case tracking-normal text-amber-200">{player.contractStatus ?? "Open"}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[8px] font-bold uppercase tracking-wider text-slate-600">
              <span>Card readiness</span>
              <span>{player.officialMarketValue ? "100%" : "62%"}</span>
            </div>
            <CardEngineMeter value={player.officialMarketValue ? 100 : 62} color={tier === "gold" ? "gold" : tier === "silver" ? "cyan" : "lime"} />
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
