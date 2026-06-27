import Link from "next/link";
import { Crosshair, Globe2, Radar, Sparkles, Telescope } from "lucide-react";
import { GamePanel, LivePill, SectionHeader, StatTile } from "@/components/game-ui";
import { TouchlinePlayerCard } from "@/components/touchline-card-engine";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  position: string | null;
  nationality: string | null;
  status: string;
  photo_url: string | null;
  market_value: number | null;
  ai_profile: { generated?: boolean } | null;
};

type OpportunityRow = {
  id: string;
  title: string;
  position_needed: string | null;
  match_score: number | null;
  status: string;
};

function playerName(player: PlayerRow) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

function age(date?: string | null) {
  if (!date) return "Age unavailable";
  const birth = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return "Age unavailable";
  const now = new Date();
  let value = now.getUTCFullYear() - birth.getUTCFullYear();
  const diff = now.getUTCMonth() - birth.getUTCMonth();
  if (diff < 0 || (diff === 0 && now.getUTCDate() < birth.getUTCDate())) value -= 1;
  return `${value}`;
}

export default async function Scouting() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ data: playerRows }, { data: opportunities }, { count: totalPlayers }] = await Promise.all([
    admin
      .from("players")
      .select("id, first_name, last_name, date_of_birth, position, nationality, status, photo_url, market_value, ai_profile")
      .eq("agency_id", agencyId)
      .order("updated_at", { ascending: false })
      .limit(24),
    admin
      .from("player_opportunities")
      .select("id, title, position_needed, match_score, status")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(8),
    admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
  ]);

  const players = ((playerRows ?? []) as PlayerRow[]).filter((player) => player.status === "scouting" || !player.market_value || !player.ai_profile?.generated);
  const aiReady = ((playerRows ?? []) as PlayerRow[]).filter((player) => player.ai_profile?.generated).length;
  const openOpportunities = ((opportunities ?? []) as OpportunityRow[]).filter((item) => item.status === "open");

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <LivePill>{players.length} scouting profiles</LivePill>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Real portfolio scouting layer</span>
          </div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Scouting Center</h1>
          <p className="mt-1.5 text-xs text-slate-500">Track developing players, incomplete profiles and opportunity matches from your real database.</p>
        </div>
        <Link href="/players" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">
          <Crosshair size={14} /> Add scouting player
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatTile icon={Telescope} label="Players Tracked" value={String(totalPlayers ?? 0)} delta="real records" accent="cyan" />
        <StatTile icon={Sparkles} label="AI Profiles" value={String(aiReady)} delta="generated summaries" accent="gold" />
        <StatTile icon={Globe2} label="Open Requirements" value={String(openOpportunities.length)} delta="club needs" accent="lime" />
      </div>

      <GamePanel className="premium-ring status-scan relative mt-5 overflow-hidden p-5 sm:p-7">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_50%_50%,rgba(34,211,238,.15),transparent_50%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-300">Global Talent Radar</p>
            <h2 className="font-display mt-2 text-3xl uppercase italic">Connected to your vault</h2>
            <p className="mt-3 max-w-md text-[10px] leading-5 text-slate-500">Touchline highlights incomplete profiles and scouting-status players so you can enrich videos, documents, stats and AI reports before promotion.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {openOpportunities.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-4">
                <p className="text-[8px] font-black uppercase tracking-[.16em] text-cyan-300">{item.position_needed || "Open position"}</p>
                <p className="mt-2 text-[10px] font-black uppercase">{item.title}</p>
                <p className="mt-3 text-[8px] text-slate-600">Match score: {item.match_score ?? 70}%</p>
              </div>
            ))}
            {!openOpportunities.length && (
              <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-300/[.035] p-5 sm:col-span-2">
                <p className="text-[10px] font-black uppercase text-white">No open requirements yet</p>
                <p className="mt-2 text-[9px] leading-5 text-slate-500">Create club requirements in Opportunities to power AI matching.</p>
              </div>
            )}
          </div>
        </div>
      </GamePanel>

      <section className="mt-6">
        <SectionHeader kicker="Real player discovery" title="Profiles needing scouting attention" action={<Radar size={16} className="text-cyan-300" />} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {players.map((player) => (
            <Link key={player.id} href={`/players/${player.id}`} className="block">
              <TouchlinePlayerCard
                variant="list"
                player={{
                  id: player.id,
                  name: playerName(player),
                  position: player.position,
                  nationality: player.nationality,
                  age: Number(age(player.date_of_birth)) || null,
                  officialMarketValue: player.market_value,
                  availability: player.status,
                  liveState: player.ai_profile?.generated ? "player_of_the_match" : "idle",
                  context: "scouting",
                }}
              />
            </Link>
          ))}
          {!players.length && (
            <GamePanel className="border-dashed border-cyan-300/20 p-6 md:col-span-2 xl:col-span-3">
              <p className="text-sm font-black uppercase italic text-white">No scouting profiles yet</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">Add players through Football Search or the Football Data layer, then use AI Profile and videos to build a scouting-ready portfolio.</p>
              <Link href="/players" className="mt-5 inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">Add first player</Link>
            </GamePanel>
          )}
        </div>
      </section>
    </div>
  );
}
