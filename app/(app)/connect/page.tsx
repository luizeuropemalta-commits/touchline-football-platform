import Link from "next/link";
import { ArrowRight, Building2, Globe2, Link2, Network, Search, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import { GlobalFootballLinkSearch } from "@/components/global-football-link-search";
import { GamePanel, LivePill, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type LinkRow = {
  id: string;
  entity_type: string;
  source_provider: string;
  source_id: string | null;
  canonical_url: string;
  source_domain: string | null;
  title: string;
  image_url: string | null;
  last_seen_at: string | null;
};

async function safeCount(query: PromiseLike<{ count: number | null }>) {
  try {
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function dateLabel(value?: string | null) {
  if (!value) return "not synced";
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));
}

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function TouchlineConnectPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin } = workspace;
  const [totalLinks, playerLinks, agentLinks, clubLinks, recentResult] = await Promise.all([
    safeCount(admin.from("global_football_links").select("id", { count: "exact", head: true }).eq("status", "active")),
    safeCount(admin.from("global_football_links").select("id", { count: "exact", head: true }).eq("status", "active").eq("entity_type", "player")),
    safeCount(admin.from("global_football_links").select("id", { count: "exact", head: true }).eq("status", "active").eq("entity_type", "agent")),
    safeCount(admin.from("global_football_links").select("id", { count: "exact", head: true }).eq("status", "active").eq("entity_type", "club")),
    admin
      .from("global_football_links")
      .select("id, entity_type, source_provider, source_id, canonical_url, source_domain, title, image_url, last_seen_at")
      .eq("status", "active")
      .order("last_seen_at", { ascending: false })
      .limit(12),
  ]);

  const recentLinks = (recentResult.data ?? []) as LinkRow[];

  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 animate-in space-y-6">
      <GamePanel className="relative overflow-hidden p-5 sm:p-7 xl:p-8">
        <div className="absolute right-[-12%] top-[-65%] size-[560px] rounded-full border border-cyan-300/[.08] bg-cyan-300/[.025]" />
        <div className="absolute bottom-[-35%] left-[-8%] size-[360px] rounded-full bg-[#a3ff12]/[.035] blur-3xl" />
        <div className="relative z-10 grid min-w-0 gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] 2xl:items-end">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <LivePill>Business graph online</LivePill>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Agents · Clubs · Players
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Global business network</p>
            <h1 className="font-display mt-3 max-w-full text-5xl uppercase italic text-white sm:text-7xl">Touchline Connect</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              The football business graph for agents, clubs, players and opportunities. Touchline indexes football links
              discovered inside your own platform activity so the network becomes easier to search every day.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link href="/feed" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black uppercase tracking-wider text-[#071007]">
                Open social feed <ArrowRight size={13} />
              </Link>
              <Link href="/football-search" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-5 text-[9px] font-black uppercase tracking-wider text-cyan-100">
                Football Search <Search size={13} />
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/[.08] bg-black/20 p-5">
            <SectionHeader kicker="Network loop" title="Why this keeps users inside" action={<Sparkles size={15} className="text-[#a3ff12]" />} />
            <div className="space-y-3 text-[10px] leading-5 text-slate-500">
              <p>1. Agents add players, links and opportunities.</p>
              <p>2. Clubs search the indexed business graph.</p>
              <p>3. Feed activity creates more searchable network signals.</p>
              <p>4. Touchline becomes the daily football business operating room.</p>
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Network} label="Indexed Links" value={String(totalLinks)} delta="business graph" accent="cyan" />
        <StatTile icon={Users} label="Players" value={String(playerLinks)} delta="profile links" accent="lime" />
        <StatTile icon={ShieldCheck} label="Agents" value={String(agentLinks)} delta="advisor links" accent="gold" />
        <StatTile icon={Building2} label="Clubs" value={String(clubLinks)} delta="club links" accent="rose" />
      </div>

      <GlobalFootballLinkSearch
        title="Search Touchline Connect"
        kicker="Global football business index"
        description="Search football entities discovered through Touchline activity and provider-backed internal records. Results can include players, agents, clubs and football business references."
        placeholder="Search player, agent, club, opportunity or provider ID..."
      />

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5">
            <SectionHeader kicker="Recently indexed" title="Live Business Signals" action={<Zap size={15} className="text-[#a3ff12]" />} />
          </div>
          <div className="divide-y divide-white/[.06]">
            {recentLinks.map((link) => (
              <a key={link.id} href={link.canonical_url} target="_blank" rel="noreferrer" className="group grid gap-4 p-5 transition hover:bg-cyan-300/[.035] sm:grid-cols-[64px_1fr_auto] sm:items-center">
                <div className="size-16 overflow-hidden rounded-2xl border border-white/[.08] bg-black/30">
                  {link.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={link.image_url} alt={link.title} className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="grid h-full place-items-center text-[12px] font-black text-cyan-300/50">{initials(link.title)}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/[.07] px-2 py-1 text-[7px] font-black uppercase tracking-wider text-cyan-100">{link.entity_type}</span>
                    {link.source_id && <span className="rounded-lg border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-2 py-1 text-[7px] font-black uppercase tracking-wider text-[#caff72]">ID {link.source_id}</span>}
                  </div>
                  <p className="mt-2 truncate text-sm font-black uppercase italic text-white group-hover:text-cyan-100">{link.title}</p>
                  <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider text-slate-600">{link.source_domain ?? link.source_provider} · indexed {dateLabel(link.last_seen_at)}</p>
                </div>
                <span className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[8px] font-black uppercase tracking-wider text-[#caff72]">
                  Open <Link2 size={12} />
                </span>
              </a>
            ))}
            {!recentLinks.length && (
              <div className="p-8 text-center">
                <Globe2 size={28} className="mx-auto text-slate-700" />
                <p className="mt-4 text-sm font-black uppercase italic text-white">Touchline Connect is ready</p>
                <p className="mt-2 text-xs leading-6 text-slate-500">The index will fill as players, clubs, agencies and provider-backed records create network signals.</p>
              </div>
            )}
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <SectionHeader kicker="Network categories" title="Discover by role" action={<Search size={15} className="text-cyan-300" />} />
          <div className="mt-5 grid gap-3">
            {[
              ["Football Search", "/football-search", "Search players, agents, agencies, clubs and provider-backed references."],
              ["Agents & Agencies", "/agencies", "Discover agent/advisor links and verified representation workflows."],
              ["Clubs", "/clubs", "Research club links and recruitment relationships."],
              ["Football Feed", "/feed", "Turn activity into social/business discovery signals."],
            ].map(([label, href, desc]) => (
              <Link key={href} href={href} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/[.04]">
                <p className="text-[11px] font-black uppercase italic text-white">{label}</p>
                <p className="mt-2 text-[10px] leading-5 text-slate-500">{desc}</p>
              </Link>
            ))}
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
