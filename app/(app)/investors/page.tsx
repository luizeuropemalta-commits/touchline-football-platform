import Link from "next/link";
import { Building, CircleDollarSign, Globe2, Landmark, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { GamePanel, LivePill, Meter, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

export default async function Investors() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ count: playerCount }, { count: clubCount }, { count: opportunities }, { data: values }] = await Promise.all([
    admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("clubs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("player_opportunities").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("players").select("market_value").eq("agency_id", agencyId),
  ]);
  const portfolioValue = ((values ?? []) as Array<{ market_value: number | null }>).reduce((sum, player) => sum + (Number(player.market_value) || 0), 0);
  const readiness = Math.min(100, Math.round((playerCount ? 35 : 0) + (clubCount ? 25 : 0) + (opportunities ? 25 : 0) + (portfolioValue ? 15 : 0)));

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3"><LivePill>Investor readiness</LivePill><span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Real portfolio signals only</span></div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Investor Hub</h1>
          <p className="mt-1.5 text-xs text-slate-500">A future compliant capital layer connected to real player development, academy and opportunity data.</p>
        </div>
        <Link href="/players" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]"><Landmark size={14} />Prepare portfolio</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={CircleDollarSign} label="Portfolio Value" value={`€${Math.round(portfolioValue / 1000000)}M`} delta="real player values" accent="gold" />
        <StatTile icon={Users} label="Players" value={String(playerCount ?? 0)} delta="profile records" accent="cyan" />
        <StatTile icon={Building} label="Clubs" value={String(clubCount ?? 0)} delta="network records" accent="lime" />
        <StatTile icon={TrendingUp} label="Opportunities" value={String(opportunities ?? 0)} delta="market signals" accent="rose" />
      </div>

      <GamePanel className="relative mt-5 overflow-hidden p-6 pitch-grid">
        <div className="absolute right-[-5%] top-[-70%] size-[450px] rounded-full border border-amber-300/10" />
        <div className="relative grid gap-7 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-300">Football Capital Intelligence</p>
            <h2 className="font-display mt-2 max-w-2xl text-3xl uppercase italic">Build verified proof before opening capital rooms.</h2>
            <p className="mt-3 max-w-xl text-[9px] leading-5 text-slate-500">Touchline will only show investor opportunities backed by real profiles, documents, agreements and compliance checks. No unverified funds or unsupported return projections.</p>
            <div className="mt-5 flex gap-2">
              <Link href="/verification" className="inline-flex h-10 items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100">Verify agent identity</Link>
              <Link href="/players" className="inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">Add player data</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[.08] bg-black/20 p-4"><ShieldCheck size={16} className="text-[#a3ff12]" /><p className="mt-4 text-[8px] text-slate-600">COMPLIANCE</p><p className="mt-1 text-xs font-black">REQUIRED</p></div>
            <div className="rounded-xl border border-white/[.08] bg-black/20 p-4"><Globe2 size={16} className="text-cyan-300" /><p className="mt-4 text-[8px] text-slate-600">NETWORK</p><p className="mt-1 text-xs font-black">{clubCount ?? 0} CLUBS</p></div>
            <div className="col-span-2 rounded-xl border border-white/[.08] bg-black/20 p-4"><div className="flex justify-between text-[8px] font-bold text-slate-500"><span>INVESTOR READINESS</span><span>{readiness}%</span></div><div className="mt-3"><Meter value={readiness} color="gold" /></div></div>
          </div>
        </div>
      </GamePanel>

      <section className="mt-6">
        <SectionHeader kicker="Curated Deal Rooms" title="No public investor opportunities until verified" />
        <GamePanel className="border-dashed border-amber-300/20 p-6">
          <p className="text-sm font-black uppercase italic text-white">Investor marketplace locked for compliance</p>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">This area will open only when investment workflows, legal permissions and verified opportunities are configured. That keeps the platform professional and safe.</p>
        </GamePanel>
      </section>
    </div>
  );
}
