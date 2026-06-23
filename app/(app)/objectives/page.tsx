import { BadgeEuro, Check, Goal, Medal, Target, Trophy, UserPlus, Zap } from "lucide-react";
import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

async function countRows(query: PromiseLike<{ count: number | null }>) {
  const { count } = await query;
  return count ?? 0;
}

function percent(value: number, target: number) {
  return Math.min(100, Math.round((value / target) * 100));
}

export default async function Objectives() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [closedDeals, newPlayers, opportunities, clubFollows, activeNegotiations, dealFees] = await Promise.all([
    countRows(admin.from("deals").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "completed").gte("created_at", monthStart)),
    countRows(admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).gte("created_at", monthStart)),
    countRows(admin.from("player_opportunities").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).gte("created_at", monthStart)),
    countRows(admin.from("club_agent_follows").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
    countRows(admin.from("negotiation_rooms").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
    admin.from("deals").select("agency_fee").eq("agency_id", agencyId).gte("created_at", monthStart),
  ]);

  const revenue = ((dealFees.data ?? []) as Array<{ agency_fee: number | null }>).reduce((sum, deal) => sum + (Number(deal.agency_fee) || 0), 0);
  const objectives = [
    { title: "Close 3 Transfer Deals", desc: "Complete three deals this month.", progress: percent(closedDeals, 3), current: `${closedDeals} / 3`, reward: "1,500 XP", icon: Zap, color: "lime" },
    { title: "Revenue Architect", desc: "Generate €500,000 in agency fees.", progress: percent(revenue, 500000), current: `€${Math.round(revenue / 1000)}K / €500K`, reward: "2,000 XP", icon: BadgeEuro, color: "gold" },
    { title: "New Signings", desc: "Add five real player profiles this month.", progress: percent(newPlayers, 5), current: `${newPlayers} / 5`, reward: "1,000 XP", icon: UserPlus, color: "cyan" },
    { title: "Club Partnerships", desc: "Build ten active club-agent follows.", progress: percent(clubFollows, 10), current: `${clubFollows} / 10`, reward: "2,500 XP", icon: Trophy, color: "cyan" },
    { title: "Opportunity Engine", desc: "Create ten matching opportunities.", progress: percent(opportunities, 10), current: `${opportunities} / 10`, reward: "1,800 XP", icon: Medal, color: "gold" },
    { title: "Negotiation Control", desc: "Keep five active private negotiation rooms.", progress: percent(activeNegotiations, 5), current: `${activeNegotiations} / 5`, reward: "3,000 XP", icon: Goal, color: "lime" },
  ];
  const complete = Math.round(objectives.reduce((sum, item) => sum + item.progress, 0) / objectives.length);

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <LivePill>Monthly objectives active</LivePill>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Real activity only</span>
          </div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Objectives</h1>
          <p className="mt-1.5 text-xs text-slate-500">Every objective is calculated from your real players, deals, opportunities and club network.</p>
        </div>
      </div>

      <GamePanel className="relative mt-6 overflow-hidden p-6 pitch-grid">
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[.2em] text-[#a3ff12]">Monthly Campaign</p>
            <h2 className="font-display mt-2 text-3xl uppercase italic">Operating Momentum</h2>
            <p className="mt-2 text-[9px] text-slate-500">Complete real work inside Touchline to raise your agency reputation and future ranking visibility.</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative grid size-24 place-items-center rounded-full border-[6px] border-cyan-300/15">
              <div className="absolute inset-[-6px] rounded-full border-[6px] border-transparent border-r-[#a3ff12] border-t-[#a3ff12] rotate-45" />
              <div className="text-center"><p className="font-display text-2xl">{complete}%</p><p className="text-[7px] text-slate-600">COMPLETE</p></div>
            </div>
            <div>
              <p className="text-[8px] text-slate-600">MONTHLY REVENUE</p>
              <p className="mt-1 text-lg font-black text-amber-300">€{Math.round(revenue).toLocaleString()}</p>
              <p className="mt-1 text-[8px] text-cyan-300">{closedDeals} closed deals this month</p>
            </div>
          </div>
        </div>
      </GamePanel>

      <section className="mt-6">
        <SectionHeader kicker="Active Challenges" title="Career Targets" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {objectives.map((objective, index) => {
            const Icon = objective.icon;
            return (
              <GamePanel key={objective.title} className="glass-hover p-5">
                <div className="flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-300"><Icon size={17} /></span>
                  <span className="text-[8px] font-black text-amber-300">{objective.reward}</span>
                </div>
                <h3 className="mt-5 text-[12px] font-black uppercase italic">{objective.title}</h3>
                <p className="mt-2 min-h-9 text-[9px] leading-4 text-slate-600">{objective.desc}</p>
                <div className="mt-5 flex justify-between text-[8px] font-bold"><span className="text-slate-500">{objective.current}</span><span className="text-slate-300">{objective.progress}%</span></div>
                <div className="mt-2"><Meter value={objective.progress} color={objective.color as "lime" | "gold" | "cyan"} /></div>
                <div className="mt-4 flex items-center justify-between border-t border-white/[.06] pt-3">
                  <span className="text-[7px] font-black uppercase tracking-wider text-slate-700">Objective {String(index + 1).padStart(2, "0")}</span>
                  {objective.progress === 100 ? <Check size={13} className="text-[#a3ff12]" /> : <Target size={13} className="text-slate-700" />}
                </div>
              </GamePanel>
            );
          })}
        </div>
      </section>
    </div>
  );
}
