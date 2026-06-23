import Link from "next/link";
import { ArrowUpRight, DatabaseZap, Radio, ShieldCheck, Trophy, Users } from "lucide-react";
import { GamePanel, LivePill, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  market_value: number | null;
  currency: string | null;
  clubs?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function playerName(player: PlayerRow) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

function clubName(value: PlayerRow["clubs"]) {
  const club = Array.isArray(value) ? value[0] : value;
  return club?.name ?? "No club linked";
}

function money(value: number | null, currency = "EUR") {
  if (!value) return "Value open";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default async function RankingsPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ data: players }, { count: clubs }, { count: links }, { count: snapshots }] = await Promise.all([
    admin
      .from("players")
      .select("id, first_name, last_name, position, market_value, currency, clubs:current_club_id(name)")
      .eq("agency_id", agencyId)
      .order("market_value", { ascending: false, nullsFirst: false })
      .limit(20),
    admin.from("clubs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("market_radar_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("player_market_snapshots").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
  ]);
  const rankedPlayers = (players ?? []) as PlayerRow[];

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3"><LivePill>Portfolio rankings</LivePill><span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Real data, no invented global boards</span></div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Market Rankings</h1>
          <p className="mt-1.5 max-w-2xl text-xs text-slate-500">Your player values, club links and market snapshots. Global rankings activate only with a compliant data provider.</p>
        </div>
        <div className="rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.055] px-4 py-3 text-right">
          <p className="text-[7px] font-black uppercase tracking-wider text-[#a3ff12]">Founder access</p>
          <p className="font-display mt-1 text-2xl">ADMIN</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Trophy} label="Ranked Players" value={String(rankedPlayers.length)} delta="portfolio board" accent="gold" />
        <StatTile icon={DatabaseZap} label="Market Snapshots" value={String(snapshots ?? 0)} delta="saved provider data" accent="cyan" />
        <StatTile icon={Radio} label="Radar Links" value={String(links ?? 0)} delta="market intelligence" accent="lime" />
        <StatTile icon={ShieldCheck} label="Clubs" value={String(clubs ?? 0)} delta="real records" accent="rose" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <GamePanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.07] p-5">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Real portfolio value</p>
              <h2 className="mt-1 text-sm font-black uppercase italic">Most Valuable Players</h2>
            </div>
            <span className="premium-ring grid size-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300"><Users size={18} /></span>
          </div>
          <div className="p-5">
            {rankedPlayers.length ? (
              <div className="divide-y divide-white/[.06] rounded-2xl border border-white/[.07] bg-black/10">
                {rankedPlayers.map((player, index) => (
                  <Link key={player.id} href={`/players/${player.id}`} className="live-row grid items-center gap-3 p-4 sm:grid-cols-[56px_1fr_130px_80px]" style={{ "--row-accent": index < 3 ? "#fbbf24" : "#22d3ee" } as React.CSSProperties}>
                    <span className={`font-display text-2xl ${index < 3 ? "text-amber-300" : "text-slate-600"}`}>#{index + 1}</span>
                    <div><p className="text-[10px] font-black uppercase italic">{playerName(player)}</p><p className="mt-1 text-[8px] text-slate-600">{player.position || "Position open"} · {clubName(player.clubs)}</p></div>
                    <p className="number-glow text-sm font-black">{money(player.market_value, player.currency ?? "EUR")}</p>
                    <ArrowUpRight size={13} className="text-cyan-300" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-300/[.035] p-7">
                <p className="text-sm font-black uppercase italic text-white">No players ranked yet</p>
                <p className="mt-2 text-xs leading-6 text-slate-500">Add players with market values to create your first real ranking board.</p>
                <Link href="/players" className="mt-5 inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">Add players</Link>
              </div>
            )}
          </div>
        </GamePanel>

        <GamePanel className="p-6">
          <SectionHeader kicker="Global rankings" title="Compliance Gate" action={<ShieldCheck size={16} className="text-[#a3ff12]" />} />
          <p className="text-[10px] leading-6 text-slate-500">Boards such as “most valuable players worldwide”, “richest clubs” and “top agents by market value” require licensed or contractually permitted data. Touchline can store links and previews, but it will not copy restricted databases.</p>
          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.055] p-4">
            <p className="text-[8px] font-black uppercase tracking-wider text-amber-300">Recommended production route</p>
            <p className="mt-2 text-[9px] leading-5 text-slate-500">Use a professional football data provider for global rankings, then sync daily into these boards.</p>
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
