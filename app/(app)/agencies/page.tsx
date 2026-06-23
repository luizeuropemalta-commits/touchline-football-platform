import Link from "next/link";
import { BadgeCheck, Building2, Globe2, ShieldCheck, Users } from "lucide-react";
import { AgencyDirectory, type AgencyDirectoryAgency, type AgencyDirectoryMember } from "@/components/agency-directory";
import { GlobalFootballLinkSearch } from "@/components/global-football-link-search";
import { StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

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
  const team: AgencyDirectoryMember[] = (members ?? []).map((member) => ({
    id: member.id,
    fullName: member.full_name,
    role: member.role,
    jobTitle: member.job_title,
    avatarUrl: member.avatar_url,
    createdAt: member.created_at,
  }));
  const directoryAgency: AgencyDirectoryAgency = {
    name: agencyData.name,
    slug: agencyData.slug,
    countryCode: agencyData.country_code,
    currency: agencyData.default_currency,
    logoUrl: agencyData.logo_url,
  };

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

      <GlobalFootballLinkSearch
        type="agent"
        title="Global Agent Link Index"
        description="Search agent and agency links discovered automatically from Touchline activity. This prepares the future football business social graph without you manually saving links one by one."
        placeholder="Search agent, agency or Transfermarkt advisor link..."
      />

      <AgencyDirectory agency={directoryAgency} members={team} />
    </div>
  );
}
