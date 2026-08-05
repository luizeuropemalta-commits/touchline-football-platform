import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, Database, Search, ShieldCheck } from "lucide-react";

import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";

type ValueRow = {
  player_id: string;
  market_value_eur: number | null;
  status: "pending" | "ready" | "verified" | "rejected" | "unavailable";
  confidence: string;
  last_verified: string | null;
  verified_season: string | null;
  football_players: { display_name: string | null; provider_player_id: string | null } | null;
};

function euro(value: number | null) {
  if (value === null) return "Market Value Pending";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-GB");
}

export default async function MarketValueAdminPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const term = typeof params.q === "string" ? params.q.trim() : "";
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) return <GamePanel className="p-8"><LivePill>Owner area</LivePill><h1 className="mt-4 text-4xl font-black italic text-white">Market Value Admin</h1><p className="mt-3 text-sm text-slate-400">Sign in as the TouchLine owner to review licensed value imports.</p><Link className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black" href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/market-values", locale))}>Sign in</Link></GamePanel>;
  if (!isOwnerEmail(user.email)) notFound();
  if (!admin) return <GamePanel className="p-8"><LivePill>Configuration required</LivePill><h1 className="mt-4 text-4xl font-black italic text-white">Market Value Admin</h1><p className="mt-3 text-sm text-slate-400">The protected server client is required for value review.</p></GamePanel>;

  let query = admin
    .from("football_player_market_values")
    .select("player_id,market_value_eur,status,confidence,last_verified,verified_season,football_players!inner(display_name,provider_player_id)")
    .order("last_verified", { ascending: false, nullsFirst: false })
    .limit(100);
  if (term) query = query.ilike("football_players.display_name", `%${term.replace(/[%_]/g, "")}%`);
  const [{ data, error }, { count: pendingCount, error: pendingError }, { count: verifiedCount, error: verifiedError }, { count: itemCount, error: itemError }] = await Promise.all([
    query.returns<ValueRow[]>(),
    admin.from("football_player_market_values").select("player_id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("football_player_market_values").select("player_id", { count: "exact", head: true }).eq("status", "verified"),
    admin.from("football_market_value_import_items").select("id", { count: "exact", head: true }).in("status", ["pending", "rejected"]),
  ]);
  const rows = data ?? [];

  return <div className="mx-auto max-w-[1400px] space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><LivePill>TouchLine-owned data</LivePill><h1 className="mt-3 text-4xl font-black italic text-white">Market Value Admin</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Review-only workflow for licensed imports. Values never change card tiers, borders, nominal prices or active contracts during the season.</p></div><Link href={touchLineAuthHref("/admin", locale)} className="rounded-2xl border border-cyan-300/20 px-4 py-3 text-xs font-black text-cyan-100">Owner Admin</Link></div>
    <div className="grid gap-3 md:grid-cols-3"><StatTile icon={CheckCircle2} label="Verified" value={verifiedError ? "—" : String(verifiedCount ?? 0)} delta="approved TouchLine values" accent="lime"/><StatTile icon={Clock3} label="Pending" value={pendingError ? "—" : String(pendingCount ?? 0)} delta="requires verification" accent="gold"/><StatTile icon={ShieldCheck} label="Review queue" value={itemError ? "—" : String(itemCount ?? 0)} delta="mapping or import issue" accent="rose"/></div>
    <GamePanel className="p-5"><form className="flex gap-3"><label className="sr-only" htmlFor="market-search">Search player</label><input id="market-search" name="q" defaultValue={term} placeholder="Search player" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"/><button className="inline-flex items-center gap-2 rounded-xl bg-[#a3ff12] px-4 py-3 text-xs font-black text-black"><Search size={14}/>Search</button></form><p className="mt-3 text-xs text-slate-500">CSV import is served by the protected <code>/api/admin/market-values/import</code> route. XLSX requires the configured approved spreadsheet adapter. No provider is called from this page.</p></GamePanel>
    <GamePanel className="overflow-hidden"><div className="border-b border-white/10 p-5"><div className="flex items-center gap-3"><Database className="text-cyan-300" size={18}/><div><h2 className="text-lg font-black italic text-white">Current approved values</h2><p className="text-xs text-slate-500">Public profiles consume only records marked verified.</p></div></div></div><div className="divide-y divide-white/5">{error ? <p className="p-6 text-sm text-rose-200">Market-value schema is not available yet. Apply migration 050 before using this admin area.</p> : rows.map((row) => <div key={row.player_id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"><div><p className="font-black text-white">{row.football_players?.display_name ?? "Unmapped player"}</p><p className="text-xs text-slate-500">Season {row.verified_season ?? "—"} · updated {date(row.last_verified)}</p></div><p className="text-sm font-black text-white">{row.status === "verified" ? euro(row.market_value_eur) : "Market Value Pending"}</p><span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${row.status === "verified" ? "border-[#a3ff12]/30 text-[#caff6d]" : "border-amber-300/30 text-amber-200"}`}>{row.status}</span><span className="text-xs text-slate-500">{row.confidence}</span></div>)}{!error && !rows.length ? <p className="p-8 text-center text-sm text-slate-500">No matching TouchLine market values.</p> : null}</div></GamePanel>
  </div>;
}
