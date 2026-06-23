import Link from "next/link";
import { Building2, MessageCircle, Radio, Share2, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { GamePanel, LivePill, SectionHeader } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type PostRow = {
  id: string;
  post_type: string;
  body: string;
  visibility: string;
  created_at: string;
  related_player_id: string | null;
};

type OpportunityRow = {
  id: string;
  title: string;
  position_needed: string | null;
  status: string;
  created_at: string;
  clubs?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function relative(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function clubName(value: OpportunityRow["clubs"]) {
  const club = Array.isArray(value) ? value[0] : value;
  return club?.name ?? "Club requirement";
}

export default async function Feed() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId, profile } = workspace;
  const [{ data: postRows }, { data: opportunityRows }, { count: playerCount }] = await Promise.all([
    admin
      .from("community_posts_phase2")
      .select("id, post_type, body, visibility, created_at, related_player_id")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("player_opportunities")
      .select("id, title, position_needed, status, created_at, clubs:club_id(name)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(8),
    admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
  ]);

  const posts = (postRows ?? []) as PostRow[];
  const opportunities = (opportunityRows ?? []) as OpportunityRow[];

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <LivePill>{posts.length + opportunities.length} live signals</LivePill>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Real community and opportunity feed</span>
          </div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">World Feed</h1>
          <p className="mt-1.5 text-xs text-slate-500">A living football feed powered by your own network activity.</p>
        </div>
        <Link href="/opportunities" className="inline-flex h-11 items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100">
          Create opportunity
        </Link>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_320px]">
        <main className="space-y-4">
          {posts.map((post) => (
            <GamePanel key={post.id} className="glass-hover p-5">
              <div className="flex items-center gap-3">
                <span className="interactive-icon grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-300">
                  <Users size={16} />
                </span>
                <div>
                  <p className="text-[9px] font-black uppercase">{profile.full_name || "Touchline user"}</p>
                  <p className="mt-1 text-[7px] font-bold uppercase tracking-wider text-slate-600">{post.post_type.replaceAll("_", " ")} · {relative(post.created_at)} · {post.visibility.replaceAll("_", " ")}</p>
                </div>
              </div>
              <p className="mt-5 text-[11px] leading-6 text-slate-400">{post.body}</p>
              <div className="mt-5 flex items-center gap-5 border-t border-white/[.06] pt-4">
                <span className="interactive-icon flex items-center gap-2 text-[8px] font-bold text-slate-600"><MessageCircle size={13} />Comment layer ready</span>
                <span className="interactive-icon flex items-center gap-2 text-[8px] font-bold text-slate-600"><Share2 size={13} />Share inside network</span>
              </div>
            </GamePanel>
          ))}

          {opportunities.map((item) => (
            <GamePanel key={item.id} className="glass-hover border-cyan-300/10 p-5">
              <div className="flex items-start gap-3">
                <span className="interactive-icon grid size-10 place-items-center rounded-xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.06] text-[#a3ff12]">
                  <Target size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] font-black uppercase tracking-[.2em] text-[#a3ff12]">Opportunity signal · {relative(item.created_at)}</p>
                  <h2 className="mt-2 text-base font-black uppercase italic">{item.title}</h2>
                  <p className="mt-2 text-[10px] leading-5 text-slate-500">{clubName(item.clubs)} · {item.position_needed || "position open"} · {item.status.replaceAll("_", " ")}</p>
                </div>
                <Link href="/opportunities" className="rounded-xl border border-cyan-300/15 px-3 py-2 text-[8px] font-black uppercase text-cyan-300">Open</Link>
              </div>
            </GamePanel>
          ))}

          {!posts.length && !opportunities.length && (
            <GamePanel className="border-dashed border-cyan-300/20 p-8">
              <Sparkles size={20} className="text-[#a3ff12]" />
              <h2 className="mt-4 text-lg font-black uppercase italic text-white">Your football world is ready</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">Add players, create opportunities, and publish scouting insights. The feed will populate only with real actions from your ecosystem.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/players" className="inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">Add player</Link>
                <Link href="/opportunities" className="inline-flex h-10 items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100">Create opportunity</Link>
              </div>
            </GamePanel>
          )}
        </main>

        <aside className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Network Radar" title="Real Signals" action={<Radio size={14} className="text-rose-300" />} />
            <div className="grid gap-3">
              <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-3">
                <p className="text-[8px] text-slate-600">PLAYERS IN SYSTEM</p>
                <p className="mt-1 font-display text-2xl text-cyan-300">{playerCount ?? 0}</p>
              </div>
              <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-3">
                <p className="text-[8px] text-slate-600">OPEN OPPORTUNITIES</p>
                <p className="mt-1 font-display text-2xl text-[#a3ff12]">{opportunities.filter((item) => item.status === "open").length}</p>
              </div>
            </div>
          </GamePanel>
          <GamePanel className="p-5">
            <SectionHeader kicker="Daily habit loop" title="Next Actions" action={<TrendingUp size={14} className="text-[#a3ff12]" />} />
            <div className="space-y-3 text-[9px] leading-5 text-slate-500">
              <p>1. Add verified player profiles.</p>
              <p>2. Create club requirements or opportunity signals.</p>
              <p>3. Move real interests into negotiation rooms.</p>
            </div>
          </GamePanel>
        </aside>
      </div>
    </div>
  );
}
