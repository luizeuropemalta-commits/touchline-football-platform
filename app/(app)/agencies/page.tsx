import Link from "next/link";
import { BadgeCheck, Building2, Globe2, ShieldCheck, Users } from "lucide-react";
import { GamePanel, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type TeamMember = {
  id: string;
  full_name: string | null;
  role: string | null;
  job_title: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

type Agency = {
  name?: string | null;
  slug?: string | null;
  country_code?: string | null;
  default_currency?: string | null;
  logo_url?: string | null;
};

async function safeCount(query: PromiseLike<{ count: number | null }>) {
  try {
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function AgenciesPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ data: agency }, { data: members }, verifiedPlayers, clubs, follows] = await Promise.all([
    admin.from("agencies").select("name, slug, country_code, default_currency, logo_url").eq("id", agencyId).maybeSingle(),
    admin.from("users").select("id, full_name, role, job_title, avatar_url, created_at").eq("agency_id", agencyId).order("created_at", { ascending: true }),
    safeCount(admin.from("agent_player_associations").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).in("status", ["active_representation", "verified_representation"])),
    safeCount(admin.from("clubs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("club_agent_follows").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
  ]);

  const agencyData = (agency ?? {}) as Agency;
  const team = (members ?? []) as TeamMember[];

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="af-mode-kicker">Touchline / Agent Network</p>
          <h1 className="font-display mt-2 text-3xl uppercase italic sm:text-[42px]">Agents & Agencies</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">
            Manage your agency identity, team members, verified player representation and club relationship footprint.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/verification" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]"><BadgeCheck size={14} />Verify agent</Link>
          <Link href="/clubs" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase text-cyan-100"><Building2 size={14} />Club network</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Users} label="Team Members" value={String(team.length)} delta="agency profiles" accent="cyan" />
        <StatTile icon={ShieldCheck} label="Verified Players" value={String(verifiedPlayers)} delta="representation records" accent="lime" />
        <StatTile icon={Building2} label="Clubs" value={String(clubs)} delta="club records" accent="gold" />
        <StatTile icon={Globe2} label="Followers" value={String(follows)} delta="club relationships" accent="rose" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[420px_1fr]">
        <GamePanel className="p-5">
          <SectionHeader kicker="Agency profile" title="Identity" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
          <div className="rounded-3xl border border-white/[.08] bg-black/20 p-5">
            <div className="grid size-20 place-items-center overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-300/[.08] text-2xl font-black text-cyan-100">
              {agencyData.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agencyData.logo_url} alt={agencyData.name ?? "Agency"} className="h-full w-full object-cover" />
              ) : (
                (agencyData.name ?? "AF").slice(0, 2).toUpperCase()
              )}
            </div>
            <h2 className="mt-5 text-2xl font-black uppercase italic text-white">{agencyData.name ?? "Touchline Agency"}</h2>
            <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-600">{agencyData.slug ?? "agency"} · {agencyData.country_code ?? "Global"} · {agencyData.default_currency ?? "EUR"}</p>
          </div>
        </GamePanel>

        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5">
            <SectionHeader kicker="People" title="Agency Team" action={<Users size={15} className="text-cyan-300" />} />
          </div>
          {team.length ? (
            <div className="divide-y divide-white/[.06]">
              {team.map((member) => (
                <div key={member.id} className="live-row grid gap-4 p-5 md:grid-cols-[1fr_180px_160px] md:items-center" style={{ "--row-accent": "#22d3ee" } as React.CSSProperties}>
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center overflow-hidden rounded-2xl border border-cyan-300/15 bg-cyan-300/[.07] text-xs font-black text-cyan-100">
                      {member.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.avatar_url} alt={member.full_name ?? "Agent"} className="h-full w-full object-cover" />
                      ) : (
                        (member.full_name ?? "AG").slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-black uppercase italic text-white">{member.full_name || "Unnamed agent"}</p>
                      <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">{member.job_title || "Football professional"}</p>
                    </div>
                  </div>
                  <p className="text-[10px] font-black uppercase text-cyan-200">{member.role ?? "member"}</p>
                  <Link href="/verification" className="text-[8px] font-black uppercase text-[#a3ff12] hover:text-white">Verification →</Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm font-black uppercase italic text-white">No team members yet</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">Your owner profile appears here once the workspace profile is created.</p>
            </div>
          )}
        </GamePanel>
      </div>
    </div>
  );
}
