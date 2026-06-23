import { Crown, Gem, Globe2, Handshake, Lock, Search, Shield, Sparkles, Zap } from "lucide-react";
import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

async function countRows(query: PromiseLike<{ count: number | null }>) {
  const { count } = await query;
  return count ?? 0;
}

function progress(value: number, target: number) {
  return Math.min(100, Math.round((value / target) * 100));
}

function age(date?: string | null) {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - birth.getUTCFullYear();
  const diff = now.getUTCMonth() - birth.getUTCMonth();
  if (diff < 0 || (diff === 0 && now.getUTCDate() < birth.getUTCDate())) years -= 1;
  return years;
}

export default async function Achievements() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [closedDeals, interests, scoutingPlayers, aiPlayers, clubs, bigDeals, playerRows] = await Promise.all([
    countRows(admin.from("deals").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "completed")),
    countRows(admin.from("player_interests").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    countRows(admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "scouting")),
    admin.from("players").select("ai_profile").eq("agency_id", agencyId),
    admin.from("clubs").select("country_code").eq("agency_id", agencyId),
    countRows(admin.from("deals").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).gte("estimated_value", 50000000)),
    admin.from("players").select("date_of_birth").eq("agency_id", agencyId),
  ]);

  const aiReady = ((aiPlayers.data ?? []) as Array<{ ai_profile: { generated?: boolean } | null }>).filter((player) => player.ai_profile?.generated).length;
  const countries = new Set(((clubs.data ?? []) as Array<{ country_code: string | null }>).map((club) => club.country_code).filter(Boolean)).size;
  const under21 = ((playerRows.data ?? []) as Array<{ date_of_birth: string | null }>).filter((player) => {
    const playerAge = age(player.date_of_birth);
    return playerAge !== null && playerAge < 21;
  }).length;
  const reputation = Math.min(999, Math.round(120 + closedDeals * 85 + interests * 24 + scoutingPlayers * 18 + aiReady * 16));

  const badges = [
    { title: "Elite Negotiator", desc: "Close 10 verified deals.", progress: progress(closedDeals, 10), rarity: "LEGENDARY", icon: Handshake, color: "amber", earned: closedDeals >= 10 },
    { title: "Top Scout", desc: "Build 5 scouting-ready player profiles.", progress: progress(Math.max(scoutingPlayers, aiReady), 5), rarity: "EPIC", icon: Search, color: "cyan", earned: Math.max(scoutingPlayers, aiReady) >= 5 },
    { title: "Rising Agent", desc: "Reach 250 reputation from real activity.", progress: progress(reputation, 250), rarity: "RARE", icon: Zap, color: "lime", earned: reputation >= 250 },
    { title: "Global Connector", desc: "Connect clubs across 5 countries.", progress: progress(countries, 5), rarity: "EPIC", icon: Globe2, color: "cyan", earned: countries >= 5 },
    { title: "Big Deal Closer", desc: "Create a deal above €50M.", progress: progress(bigDeals, 1), rarity: "LEGENDARY", icon: Gem, color: "amber", earned: bigDeals >= 1 },
    { title: "Talent Hunter", desc: "Add 20 players under age 21.", progress: progress(under21, 20), rarity: "RARE", icon: Shield, color: "lime", earned: under21 >= 20 },
  ];
  const earned = badges.filter((badge) => badge.earned).length;
  const prestige = reputation >= 850 ? "Icon Agent" : reputation >= 650 ? "Elite Agent" : reputation >= 250 ? "Rising Agent" : "Foundation Agent";

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <LivePill>{earned} unlocked</LivePill>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">{badges.length - earned} still locked</span>
          </div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Achievements</h1>
          <p className="mt-1.5 text-xs text-slate-500">Badges unlock only from real Touchline activity.</p>
        </div>
      </div>

      <GamePanel className="premium-ring status-scan relative mt-6 overflow-hidden p-7 pitch-grid">
        <div className="absolute right-[-6%] top-[-70%] size-[430px] rounded-full border border-amber-300/10" />
        <div className="relative flex flex-col justify-between gap-7 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <div className="float-slow relative grid size-24 place-items-center rounded-[28px] border border-amber-300/30 bg-gradient-to-br from-amber-300/15 to-amber-700/5 shadow-[0_0_65px_rgba(247,198,93,.16)]">
              <Crown size={38} className="text-amber-300 drop-shadow-[0_0_12px_rgba(247,198,93,.5)]" />
              <Sparkles size={14} className="absolute right-2 top-2 text-amber-200" />
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[.2em] text-amber-300">Current Prestige</p>
              <h2 className="font-display mt-1 text-3xl uppercase italic">{prestige}</h2>
              <p className="mt-2 text-[9px] text-slate-500">Reputation score: {reputation}</p>
            </div>
          </div>
          <div className="w-full max-w-sm">
            <div className="flex justify-between text-[8px] font-black uppercase text-slate-500">
              <span>Prestige progress</span>
              <span>{reputation} / 999</span>
            </div>
            <div className="mt-3"><Meter value={Math.min(100, Math.round((reputation / 999) * 100))} color="gold" /></div>
            <p className="mt-3 text-right text-[8px] text-amber-300">Next score is earned by real players, deals and club interest</p>
          </div>
        </div>
      </GamePanel>

      <section className="mt-6">
        <SectionHeader kicker="Career Collection" title="Badge Cabinet" action={<span className="text-[8px] font-black text-slate-600">{earned} / {badges.length} unlocked</span>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((badge) => {
            const Icon = badge.icon;
            const glow = badge.color === "amber" ? "rgba(247,198,93,.25)" : badge.color === "lime" ? "rgba(163,255,18,.22)" : "rgba(34,211,238,.22)";
            return (
              <GamePanel key={badge.title} className={`achievement-card glass-hover group relative overflow-hidden p-5 ${!badge.earned ? "opacity-75 grayscale-[20%]" : ""}`}>
                <div className={`absolute right-[-30px] top-[-30px] size-28 rounded-full blur-3xl transition duration-500 group-hover:scale-150 ${badge.color === "amber" ? "bg-amber-300/10" : badge.color === "lime" ? "bg-[#a3ff12]/10" : "bg-cyan-300/10"}`} />
                <div className="relative flex items-start justify-between">
                  <span className={`achievement-icon grid size-14 place-items-center rounded-2xl border ${badge.color === "amber" ? "border-amber-300/25 bg-amber-300/[.08] text-amber-300" : badge.color === "lime" ? "border-[#a3ff12]/25 bg-[#a3ff12]/[.07] text-[#a3ff12]" : "border-cyan-300/25 bg-cyan-300/[.07] text-cyan-300"}`} style={{ "--badge-glow": glow } as React.CSSProperties}>
                    <Icon size={24} />
                  </span>
                  {badge.earned ? <span className="rounded-md border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] px-2 py-1 text-[7px] font-black text-[#a3ff12]">UNLOCKED</span> : <Lock size={13} className="text-slate-700" />}
                </div>
                <div className="relative mt-5">
                  <p className={`text-[7px] font-black tracking-[.15em] ${badge.color === "amber" ? "text-amber-300" : badge.color === "lime" ? "text-[#a3ff12]" : "text-cyan-300"}`}>{badge.rarity}</p>
                  <h3 className="mt-1 text-[13px] font-black uppercase italic">{badge.title}</h3>
                  <p className="mt-2 text-[9px] text-slate-600">{badge.desc}</p>
                  <div className="mt-5 flex justify-between text-[8px] font-bold text-slate-600"><span>PROGRESS</span><span>{badge.progress}%</span></div>
                  <div className="mt-2"><Meter value={badge.progress} color={badge.color === "amber" ? "gold" : badge.color === "lime" ? "lime" : "cyan"} /></div>
                </div>
              </GamePanel>
            );
          })}
        </div>
      </section>
    </div>
  );
}
