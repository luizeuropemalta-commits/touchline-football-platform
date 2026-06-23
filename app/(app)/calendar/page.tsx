import Link from "next/link";
import { CalendarClock, CalendarDays, FileSignature, Radio, Target } from "lucide-react";
import { GamePanel, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type CalendarItem = {
  id: string;
  type: string;
  title: string;
  date: string;
  href: string;
  accent: string;
};

function addItem(items: CalendarItem[], item: CalendarItem | null) {
  if (item?.date) items.push(item);
}

export default async function CalendarPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const now = new Date().toISOString();
  const [{ data: fixtures }, { data: contracts }, { data: players }, { data: opportunities }] = await Promise.all([
    admin.from("football_live_items").select("id, item_type, title, starts_at, source_url").eq("agency_id", agencyId).eq("item_type", "fixture").gte("starts_at", now).order("starts_at", { ascending: true }).limit(30),
    admin.from("contracts").select("id, contract_type, expires_on, players:player_id(first_name,last_name), clubs:club_id(name)").eq("agency_id", agencyId).eq("status", "active").not("expires_on", "is", null).order("expires_on", { ascending: true }).limit(30),
    admin.from("players").select("id, first_name, last_name, contract_end_date").eq("agency_id", agencyId).not("contract_end_date", "is", null).order("contract_end_date", { ascending: true }).limit(30),
    admin.from("player_opportunities").select("id, title, expires_at, status").eq("agency_id", agencyId).not("expires_at", "is", null).order("expires_at", { ascending: true }).limit(30),
  ]);

  const items: CalendarItem[] = [];
  (fixtures ?? []).forEach((fixture) => addItem(items, { id: fixture.id, type: "Fixture", title: fixture.title, date: fixture.starts_at, href: fixture.source_url || "/world", accent: "#22d3ee" }));
  (contracts ?? []).forEach((contract) => {
    const player = Array.isArray(contract.players) ? contract.players[0] : contract.players;
    addItem(items, { id: contract.id, type: "Contract expiry", title: `${player?.first_name ?? "Player"} ${player?.last_name ?? ""}`.trim() || contract.contract_type, date: contract.expires_on, href: "/contracts", accent: "#f7c65d" });
  });
  (players ?? []).forEach((player) => addItem(items, { id: player.id, type: "Player contract", title: `${player.first_name} ${player.last_name}`, date: player.contract_end_date, href: `/players/${player.id}`, accent: "#a3ff12" }));
  (opportunities ?? []).forEach((opportunity) => addItem(items, { id: opportunity.id, type: "Opportunity deadline", title: opportunity.title, date: opportunity.expires_at, href: "/opportunities", accent: "#fb7185" }));

  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="af-mode-kicker">Touchline / Calendar</p>
          <h1 className="font-display mt-2 text-3xl uppercase italic sm:text-[42px]">Calendar</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">Upcoming fixtures, contract expiries and opportunity deadlines in one operating view.</p>
        </div>
        <Link href="/dashboard" className="inline-flex h-11 items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100">Dashboard</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={CalendarDays} label="Events" value={String(items.length)} delta="upcoming" accent="cyan" />
        <StatTile icon={Radio} label="Fixtures" value={String(fixtures?.length ?? 0)} delta="live center" accent="lime" />
        <StatTile icon={FileSignature} label="Contracts" value={String(contracts?.length ?? 0)} delta="active expiries" accent="gold" />
        <StatTile icon={Target} label="Deadlines" value={String(opportunities?.length ?? 0)} delta="opportunities" accent="rose" />
      </div>

      <GamePanel className="mt-5 overflow-hidden">
        <div className="border-b border-white/[.07] p-5"><SectionHeader kicker="Timeline" title="Upcoming Operating Events" action={<CalendarClock size={15} className="text-cyan-300" />} /></div>
        {items.length ? (
          <div className="divide-y divide-white/[.06]">
            {items.slice(0, 80).map((item) => (
              <Link key={`${item.type}-${item.id}`} href={item.href} className="live-row grid gap-3 p-5 transition hover:bg-white/[.025] md:grid-cols-[150px_1fr_180px] md:items-center" style={{ "--row-accent": item.accent } as React.CSSProperties}>
                <p className="text-[9px] font-black uppercase tracking-wider text-cyan-200">{item.type}</p>
                <p className="text-sm font-black uppercase italic text-white">{item.title}</p>
                <p className="text-[10px] font-bold text-slate-400">{new Date(item.date).toLocaleString()}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center"><p className="text-sm font-black uppercase italic text-white">No upcoming events yet</p><p className="mt-2 text-xs text-slate-500">Add players, contracts, opportunities or live fixtures to populate the calendar.</p></div>
        )}
      </GamePanel>
    </div>
  );
}
