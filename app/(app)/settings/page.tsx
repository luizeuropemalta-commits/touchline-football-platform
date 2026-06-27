import Link from "next/link";
import { BadgeCheck, Bell, Building2, CreditCard, Database, Globe2, ShieldCheck, Users } from "lucide-react";
import { GamePanel, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type AgencyRow = {
  name?: string | null;
  slug?: string | null;
  country_code?: string | null;
  default_currency?: string | null;
  logo_url?: string | null;
};

export default async function SettingsPage() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId, profile } = workspace;
  const [{ data: agency }, { count: teamMembers }, { count: players }, { count: clubs }] = await Promise.all([
    admin.from("agencies").select("name, slug, country_code, default_currency, logo_url").eq("id", agencyId).maybeSingle(),
    admin.from("users").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("players").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("clubs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
  ]);

  const agencyData = (agency ?? {}) as AgencyRow;
  const controls = [
    { title: "Billing & subscription", body: "Manage plan, invoices and Stripe portal.", href: "/billing", icon: CreditCard },
    { title: "Agent verification", body: "FIFA ID, documents and representation integrity.", href: "/verification", icon: BadgeCheck },
    { title: "Player portfolio", body: "Add players, videos, documents and football data profiles.", href: "/players", icon: Users },
    { title: "Club network", body: "Manage clubs, interests and recruitment requests.", href: "/clubs", icon: Building2 },
    { title: "Football data", body: "Validate provider sync, internal data and API-first football records.", href: "/admin/football-data", icon: Database },
    { title: "Touchline AI", body: "Generate contracts, proposals and scouting documents.", href: "/ai", icon: Globe2 },
  ];

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="af-mode-kicker">Touchline / Workspace control</p>
          <h1 className="font-display mt-2 text-3xl uppercase italic sm:text-[42px]">Settings</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">
            Central control for your agency workspace. Every action below opens a real connected area of the platform.
          </p>
        </div>
        <Link href="/dashboard" className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] px-4 text-[9px] font-black uppercase tracking-wider text-cyan-100">
          Back to dashboard
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={ShieldCheck} label="Role" value={profile.role} delta="current access" accent="cyan" />
        <StatTile icon={Users} label="Team Members" value={String(teamMembers ?? 0)} delta="agency users" accent="lime" />
        <StatTile icon={Users} label="Players" value={String(players ?? 0)} delta="portfolio records" accent="gold" />
        <StatTile icon={Building2} label="Clubs" value={String(clubs ?? 0)} delta="club records" accent="rose" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <GamePanel className="p-5">
          <SectionHeader kicker="Agency identity" title="Workspace Profile" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
          <div className="rounded-3xl border border-white/[.08] bg-black/20 p-5">
            <div className="flex items-center gap-4">
              <div className="grid size-16 place-items-center overflow-hidden rounded-2xl border border-cyan-300/20 bg-cyan-300/[.08] text-xl font-black text-cyan-100">
                {agencyData.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={agencyData.logo_url} alt={agencyData.name ?? "Agency"} className="h-full w-full object-cover" />
                ) : (
                  (agencyData.name ?? "TL").slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-black uppercase italic text-white">{agencyData.name ?? "Touchline Agency"}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">{agencyData.slug ?? "workspace"} · {agencyData.country_code ?? "Global"} · {agencyData.default_currency ?? "EUR"}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.055] p-4">
            <div className="flex items-start gap-3">
              <Bell size={15} className="mt-0.5 text-amber-300" />
              <p className="text-[10px] leading-5 text-amber-100/80">
                Advanced editable organization settings, team invitations and notification preferences are prepared for the next backend workflow.
              </p>
            </div>
          </div>
        </GamePanel>

        <GamePanel className="p-5">
          <SectionHeader kicker="Control center" title="Workspace Actions" action={<Database size={15} className="text-cyan-300" />} />
          <div className="grid gap-3 md:grid-cols-2">
            {controls.map(({ title, body, href, icon: Icon }) => (
              <Link key={href} href={href} className="group rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-cyan-300/[.045]">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-300 transition group-hover:text-[#a3ff12]">
                    <Icon size={16} />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase text-white">{title}</p>
                    <p className="mt-1 text-[9px] leading-5 text-slate-500">{body}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
