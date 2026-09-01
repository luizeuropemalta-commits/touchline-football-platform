import Link from "next/link";
import { Database, ShieldCheck, Workflow } from "lucide-react";

import { AdminCardEngineConsole } from "@/components/admin-card-engine-console";
import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { touchLineAuthEntryHref, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";
function unavailable(error: unknown) { return /does not exist|schema cache|Could not find/i.test(String(error ?? "")); }

export default async function CardEnginePage() {
  const supabase = await createClient(); const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) return <GamePanel className="p-8"><LivePill>Owner area</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">Card Engine</h1><p className="mt-3 text-sm text-slate-400">Sign in as the TouchLine owner to review protected editorial card decisions.</p><Link href={touchLineAuthEntryHref("/login", "en-GB", touchLineAuthHref("/admin/card-engine", "en-GB"))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">Sign in</Link></GamePanel>;
  if (!isOwnerEmail(user.email) || !admin) return <GamePanel className="p-8"><LivePill>Owner-only</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">Card Engine unavailable</h1></GamePanel>;
  const { data: players } = await admin.from("football_players").select("id,provider_player_id,display_name,name,football_clubs:current_club_id(name)").eq("provider", "sportmonks").not("current_club_id", "is", null).order("display_name").limit(750);
  const batchesResult = await admin.from("touchline_card_editorial_batches").select("id,status,rows_received,matched_rows,review_rows,conflict_rows,unmatched_rows,created_at").order("created_at", { ascending: false }).limit(30);
  const overridesResult = await admin.from("touchline_card_editorial_overrides").select("id,field_key,status,player_id,effective_value,source_batch_id,approved_at,provenance_status,provisional_reason,last_verification_at,next_verification_at,sources_consulted").order("updated_at", { ascending: false }).limit(100);
  const provisionalCountResult = await admin.from("touchline_card_editorial_overrides").select("id", { count: "exact", head: true }).eq("status", "provisional");
  const migrationReady = !batchesResult.error && !overridesResult.error && !provisionalCountResult.error;
  const playerOptions = (players ?? []).map((player) => {
    const club = Array.isArray(player.football_clubs) ? player.football_clubs[0] : player.football_clubs;
    return { id: player.id, providerPlayerId: player.provider_player_id, name: player.display_name || player.name || "Unnamed player", club: club?.name || "Unassigned club" };
  }).filter((player) => Boolean(player.providerPlayerId));
  const batches = migrationReady ? batchesResult.data ?? [] : [];
  const overrides = migrationReady ? overridesResult.data ?? [] : [];
  const review = batches.reduce((count, batch) => count + batch.review_rows + batch.conflict_rows + batch.unmatched_rows, 0);
  const published = batches.filter((batch) => batch.status === "published").length;
  const provisional = provisionalCountResult.count ?? 0;
  return <div className="mx-auto max-w-[1500px] space-y-6">
    <GamePanel className="overflow-hidden p-6 sm:p-8"><LivePill>QA only · protected editorial source</LivePill><h1 className="mt-5 max-w-4xl text-5xl font-black italic leading-[.9] text-white md:text-7xl">TouchLine Card Engine</h1><p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">TouchLine verifies football identity, facts and genuine transfers. TouchLine owns approved card presentation, editorial Market Value, tier calculation and audit provenance. Manual decisions require owner approval; permanent provisional defaults remain explicitly labelled and monitored.</p><p className="mt-4 text-xs text-slate-500">Official value → TouchLine override → effective value. Stale or provisional fields are surfaced for review; raw football facts are not editable here.</p></GamePanel>
    <div className="grid gap-4 md:grid-cols-4"><StatTile icon={Database} label="Canonical candidates" value={String(playerOptions.length)} delta="provider-backed, read only" accent="cyan"/><StatTile icon={Workflow} label="Review blockers" value={String(review)} delta="conflict / unmatched / manual review" accent={review ? "rose" : "lime"}/><StatTile icon={Workflow} label="Provisional queue" value={String(provisional)} delta="monitored, not official" accent={provisional ? "gold" : "lime"}/><StatTile icon={ShieldCheck} label="Published batches" value={String(published)} delta={migrationReady ? "rollback available" : "schema pending"} accent="gold"/></div>
    {!migrationReady && !unavailable(batchesResult.error?.message) ? <GamePanel className="p-5 text-sm text-rose-100">Card Engine store could not be read: {batchesResult.error?.message}</GamePanel> : null}
    <AdminCardEngineConsole players={playerOptions} batches={batches} overrides={overrides} migrationReady={migrationReady}/>
  </div>;
}
