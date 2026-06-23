import Link from "next/link";
import { BarChart3, Binoculars, Building2, GraduationCap, Radio, ShieldCheck, Sparkles, Upload, Users } from "lucide-react";
import { GamePanel, LivePill, Meter, SectionHeader, StatTile } from "@/components/game-ui";
import { WorkspaceState } from "@/components/workspace-state";
import { getCurrentWorkspace } from "@/lib/server/current-workspace";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  position: string | null;
  nationality: string | null;
  ai_profile: { generated?: boolean } | null;
};

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

function playerName(player: PlayerRow) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

export default async function Academies() {
  const workspace = await getCurrentWorkspace();
  if (workspace.status !== "ready") return <WorkspaceState status={workspace.status} message={"message" in workspace ? workspace.message : undefined} />;

  const { admin, agencyId } = workspace;
  const [{ data: playerRows }, { count: clubCount }, { count: scoutViews }] = await Promise.all([
    admin.from("players").select("id, first_name, last_name, date_of_birth, position, nationality, ai_profile").eq("agency_id", agencyId).order("created_at", { ascending: false }).limit(30),
    admin.from("clubs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    admin.from("player_opportunities").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
  ]);
  const youth = ((playerRows ?? []) as PlayerRow[]).filter((player) => {
    const playerAge = age(player.date_of_birth);
    return playerAge !== null && playerAge <= 21;
  });
  const aiReady = youth.filter((player) => player.ai_profile?.generated).length;
  const funnel = [
    ["Youth profiles uploaded", youth.length, 100],
    ["AI profile generated", aiReady, youth.length ? Math.round((aiReady / youth.length) * 100) : 0],
    ["Club network connected", clubCount ?? 0, Math.min(100, (clubCount ?? 0) * 10)],
    ["Opportunity signals", scoutViews ?? 0, Math.min(100, (scoutViews ?? 0) * 10)],
  ] as const;

  return (
    <div className="mx-auto max-w-[1500px] animate-in">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-3"><LivePill>{youth.length} youth profiles</LivePill><span className="text-[8px] font-bold uppercase tracking-wider text-slate-700">Academy layer uses real uploaded talents</span></div>
          <h1 className="font-display text-3xl uppercase italic sm:text-[42px]">Academy Network</h1>
          <p className="mt-1.5 text-xs text-slate-500">A future academy portal connected to real youth player profiles, club visibility and scout workflows.</p>
        </div>
        <Link href="/players" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#a3ff12] px-4 text-[9px] font-black uppercase text-[#071007]"><Upload size={14} />Upload Talent</Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={GraduationCap} label="Youth Profiles" value={String(youth.length)} delta="age 21 or under" accent="cyan" />
        <StatTile icon={Users} label="AI Ready" value={String(aiReady)} delta="presentation generated" accent="lime" />
        <StatTile icon={Binoculars} label="Scout Signals" value={String(scoutViews ?? 0)} delta="opportunities" accent="gold" />
        <StatTile icon={Building2} label="Club Network" value={String(clubCount ?? 0)} delta="real club records" accent="rose" />
      </div>

      <section className="mt-6">
        <SectionHeader kicker="Development profiles" title="Youth Talent Showcase" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
        <div className="grid gap-4 lg:grid-cols-3">
          {youth.map((player) => (
            <Link key={player.id} href={`/players/${player.id}`} className="glass-hover rounded-3xl border border-white/[.07] bg-white/[.025] p-5">
              <p className="text-[8px] font-black uppercase tracking-[.2em] text-[#a3ff12]">Real uploaded talent</p>
              <h3 className="mt-3 text-sm font-black uppercase italic text-white">{playerName(player)}</h3>
              <p className="mt-2 text-[9px] text-slate-500">{player.position || "Position open"} · Age {age(player.date_of_birth) ?? "open"} · {player.nationality || "Nationality open"}</p>
              <span className="mt-5 inline-flex rounded-lg border border-cyan-300/20 bg-cyan-300/[.06] px-2 py-1 text-[7px] font-black text-cyan-300">{player.ai_profile?.generated ? "AI READY" : "PROFILE NEEDS AI"}</span>
            </Link>
          ))}
          {!youth.length && (
            <GamePanel className="border-dashed border-cyan-300/20 p-6 lg:col-span-3">
              <Sparkles size={18} className="text-[#a3ff12]" />
              <p className="mt-4 text-sm font-black uppercase italic text-white">No academy/youth talents uploaded yet</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">Add players aged 21 or under to activate the academy showcase and future scout visibility workflows.</p>
            </GamePanel>
          )}
        </div>
      </section>

      <GamePanel className="mt-6 p-5">
        <SectionHeader kicker="Pathway Health" title="Development Funnel" action={<BarChart3 size={15} className="text-cyan-300" />} />
        {funnel.map(([label, value, pct], index) => (
          <div key={label} className="mb-4">
            <div className="flex justify-between text-[8px]"><span className="font-bold text-slate-500">{label}</span><span className="font-black text-slate-300">{value}</span></div>
            <div className="mt-2"><Meter value={pct} color={index === 3 ? "lime" : "cyan"} /></div>
          </div>
        ))}
        <p className="mt-5 rounded-lg border border-[#a3ff12]/15 bg-[#a3ff12]/[.04] p-3 text-[8px] leading-4 text-slate-500"><Radio size={12} className="mb-2 text-[#a3ff12]" />Future academy accounts will upload talents directly into this verified pipeline.</p>
      </GamePanel>
    </div>
  );
}
