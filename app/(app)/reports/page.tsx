import Link from "next/link";
import { BarChart3, Building2, CircleDollarSign, FileSignature, ShieldCheck, Target, Users } from "lucide-react";
import { GamePanel, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

async function safeCount(query: PromiseLike<{ count: number | null }>) {
  try {
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export default async function ReportsPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [players, clubs, deals, activeContracts, invoices, verifiedReps, opportunities, interests, marketLinks, playerValues, dealFees] = await Promise.all([
    safeCount(admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("clubs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("deals").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("contracts").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
    safeCount(admin.from("invoices").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).in("status", ["draft", "sent", "overdue"])),
    safeCount(admin.from("agent_player_associations").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "verified_representation")),
    safeCount(admin.from("player_opportunities").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("player_interests").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("market_radar_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
    admin.from("players").select("market_value").eq("agency_id", agencyId),
    admin.from("deals").select("agency_fee").eq("agency_id", agencyId),
  ]);

  const portfolioValue = (playerValues.data ?? []).reduce((sum, row) => sum + Number(row.market_value ?? 0), 0);
  const projectedFees = (dealFees.data ?? []).reduce((sum, row) => sum + Number(row.agency_fee ?? 0), 0);
  const readiness = Math.min(100, Math.round(((players ? 20 : 0) + (clubs ? 20 : 0) + (verifiedReps ? 20 : 0) + (marketLinks ? 20 : 0) + (activeContracts ? 20 : 0))));

  const rows = [
    ["Players", players, "/players"],
    ["Clubs", clubs, "/clubs"],
    ["Deals", deals, "/deals"],
    ["Active contracts", activeContracts, "/contracts"],
    ["Pending invoices", invoices, "/invoices"],
    ["Verified representation", verifiedReps, "/verification"],
    ["Opportunities", opportunities, "/opportunities"],
    ["Club interests", interests, "/inbox"],
    ["Football data signals", marketLinks, "/football-search"],
  ];

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="af-mode-kicker">Touchline / Reports</p>
          <h1 className="font-display mt-2 text-3xl uppercase italic sm:text-[42px]">Reports</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">Real operational reporting for portfolio value, deal activity, representation trust and database readiness.</p>
        </div>
        <Link href="/dashboard" className="inline-flex h-11 items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100">Command Center</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={CircleDollarSign} label="Portfolio Value" value={money(portfolioValue)} delta="player records" accent="cyan" />
        <StatTile icon={FileSignature} label="Projected Fees" value={money(projectedFees)} delta="deal pipeline" accent="lime" />
        <StatTile icon={ShieldCheck} label="Readiness" value={`${readiness}%`} delta="data health" accent="gold" />
        <StatTile icon={Target} label="Opportunities" value={String(opportunities)} delta="matching engine" accent="rose" />
      </div>

      <div className="mt-5 grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5"><SectionHeader kicker="Operating metrics" title="Database Health" action={<BarChart3 size={15} className="text-cyan-300" />} /></div>
          <div className="divide-y divide-white/[.06]">
            {rows.map(([label, value, href]) => (
              <Link key={String(label)} href={String(href)} className="live-row grid gap-3 p-5 transition hover:bg-white/[.025] md:grid-cols-[1fr_120px_100px] md:items-center" style={{ "--row-accent": Number(value) > 0 ? "#22d3ee" : "#64748b" } as React.CSSProperties}>
                <p className="text-sm font-black uppercase italic text-white">{label}</p>
                <p className="font-display text-2xl text-cyan-200">{String(value)}</p>
                <p className="text-[8px] font-black uppercase text-[#a3ff12]">Open →</p>
              </Link>
            ))}
          </div>
        </GamePanel>

        <div className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Agent readiness" title="Next Best Actions" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
            <div className="space-y-3">
              {[
                ["Add/complete players", players > 0, "/players", Users],
                ["Connect clubs", clubs > 0, "/clubs", Building2],
                ["Verify representation", verifiedReps > 0, "/verification", ShieldCheck],
                ["Create contracts", activeContracts > 0, "/contracts", FileSignature],
              ].map(([label, done, href, Icon]) => {
                const ActionIcon = Icon as typeof Users;
                return (
                  <Link key={String(label)} href={String(href)} className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4 transition hover:border-cyan-300/20">
                    <ActionIcon size={16} className={done ? "text-[#a3ff12]" : "text-slate-600"} />
                    <span className="text-[10px] font-black uppercase text-white">{String(label)}</span>
                    <span className="ml-auto text-[8px] font-black uppercase text-slate-500">{done ? "Ready" : "Needed"}</span>
                  </Link>
                );
              })}
            </div>
          </GamePanel>
        </div>
      </div>
    </div>
  );
}
