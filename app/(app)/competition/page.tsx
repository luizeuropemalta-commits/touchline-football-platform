import Link from "next/link";
import { Crown, Flame, Globe2, Shield, Trophy, Users, Zap } from "lucide-react";
import { GamePanel, LivePill, Meter, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

async function countRows(query: PromiseLike<{ count: number | null }>) {
  const { count } = await query;
  return count ?? 0;
}

export default async function Competition() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId, profile } = workspace;
  const [players, deals, closedDeals, opportunities, interests, predictions, agencyCount, playerValues] = await Promise.all([
    countRows(admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    countRows(admin.from("deals").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    countRows(admin.from("deals").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "completed")),
    countRows(admin.from("player_opportunities").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    countRows(admin.from("player_interests").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    countRows(admin.from("match_predictions").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    countRows(admin.from("agencies").select("id", { count: "exact", head: true })),
    admin.from("players").select("market_value").eq("agency_id", agencyId),
  ]);

  const totalValue = ((playerValues.data ?? []) as Array<{ market_value: number | null }>).reduce((sum, player) => sum + (Number(player.market_value) || 0), 0);
  const reputation = Math.min(999, Math.round(120 + players * 28 + closedDeals * 85 + interests * 24 + opportunities * 12 + predictions * 5));
  const divisionProgress = Math.min(100, Math.round((reputation / 999) * 100));
  const nextMilestone = reputation >= 850 ? "Icon Division" : reputation >= 650 ? "Elite Division" : reputation >= 420 ? "Pro Division" : "Rising Division";

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <LivePill>Reputation live</LivePill>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Calculated from real Touchline actions</span>
          </div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Agent League</h1>
          <p className="mt-1.5 text-xs text-slate-500">Your competitive score grows from real players, deals, opportunities and verified activity.</p>
        </div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[.05] px-4 py-3 text-right">
          <p className="text-[7px] font-black uppercase tracking-wider text-amber-300">Your reputation</p>
          <p className="font-display mt-1 text-2xl">{reputation}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Trophy} label="Reputation" value={String(reputation)} delta={nextMilestone} accent="gold" />
        <StatTile icon={Flame} label="Closed Deals" value={String(closedDeals)} delta={`${deals} total deals`} accent="rose" />
        <StatTile icon={Users} label="Portfolio Value" value={`€${Math.round(totalValue / 1000000)}M`} delta={`${players} players`} accent="cyan" />
        <StatTile icon={Globe2} label="Live Signals" value={String(interests + opportunities)} delta="interests + opportunities" accent="lime" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <GamePanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.07] p-5">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-300">Verified standings</p>
              <h2 className="mt-1 text-sm font-black uppercase italic">Global Agent Ranking</h2>
            </div>
            <Trophy size={17} className="text-amber-300" />
          </div>
          <div className="p-5">
            <div className="rounded-3xl border border-cyan-300/10 bg-cyan-300/[.035] p-5">
              <div className="grid items-center gap-3 sm:grid-cols-[70px_1fr_110px_100px]">
                <span className="font-display text-2xl text-amber-300">#—</span>
                <div>
                  <p className="text-[10px] font-black uppercase italic">{profile.full_name || "Touchline Founder"}</p>
                  <p className="mt-1 text-[7px] font-bold text-slate-600">Your agency workspace · real score only</p>
                </div>
                <div>
                  <p className="text-[7px] text-slate-600">REPUTATION</p>
                  <p className="mt-1 text-xs font-black">{reputation}</p>
                </div>
                <span className="justify-self-start rounded-md border border-cyan-300/20 px-2 py-1 text-[7px] font-black text-cyan-300">VERIFIED DATA</span>
              </div>
            </div>
            <p className="mt-5 text-[10px] leading-6 text-slate-500">
              Touchline will publish global ranks only when there are enough verified agencies and anti-fraud checks. Until then, this page uses your real activity and does not show invented competitors.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[7px] text-slate-600">AGENCIES READY</p>
                <p className="mt-1 font-display text-2xl text-cyan-300">{agencyCount}</p>
              </div>
              <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[7px] text-slate-600">MINIMUM FOR PUBLIC RANK</p>
                <p className="mt-1 font-display text-2xl text-[#a3ff12]">25</p>
              </div>
              <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[7px] text-slate-600">STATUS</p>
                <p className="mt-1 text-xs font-black uppercase text-amber-300">{agencyCount >= 25 ? "Ready" : "Building network"}</p>
              </div>
            </div>
          </div>
        </GamePanel>

        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Division Status" title={nextMilestone} action={<Crown size={17} className="text-amber-300" />} />
            <div className="mt-5 text-center">
              <div className="mx-auto grid size-24 place-items-center rounded-full border border-amber-300/25 bg-amber-300/[.06] shadow-[0_0_35px_rgba(247,198,93,.1)]">
                <Shield size={38} className="text-amber-300" />
              </div>
              <p className="mt-4 text-[9px] font-bold text-slate-500">Progress based on real operating activity</p>
              <div className="mt-3"><Meter value={divisionProgress} color="gold" /></div>
            </div>
          </GamePanel>
          <GamePanel className="p-5">
            <SectionHeader kicker="Points only" title="Prediction League" action={<Zap size={15} className="text-[#a3ff12]" />} />
            <p className="text-[9px] leading-5 text-slate-500">Non-gambling gamification. Match and transfer predictions add virtual points only.</p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-[7px] text-slate-600">PREDICTIONS</p>
                <p className="mt-1 text-lg font-black">{predictions}</p>
              </div>
              <Link href="/world" className="text-[8px] font-black uppercase text-[#a3ff12]">Open public world →</Link>
            </div>
          </GamePanel>
        </div>
      </div>
    </div>
  );
}
