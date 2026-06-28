import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createFootballDataProvider } from "@/lib/football-data";
import type { TouchlineCompetition, TouchlinePlayer, TouchlineTeam } from "@/lib/football-data/types";
import { getTouchlinePlayerTier } from "@/lib/player-tier";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbClient = SupabaseClient;

type QaTarget = {
  name: string;
  searchName?: string;
  providerId?: string;
  clubProviderId?: string;
  clubLogoUrl?: string;
  leagueProviderId?: string;
  league?: string;
  staleProviderIds?: string[];
  club?: string;
  overrideMarketValue?: number;
};

const qaTargets: QaTarget[] = [
  { name: "Lamine Yamal", providerId: "37656179", clubProviderId: "83", clubLogoUrl: "https://cdn.sportmonks.com/images/soccer/teams/19/83.png", club: "Barcelona", leagueProviderId: "564", league: "La Liga", overrideMarketValue: 220_000_000 },
  { name: "Joao Neves", providerId: "37592729", club: "Paris Saint-Germain", leagueProviderId: "301", league: "Ligue 1", overrideMarketValue: 120_000_000 },
  { name: "Joao Pedro", searchName: "Joao Pedro", providerId: "28931574", staleProviderIds: ["129664"], club: "Chelsea", leagueProviderId: "8", league: "Premier League", overrideMarketValue: 70_000_000 },
  { name: "Neymar", providerId: "186320", club: "Santos", leagueProviderId: "648", league: "Serie A", overrideMarketValue: 20_000_000 },
  { name: "Weverton", providerId: "218295", club: "Pembroke", league: "Domestic League", overrideMarketValue: 3_000_000 },
  { name: "Lionel Messi", providerId: "184798", club: "Inter Miami CF", league: "Major League Soccer" },
];

function targetForProviderId(providerId?: string | null) {
  return qaTargets.find((target) => target.providerId === providerId)
    ?? qaTargets.find((target) => target.staleProviderIds?.includes(String(providerId)));
}

function currentClubName(currentClub: { name?: string | null } | { name?: string | null }[] | null | undefined) {
  const club = Array.isArray(currentClub) ? currentClub[0] : currentClub;
  return club?.name ?? null;
}

function normalized(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesRequestedTarget(target: QaTarget, requestedName: string) {
  const requested = normalized(requestedName);
  const names = [target.name, target.searchName].map((name) => normalized(name)).filter(Boolean);
  return names.some((name) => name === requested || (requested.length >= 4 && name.endsWith(` ${requested}`)));
}

function moneyLabel(value: number) {
  if (value >= 1_000_000) return `EUR ${(value / 1_000_000).toFixed(0)}.00 m`;
  return `EUR ${value.toLocaleString("en-US")}`;
}

function playerScore(player: TouchlinePlayer, target: QaTarget) {
  const playerName = normalized(player.displayName || player.name);
  const targetName = normalized(target.searchName ?? target.name);
  const playerClub = normalized(player.currentTeamName);
  const targetClub = normalized(target.club);

  let score = 0;
  if (playerName === targetName) score += 100;
  if (playerName.includes(targetName) || targetName.includes(playerName)) score += 55;
  if (playerClub && targetClub && (playerClub.includes(targetClub) || targetClub.includes(playerClub))) score += 80;
  if (player.photoUrl) score += 5;
  if (player.dateOfBirth) score += 5;
  return score;
}

async function upsertClub(client: DbClient, player: TouchlinePlayer, target: QaTarget, team?: TouchlineTeam | null) {
  const providerTeamId = team?.providerId ?? player.currentTeamId ?? target.clubProviderId;
  const name = team?.name ?? player.currentTeamName ?? target.club;
  if (!providerTeamId || !name) return null;
  const competition = await upsertCompetition(client, target);

  const { data, error } = await client
    .from("football_clubs")
    .upsert(
      {
        provider: "sportmonks",
        provider_team_id: providerTeamId,
        competition_id: competition?.id ?? null,
        name,
        short_code: team?.shortCode ?? null,
        logo_url: team?.logoUrl ?? target.clubLogoUrl ?? null,
        country: team?.country ?? null,
        country_id: team?.countryId ?? null,
        founded: team?.founded ?? null,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_team_id" },
    )
    .select("id,name,logo_url")
    .maybeSingle();

  if (error) throw new Error(`Could not upsert club ${player.currentTeamName}: ${error.message}`);
  return data;
}

async function upsertCompetition(client: DbClient, target: QaTarget, competition?: TouchlineCompetition | null) {
  const providerCompetitionId = competition?.providerId ?? target.leagueProviderId;
  const name = competition?.name ?? target.league;
  if (!providerCompetitionId || !name) return null;

  const { data, error } = await client
    .from("football_competitions")
    .upsert(
      {
        provider: "sportmonks",
        provider_competition_id: providerCompetitionId,
        name,
        type: competition?.type ?? "league",
        logo_url: competition?.logoUrl ?? null,
        country: competition?.country ?? null,
        country_id: competition?.countryId ?? null,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_competition_id" },
    )
    .select("id,name,logo_url")
    .maybeSingle();

  if (error) throw new Error(`Could not upsert competition ${name}: ${error.message}`);
  return data;
}

async function upsertPlayer(client: DbClient, player: TouchlinePlayer, target: QaTarget, team?: TouchlineTeam | null) {
  const club = await upsertClub(client, player, target, team);
  const marketValue = player.marketValue ?? target.overrideMarketValue ?? null;
  const marketValueSource = player.marketValue ? "sportmonks" : target.overrideMarketValue ? "approved_visual_qa_market_value" : "sportmonks_missing_market_value";

  const { data, error } = await client
    .from("football_players")
    .upsert(
      {
        provider: "sportmonks",
        provider_player_id: player.providerId,
        current_club_id: club?.id ?? null,
        name: player.name,
        display_name: player.displayName || player.name,
        first_name: player.firstName ?? null,
        last_name: player.lastName ?? null,
        photo_url: player.photoUrl ?? null,
        date_of_birth: player.dateOfBirth ?? null,
        age: player.age ?? null,
        nationality: player.nationality ?? null,
        country_id: player.countryId ?? null,
        position: player.position ?? null,
        position_id: player.positionId ?? null,
        height: player.height ?? null,
        weight: player.weight ?? null,
        market_value: marketValue,
        market_value_currency: player.marketValueCurrency ?? "EUR",
        contract_until: player.contractUntil ?? null,
        source_updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_player_id" },
    )
    .select("id,provider,provider_player_id,current_club_id,name,display_name,photo_url,date_of_birth,age,nationality,position,market_value,market_value_currency,contract_until,source_updated_at")
    .maybeSingle();

  if (error) throw new Error(`Could not upsert player ${player.displayName}: ${error.message}`);

  return {
    ...data,
    current_club: club,
    qa_club_name: club?.name ?? target.club ?? null,
    market_value_source: marketValueSource,
    tier: getTouchlinePlayerTier(marketValue),
    market_value_label: marketValue ? moneyLabel(Number(marketValue)) : "Pending",
  };
}

async function registeredPlayers(client: DbClient, query?: string | null) {
  const request = client
    .from("football_players")
    .select("id,provider,provider_player_id,current_club_id,name,display_name,photo_url,date_of_birth,age,nationality,position,market_value,market_value_currency,contract_until,source_updated_at,current_club:current_club_id(id,name,logo_url,competition:competition_id(id,name,logo_url))")
    .eq("provider", "sportmonks")
    .order("market_value", { ascending: false, nullsFirst: false })
    .limit(100);

  const cleanQuery = query?.trim();

  const { data, error } = await request;
  if (error) throw new Error(`Could not read registered Sportmonks players: ${error.message}`);

  return (data ?? []).map((player) => {
    const target = targetForProviderId(player.provider_player_id);
    const targetOverride = target?.overrideMarketValue && Number(player.market_value ?? 0) === target.overrideMarketValue;
    return {
      ...player,
      qa_club_name: currentClubName(player.current_club) ?? target?.club ?? null,
      market_value_source: targetOverride ? "approved_visual_qa_market_value" : "registered_player",
      tier: getTouchlinePlayerTier(Number(player.market_value ?? 0)),
      market_value_label: player.market_value ? moneyLabel(Number(player.market_value)) : "Pending",
    };
  }).filter((player) => {
    if (!cleanQuery) return true;
    const target = targetForProviderId(player.provider_player_id);
    const haystack = normalized(`${player.name} ${player.display_name} ${player.provider_player_id} ${player.qa_club_name ?? ""} ${target?.name ?? ""}`);
    return haystack.includes(normalized(cleanQuery));
  });
}

async function importTarget(client: DbClient, target: QaTarget) {
  const provider = createFootballDataProvider("sportmonks");
  if (target.staleProviderIds?.length) {
    await client.from("football_players").delete().eq("provider", "sportmonks").in("provider_player_id", target.staleProviderIds);
  }

  if (target.providerId) {
    const full = await provider.getPlayerById(target.providerId);
    if (!full.ok) throw new Error(`${target.name}: ${full.error.message}`);
    if (!full.data) throw new Error(`${target.name}: Sportmonks player ${target.providerId} was not found.`);
    const teamId = full.data.currentTeamId ?? target.clubProviderId;
    const team = teamId ? await provider.getTeamById(teamId) : null;
    return upsertPlayer(client, full.data, target, team?.ok ? team.data : null);
  }

  const search = await provider.searchPlayers({ query: target.searchName ?? target.name, limit: 20 });
  if (!search.ok) throw new Error(`${target.name}: ${search.error.message}`);

  const candidates = search.data
    .map((player) => ({ player, score: playerScore(player, target) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (!best || best.score < 100) {
    const sample = candidates.slice(0, 8).map(({ player, score }) => `${player.providerId}:${player.displayName}:${player.currentTeamName ?? "club-open"}:${score}`).join(" | ");
    throw new Error(`${target.name}: Sportmonks did not return a confident player match. Candidates: ${sample}`);
  }

  const full = await provider.getPlayerById(best.player.providerId);
  if (!full.ok) throw new Error(`${target.name}: ${full.error.message}`);
  const player = full.data ?? best.player;
  const teamId = player.currentTeamId ?? target.clubProviderId;
  const team = teamId ? await provider.getTeamById(teamId) : null;
  return upsertPlayer(client, player, target, team?.ok ? team.data : null);
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ ok: false, error: "Disabled in production." }, { status: 404 });
  const client = createAdminClient();
  if (!client) return NextResponse.json({ ok: false, error: "Supabase service role env is missing." }, { status: 500 });

  try {
    const query = request.nextUrl.searchParams.get("q");
    return NextResponse.json({ ok: true, players: await registeredPlayers(client, query) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown Sportmonks QA read error." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ ok: false, error: "Disabled in production." }, { status: 404 });
  if (!process.env.SPORTMONKS_API_TOKEN) return NextResponse.json({ ok: false, error: "SPORTMONKS_API_TOKEN is missing." }, { status: 500 });
  const client = createAdminClient();
  if (!client) return NextResponse.json({ ok: false, error: "Supabase service role env is missing." }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({})) as { name?: unknown };
    const requestedName = typeof body.name === "string" ? body.name.trim() : "";
    const requested = requestedName
      ? qaTargets.filter((target) => matchesRequestedTarget(target, requestedName))
      : qaTargets;
    const targets = requested.length ? requested : [{ name: requestedName, searchName: requestedName }];
    if (requestedName && !targets[0]?.name) return NextResponse.json({ ok: false, error: "Type a player name to import from Sportmonks." }, { status: 400 });

    const imported = [];
    for (const target of targets) {
      imported.push(await importTarget(client, target));
    }

    return NextResponse.json({ ok: true, imported, players: await registeredPlayers(client) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown Sportmonks QA import error." }, { status: 500 });
  }
}
