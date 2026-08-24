import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  ExternalLink,
  Gift,
  Layers3,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";

import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref, type TouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";

type QueryError = { message: string };
type ReadResult<T> = { data: T; error: string | null };
type CountResult = { value: number; error: string | null };
type HealthStatus = "READY" | "CONFIGURED_NOT_VERIFIED" | "NOT_CONFIGURED_YET" | "PARTIALLY_IMPLEMENTED" | "ERROR";

type PublicUserRow = {
  id: string;
  full_name: string | null;
  created_at: string | null;
};

type AnalyticsSessionRow = {
  user_id: string;
  active_seconds: number | null;
  last_seen_at: string;
  current_area: string;
  device_class: string;
};

type BetaGrantRow = {
  user_id: string;
  slot_number: number;
  amount_tc: number;
  granted_at: string;
};

type ArenaStateRow = {
  user_id: string;
  formation_key: string;
  updated_at: string;
};

type SyncRunRow = {
  id: string;
  provider: string;
  sync_type: string;
  status: string;
  records_created: number;
  records_updated: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type CardInventoryRow = {
  id: string;
  player_name: string;
  frame_color: string;
  card_status: string;
  sale_status: string;
  updated_at: string | null;
};

type CreditLedgerRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  entry_type: string;
  reason: string;
  created_at: string;
};

type HealthCheck = {
  name: string;
  detail: string;
  status: HealthStatus;
};

async function safeRows<T>(
  query: PromiseLike<{ data: T[] | null; error: QueryError | null }>,
): Promise<ReadResult<T[]>> {
  try {
    const { data, error } = await query;
    return error ? { data: [], error: error.message } : { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Read unavailable" };
  }
}

async function safeCount(
  query: PromiseLike<{ count: number | null; error: QueryError | null }>,
): Promise<CountResult> {
  try {
    const { count, error } = await query;
    return error ? { value: 0, error: error.message } : { value: count ?? 0, error: null };
  } catch (error) {
    return { value: 0, error: error instanceof Error ? error.message : "Count unavailable" };
  }
}

function hasEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return false;
  const normalized = value.toLowerCase();
  return !normalized.includes("replace-with") && !normalized.includes("your_") && !normalized.includes("your-");
}

function supabaseTargetsMatch() {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const adminUrl = process.env.SUPABASE_URL?.trim();
  if (!publicUrl || !adminUrl) return true;

  try {
    return new URL(publicUrl).origin === new URL(adminUrl).origin;
  } catch {
    return false;
  }
}

function countText(result: CountResult) {
  return result.error ? "—" : String(result.value);
}

function dateLabel(value: string | null | undefined, locale: TouchLineAuthLocale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function money(cents: number, locale: TouchLineAuthLocale, currency = "EUR") {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function healthText(status: HealthStatus) {
  if (status === "READY") return "Ready";
  if (status === "CONFIGURED_NOT_VERIFIED") return "Configured, not verified";
  if (status === "ERROR") return "Error";
  if (status === "PARTIALLY_IMPLEMENTED") return "Partially ready";
  return "Not configured yet";
}

function healthClasses(status: HealthStatus) {
  if (status === "READY") return "border-[#a3ff12]/20 bg-[#a3ff12]/10 text-[#caff6d]";
  if (status === "ERROR") return "border-rose-300/25 bg-rose-300/10 text-rose-200";
  if (status === "PARTIALLY_IMPLEMENTED" || status === "CONFIGURED_NOT_VERIFIED") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-cyan-300/20 bg-cyan-300/[.07] text-cyan-100";
}

function healthIcon(status: HealthStatus) {
  if (status === "READY") return <CheckCircle2 size={16} className="text-[#a3ff12]" />;
  if (status === "ERROR") return <AlertTriangle size={16} className="text-rose-300" />;
  return <AlertTriangle size={16} className={status === "NOT_CONFIGURED_YET" ? "text-cyan-300" : "text-amber-300"} />;
}

function schemaStatus(errors: Array<string | null>): HealthStatus {
  const failures = errors.filter(Boolean).length;
  if (failures === 0) return "READY";
  return failures === errors.length ? "ERROR" : "PARTIALLY_IMPLEMENTED";
}

export default async function AdminOwnerPanel({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const supabase = await createClient();
  const admin = createAdminClient();

  if (!supabase) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <GamePanel className="p-8">
          <LivePill>Configuration required</LivePill>
          <h1 className="mt-5 text-4xl font-black italic text-white">Arena Owner Control</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Supabase public credentials and the protected service role are required before the Arena owner panel can read operational data.
          </p>
        </GamePanel>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <GamePanel className="p-8">
          <LivePill>Owner area</LivePill>
          <h1 className="mt-5 text-4xl font-black italic text-white">Arena Owner Control</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400">Sign in with the TouchLine owner account to continue.</p>
          <Link href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin", locale))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">
            Sign in
          </Link>
        </GamePanel>
      </div>
    );
  }

  if (!isOwnerEmail(user.email)) notFound();

  if (!admin) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <GamePanel className="p-8">
          <LivePill>Configuration required</LivePill>
          <h1 className="mt-5 text-4xl font-black italic text-white">Arena Owner Control</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            The protected Supabase administration client is required before operational data can be read.
          </p>
        </GamePanel>
      </div>
    );
  }

  let authUsers: Array<{
    id: string;
    email?: string;
    created_at: string;
    last_sign_in_at?: string;
  }> = [];
  let authUsersError: string | null = null;

  try {
    const authResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    authUsers = authResult.data?.users ?? [];
    authUsersError = authResult.error?.message ?? null;
  } catch (error) {
    authUsersError = error instanceof Error ? error.message : "Auth users unavailable";
  }

  const [
    publicUsers,
    sessions,
    betaGrants,
    arenaStates,
    syncRuns,
    recentCards,
    ledger,
    registeredUsers,
    footballPlayers,
    footballClubs,
    footballCompetitions,
    footballSquadMembers,
    cardInventory,
    activeContracts,
    marketOrders,
    analyticsSessions,
    betaGrantCount,
    arenaStateCount,
    creditLedgerCount,
  ] = await Promise.all([
    safeRows<PublicUserRow>(
      admin.from("users").select("id,full_name,created_at").order("created_at", { ascending: false }).limit(12).returns<PublicUserRow[]>(),
    ),
    safeRows<AnalyticsSessionRow>(
      admin
        .from("touchline_analytics_sessions")
        .select("user_id,active_seconds,last_seen_at,current_area,device_class")
        .order("last_seen_at", { ascending: false })
        .limit(2500)
        .returns<AnalyticsSessionRow[]>(),
    ),
    safeRows<BetaGrantRow>(
      admin
        .from("touchline_beta_tc_grants")
        .select("user_id,slot_number,amount_tc,granted_at")
        .order("slot_number", { ascending: true })
        .limit(20)
        .returns<BetaGrantRow[]>(),
    ),
    safeRows<ArenaStateRow>(
      admin
        .from("touchline_user_arena_state")
        .select("user_id,formation_key,updated_at")
        .order("updated_at", { ascending: false })
        .limit(100)
        .returns<ArenaStateRow[]>(),
    ),
    safeRows<SyncRunRow>(
      admin
        .from("football_data_sync_runs")
        .select("id,provider,sync_type,status,records_created,records_updated,started_at,completed_at,error_message")
        .order("started_at", { ascending: false })
        .limit(8)
        .returns<SyncRunRow[]>(),
    ),
    safeRows<CardInventoryRow>(
      admin
        .from("touchline_card_inventory")
        .select("id,player_name,frame_color,card_status,sale_status,updated_at")
        .order("updated_at", { ascending: false })
        .limit(8)
        .returns<CardInventoryRow[]>(),
    ),
    safeRows<CreditLedgerRow>(
      admin
        .from("clubowner_credit_ledger")
        .select("id,user_id,amount_cents,currency,entry_type,reason,created_at")
        .order("created_at", { ascending: false })
        .limit(12)
        .returns<CreditLedgerRow[]>(),
    ),
    safeCount(admin.from("users").select("id", { count: "exact", head: true })),
    safeCount(admin.from("football_players").select("id", { count: "exact", head: true })),
    safeCount(admin.from("football_clubs").select("id", { count: "exact", head: true })),
    safeCount(admin.from("football_competitions").select("id", { count: "exact", head: true })),
    safeCount(admin.from("football_squad_members").select("id", { count: "exact", head: true })),
    safeCount(admin.from("touchline_card_inventory").select("id", { count: "exact", head: true })),
    safeCount(admin.from("touchline_card_contracts").select("id", { count: "exact", head: true }).eq("status", "active")),
    safeCount(admin.from("touchline_market_orders").select("id", { count: "exact", head: true }).eq("status", "completed")),
    safeCount(admin.from("touchline_analytics_sessions").select("id", { count: "exact", head: true })),
    safeCount(admin.from("touchline_beta_tc_grants").select("id", { count: "exact", head: true })),
    safeCount(admin.from("touchline_user_arena_state").select("user_id", { count: "exact", head: true })),
    safeCount(admin.from("clubowner_credit_ledger").select("id", { count: "exact", head: true })),
  ]);

  const profileById = new Map(publicUsers.data.map((profile) => [profile.id, profile]));
  const grantByUser = new Map(betaGrants.data.map((grant) => [grant.user_id, grant]));
  const arenaStateByUser = new Map(arenaStates.data.map((state) => [state.user_id, state]));

  // Server timestamps intentionally represent the instant this protected dashboard is requested.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const activeCutoff = requestTime - 2 * 60_000;
  const dailyCutoff = requestTime - 24 * 60 * 60_000;
  const activeNow = new Set(
    sessions.data
      .filter((session) => Date.parse(session.last_seen_at) >= activeCutoff)
      .map((session) => session.user_id),
  ).size;
  const dailyActive = new Set(
    sessions.data
      .filter((session) => Date.parse(session.last_seen_at) >= dailyCutoff)
      .map((session) => session.user_id),
  ).size;
  const activeSeconds = sessions.data.reduce((total, session) => total + Number(session.active_seconds ?? 0), 0);
  const areaTotals = new Map<string, number>();
  sessions.data.forEach((session) => {
    areaTotals.set(session.current_area, (areaTotals.get(session.current_area) ?? 0) + Number(session.active_seconds ?? 0));
  });
  const topAreas = [...areaTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const footballSchema = schemaStatus([
    footballPlayers.error,
    footballClubs.error,
    footballCompetitions.error,
    footballSquadMembers.error,
    syncRuns.error,
  ]);
  const arenaSchema = schemaStatus([
    sessions.error,
    betaGrants.error,
    arenaStates.error,
    recentCards.error,
    ledger.error,
    cardInventory.error,
    activeContracts.error,
    marketOrders.error,
    analyticsSessions.error,
    betaGrantCount.error,
    arenaStateCount.error,
    creditLedgerCount.error,
  ]);
  const supabaseReady =
    hasEnv("NEXT_PUBLIC_SUPABASE_URL") &&
    hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
    hasEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseProjectsAligned = supabaseTargetsMatch();
  const supabaseReadError = Boolean(authUsersError || registeredUsers.error || publicUsers.error);
  const ownerAllowlistConfigured = hasEnv("TOUCHLINE_OWNER_EMAILS");
  const sportmonksConfigured = hasEnv("SPORTMONKS_API_TOKEN");
  const stripeSecretReady = hasEnv("STRIPE_SECRET_KEY");
  const stripeWebhookReady = hasEnv("STRIPE_WEBHOOK_SECRET");

  const healthChecks: HealthCheck[] = [
    {
      name: "Supabase protected reads",
      status: !supabaseReady ? "NOT_CONFIGURED_YET" : !supabaseProjectsAligned || supabaseReadError ? "ERROR" : "READY",
      detail: !supabaseReady
        ? "Public URL, anon key and service role are required."
        : !supabaseProjectsAligned
          ? "Public authentication and protected administration are configured for different Supabase projects."
          : supabaseReadError
            ? "A protected authentication or database read failed. No server error detail is exposed here."
            : "The current owner session and protected database reads were validated server-side.",
    },
    {
      name: "Owner access boundary",
      status: ownerAllowlistConfigured ? "READY" : "PARTIALLY_IMPLEMENTED",
      detail: ownerAllowlistConfigured
        ? "The current session passed the explicit server-side owner allowlist."
        : "The current session passed the built-in fallback. Configure an explicit deployment owner allowlist before release.",
    },
    {
      name: "Official football schema",
      status: footballSchema,
      detail: footballSchema === "READY"
        ? "Normalized competitions, clubs, players, squads and sync history are readable."
        : footballSchema === "ERROR"
          ? "All checked football_* reads failed; coverage values are unavailable rather than zero."
          : "One or more football_* reads failed; unaffected sections remain available.",
    },
    {
      name: "Arena operational schema",
      status: arenaSchema,
      detail: arenaSchema === "READY"
        ? "Cards, contracts, orders, analytics, legacy grant audit rows, state and credit ledger are readable."
        : arenaSchema === "ERROR"
          ? "All checked Arena operational reads failed; affected values are shown as unavailable."
          : "One or more Arena operational reads failed; affected values are shown as unavailable.",
    },
    {
      name: "TouchLine data configuration",
      status: sportmonksConfigured ? "CONFIGURED_NOT_VERIFIED" : "NOT_CONFIGURED_YET",
      detail: sportmonksConfigured
        ? "A server token is configured. Connectivity and subscription entitlement are not probed by this page."
        : "TouchLine data access is not configured.",
    },
    {
      name: "Stripe configuration",
      status: stripeSecretReady && stripeWebhookReady
        ? "CONFIGURED_NOT_VERIFIED"
        : stripeSecretReady || stripeWebhookReady
          ? "PARTIALLY_IMPLEMENTED"
          : "NOT_CONFIGURED_YET",
      detail: stripeSecretReady && stripeWebhookReady
        ? "Server and webhook credentials are configured, but connectivity and webhook delivery are not probed here."
        : stripeSecretReady || stripeWebhookReady
          ? "Only part of the generic Stripe server configuration is present."
          : "Generic Stripe server and webhook configuration is not present.",
    },
  ];

  const overallHealth: HealthStatus = healthChecks.some((check) => check.status === "ERROR")
    ? "ERROR"
    : healthChecks.some((check) => check.status === "PARTIALLY_IMPLEMENTED")
      ? "PARTIALLY_IMPLEMENTED"
      : healthChecks.some((check) => check.status === "NOT_CONFIGURED_YET")
        ? "NOT_CONFIGURED_YET"
        : healthChecks.some((check) => check.status === "CONFIGURED_NOT_VERIFIED")
          ? "CONFIGURED_NOT_VERIFIED"
          : "READY";

  const linkCards = [
    { href: "/admin/cards", label: "Card Inventory", detail: "Art, publication and supply", icon: Layers3 },
    { href: "/admin/analytics", label: "Arena Analytics", detail: "ClubOwner activity and retention", icon: BarChart3 },
    { href: "/admin/promotions", label: "Promotions", detail: "Campaigns and credit ledger", icon: Gift },
    { href: "/admin/football-data", label: "Football Data", detail: "Normalized football foundation", icon: Database },
    { href: "/admin/market-values", label: "Market Values", detail: "Verified values and review queue", icon: ShieldCheck },
    { href: "/admin/card-engine", label: "Card Engine", detail: "Protected editorial review and publish", icon: Sparkles },
    { href: "/admin/formation-calibration", label: "Formation Calibration", detail: "QA-only flat-pitch geometry versions", icon: Trophy },
    { href: "/admin/finance", label: "Finance Control", detail: "Protected financial overview", icon: CircleDollarSign },
  ];

  const recentAuthUsers = authUsers.slice(0, 10);
  const ledgerNetCents = ledger.data.reduce((total, entry) => total + Number(entry.amount_cents || 0), 0);
  const registeredUsersText = registeredUsers.error
    ? authUsersError ? "—" : String(authUsers.length)
    : String(registeredUsers.value);
  const footballCoverage = [
    { label: "Competitions", result: footballCompetitions },
    { label: "Clubs", result: footballClubs },
    { label: "Players", result: footballPlayers },
    { label: "Squad rows", result: footballSquadMembers },
  ];
  const economyCoverage = [
    { label: "Completed orders", result: marketOrders },
    { label: "Active contracts", result: activeContracts },
    { label: "Saved Arenas", result: arenaStateCount },
    { label: "Ledger entries", result: creditLedgerCount },
  ];
  const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <LivePill>Arena owner control</LivePill>
            <span className={`rounded-full border px-3 py-1.5 text-[8px] font-black ${healthClasses(overallHealth)}`}>
              {healthText(overallHealth)}
            </span>
          </div>
          <h1 className="font-display text-4xl italic text-white sm:text-[52px]">TouchLine Owner Panel</h1>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">
            Read-only command center for ClubOwners, official football data, Arena operations, cards, engagement and credits.
          </p>
        </div>
        {supabaseRef ? (
          <Link
            href={`https://supabase.com/dashboard/project/${supabaseRef}`}
            target="_blank"
            className="inline-flex h-11 items-center gap-2 self-start rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black text-cyan-100"
          >
            Supabase project <ExternalLink size={13} />
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        <StatTile icon={Users} label="ClubOwners" value={registeredUsersText} delta={registeredUsersText === "—" ? "read unavailable" : "registered"} accent={registeredUsersText === "—" ? "rose" : "cyan"} />
        <StatTile icon={Radio} label="Active now" value={sessions.error ? "—" : String(activeNow)} delta={sessions.error ? "read unavailable" : "last 2 min"} accent={sessions.error ? "rose" : "lime"} />
        <StatTile icon={Activity} label="Daily active" value={sessions.error ? "—" : String(dailyActive)} delta={sessions.error ? "read unavailable" : "last 24h"} accent={sessions.error ? "rose" : "cyan"} />
        <StatTile icon={Trophy} label="Legacy grants" value={betaGrantCount.error ? "—" : String(betaGrantCount.value)} delta={betaGrantCount.error ? "read unavailable" : "historical only"} accent={betaGrantCount.error ? "rose" : "gold"} />
        <StatTile icon={Database} label="Players" value={countText(footballPlayers)} delta={footballPlayers.error ? "read unavailable" : "football_*"} accent={footballPlayers.error ? "rose" : "cyan"} />
        <StatTile icon={ShieldCheck} label="Clubs" value={countText(footballClubs)} delta={footballClubs.error ? "read unavailable" : "normalized"} accent={footballClubs.error ? "rose" : "lime"} />
        <StatTile icon={Sparkles} label="Cards" value={countText(cardInventory)} delta={cardInventory.error ? "read unavailable" : "inventory"} accent={cardInventory.error ? "rose" : "gold"} />
        <StatTile icon={WalletCards} label="Contracts" value={countText(activeContracts)} delta={activeContracts.error ? "read unavailable" : "active"} accent="rose" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {linkCards.map(({ href, label, detail, icon: Icon }) => (
          <Link
            key={href}
            href={touchLineAuthHref(href, locale)}
            className="glass glass-hover group rounded-2xl border border-white/[.07] p-4 transition hover:border-[#a3ff12]/25"
          >
            <span className="grid size-9 place-items-center rounded-xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] text-[#a3ff12]">
              <Icon size={16} />
            </span>
            <p className="mt-4 text-xs font-black text-white">{label}</p>
            <p className="mt-1 text-[9px] leading-4 text-slate-600">{detail}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5">
            <p className="text-[9px] font-black text-[#a3ff12]">ClubOwner access</p>
            <h2 className="mt-1 text-xl font-black italic text-white">Recent registered users</h2>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              Read-only identity overview. Historical access grants and saved Arena state are shown independently of authentication.
            </p>
          </div>
          <div className="divide-y divide-white/[.06]">
            {recentAuthUsers.map((authUser) => {
              const profile = profileById.get(authUser.id);
              const grant = grantByUser.get(authUser.id);
              const arenaState = arenaStateByUser.get(authUser.id);
              return (
                <div key={authUser.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-black text-white">{profile?.full_name?.trim() || authUser.email || "ClubOwner"}</p>
                      {isOwnerEmail(authUser.email) ? (
                        <span className="rounded-lg border border-amber-300/20 bg-amber-300/[.08] px-2 py-1 text-[7px] font-black text-amber-200">
                          Owner
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-[9px] text-slate-600">{authUser.email ?? "Email unavailable"} · joined {dateLabel(authUser.created_at, locale)}</p>
                  </div>
                  <span className={`w-fit rounded-lg border px-2 py-1 text-[8px] font-black ${grant ? "border-[#a3ff12]/20 bg-[#a3ff12]/[.07] text-[#caff6d]" : "border-white/[.08] text-slate-600"}`}>
                    {grant ? `Legacy grant #${grant.slot_number}` : "No legacy grant"}
                  </span>
                  <span className={`w-fit rounded-lg border px-2 py-1 text-[8px] font-black ${arenaState ? "border-cyan-300/20 bg-cyan-300/[.06] text-cyan-100" : "border-white/[.08] text-slate-600"}`}>
                    {arenaState ? `${arenaState.formation_key} saved` : "Arena not saved"}
                  </span>
                </div>
              );
            })}
            {!recentAuthUsers.length ? (
              <p className="p-8 text-center text-xs text-slate-500">
                {authUsersError ? "Authenticated users are temporarily unavailable." : "No ClubOwners registered yet."}
              </p>
            ) : null}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.08] text-cyan-300">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-cyan-300">Operational health</p>
              <h2 className="mt-1 text-xl font-black italic text-white">Protected read audit</h2>
            </div>
          </div>
          <div className={`mt-5 rounded-2xl border p-4 ${healthClasses(overallHealth)}`}>
            <p className="text-[8px] font-black opacity-70">Overall state</p>
            <p className="mt-1 text-sm font-black italic">{healthText(overallHealth)}</p>
            <p className="mt-2 text-[10px] leading-5 opacity-70">
              Readiness reflects only the protected checks shown below. Configured integrations remain unverified until a targeted connectivity check runs.
            </p>
          </div>
          <div className="mt-4 space-y-2">
            {healthChecks.map((check) => (
              <div key={check.name} className="flex items-start gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3">
                <div className="mt-0.5">{healthIcon(check.status)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black text-white">{check.name}</p>
                  <p className="mt-1 text-[8px] leading-4 text-slate-600">{check.detail}</p>
                </div>
                <span className={`shrink-0 rounded-lg border px-2 py-1 text-[7px] font-black ${healthClasses(check.status)}`}>
                  {healthText(check.status)}
                </span>
              </div>
            ))}
          </div>
        </GamePanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <GamePanel className="p-5">
          <p className="text-[9px] font-black text-cyan-300">Official football data</p>
          <h2 className="mt-1 text-xl font-black italic text-white">Normalized coverage</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {footballCoverage.map(({ label, result }) => (
              <div key={label} className={`rounded-2xl border bg-white/[.025] p-4 ${result.error ? "border-rose-300/20" : "border-white/[.07]"}`}>
                <p className="text-[8px] font-black text-slate-600">{label}</p>
                <p className={`mt-2 font-display text-3xl ${result.error ? "text-rose-200" : "text-white"}`}>{countText(result)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {syncRuns.data.slice(0, 4).map((run) => (
              <div key={run.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black text-white">{run.provider} · {run.sync_type}</p>
                  <span className={run.status === "success" ? "text-[#a3ff12]" : run.status === "error" ? "text-rose-300" : "text-amber-200"}>
                    {run.status}
                  </span>
                </div>
                <p className="mt-1 text-[8px] text-slate-600">{run.records_created} created · {run.records_updated} updated · {dateLabel(run.completed_at ?? run.started_at, locale)}</p>
              </div>
            ))}
            {!syncRuns.data.length ? (
              <p className={`text-xs ${syncRuns.error ? "text-rose-200" : "text-slate-500"}`}>
                {syncRuns.error ? "Football sync history is unavailable." : "No football sync history has been recorded yet."}
              </p>
            ) : null}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <p className="text-[9px] font-black text-[#a3ff12]">Arena engagement</p>
          <h2 className="mt-1 text-xl font-black italic text-white">Gameplay activity</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
              <Clock3 size={15} className="text-cyan-300" />
              <p className="mt-3 text-[8px] font-black text-slate-600">Tracked time</p>
              <p className={`mt-1 font-display text-3xl ${sessions.error ? "text-rose-200" : "text-white"}`}>
                {sessions.error ? "—" : `${Math.round(activeSeconds / 3600)}h`}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
              <Activity size={15} className="text-[#a3ff12]" />
              <p className="mt-3 text-[8px] font-black text-slate-600">Sessions</p>
              <p className={`mt-1 font-display text-3xl ${analyticsSessions.error ? "text-rose-200" : "text-white"}`}>
                {countText(analyticsSessions)}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {topAreas.map(([area, seconds]) => {
              const width = activeSeconds ? Math.max(4, Math.round((seconds / activeSeconds) * 100)) : 0;
              return (
                <div key={area}>
                  <div className="flex justify-between gap-3 text-[9px]">
                    <span className="font-black text-white">{area}</span>
                    <span className="text-slate-600">{Math.round(seconds / 60)} min</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-[#a3ff12]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
            {!topAreas.length ? (
              <p className={`text-xs ${sessions.error ? "text-rose-200" : "text-slate-500"}`}>
                {sessions.error ? "Engagement data is unavailable." : "Engagement appears after authenticated Arena sessions."}
              </p>
            ) : null}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <p className="text-[9px] font-black text-amber-300">Arena economy read model</p>
          <h2 className="mt-1 text-xl font-black italic text-white">Contracts and credits</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {economyCoverage.map(({ label, result }) => (
              <div key={label} className={`rounded-2xl border bg-white/[.025] p-4 ${result.error ? "border-rose-300/20" : "border-white/[.07]"}`}>
                <p className="text-[8px] font-black text-slate-600">{label}</p>
                <p className={`mt-2 font-display text-3xl ${result.error ? "text-rose-200" : "text-white"}`}>{countText(result)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.05] p-4">
            <p className="text-[8px] font-black text-amber-200">Recent ledger sample</p>
            <p className="mt-2 text-2xl font-black text-white">
              {ledger.error ? "—" : money(ledgerNetCents, locale, ledger.data[0]?.currency ?? "EUR")}
            </p>
            <p className="mt-1 text-[8px] leading-4 text-slate-600">
              {ledger.error
                ? "The recent ledger sample is unavailable."
                : `Net of the latest ${ledger.data.length} immutable entries. This panel never changes balances or economy rules.`}
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {recentCards.data.slice(0, 3).map((card) => (
              <div key={card.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-black text-white">{card.player_name}</p>
                  <p className="mt-0.5 text-[7px] text-slate-600">{card.frame_color}</p>
                </div>
                <span className="text-[8px] font-black text-cyan-100">{card.card_status} · {card.sale_status}</span>
              </div>
            ))}
            {recentCards.error ? <p className="text-xs text-rose-200">Recent card inventory is unavailable.</p> : null}
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
