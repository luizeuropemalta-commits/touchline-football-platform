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
type HealthStatus = "READY" | "NOT_CONFIGURED_YET" | "PARTIALLY_IMPLEMENTED" | "ERROR";
type HealthCheck = {
  area: string;
  name: string;
  purpose: string;
  configured: boolean;
  required: "Required" | "Optional" | "Required for billing" | "Required for automation";
  status: HealthStatus;
  detail: string;
};

const stripePriceEnvKeys = [
  "STRIPE_PRICE_STARTER_AGENT_MONTHLY",
  "STRIPE_PRICE_STARTER_AGENT_YEARLY",
  "STRIPE_PRICE_PRO_AGENT_MONTHLY",
  "STRIPE_PRICE_PRO_AGENT_YEARLY",
  "STRIPE_PRICE_ELITE_AGENCY_MONTHLY",
  "STRIPE_PRICE_ELITE_AGENCY_YEARLY",
  "STRIPE_PRICE_CLUB_BASIC_MONTHLY",
  "STRIPE_PRICE_CLUB_BASIC_YEARLY",
  "STRIPE_PRICE_CLUB_PRO_MONTHLY",
  "STRIPE_PRICE_CLUB_PRO_YEARLY",
  "STRIPE_PRICE_CLUB_ELITE_MONTHLY",
  "STRIPE_PRICE_CLUB_ELITE_YEARLY",
  "STRIPE_PRICE_ACADEMY_MONTHLY",
  "STRIPE_PRICE_ACADEMY_YEARLY",
  "STRIPE_PRICE_FOUNDER_YEARLY",
] as const;

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isPlaceholder(value: string) {
  const lower = value.toLowerCase();
  return (
    !value ||
    value === "price_" ||
    lower.includes("your-") ||
    lower.includes("your_") ||
    lower.includes("replace-with") ||
    lower.includes("example.com")
  );
}

function hasEnv(name: string) {
  return !isPlaceholder(envValue(name));
}

function statusText(status: HealthStatus) {
  if (status === "NOT_CONFIGURED_YET") return "Not Configured Yet";
  if (status === "PARTIALLY_IMPLEMENTED") return "Partially Implemented";
  return status === "READY" ? "Ready" : "Error";
}

function statusClasses(status: HealthStatus) {
  if (status === "READY") return "border-[#a3ff12]/20 bg-[#a3ff12]/10 text-[#caff6d]";
  if (status === "ERROR") return "border-rose-300/25 bg-rose-300/10 text-rose-200";
  if (status === "PARTIALLY_IMPLEMENTED") return "border-amber-300/25 bg-amber-300/10 text-amber-200";
  return "border-cyan-300/20 bg-cyan-300/[.07] text-cyan-100";
}

function statusIcon(status: HealthStatus) {
  if (status === "READY") return <CheckCircle2 size={16} className="text-[#a3ff12]" />;
  if (status === "ERROR") return <AlertTriangle size={16} className="text-rose-300" />;
  return <AlertTriangle size={16} className={status === "PARTIALLY_IMPLEMENTED" ? "text-amber-300" : "text-cyan-300"} />;
}

function healthStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.some((check) => check.status === "ERROR")) return "ERROR";
  if (checks.some((check) => check.status === "PARTIALLY_IMPLEMENTED")) return "PARTIALLY_IMPLEMENTED";
  if (checks.some((check) => check.status === "NOT_CONFIGURED_YET")) return "NOT_CONFIGURED_YET";
  return "READY";
}

async function checkApiFootball(): Promise<HealthCheck> {
  const keyConfigured = hasEnv("API_FOOTBALL_KEY") || hasEnv("APISPORTS_KEY");
  const baseUrl = envValue("API_FOOTBALL_BASE_URL") || "https://v3.football.api-sports.io";

  if (!keyConfigured) {
    return {
      area: "API-Football",
      name: "API-Football connection",
      purpose: "Optional football data search and provider player ID lookup.",
      configured: false,
      required: "Optional",
      status: "NOT_CONFIGURED_YET",
      detail: "No API-Football/API-SPORTS key is configured. This is optional unless live provider search is required.",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(new URL("/status", baseUrl), {
      headers: {
        "x-apisports-key": envValue("API_FOOTBALL_KEY") || envValue("APISPORTS_KEY"),
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        area: "API-Football",
        name: "API-Football connection",
        purpose: "Optional football data search and provider player ID lookup.",
        configured: true,
        required: "Optional",
        status: "ERROR",
        detail: `API-Football responded with HTTP ${response.status}. Check key, quota and base URL.`,
      };
    }

    const body = await response.json().catch(() => null);
    return {
      area: "API-Football",
      name: "API-Football connection",
      purpose: "Optional football data search and provider player ID lookup.",
      configured: true,
      required: "Optional",
      status: body ? "READY" : "ERROR",
      detail: body ? "API key exists and the provider status endpoint returned JSON." : "Provider response was not valid JSON.",
    };
  } catch (error) {
    return {
      area: "API-Football",
      name: "API-Football connection",
      purpose: "Optional football data search and provider player ID lookup.",
      configured: true,
      required: "Optional",
      status: "ERROR",
      detail: error instanceof Error ? error.message : "Could not verify API-Football connection.",
    };
  }
}

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
    totalGlobalLinks,
    totalDocuments,
    activeSubscriptions,
    pendingReviews,
    billingCustomersCheck,
    billingInvoicesCheck,
    webhookEventsCheck,
    founderSlotsCheck,
    globalLinksTableCheck,
    authenticatedUsersCheck,
    authenticatedPlayersCheck,
    apiFootballCheck,
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
    safeCount(admin.from("global_football_links").select("id", { count: "exact", head: true })),
    safeCount(admin.from("player_documents").select("id", { count: "exact", head: true })),
    safeCount(admin.from("billing_subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing", "past_due"])),
    safeCount(admin.from("representation_admin_reviews").select("id", { count: "exact", head: true }).in("review_status", ["requested", "documents_requested", "disputed"])),
    admin.from("billing_customers").select("user_id", { count: "exact", head: true }),
    admin.from("billing_invoices").select("id", { count: "exact", head: true }),
    admin.from("stripe_webhook_events").select("stripe_event_id", { count: "exact", head: true }),
    admin.from("founder_plan_slots").select("user_id", { count: "exact", head: true }),
    admin.from("global_football_links").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("players").select("id", { count: "exact", head: true }),
    checkApiFootball(),
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

  const supabaseEnvReady = hasEnv("NEXT_PUBLIC_SUPABASE_URL") && hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabaseAdminReady = hasEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseQueryErrors = [
    authResult.error,
    publicUsersResult.error,
    agenciesResult.error,
    playersResult.error,
  ].filter(Boolean);
  const billingTableErrors = [
    subscriptionsResult.error,
    alertsResult.error,
    billingCustomersCheck.error,
    billingInvoicesCheck.error,
    webhookEventsCheck.error,
    founderSlotsCheck.error,
  ].filter(Boolean);
  const authenticatedAccessErrors = [
    authenticatedUsersCheck.error,
    authenticatedPlayersCheck.error,
  ].filter(Boolean);
  const stripeSecretConfigured = hasEnv("STRIPE_SECRET_KEY");
  const stripeWebhookConfigured = hasEnv("STRIPE_WEBHOOK_SECRET");
  const stripeSecretLooksValid = !stripeSecretConfigured || /^sk_(test|live)_/.test(envValue("STRIPE_SECRET_KEY"));
  const stripeWebhookLooksValid = !stripeWebhookConfigured || envValue("STRIPE_WEBHOOK_SECRET").startsWith("whsec_");
  const configuredPriceKeys = stripePriceEnvKeys.filter((key) => hasEnv(key));
  const stripeAllPricesConfigured = configuredPriceKeys.length === stripePriceEnvKeys.length;
  const marketSyncSecretConfigured = hasEnv("MARKET_SYNC_SECRET") || hasEnv("CRON_SECRET");
  const licensedMarketProviderConfigured = hasEnv("FOOTBALL_MARKET_DATA_API_URL") && hasEnv("FOOTBALL_MARKET_DATA_API_KEY");

  const stripeSystemStatus: HealthStatus = !stripeSecretConfigured && !stripeWebhookConfigured && configuredPriceKeys.length === 0
    ? "NOT_CONFIGURED_YET"
    : billingTableErrors.length || !stripeSecretLooksValid || !stripeWebhookLooksValid
      ? "ERROR"
      : stripeSecretConfigured && stripeWebhookConfigured && stripeAllPricesConfigured
        ? "READY"
        : "PARTIALLY_IMPLEMENTED";

  const supabaseSystemStatus: HealthStatus = !supabaseEnvReady || !supabaseAdminReady
    ? "NOT_CONFIGURED_YET"
    : supabaseQueryErrors.length
      ? "ERROR"
      : "READY";

  const marketSyncStatus: HealthStatus = !marketSyncSecretConfigured
    ? "NOT_CONFIGURED_YET"
    : licensedMarketProviderConfigured || hasEnv("API_FOOTBALL_KEY") || hasEnv("APISPORTS_KEY")
      ? "READY"
      : "PARTIALLY_IMPLEMENTED";
  const linkIndexStatus: HealthStatus = globalLinksTableCheck.error
    ? "PARTIALLY_IMPLEMENTED"
    : marketSyncSecretConfigured
      ? "READY"
      : "NOT_CONFIGURED_YET";

  const healthChecks: HealthCheck[] = [
    {
      area: "Supabase",
      name: "Supabase environment",
      purpose: "Frontend auth, server sessions and service-role admin operations.",
      configured: supabaseEnvReady && supabaseAdminReady,
      required: "Required",
      status: supabaseSystemStatus,
      detail: supabaseSystemStatus === "READY"
        ? "Public URL, anon key and service role are present; auth/admin queries returned successfully."
        : supabaseSystemStatus === "ERROR"
          ? `Supabase query returned an error: ${supabaseQueryErrors[0]?.message ?? "unknown"}`
          : "Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
    },
    {
      area: "Supabase",
      name: "Protected route/auth flow",
      purpose: "Login, registration, session persistence and private route redirects.",
      configured: supabaseEnvReady,
      required: "Required",
      status: supabaseEnvReady && authenticatedAccessErrors.length === 0 ? "READY" : supabaseEnvReady ? "ERROR" : "NOT_CONFIGURED_YET",
      detail: supabaseEnvReady && authenticatedAccessErrors.length === 0
        ? "SSR cookie sessions, protected routes and authenticated Supabase reads are working. Google OAuth is optional and controlled separately."
        : supabaseEnvReady
          ? `Authenticated Supabase/RLS check failed: ${authenticatedAccessErrors[0]?.message ?? "unknown"}`
        : "Supabase public URL/key are required before auth flows can work.",
    },
    {
      area: "Supabase",
      name: "RLS policy access check",
      purpose: "Confirms authenticated users can read their permitted user/player records without service-role bypass.",
      configured: supabaseEnvReady,
      required: "Required",
      status: !supabaseEnvReady ? "NOT_CONFIGURED_YET" : authenticatedAccessErrors.length ? "ERROR" : "READY",
      detail: authenticatedAccessErrors.length
        ? `Authenticated client query failed: ${authenticatedAccessErrors[0]?.message ?? "unknown"}`
        : "Authenticated client queries ran through RLS without errors. Deeper policy review still lives in Supabase migrations.",
    },
    {
      area: "Stripe",
      name: "Stripe billing system",
      purpose: "Checkout, portal, webhook processing, subscriptions, invoices and billing alerts.",
      configured: stripeSecretConfigured || stripeWebhookConfigured || configuredPriceKeys.length > 0,
      required: "Required for billing",
      status: stripeSystemStatus,
      detail: stripeSystemStatus === "READY"
        ? "Stripe secret, webhook secret, all monthly/yearly price IDs and billing tables are configured."
        : stripeSystemStatus === "NOT_CONFIGURED_YET"
          ? "Stripe code and tables exist, but billing environment variables are not configured yet."
          : stripeSystemStatus === "PARTIALLY_IMPLEMENTED"
            ? `Stripe is partially configured: ${configuredPriceKeys.length}/${stripePriceEnvKeys.length} price IDs set; webhook=${stripeWebhookConfigured ? "set" : "not set"}; secret=${stripeSecretConfigured ? "set" : "not set"}.`
            : billingTableErrors.length
              ? `Billing table check failed: ${billingTableErrors[0]?.message ?? "unknown"}`
              : "Stripe environment value appears invalid. Check key prefixes and price IDs.",
    },
    {
      area: "Stripe",
      name: "Stripe webhook endpoint",
      purpose: "Synchronizes subscriptions, invoices, payment failures and trial alerts.",
      configured: stripeWebhookConfigured,
      required: "Required for billing",
      status: !stripeSecretConfigured && !stripeWebhookConfigured
        ? "NOT_CONFIGURED_YET"
        : billingTableErrors.length || (stripeWebhookConfigured && !stripeWebhookLooksValid)
          ? "ERROR"
          : stripeWebhookConfigured
            ? "READY"
            : "PARTIALLY_IMPLEMENTED",
      detail: stripeWebhookConfigured
        ? "Webhook route exists at /api/stripe/webhook and validates Stripe signatures before syncing billing tables."
        : stripeSecretConfigured
          ? "Stripe secret exists, but the webhook secret is not configured yet. Billing can start checkout, but subscription/invoice sync is not complete."
          : "Webhook is not configured yet. This is not an app error until live Stripe billing is expected.",
    },
    {
      area: "Stripe",
      name: "Subscription feature restrictions",
      purpose: "Controls plan-based access to premium routes and upgrade prompts.",
      configured: true,
      required: "Required for billing",
      status: "PARTIALLY_IMPLEMENTED",
      detail: "Plan restriction code exists in proxy.ts, but beta full access is currently enabled so you can test the full platform as owner/beta.",
    },
    {
      area: "API-Football",
      name: apiFootballCheck.name,
      purpose: apiFootballCheck.purpose,
      configured: apiFootballCheck.configured,
      required: apiFootballCheck.required,
      status: apiFootballCheck.status,
      detail: apiFootballCheck.detail,
    },
    {
      area: "Market Sync",
      name: "Market sync automation",
      purpose: "Vercel cron calls /api/market-sync and /api/radar/refresh with a bearer secret.",
      configured: marketSyncSecretConfigured,
      required: "Required for automation",
      status: marketSyncStatus,
      detail: marketSyncStatus === "READY"
        ? "Cron routes exist, a sync secret is configured, and at least one provider key/source is available."
        : marketSyncStatus === "PARTIALLY_IMPLEMENTED"
          ? "Cron routes and secret exist, but no licensed market provider/API-Football key is configured for external player refresh."
          : "Cron routes are implemented, but MARKET_SYNC_SECRET or CRON_SECRET is not configured yet.",
    },
    {
      area: "Link Index",
      name: "Automatic football link index",
      purpose: "Daily cron indexes Transfermarkt links already discovered inside Touchline activity.",
      configured: marketSyncSecretConfigured,
      required: "Required for automation",
      status: linkIndexStatus,
      detail: globalLinksTableCheck.error
        ? `Link index migration needs to be applied in Supabase: ${globalLinksTableCheck.error.message}`
        : marketSyncSecretConfigured
          ? "Automatic link index route exists at /api/link-index/sync and runs daily from Vercel Cron."
          : "Configure MARKET_SYNC_SECRET or CRON_SECRET so the daily link indexer can run securely.",
    },
    {
      area: "Owner Admin",
      name: "Owner/admin access control",
      purpose: "Restricts the owner panel and manual beta access grants.",
      configured: true,
      required: "Required",
      status: "PARTIALLY_IMPLEMENTED",
      detail: "Owner access is controlled by TOUCHLINE_OWNER_EMAILS or the default owner email. The first registered user is not automatically promoted to owner.",
    },
  ];

  const envTable: HealthCheck[] = [
    { area: "Env", name: "NEXT_PUBLIC_SUPABASE_URL", purpose: "Supabase project URL for auth and database.", configured: hasEnv("NEXT_PUBLIC_SUPABASE_URL"), required: "Required", status: hasEnv("NEXT_PUBLIC_SUPABASE_URL") ? "READY" : "NOT_CONFIGURED_YET", detail: "Required for frontend and server Supabase clients." },
    { area: "Env", name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", purpose: "Public anon/publishable Supabase key.", configured: hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), required: "Required", status: hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "READY" : "NOT_CONFIGURED_YET", detail: "Required for login, register and sessions." },
    { area: "Env", name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Server-only admin database operations.", configured: hasEnv("SUPABASE_SERVICE_ROLE_KEY"), required: "Required", status: hasEnv("SUPABASE_SERVICE_ROLE_KEY") ? "READY" : "NOT_CONFIGURED_YET", detail: "Never expose this key in frontend code." },
    { area: "Env", name: "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH", purpose: "Shows/enables the Google login button.", configured: envValue("NEXT_PUBLIC_ENABLE_GOOGLE_AUTH") === "true", required: "Optional", status: envValue("NEXT_PUBLIC_ENABLE_GOOGLE_AUTH") === "true" ? "PARTIALLY_IMPLEMENTED" : "NOT_CONFIGURED_YET", detail: "Only enable after Google provider is enabled in Supabase Auth." },
    { area: "Env", name: "STRIPE_SECRET_KEY", purpose: "Stripe Checkout and Billing Portal server key.", configured: stripeSecretConfigured, required: "Required for billing", status: stripeSecretConfigured ? (stripeSecretLooksValid ? "READY" : "ERROR") : "NOT_CONFIGURED_YET", detail: "Required before paid checkout can work." },
    { area: "Env", name: "STRIPE_WEBHOOK_SECRET", purpose: "Validates Stripe webhook signatures.", configured: stripeWebhookConfigured, required: "Required for billing", status: stripeWebhookConfigured ? (stripeWebhookLooksValid ? "READY" : "ERROR") : "NOT_CONFIGURED_YET", detail: "Required before subscription/invoice state can sync automatically." },
    { area: "Env", name: "STRIPE_PRICE_*", purpose: "Monthly/yearly Stripe prices for all plans.", configured: stripeAllPricesConfigured, required: "Required for billing", status: stripeAllPricesConfigured ? "READY" : configuredPriceKeys.length ? "PARTIALLY_IMPLEMENTED" : "NOT_CONFIGURED_YET", detail: `${configuredPriceKeys.length}/${stripePriceEnvKeys.length} Stripe price IDs configured.` },
    { area: "Env", name: "MARKET_SYNC_SECRET / CRON_SECRET", purpose: "Protects scheduled sync endpoints.", configured: marketSyncSecretConfigured, required: "Required for automation", status: marketSyncSecretConfigured ? "READY" : "NOT_CONFIGURED_YET", detail: "Required for Vercel Cron to call sync endpoints securely." },
    { area: "Env", name: "TOUCHLINE_LINK_INDEX_*", purpose: "Optional daily limits for automatic internal link indexing.", configured: hasEnv("TOUCHLINE_LINK_INDEX_DAILY_LIMIT") || hasEnv("TOUCHLINE_LINK_INDEX_SYNC_LIMIT"), required: "Optional", status: "READY", detail: "Defaults to 1000 links/day if not set. This indexes Touchline activity, not external site crawling." },
    { area: "Env", name: "FOOTBALL_MARKET_DATA_API_*", purpose: "Licensed provider for market value/club/contract sync.", configured: licensedMarketProviderConfigured, required: "Optional", status: licensedMarketProviderConfigured ? "READY" : "NOT_CONFIGURED_YET", detail: "Optional unless professional market value sync is required." },
    { area: "Env", name: "API_FOOTBALL_KEY", purpose: "Optional API-Football player/stat data provider.", configured: hasEnv("API_FOOTBALL_KEY") || hasEnv("APISPORTS_KEY"), required: "Optional", status: apiFootballCheck.status, detail: apiFootballCheck.detail },
    { area: "Env", name: "TOUCHLINE_OWNER_EMAILS", purpose: "Comma-separated owner emails.", configured: hasEnv("TOUCHLINE_OWNER_EMAILS"), required: "Optional", status: hasEnv("TOUCHLINE_OWNER_EMAILS") ? "READY" : "PARTIALLY_IMPLEMENTED", detail: "If missing, the app falls back to the built-in default owner email." },
  ];

  const reportItems = [
    ["Stripe", healthStatus(healthChecks.filter((item) => item.area === "Stripe")), "Checkout, billing portal and webhook code exist. Billing is ready only when secret, webhook and every Stripe price ID are configured."],
    ["Supabase", supabaseSystemStatus, "Database, auth users and admin queries are checked against the live Supabase client used by the page."],
    ["API-Football", apiFootballCheck.status, apiFootballCheck.detail],
    ["Market Sync", marketSyncStatus, "Cron routes are implemented in vercel.json. Full data refresh depends on a sync secret and a configured provider."],
    ["Automatic Link Index", linkIndexStatus, "Touchline now indexes Transfermarkt links discovered inside internal players, Radar and social posts. It does not crawl third-party sites directly."],
    ["Authentication", supabaseEnvReady ? "READY" : "NOT_CONFIGURED_YET", "Password login/register/session cookies are implemented. Google OAuth is optional and should stay disabled until Supabase provider setup is complete."],
    ["Owner Admin", "PARTIALLY_IMPLEMENTED", "Owner email protection and manual beta grants exist. First registered user is not auto-owner; full role management can be expanded later."],
  ] as Array<[string, HealthStatus, string]>;

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        <StatTile icon={Users} label="Auth Users" value={String(authUsers.length)} delta="loaded users" accent="cyan" />
        <StatTile icon={Building2} label="Agencies" value={String(totalAgencies)} delta="workspaces" accent="lime" />
        <StatTile icon={Building2} label="Clubs" value={String(totalClubs)} delta="club records" accent="cyan" />
        <StatTile icon={Crown} label="Active Access" value={String(activeSubscriptions)} delta="subs/grants" accent="gold" />
        <StatTile icon={Radio} label="Players" value={String(totalPlayers)} delta="local vault" accent="cyan" />
        <StatTile icon={Database} label="Global Profiles" value={String(totalGlobalProfiles)} delta="search index" accent="lime" />
        <StatTile icon={Link2} label="Link Index" value={String(totalGlobalLinks)} delta="auto indexed" accent="cyan" />
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
              <h2 className="mt-1 text-xl font-black uppercase italic text-white">Live operational audit</h2>
            </div>
          </div>
          <div className={`mt-5 rounded-2xl border p-4 ${statusClasses(healthStatus(healthChecks))}`}>
            <p className="text-[8px] font-black uppercase tracking-[.18em] opacity-70">Overall platform status</p>
            <p className="mt-1 text-sm font-black uppercase italic">{statusText(healthStatus(healthChecks))}</p>
            <p className="mt-2 text-[10px] leading-5 opacity-70">Unconfigured optional systems are reported as Not Configured Yet, not as errors.</p>
          </div>
          <div className="mt-5 space-y-2">
            {healthChecks.map((check) => (
              <div key={`${check.area}-${check.name}`} className="flex items-start gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3">
                <div className="mt-0.5">{statusIcon(check.status)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] font-black uppercase tracking-[.16em] text-cyan-300/65">{check.area}</p>
                  <p className="mt-0.5 text-[10px] font-black uppercase text-white">{check.name}</p>
                  <p className="mt-1 text-[8px] font-bold uppercase leading-4 tracking-wider text-slate-600">{check.detail}</p>
                </div>
                <span className={`shrink-0 rounded-lg border px-2 py-1 text-[7px] font-black uppercase tracking-wider ${statusClasses(check.status)}`}>{statusText(check.status)}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
            <p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-200">Route protection</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">Dashboard, players, agencies, documents, calendar, reports, radar, verification, billing and admin routes are private. The admin page checks owner email before loading data. Subscription feature gates currently allow beta full access in code.</p>
          </div>
        </GamePanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5">
            <p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-300">Environment Variable Audit</p>
            <h2 className="mt-1 text-xl font-black uppercase italic text-white">Configuration matrix</h2>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">Secret values are never displayed. This table only checks whether values appear configured and whether they look like placeholders.</p>
          </div>
          <div className="divide-y divide-white/[.06]">
            {envTable.map((item) => (
              <div key={item.name} className="grid gap-3 p-4 text-[10px] sm:grid-cols-[1.15fr_1.3fr_120px_150px] sm:items-center">
                <div>
                  <p className="font-black uppercase text-white">{item.name}</p>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{item.required}</p>
                </div>
                <p className="text-[9px] leading-5 text-slate-500">{item.purpose}</p>
                <span className={`w-fit rounded-lg border px-2 py-1 text-[7px] font-black uppercase tracking-wider ${item.configured ? "border-[#a3ff12]/20 bg-[#a3ff12]/10 text-[#caff6d]" : "border-cyan-300/20 bg-cyan-300/[.07] text-cyan-100"}`}>
                  {item.configured ? "Configured" : "Not set"}
                </span>
                <span className={`w-fit rounded-lg border px-2 py-1 text-[7px] font-black uppercase tracking-wider ${statusClasses(item.status)}`}>{statusText(item.status)}</span>
              </div>
            ))}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-amber-300">Audit Report</p>
          <h2 className="mt-1 text-xl font-black uppercase italic text-white">What is real vs pending</h2>
          <div className="mt-5 space-y-3">
            {reportItems.map(([name, status, detail]) => (
              <div key={name} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-black uppercase italic text-white">{name}</p>
                  <span className={`shrink-0 rounded-lg border px-2 py-1 text-[7px] font-black uppercase tracking-wider ${statusClasses(status)}`}>{statusText(status)}</span>
                </div>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">{detail}</p>
              </div>
            ))}
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
