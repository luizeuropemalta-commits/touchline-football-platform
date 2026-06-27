import Link from "next/link";
import { BarChart3, Bot, FileSearch, FileSignature, Gavel, Mail, ShieldAlert, Sparkles, TrendingUp, UserSearch } from "lucide-react";
import { GamePanel, LivePill, SectionHeader } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type AiDocument = {
  id: string;
  document_type: string;
  title: string;
  status: string;
  created_at: string;
};

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export default async function AIPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ data: docs }, { count: players }, { count: opportunities }, { count: negotiations }] = await Promise.all([
    admin
      .from("ai_generated_documents")
      .select("id, document_type, title, status, created_at")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("player_opportunities").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("negotiation_rooms").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active"),
  ]);

  const documents = (docs ?? []) as AiDocument[];
  const actions = [
    { label: "Create contract", text: "Use the Contracts area with real player and deal data.", icon: FileSignature, href: "/contracts" },
    { label: "Create proposal", text: "Turn a player profile into a club-ready presentation.", icon: Sparkles, href: "/players/pitch" },
    { label: "Create email", text: "Use club interest and negotiation context.", icon: Mail, href: "/inbox" },
    { label: "Create scouting report", text: "Generate AI player profile from the Player Vault.", icon: UserSearch, href: "/scouting" },
    { label: "Create player presentation", text: "Build a club-ready Pitch Player document.", icon: FileSearch, href: "/players/pitch" },
    { label: "Market analysis", text: "Review football search, provider data and opportunities.", icon: BarChart3, href: "/football-search" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <LivePill>AI workspace online</LivePill>
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Real agency context only</span>
          </div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Touchline AI</h1>
          <p className="mt-1.5 text-xs text-slate-500">AI actions are connected to your real players, opportunities, negotiations and generated documents.</p>
        </div>
        <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.04] px-4 py-3">
          <p className="text-[7px] font-black uppercase text-cyan-300">Context records</p>
          <p className="font-display mt-1 text-2xl">{(players ?? 0) + (opportunities ?? 0) + (negotiations ?? 0)}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <GamePanel className="p-4">
            <SectionHeader kicker="Specialized actions" title="AI Capabilities" />
            <div className="space-y-1.5">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.label} href={action.href} className="flex w-full items-center gap-3 rounded-lg border border-white/[.06] bg-white/[.02] p-3 text-left transition hover:border-cyan-300/20 hover:bg-cyan-300/[.04]">
                    <span className="grid size-8 place-items-center rounded-lg bg-cyan-300/[.06] text-cyan-300"><Icon size={14} /></span>
                    <div>
                      <p className="text-[9px] font-black uppercase">{action.label}</p>
                      <p className="mt-1 text-[7px] text-slate-600">{action.text}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </GamePanel>
          <GamePanel className="p-4">
            <div className="flex gap-3"><ShieldAlert size={15} className="shrink-0 text-amber-300" /><p className="text-[8px] leading-4 text-slate-600">AI output supports decision-making and does not replace licensed legal, financial, medical, or regulatory advice.</p></div>
          </GamePanel>
        </aside>

        <GamePanel className="min-h-[620px] overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.07] p-4">
            <div className="flex items-center gap-3">
              <span className="relative grid size-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300"><Bot size={18} /><span className="pulse-live absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#a3ff12]" /></span>
              <div><p className="text-[10px] font-black uppercase">Generated Intelligence</p><p className="mt-1 text-[7px] font-bold uppercase tracking-wider text-[#a3ff12]">{documents.length} real documents</p></div>
            </div>
            <TrendingUp size={17} className="text-cyan-300" />
          </div>

          <div className="p-5 sm:p-7">
            {documents.length ? (
              <div className="divide-y divide-white/[.06] rounded-3xl border border-white/[.07] bg-black/10">
                {documents.map((doc) => (
                  <div key={doc.id} className="grid gap-3 p-4 sm:grid-cols-[150px_1fr_100px] sm:items-center">
                    <span className="text-[8px] font-black uppercase text-cyan-300">{doc.document_type.replaceAll("_", " ")}</span>
                    <div>
                      <p className="text-[10px] font-black uppercase italic text-white">{doc.title}</p>
                      <p className="mt-1 text-[8px] text-slate-600">{dateLabel(doc.created_at)}</p>
                    </div>
                    <span className="w-fit rounded-lg border border-[#a3ff12]/20 bg-[#a3ff12]/[.06] px-2 py-1 text-[7px] font-black uppercase text-[#a3ff12]">{doc.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-300/[.035] p-8">
                <Gavel size={22} className="text-amber-300" />
                <h2 className="mt-4 text-lg font-black uppercase italic text-white">No AI documents generated yet</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">Open Pitch Player to create a club-ready presentation. Saved pitches and AI player profiles appear in this same document center.</p>
                <Link href="/players/pitch" className="mt-6 inline-flex h-10 items-center rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]">
                  Create first pitch
                </Link>
              </div>
            )}
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
