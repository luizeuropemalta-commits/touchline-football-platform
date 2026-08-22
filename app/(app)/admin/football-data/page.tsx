import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  Trophy,
  Users,
} from "lucide-react";
import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { FootballDataSyncControls } from "@/components/admin-football-data-sync-controls";
import { isOwnerEmail } from "@/lib/admin/owner";
import { getConfiguredFootballDataProviderName } from "@/lib/football-data/provider-factory";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";

type CompetitionRow = {
  id: string;
  provider: string;
  provider_competition_id: string;
  name: string;
  country: string | null;
  logo_url: string | null;
  source_updated_at: string | null;
};

type ClubRow = {
  id: string;
  provider: string;
  provider_team_id: string;
  name: string;
  short_code: string | null;
  country: string | null;
  logo_url: string | null;
  venue_id: string | null;
  source_updated_at: string | null;
};

type PlayerRow = {
  id: string;
  provider: string;
  provider_player_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
  age: number | null;
  position: string | null;
  nationality: string | null;
  source_updated_at: string | null;
};

type SquadRow = {
  id: string;
  club_id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  status: "active" | "inactive" | "loaned" | "unknown";
  source_updated_at: string | null;
};

type SyncRunStatus = "running" | "success" | "partial" | "error" | "not_configured";

type SyncRunRow = {
  id: string;
  provider: string;
  sync_type: string;
  status: SyncRunStatus;
  records_updated: number | null;
  records_skipped: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

function formatDate(value: string | null | undefined, locale: "en-GB" | "pt-BR") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(date);
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
  if (status === "partial" || status === "not_configured") return "text-amber-300";
  if (status === "error") return "text-rose-300";
  if (status === "running") return "text-cyan-300";
  return "text-slate-400";
}

function syncAccent(status?: SyncRunStatus | null): "cyan" | "lime" | "gold" | "rose" {
  if (status === "success") return "lime";
  if (status === "error") return "rose";
  if (status === "partial" || status === "not_configured") return "gold";
  return "cyan";
}

export default async function FootballDataAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return (
      <GamePanel className="p-8">
        <LivePill>Owner area</LivePill>
        <h1 className="mt-5 text-4xl font-black  italic text-white">Football Data Foundation</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Sign in as the Touchline owner to inspect the normalized football data source of truth.</p>
        <Link href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/football-data", locale))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">
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
        <h1 className="mt-5 text-4xl font-black  italic text-white">Football Data Foundation</h1>
        <p className="mt-3 text-sm text-slate-400">Supabase admin client is not configured for server-side football data inspection.</p>
      </GamePanel>
    );
  }

  const requestedClubId = typeof params.clubId === "string" ? params.clubId : null;

  const [competitionsResult, clubsResult, syncRunsResult] = await Promise.all([
    admin
      .from("football_competitions")
      .select("id, provider, provider_competition_id, name, country, logo_url, source_updated_at")
      .order("name", { ascending: true })
      .returns<CompetitionRow[]>(),
    admin
      .from("football_clubs")
      .select("id, provider, provider_team_id, name, short_code, country, logo_url, venue_id, source_updated_at")
      .order("source_updated_at", { ascending: false })
      .limit(20)
      .returns<ClubRow[]>(),
    admin
      .from("football_data_sync_runs")
      .select("id, provider, sync_type, status, records_updated, records_skipped, started_at, completed_at, error_message")
      .order("started_at", { ascending: false })
      .limit(8)
      .returns<SyncRunRow[]>(),
  ]);

  const competitions = competitionsResult.data ?? [];
  const clubs = clubsResult.data ?? [];
  const recentSyncRuns = syncRunsResult.data ?? [];
  const selectedClub = clubs.find((club) => (
    club.id === requestedClubId || club.provider_team_id === requestedClubId
  )) ?? clubs[0] ?? null;

  const squadResult = selectedClub
    ? await admin
        .from("football_squad_members")
        .select("id, club_id, player_id, jersey_number, position, status, source_updated_at")
        .eq("club_id", selectedClub.id)
        .eq("status", "active")
        .order("jersey_number", { ascending: true, nullsFirst: false })
        .returns<SquadRow[]>()
    : { data: [] as SquadRow[], error: null };

  const squadMembers = squadResult.data ?? [];
  const playerIds = [...new Set(squadMembers.map((member) => member.player_id).filter(Boolean))];
  const playersResult = playerIds.length
    ? await admin
        .from("football_players")
        .select(
          "id, provider, provider_player_id, display_name, first_name, last_name, photo_url, date_of_birth, age, position, nationality, source_updated_at",
        )
        .in("id", playerIds)
        .returns<PlayerRow[]>()
    : { data: [] as PlayerRow[], error: null };

  const players = playersResult.data ?? [];
  const playerById = new Map(players.map((player) => [player.id, player]));
  const latestSync = recentSyncRuns[0] ?? null;
  const readIssues: string[] = [];
  if (competitionsResult.error) readIssues.push("Normalized competitions could not be read.");
  if (clubsResult.error) readIssues.push("Normalized clubs could not be read.");
  if (syncRunsResult.error) readIssues.push("Football sync history could not be read.");
  if (squadResult.error) readIssues.push("The selected club squad could not be read.");
  if (playersResult.error) readIssues.push("The selected club player details could not be read.");

  const databaseReadable = readIssues.length === 0;
  const hasFoundationData = competitions.length > 0 && clubs.length > 0;
  const pipelineLabel = !databaseReadable
    ? "Football data read unavailable"
    : hasFoundationData
      ? "Football data readable"
      : "Foundation waiting for data";
  const configuredProvider = getConfiguredFootballDataProviderName();
  const pipelineRows = [
    { label: "Selected provider adapter", value: configuredProvider, tone: "text-white" },
    {
      label: "Database reads",
      value: databaseReadable ? "Available" : "Unavailable",
      tone: databaseReadable ? "text-[#a3ff12]" : "text-rose-300",
    },
    {
      label: "Latest sync",
      value: latestSync?.status ?? (syncRunsResult.error ? "Unavailable" : "No sync recorded"),
      tone: latestSync ? statusTone(latestSync.status) : syncRunsResult.error ? "text-rose-300" : "text-slate-400",
    },
    {
      label: "Updated",
      value: latestSync ? formatDate(latestSync.completed_at ?? latestSync.started_at, locale) : "—",
      tone: "text-white",
    },
  ];

  return (
    <div className="space-y-6">
      <GamePanel className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
          <div>
            <LivePill>{pipelineLabel}</LivePill>
            <p className="mt-6 text-[10px] font-black text-cyan-300/70">Touchline / Owner Data Control</p>
            <h1 className="mt-2 max-w-4xl text-5xl font-black  italic leading-[.9] text-white md:text-7xl">
              Football Data Foundation
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">
              This page verifies the new provider-independent pipeline: Sportmonks feeds the FootballDataProvider layer, data is normalized into
              Touchline tables, and the app reads from the Touchline database as the source of truth.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={touchLineAuthHref("/admin", locale)} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-[10px] font-black text-cyan-100">
                Owner Admin
              </Link>
              <Link href="/football-search" className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-4 py-3 text-[10px] font-black text-[#c6ff62]">
                Football Search
              </Link>
            </div>
            <FootballDataSyncControls />
          </div>

          <div className="rounded-3xl border border-cyan-300/15 bg-black/20 p-5">
            <p className="text-[9px] font-black text-cyan-300">Pipeline status</p>
            <div className="mt-5 space-y-4">
              {pipelineRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 border-b border-white/[.06] pb-3">
                  <span className="text-[10px] font-bold text-slate-500">{row.label}</span>
                  <span className={`text-right text-xs font-black ${row.tone}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GamePanel>

      {readIssues.length ? (
        <GamePanel className="border border-rose-300/20 bg-rose-300/[.045] p-5">
          <p className="text-[9px] font-black text-rose-200">Protected read error</p>
          <h2 className="mt-1 text-xl font-black italic text-white">Some football data is unavailable</h2>
          <ul className="mt-3 space-y-1 text-[10px] leading-5 text-slate-400">
            {readIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
          <p className="mt-3 text-[9px] leading-4 text-slate-600">
            No credentials or provider payloads are shown here. Use protected server-side diagnostics for technical detail.
          </p>
        </GamePanel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Trophy}
          label="Competitions"
          value={competitionsResult.error ? "—" : String(competitions.length)}
          delta={competitionsResult.error ? "read unavailable" : "normalized"}
          accent={competitionsResult.error ? "rose" : "gold"}
        />
        <StatTile
          icon={Building2}
          label="Clubs"
          value={clubsResult.error ? "—" : String(clubs.length)}
          delta={clubsResult.error ? "read unavailable" : "database"}
          accent={clubsResult.error ? "rose" : "cyan"}
        />
        <StatTile
          icon={Users}
          label="Squad players"
          value={playersResult.error || squadResult.error ? "—" : String(players.length)}
          delta={playersResult.error || squadResult.error ? "read unavailable" : selectedClub?.name ?? "no club"}
          accent={playersResult.error || squadResult.error ? "rose" : "lime"}
        />
        <StatTile
          icon={Activity}
          label="Recent syncs"
          value={syncRunsResult.error ? "—" : String(recentSyncRuns.length)}
          delta={syncRunsResult.error ? "read unavailable" : latestSync?.status ?? "none recorded"}
          accent={syncRunsResult.error ? "rose" : syncAccent(latestSync?.status)}
        />
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
                  <p className="text-[9px] font-black text-cyan-300">Selected club</p>
                  <h2 className="mt-1 truncate text-2xl font-black  italic text-white">{selectedClub.name}</h2>
                  <p className="mt-1 text-[10px] font-bold text-slate-500">
                    {selectedClub.country ?? "Country open"} · Provider ID {selectedClub.provider_team_id}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-xs">
                <div className="rounded-2xl border border-white/[.06] bg-black/20 p-4">
                  <p className="text-[8px] font-black text-slate-500">Provider venue ID</p>
                  <p className="mt-1 font-black text-white">{selectedClub.venue_id ?? "Not supplied by provider"}</p>
                </div>
                <div className="rounded-2xl border border-white/[.06] bg-black/20 p-4">
                  <p className="text-[8px] font-black text-slate-500">Last normalized</p>
                  <p className="mt-1 font-black text-[#a3ff12]">{formatDate(selectedClub.source_updated_at, locale)}</p>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black text-cyan-300">Squad source of truth</p>
                  <h2 className="mt-1 text-2xl font-black  italic text-white">Synced players</h2>
                </div>
                <span className="rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.08] px-3 py-1 text-[9px] font-black text-[#c6ff62]">
                  {squadResult.error ? "Unavailable" : `${squadMembers.length} current`}
                </span>
              </div>
              <div className="grid max-h-[620px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {squadResult.error ? (
                  <div className="rounded-3xl border border-rose-300/20 bg-rose-300/[.06] p-6 text-sm text-rose-100">
                    The active squad could not be read.
                  </div>
                ) : playersResult.error ? (
                  <div className="rounded-3xl border border-rose-300/20 bg-rose-300/[.06] p-6 text-sm text-rose-100">
                    Player details for this squad could not be read.
                  </div>
                ) : squadMembers.map((member) => {
                  const player = playerById.get(member.player_id);
                  const name = player?.display_name ?? "Unknown player";
                  return (
                    <div key={member.id} className="group rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-3 transition hover:border-[#a3ff12]/25 hover:bg-[#a3ff12]/[.06]">
                      <div className="flex items-center gap-3">
                        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/[.08] bg-black/25 text-xs font-black text-cyan-200">
                          {player?.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={player.photo_url} alt="" className="h-full w-full object-cover object-top" />
                          ) : (
                            initials(name)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black  italic text-white">{name}</p>
                          <p className="mt-1 truncate text-[9px] font-bold text-slate-500">
                            {member.position ?? player?.position ?? "Position unavailable"} ·{" "}
                            {player?.nationality ?? "Nation unavailable"}
                          </p>
                        </div>
                        <span className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] px-2 py-1 text-[9px] font-black text-cyan-200">
                          #{member.jersey_number ?? "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {!squadResult.error && !playersResult.error && !squadMembers.length && (
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
              <p className="text-[9px] font-black text-cyan-300">Normalized competitions</p>
              <h2 className="text-xl font-black  italic text-white">Provider-independent records</h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {competitions.map((competition) => (
              <div key={competition.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black  text-white">{competition.name}</p>
                  <p className="mt-1 text-[9px] font-bold text-slate-500">
                    {competition.country ?? "Country open"} · {competition.provider} #{competition.provider_competition_id} · normalized {formatDate(competition.source_updated_at, locale)}
                  </p>
                </div>
                <CheckCircle2 aria-label="Normalized record readable" className="shrink-0 text-[#a3ff12]" size={18} />
              </div>
            ))}
            {competitionsResult.error ? (
              <p className="text-sm text-rose-200">Competition records are unavailable.</p>
            ) : !competitions.length ? (
              <p className="text-sm text-slate-500">No competitions normalized yet.</p>
            ) : null}
          </div>
        </GamePanel>

        <GamePanel className="p-6">
          <div className="flex items-center gap-3">
            <Activity className="text-[#a3ff12]" />
            <div>
              <p className="text-[9px] font-black text-cyan-300">Sync audit trail</p>
              <h2 className="text-xl font-black  italic text-white">Recent sync runs</h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {recentSyncRuns.map((run) => (
              <div key={run.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-sm font-black  ${statusTone(run.status)}`}>{run.status}</p>
                    <p className="mt-1 text-[9px] font-bold text-slate-500">
                      {run.provider} · {run.sync_type} · {formatDate(run.started_at, locale)}
                    </p>
                  </div>
                  <span className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] px-2 py-1 text-[9px] font-black text-cyan-200">
                    +{run.records_updated ?? 0}
                  </span>
                </div>
                {run.error_message ? (
                  <p className="mt-3 text-xs text-rose-200">
                    This sync recorded diagnostic detail. Review protected server logs before retrying.
                  </p>
                ) : null}
              </div>
            ))}
            {syncRunsResult.error ? (
              <p className="text-sm text-rose-200">Sync history is unavailable.</p>
            ) : !recentSyncRuns.length ? (
              <p className="text-sm text-slate-500">No sync run has been recorded yet.</p>
            ) : null}
          </div>
        </GamePanel>
      </div>

      <GamePanel className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[9px] font-black text-cyan-300">Next engineering step</p>
            <p className="mt-1 text-sm text-slate-300">Player Profile 2.0 can now read normalized football_players instead of calling external APIs directly.</p>
          </div>
          <Link href={touchLineAuthHref("/admin/football-data", locale)} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-[10px] font-black text-cyan-100">
            Refresh dashboard <ExternalLink size={13} />
          </Link>
        </div>
      </GamePanel>
    </div>
  );
}
