import Link from "next/link";

import { ClubOwnerCommandCenter } from "@/components/club-owner-command-center";
import { GamePanel } from "@/components/game-ui";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

type MaybeRelation<T> = T | T[] | null;

type FootballClubRow = {
  id: string;
  name: string;
  logo_url: string | null;
  country: string | null;
  competition_id: string | null;
  source_updated_at: string | null;
};

type FootballCompetitionRow = {
  id: string;
  name: string;
  type: string | null;
  country: string | null;
};

type FootballSquadMemberRow = {
  player_id: string;
  position: string | null;
  status: string | null;
};

type FootballPlayerRow = {
  id: string;
  name: string;
  display_name: string | null;
  photo_url: string | null;
  position: string | null;
  market_value: number | null;
  market_value_currency: string | null;
};

type ExistingPlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  market_value: number | null;
  currency: string | null;
};

type SyncRunRow = {
  status: string;
  completed_at: string | null;
};

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type CountResult = PromiseLike<{ count: number | null; error: { message: string } | null }>;

async function safeData<T>(query: QueryResult<T>, fallback: T): Promise<T> {
  const { data, error } = await query;
  if (error) return fallback;
  return data ?? fallback;
}

async function safeCount(query: CountResult): Promise<number> {
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

function fullName(player: ExistingPlayerRow) {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Unnamed player";
}

function firstRelation<T>(value: MaybeRelation<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cardTier(value: number) {
  if (value >= 50_000_000) return "gold";
  if (value >= 5_000_000) return "silver";
  return "bronze";
}

function prestigeFromNetWorth(value: number): "Bronze" | "Silver" | "Gold" | "Emerald" | "Diamond" {
  if (value >= 500_000_000) return "Diamond";
  if (value >= 200_000_000) return "Emerald";
  if (value >= 50_000_000) return "Gold";
  if (value >= 5_000_000) return "Silver";
  return "Bronze";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Official data pending";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function Dashboard() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <GamePanel className="p-8">
          <h1 className="text-3xl font-black uppercase italic text-white">Touchline Command Center</h1>
          <p className="mt-3 text-slate-400">Connect Supabase to activate the real operating screen for requests, player assets, pitches and deal rooms.</p>
        </GamePanel>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <GamePanel className="p-8">
          <h1 className="text-3xl font-black uppercase italic text-white">Login required</h1>
          <p className="mt-3 text-slate-400">Enter your account to load the Touchline Command Center.</p>
          <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
            Login
          </Link>
        </GamePanel>
      </div>
    );
  }

  const { admin, agencyId, profile } = await ensureUserWorkspace(user);

  const [syncedClubs, latestSyncRuns, activeNegotiations, messages, marketAlerts, localPlayerRows] = await Promise.all([
    safeData(
      admin
        .from("football_clubs")
        .select("id,name,logo_url,country,competition_id,source_updated_at")
        .order("source_updated_at", { ascending: false, nullsFirst: false })
        .limit(1),
      [] as FootballClubRow[],
    ),
    safeData(
      admin
        .from("football_data_sync_runs")
        .select("status,completed_at")
        .order("started_at", { ascending: false })
        .limit(1),
      [] as SyncRunRow[],
    ),
    safeCount(admin.from("negotiation_rooms").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
    safeCount(admin.from("negotiation_messages").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)),
    safeCount(admin.from("market_radar_links").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")),
    safeData(
      admin
        .from("players")
        .select("id, first_name, last_name, photo_url, market_value, currency")
        .eq("agency_id", agencyId)
        .order("updated_at", { ascending: false })
        .limit(8),
      [] as ExistingPlayerRow[],
    ),
  ]);

  const selectedClub = syncedClubs[0] ?? null;

  const competition = selectedClub?.competition_id
    ? firstRelation(
        await safeData(
          admin
            .from("football_competitions")
            .select("id,name,type,country")
            .eq("id", selectedClub.competition_id)
            .limit(1),
          [] as FootballCompetitionRow[],
        ),
      )
    : null;

  const squadMembers = selectedClub?.id
    ? await safeData(
        admin
          .from("football_squad_members")
          .select("player_id,position,status")
          .eq("club_id", selectedClub.id)
          .eq("status", "active")
          .limit(35),
        [] as FootballSquadMemberRow[],
      )
    : [];

  const squadPlayerIds = squadMembers.map((member) => member.player_id).filter(Boolean);
  const footballPlayers = squadPlayerIds.length
    ? await safeData(
        admin
          .from("football_players")
          .select("id,name,display_name,photo_url,position,market_value,market_value_currency")
          .in("id", squadPlayerIds)
          .limit(35),
        [] as FootballPlayerRow[],
      )
    : [];

  const dataPlayers = footballPlayers.length
    ? footballPlayers.map((player) => ({
        id: player.id,
        name: player.display_name || player.name,
        position: player.position || "Role pending",
        photoUrl: player.photo_url,
        marketValue: toMoneyNumber(player.market_value),
        currency: player.market_value_currency || "EUR",
      }))
    : localPlayerRows.map((player) => ({
        id: player.id,
        name: fullName(player),
        position: "Touchline portfolio",
        photoUrl: player.photo_url,
        marketValue: toMoneyNumber(player.market_value),
        currency: player.currency || "EUR",
      }));

  const squadMarketValue = dataPlayers.reduce((sum, player) => sum + toMoneyNumber(player.marketValue), 0);
  const goldCards = dataPlayers.filter((player) => cardTier(toMoneyNumber(player.marketValue)) === "gold").length;
  const silverCards = dataPlayers.filter((player) => cardTier(toMoneyNumber(player.marketValue)) === "silver").length;
  const bronzeCards = Math.max(0, dataPlayers.length - goldCards - silverCards);
  const clubNetWorth = squadMarketValue;
  const latestSync = latestSyncRuns[0] ?? null;
  const synced = Boolean(selectedClub);
  const clubName = selectedClub?.name ?? "Touchline FC";
  const leagueName = competition?.name ?? "Competition sync pending";
  const division = competition?.type ?? "Fantasy Division";
  const rating = Math.max(62, Math.min(99, 62 + Math.round((dataPlayers.length / 35) * 18) + goldCards * 3 + silverCards));
  const ownerName = profile.full_name || user.email?.split("@")[0] || "Club Owner";

  const dashboardData = {
    owner: {
      name: ownerName,
      avatarUrl: null,
      country: "Global",
      ranking: synced ? "#1,248" : "#--",
      reputation: synced ? 84 : 50,
    },
    club: {
      id: selectedClub?.id ?? null,
      name: clubName,
      badgeUrl: selectedClub?.logo_url ?? null,
      league: leagueName,
      division,
      country: selectedClub?.country ?? competition?.country ?? "Global",
      rating,
      netWorth: clubNetWorth,
      credits: 12_450,
      prestige: prestigeFromNetWorth(clubNetWorth),
      lastUpdated: formatDate(selectedClub?.source_updated_at ?? latestSync?.completed_at),
    },
    financial: {
      cash: 12_450_000,
      transferBudget: Math.max(2_500_000, Math.round(clubNetWorth * 0.18)),
      salaryBudget: Math.max(850_000, Math.round(clubNetWorth * 0.06)),
      revenue: Math.round(Math.max(1_200_000, clubNetWorth * 0.09)),
      expenses: Math.round(Math.max(600_000, clubNetWorth * 0.045)),
      ffpStatus: clubNetWorth > 0 ? "Healthy" as const : "Monitor" as const,
    },
    squad: {
      startingXi: Math.min(11, dataPlayers.length),
      bench: Math.min(12, Math.max(0, dataPlayers.length - 11)),
      totalPlayers: dataPlayers.length,
      goldCards,
      silverCards,
      bronzeCards,
      squadMarketValue,
      coach: "Coach data pending",
      formation: dataPlayers.length >= 11 ? "4-3-3" : "Setup pending",
      players: dataPlayers,
    },
    competition: {
      leaguePosition: synced ? "Pre-season" : "Competition data pending",
      nextMatch: synced ? "Fixture data pending" : "No fixture loaded",
      seasonProgress: synced ? 7 : 0,
      promotionZone: synced ? "Available after standings sync" : "Not configured",
      relegationZone: synced ? "Available after standings sync" : "Not configured",
      championsQualification: synced ? "Available after standings sync" : "Not configured",
    },
    transfer: {
      latestOffers: messages,
      pendingOffers: marketAlerts,
      negotiations: activeNegotiations,
      watchlist: marketAlerts,
      recentTransfers: 0,
    },
    liveArena: {
      nextMatch: synced ? `${clubName} next fixture` : "Live Arena not synced",
      countdown: synced ? "Waiting for fixture sync" : "Provider foundation required",
      latestResults: synced
        ? ["Fixture engine ready", "Live scores module not activated yet", "Competition sync available next"]
        : ["Run Football Data Foundation first", "Then activate fixtures", "Then connect Live Arena"],
    },
    history: {
      titles: 0,
      cups: 0,
      bestSeason: synced ? "History sync pending" : "Not available yet",
      biggestTransfer: synced ? "Transfer sync pending" : "Not available yet",
      legacy: synced
        ? "Club identity is connected to the Touchline Football Data Layer. Historical honours, records and trophy cabinet are ready for the next Sportmonks modules."
        : "The Club Owner Command Center is ready. Sync a real club to activate legacy, squad, competitions and live arena intelligence.",
    },
    notifications: [
      {
        title: synced ? "Football Data connected" : "Football Data pending",
        body: synced ? `${clubName} is loaded from the normalized Touchline database.` : "Run the first club sync to populate the command center with real club data.",
        tone: synced ? "green" as const : "gold" as const,
      },
      {
        title: dataPlayers.length ? "Squad assets online" : "Squad sync required",
        body: dataPlayers.length ? `${dataPlayers.length} player assets are available for the Club Owner module.` : "No squad players are available yet. Sync a club squad to activate cards.",
        tone: dataPlayers.length ? "cyan" as const : "gold" as const,
      },
      {
        title: "TDIE ready",
        body: "Touchline uses one identity language for players, clubs, agencies, cards and deal rooms.",
        tone: "cyan" as const,
      },
      {
        title: activeNegotiations ? "Negotiations active" : "Transfer room quiet",
        body: activeNegotiations ? `${activeNegotiations} private deal room is active.` : "No active transfer negotiation is open right now.",
        tone: activeNegotiations ? "green" as const : "rose" as const,
      },
    ],
  };

  return <ClubOwnerCommandCenter data={dashboardData} />;
}
