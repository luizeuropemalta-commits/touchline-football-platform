import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Crown,
  Database,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { AdminOwnerActions } from "@/components/admin-owner-actions";
import { GamePanel, LivePill, StatTile } from "@/components/game-ui";
import { isOwnerEmail, ownerGrantSubscriptionId } from "@/lib/admin/owner";
import { planMap, type PlanKey } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicUser = {
  id: string;
  agency_id: string | null;
  full_name: string | null;
  role: string | null;
  job_title: string | null;
  created_at: string | null;
};

type SubscriptionRow = {
  user_id: string;
  stripe_subscription_id: string;
  plan_key: string | null;
  status: string | null;
  billing_interval: string | null;
  current_period_end: string | null;
  metadata: unknown;
  created_at: string | null;
};

type AgencyRow = { id: string; name: string | null };
type PlayerRow = { id: string; first_name: string | null; last_name: string | null; position: string | null; created_at: string | null };
type RadarRow = { id: string; title: string | null; url: string | null; category: string | null; created_at: string | null };
type AlertRow = { id: string; title: string; message: string; type: string; created_at: string };

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function fullName(user?: PublicUser) {
  return user?.full_name?.trim() || "Unnamed user";
}

function playerName(player: PlayerRow) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

async function safeCount(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  try {
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function AdminOwnerPanel() {
  const supabase = await createClient();
  const admin = createAdminClient();

  if (!supabase || !admin) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <GamePanel className="p-8">
          <p className="text-[9px] font-black uppercase tracking-[.2em] text-rose-300">Admin unavailable</p>
          <h1 className="mt-2 text-3xl font-black uppercase italic text-white">Supabase admin client is not configured</h1>
          <p className="mt-3 max-w-2xl text-xs leading-6 text-slate-500">Add the public Supabase URL, anon key and service role key in Vercel to activate the owner control room.</p>
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
          <p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">Login required</p>
          <h1 className="mt-2 text-3xl font-black uppercase italic text-white">Owner access requires login</h1>
          <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black uppercase text-[#071007]">Login</Link>
        </GamePanel>
      </div>
    );
  }

  if (!isOwnerEmail(user.email)) notFound();

  const [
    authResult,
    publicUsersResult,
    agenciesResult,
    subscriptionsResult,
    playersResult,
    radarResult,
    alertsResult,
    totalAgencies,
    totalPlayers,
    totalClubs,
    totalGlobalProfiles,
    totalDocuments,
    activeSubscriptions,
    pendingReviews,
  ] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
    admin.from("users").select("id, agency_id, full_name, role, job_title, created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("agencies").select("id, name").limit(500),
    admin.from("billing_subscriptions").select("user_id, stripe_subscription_id, plan_key, status, billing_interval, current_period_end, metadata, created_at").order("created_at", { ascending: false }).limit(200),
    admin.from("players").select("id, first_name, last_name, position, created_at").order("created_at", { ascending: false }).limit(8),
    admin.from("market_radar_links").select("id, title, url, category, created_at").order("created_at", { ascending: false }).limit(8),
    admin.from("billing_alerts").select("id, title, message, type, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(8),
    safeCount(admin.from("agencies").select("id", { count: "exact", head: true })),
    safeCount(admin.from("players").select("id", { count: "exact", head: true })),
    safeCount(admin.from("clubs").select("id", { count: "exact", head: true })),
    safeCount(admin.from("global_player_profiles").select("id", { count: "exact", head: true })),
    safeCount(admin.from("player_documents").select("id", { count: "exact", head: true })),
    safeCount(admin.from("billing_subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing", "past_due"])),
    safeCount(admin.from("representation_admin_reviews").select("id", { count: "exact", head: true }).in("review_status", ["requested", "documents_requested", "disputed"])),
  ]);

  const authUsers = authResult.data?.users ?? [];
  const publicUsers = (publicUsersResult.data ?? []) as PublicUser[];
  const agencies = (agenciesResult.data ?? []) as AgencyRow[];
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
  const players = (playersResult.data ?? []) as PlayerRow[];
  const radarLinks = (radarResult.data ?? []) as RadarRow[];
  const alerts = (alertsResult.data ?? []) as AlertRow[];

  const profilesById = new Map(publicUsers.map((profile) => [profile.id, profile]));
  const agenciesById = new Map(agencies.map((agency) => [agency.id, agency.name || "Unnamed agency"]));
  const latestSubByUser = new Map<string, SubscriptionRow>();
  subscriptions.forEach((subscription) => {
    if (!latestSubByUser.has(subscription.user_id)) latestSubByUser.set(subscription.user_id, subscription);
  });

  const envChecks = [
    ["Supabase URL", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), "Frontend connection"],
    ["Supabase anon key", Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), "Public auth key"],
    ["Service role key", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), "Server admin operations"],
    ["Stripe secret", Boolean(process.env.STRIPE_SECRET_KEY), "Checkout + portal"],
    ["Stripe webhook", Boolean(process.env.STRIPE_WEBHOOK_SECRET), "Subscription sync"],
    ["Market sync secret", Boolean(process.env.MARKET_SYNC_SECRET || process.env.CRON_SECRET), "Daily sync protection"],
    ["API-Football key", Boolean(process.env.API_FOOTBALL_KEY), "Demo football data"],
  ];

  const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <LivePill>Owner control room</LivePill>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.15em] text-amber-200">Admin access active</span>
          </div>
          <h1 className="font-display text-4xl uppercase italic text-white sm:text-[52px]">Admin Owner Panel</h1>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">
            Your private operating cockpit for users, access, billing health, database coverage and football ecosystem readiness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {supabaseRef && (
            <Link href={`https://supabase.com/dashboard/project/${supabaseRef}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100">
              Supabase <ExternalLink size={13} />
            </Link>
          )}
          <Link href="https://dashboard.stripe.com/test/dashboard" target="_blank" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase text-[#caff6d]">
            Stripe <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <StatTile icon={Users} label="Auth Users" value={String(authUsers.length)} delta="loaded users" accent="cyan" />
        <StatTile icon={Building2} label="Agencies" value={String(totalAgencies)} delta="workspaces" accent="lime" />
        <StatTile icon={Building2} label="Clubs" value={String(totalClubs)} delta="club records" accent="cyan" />
        <StatTile icon={Crown} label="Active Access" value={String(activeSubscriptions)} delta="subs/grants" accent="gold" />
        <StatTile icon={Radio} label="Players" value={String(totalPlayers)} delta="local vault" accent="cyan" />
        <StatTile icon={Database} label="Global Profiles" value={String(totalGlobalProfiles)} delta="search index" accent="lime" />
        <StatTile icon={AlertTriangle} label="Reviews" value={String(pendingReviews)} delta="needs admin" accent={pendingReviews ? "rose" : "gold"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_.85fr]">
        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/10 text-[#a3ff12]"><KeyRound size={18} /></div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-[#a3ff12]">Access Control</p>
                <h2 className="mt-1 text-xl font-black uppercase italic text-white">Users & manual beta grants</h2>
              </div>
            </div>
          </div>
          <div className="divide-y divide-white/[.06]">
            {authUsers.map((authUser) => {
              const profile = profilesById.get(authUser.id);
              const subscription = latestSubByUser.get(authUser.id);
              const ownerGrantActive = subscription?.stripe_subscription_id === ownerGrantSubscriptionId(authUser.id) && ["active", "trialing", "past_due"].includes(subscription.status ?? "");
              const planName = subscription?.plan_key && subscription.plan_key in planMap ? planMap[subscription.plan_key as PlanKey].name : "No active plan";
              const agencyName = profile?.agency_id ? agenciesById.get(profile.agency_id) : null;

              return (
                <div key={authUser.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_210px_340px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black uppercase italic text-white">{fullName(profile)}</p>
                      {isOwnerEmail(authUser.email) && <span className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[7px] font-black uppercase tracking-wider text-amber-200">Owner</span>}
                      {ownerGrantActive && <span className="rounded-lg border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-2 py-1 text-[7px] font-black uppercase tracking-wider text-[#caff6d]">Manual grant</span>}
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-500">{authUser.email ?? "No email"} · {agencyName ?? "No agency loaded"}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-700">Joined {dateLabel(authUser.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[.16em] text-slate-600">Plan status</p>
                    <p className="mt-1 text-[11px] font-black uppercase text-cyan-100">{planName}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{subscription?.status ?? "no subscription"} · {subscription?.billing_interval ?? "—"}</p>
                  </div>
                  <AdminOwnerActions userId={authUser.id} ownerGrantActive={ownerGrantActive} />
                </div>
              );
            })}
            {!authUsers.length && <div className="p-8 text-center text-xs text-slate-500">No users found yet.</div>}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.08] text-cyan-300"><ShieldCheck size={18} /></div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-300">System Health</p>
              <h2 className="mt-1 text-xl font-black uppercase italic text-white">Production checklist</h2>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {envChecks.map(([label, ok, detail]) => (
              <div key={String(label)} className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3">
                {ok ? <CheckCircle2 size={16} className="text-[#a3ff12]" /> : <AlertTriangle size={16} className="text-amber-300" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase text-white">{label}</p>
                  <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-600">{detail}</p>
                </div>
                <span className={`rounded-lg px-2 py-1 text-[7px] font-black uppercase tracking-wider ${ok ? "bg-[#a3ff12]/10 text-[#caff6d]" : "bg-amber-300/10 text-amber-200"}`}>{ok ? "Ready" : "Missing"}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-200">Route protection</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">Dashboard, players, agencies, documents, calendar, reports, radar, verification, billing and admin routes are private. The admin page also checks owner email before loading data.</p>
          </div>
        </GamePanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <GamePanel className="p-5">
          <div className="mb-4 flex items-center gap-3"><Sparkles size={17} className="text-cyan-300" /><h2 className="text-sm font-black uppercase italic text-white">Recent players</h2></div>
          <div className="space-y-2">
            {players.map((player) => (
              <Link key={player.id} href={`/players/${player.id}`} className="block rounded-2xl border border-white/[.07] bg-white/[.025] p-3 transition hover:border-cyan-300/25">
                <p className="text-[11px] font-black uppercase text-white">{playerName(player)}</p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{player.position ?? "Position open"} · {dateLabel(player.created_at)}</p>
              </Link>
            ))}
            {!players.length && <p className="rounded-2xl border border-white/[.07] p-4 text-xs text-slate-500">No players created yet.</p>}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <div className="mb-4 flex items-center gap-3"><Link2 size={17} className="text-[#a3ff12]" /><h2 className="text-sm font-black uppercase italic text-white">Recent Radar links</h2></div>
          <div className="space-y-2">
            {radarLinks.map((item) => (
              <a key={item.id} href={item.url ?? "#"} target="_blank" className="block rounded-2xl border border-white/[.07] bg-white/[.025] p-3 transition hover:border-[#a3ff12]/25">
                <p className="line-clamp-1 text-[11px] font-black uppercase text-white">{item.title ?? "Untitled link"}</p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{item.category ?? "market"} · {dateLabel(item.created_at)}</p>
              </a>
            ))}
            {!radarLinks.length && <p className="rounded-2xl border border-white/[.07] p-4 text-xs text-slate-500">No radar links saved yet.</p>}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <div className="mb-4 flex items-center gap-3"><FileText size={17} className="text-amber-300" /><h2 className="text-sm font-black uppercase italic text-white">Alerts & documents</h2></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-[8px] font-black uppercase text-slate-600">Documents</p><p className="mt-2 font-display text-3xl text-white">{totalDocuments}</p></div>
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-[8px] font-black uppercase text-slate-600">Open alerts</p><p className="mt-2 font-display text-3xl text-white">{alerts.length}</p></div>
          </div>
          <div className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded-2xl border border-rose-300/20 bg-rose-300/[.07] p-3">
                <p className="text-[10px] font-black uppercase text-rose-100">{alert.title}</p>
                <p className="mt-1 text-[8px] leading-4 text-rose-100/60">{alert.message}</p>
              </div>
            ))}
            {!alerts.length && <p className="rounded-2xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.06] p-4 text-xs font-bold text-[#caff6d]">No unresolved billing alerts.</p>}
          </div>
        </GamePanel>
      </div>

      <GamePanel className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-2xl border border-amber-300/20 bg-amber-300/[.08] text-amber-300"><LockKeyhole size={18} /></div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-300">Owner note</p>
            <h2 className="mt-1 text-xl font-black uppercase italic text-white">Manual access is for beta control</h2>
            <p className="mt-2 max-w-4xl text-[10px] leading-5 text-slate-500">
              Stripe remains the professional payment system. Manual grants are marked with owner metadata and are useful for yourself, testers, partners or early clients while the business is being shaped.
            </p>
          </div>
        </div>
      </GamePanel>
    </div>
  );
}
