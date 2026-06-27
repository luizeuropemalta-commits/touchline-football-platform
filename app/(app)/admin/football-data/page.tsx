import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { GamePanel, LivePill, StatTile } from "@/components/game-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CompetitionRow = {
  id: string;
  provider: string;
  provider_competition_id: string;
  name: string;
  country_name: string | null;
  logo_url: string | null;
  is_active: boolean | null;
  updated_at: string | null;
};

type ClubRow = {
  id: string;
  provider: string;
  provider_team_id: string;
  name: string;
  short_code: string | null;
  country_name: string | null;
  logo_url: string | null;
  venue_name: string | null;
  updated_at: string | null;
};

type PlayerRow = {
  id: string;
  provider: string;
  provider_player_id: string;
  display_name: string;
  common_name: string | null;
  firstname: string | null;
  lastname: string | null;
  image_url: string | null;
  date_of_birth: string | null;
  age: number | null;
  position_name: string | null;
  detailed_position_name: string | null;
  nationality_name: string | null;
  updated_at: string | null;
};

type SquadRow = {
  id: string;
  club_id: string;
  player_id: string;
  jersey_number: number | null;
  position_name: string | null;
  is_current: boolean | null;
  updated_at: string | null;
};

type SyncRunRow = {
  id: string;
  provider: string;
  sync_type: string;
  status: string;
  records_updated: number | null;
  records_skipped: number | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusTone(status?: string | null) {
  if (status === "success") return "text-[#a3ff12]";
  if (status === "partial") return "text-amber-300";
  if (status === "failed") return "text-rose-300";
  return "text-cyan-300";
}

export default async function FootballDataAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return (
      <GamePanel className="p-8">
        <LivePill>Owner area</LivePill>
        <h1 className="mt-5 text-4xl font-black uppercase italic tracking-[-.06em] text-white">Football Data Foundation</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Sign in as the Touchline owner to inspect the normalized football data source of truth.</p>
        <Link href="/login" className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black uppercase tracking-wider text-black">
          Sign in
        </Link>
      </GamePanel>
    );
  }

  if (!isOwnerEmail(user.email)) notFound();

  if (!admin) {
    return (
      <GamePanel className="p-8">
        <LivePill>Configuration required</LivePill>
        <h1 className="mt-5 text-4xl font-black uppercase italic tracking-[-.06em] text-white">Football Data Foundation</h1>
        <p className="mt-3 text-sm text-slate-400">Supabase admin client is not configured for server-side football data inspection.</p>
      </GamePanel>
    );
  }

  const params = (await searchParams) ?? {};
  const requestedClubId = typeof params.clubId === "string" ? params.clubId : null;

  const [{ data: competitions }, { data: clubs }, { data: recentSyncRuns }] = await Promise.all([
    admin
      .from("football_competitions")
      .select("id, provider, provider_competition_id, name, country_name, logo_url, is_active, updated_at")
      .order("name", { ascending: true })
      .returns<CompetitionRow[]>(),
    admin
      .from("football_clubs")
      .select("id, provider, provider_team_id, name, short_code, country_name, logo_url, venue_name, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20)
      .returns<ClubRow[]>(),
    admin
      .from("football_data_sync_runs")
      .select("id, provider, sync_type, status, records_updated, records_skipped, started_at, finished_at, error_message")
      .order("started_at", { ascending: false })
      .limit(8)
      .returns<SyncRunRow[]>(),
  ]);

  const selectedClub = (clubs ?? []).find((club) => club.id === requestedClubId) ?? clubs?.[0] ?? null;

  const { data: squadMembers } = selectedClub
    ? await admin
        .from("football_squad_members")
        .select("id, club_id, player_id, jersey_number, position_name, is_current, updated_at")
        .eq("club_id", selectedClub.id)
        .eq("is_current", true)
        .order("jersey_number", { ascending: true })
        .returns<SquadRow[]>()
    : { data: [] as SquadRow[] };

  const playerIds = [...new Set((squadMembers ?? []).map((member) => member.player_id).filter(Boolean))];
  const { data: players } = playerIds.length
    ? await admin
        .from("football_players")
        .select(
          "id, provider, provider_player_id, display_name, common_name, firstname, lastname, image_url, date_of_birth, age, position_name, detailed_position_name, nationality_name, updated_at",
        )
        .in("id", playerIds)
        .returns<PlayerRow[]>()
    : { data: [] as PlayerRow[] };

  const playerById = new Map((players ?? []).map((player) => [player.id, player]));
  const latestSync = recentSyncRuns?.[0] ?? null;
  const ready = Boolean(competitions?.length && clubs?.length && squadMembers?.length && players?.length);

  return (
    <div className="space-y-6">
      <GamePanel className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
          <div>
            <LivePill>{ready ? "Football data online" : "Foundation waiting for data"}</LivePill>
            <p className="mt-6 text-[10px] font-black uppercase tracking-[.26em] text-cyan-300/70">Touchline / Owner Data Control</p>
            <h1 className="mt-2 max-w-4xl text-5xl font-black uppercase italic leading-[.9] tracking-[-.08em] text-white md:text-7xl">
              Football Data Foundation
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">
              This page verifies the new provider-independent pipeline: Sportmonks feeds the FootballDataProvider layer, data is normalized into
              Touchline tables, and the app reads from the Touchline database as the source of truth.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/admin" className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-cyan-100">
                Owner Admin
              </Link>
              <Link href="/football-search" className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-[#c6ff62]">
                Football Search
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-cyan-300/15 bg-black/20 p-5">
            <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Pipeline status</p>
            <div className="mt-5 space-y-4">
              {[
                ["Provider", process.env.FOOTBALL_DATA_PROVIDER || "Not configured"],
                ["Database", "Touchline source of truth"],
                ["Latest sync", latestSync ? latestSync.status : "No sync yet"],
                ["Updated", latestSync ? formatDate(latestSync.finished_at ?? latestSync.started_at) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-white/[.06] pb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                  <span className={`text-right text-xs font-black uppercase ${label === "Latest sync" ? statusTone(value) : "text-white"}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Trophy} label="Competitions" value={`${competitions?.length ?? 0}`} delta="normalized" accent="gold" />
        <StatTile icon={Building2} label="Clubs" value={`${clubs?.length ?? 0}`} delta="database" accent="cyan" />
        <StatTile icon={Users} label="Squad players" value={`${players?.length ?? 0}`} delta={selectedClub?.name ?? "no club"} accent="lime" />
        <StatTile icon={Activity} label="Recent syncs" value={`${recentSyncRuns?.length ?? 0}`} delta={latestSync?.status ?? "waiting"} accent={latestSync?.status === "failed" ? "rose" : "cyan"} />
      </div>

      {selectedClub ? (
        <GamePanel className="p-6">
          <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
            <div className="rounded-3xl border border-white/[.08] bg-white/[.025] p-5">
              <div className="flex items-center gap-4">
                <div className="grid size-20 place-items-center overflow-hidden rounded-3xl border border-cyan-300/15 bg-cyan-300/[.06]">
                  {selectedClub.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedClub.logo_url} alt="" className="h-full w-full object-contain p-3" />
                  ) : (
                    <Building2 className="text-cyan-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Selected club</p>
                  <h2 className="mt-1 truncate text-2xl font-black uppercase italic tracking-[-.05em] text-white">{selectedClub.name}</h2>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {selectedClub.country_name ?? "Country open"} · Provider ID {selectedClub.provider_team_id}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-xs">
                <div className="rounded-2xl border border-white/[.06] bg-black/20 p-4">
                  <p className="text-[8px] font-black uppercase tracking-[.18em] text-slate-500">Venue</p>
                  <p className="mt-1 font-black text-white">{selectedClub.venue_name ?? "Not supplied by provider"}</p>
                </div>
                <div className="rounded-2xl border border-white/[.06] bg-black/20 p-4">
                  <p className="text-[8px] font-black uppercase tracking-[.18em] text-slate-500">Last normalized</p>
                  <p className="mt-1 font-black text-[#a3ff12]">{formatDate(selectedClub.updated_at)}</p>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Squad source of truth</p>
                  <h2 className="mt-1 text-2xl font-black uppercase italic tracking-[-.05em] text-white">Synced players</h2>
                </div>
                <span className="rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.08] px-3 py-1 text-[9px] font-black uppercase tracking-wider text-[#c6ff62]">
                  {squadMembers?.length ?? 0} current
                </span>
              </div>
              <div className="grid max-h-[620px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {(squadMembers ?? []).map((member) => {
                  const player = playerById.get(member.player_id);
                  const name = player?.display_name ?? "Unknown player";
                  return (
                    <div key={member.id} className="group rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-3 transition hover:border-[#a3ff12]/25 hover:bg-[#a3ff12]/[.06]">
                      <div className="flex items-center gap-3">
                        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/[.08] bg-black/25 text-xs font-black text-cyan-200">
                          {player?.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={player.image_url} alt="" className="h-full w-full object-cover object-top" />
                          ) : (
                            initials(name)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black uppercase italic tracking-[-.03em] text-white">{name}</p>
                          <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            {player?.detailed_position_name ?? member.position_name ?? player?.position_name ?? "Position unavailable"} ·{" "}
                            {player?.nationality_name ?? "Nation unavailable"}
                          </p>
                        </div>
                        <span className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] px-2 py-1 text-[9px] font-black text-cyan-200">
                          #{member.jersey_number ?? "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {!squadMembers?.length && (
                  <div className="rounded-3xl border border-amber-300/15 bg-amber-300/[.06] p-6 text-sm text-amber-100">
                    No squad has been synced yet. Run the starter sync endpoint after confirming the Sportmonks club ID.
                  </div>
                )}
              </div>
            </div>
          </div>
        </GamePanel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <GamePanel className="p-6">
          <div className="flex items-center gap-3">
            <Database className="text-cyan-300" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Normalized competitions</p>
              <h2 className="text-xl font-black uppercase italic tracking-[-.04em] text-white">Provider-independent records</h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {(competitions ?? []).map((competition) => (
              <div key={competition.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black uppercase text-white">{competition.name}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    {competition.country_name ?? "Country open"} · {competition.provider} #{competition.provider_competition_id}
                  </p>
                </div>
                {competition.is_active ? <CheckCircle2 className="shrink-0 text-[#a3ff12]" size={18} /> : <ShieldCheck className="shrink-0 text-slate-600" size={18} />}
              </div>
            ))}
            {!competitions?.length && <p className="text-sm text-slate-500">No competitions normalized yet.</p>}
          </div>
        </GamePanel>

        <GamePanel className="p-6">
          <div className="flex items-center gap-3">
            <Activity className="text-[#a3ff12]" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Sync audit trail</p>
              <h2 className="text-xl font-black uppercase italic tracking-[-.04em] text-white">Recent sync runs</h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {(recentSyncRuns ?? []).map((run) => (
              <div key={run.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-sm font-black uppercase ${statusTone(run.status)}`}>{run.status}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      {run.provider} · {run.sync_type} · {formatDate(run.started_at)}
                    </p>
                  </div>
                  <span className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] px-2 py-1 text-[9px] font-black text-cyan-200">
                    +{run.records_updated ?? 0}
                  </span>
                </div>
                {run.error_message && <p className="mt-3 text-xs text-rose-200">{run.error_message}</p>}
              </div>
            ))}
            {!recentSyncRuns?.length && <p className="text-sm text-slate-500">No sync run has been recorded yet.</p>}
          </div>
        </GamePanel>
      </div>

      <GamePanel className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.22em] text-cyan-300">Next engineering step</p>
            <p className="mt-1 text-sm text-slate-300">Player Profile 2.0 can now read normalized football_players instead of calling external APIs directly.</p>
          </div>
          <Link href="/admin/football-data" className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-cyan-100">
            Refresh dashboard <ExternalLink size={13} />
          </Link>
        </div>
      </GamePanel>
    </div>
  );
}
