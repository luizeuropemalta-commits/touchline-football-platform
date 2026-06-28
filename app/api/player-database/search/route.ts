import { NextResponse } from "next/server";
import { discoverTransfermarktLinksByName } from "@/lib/market-link-registry";
import { enrichGlobalPlayerProfileFromTransfermarkt, mapGlobalPlayer } from "@/lib/player-database";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function cleanQuery(value: string | null) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "";
}

function cleanLimit(value: string | null) {
  const limit = Number(value ?? 12);
  if (!Number.isFinite(limit)) return 12;
  return Math.min(Math.max(Math.round(limit), 1), 50);
}

function cleanText(value?: string | null, max = 220) {
  return value?.trim().replace(/\s+/g, " ").slice(0, max) || null;
}

function normalizeSearchText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchResultScore(name: unknown, query: string) {
  const normalizedName = normalizeSearchText(typeof name === "string" ? name : "");
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedName || !normalizedQuery) return 0;

  let score = 0;
  if (normalizedName === normalizedQuery) score += 1000;
  if (normalizedName.startsWith(normalizedQuery)) score += 500;
  if (normalizedName.includes(normalizedQuery)) score += 250;
  const words = normalizedQuery.split(" ").filter(Boolean);
  score += words.filter((word) => normalizedName.includes(word)).length * 80;
  score -= Math.max(normalizedName.length - normalizedQuery.length, 0);
  return score;
}

function sortRowsForQuery(rows: Record<string, unknown>[], query: string) {
  return [...rows].sort((a, b) => {
    const scoreDiff =
      searchResultScore(b.player_name ?? b.name, query) -
      searchResultScore(a.player_name ?? a.name, query);
    if (scoreDiff !== 0) return scoreDiff;
    const relevanceA = typeof a.relevance === "number" ? a.relevance : 0;
    const relevanceB = typeof b.relevance === "number" ? b.relevance : 0;
    return relevanceB - relevanceA;
  });
}

async function discoverFromMarketLinkRegistry(admin: NonNullable<ReturnType<typeof createAdminClient>>, query: string, limit: number) {
  const { data } = await admin.rpc("search_transfermarkt_entities", {
    search_query: query,
    entity_type_filter: "player",
    result_limit: limit,
  });

  const rows = ((data ?? []) as Record<string, unknown>[]).flatMap((entity) => {
    const transfermarktId = cleanText(String(entity.transfermarkt_id ?? ""), 80);
    const name = cleanText(String(entity.name ?? ""), 180);
    const profileUrl = cleanText(String(entity.canonical_url ?? entity.profile_url ?? ""), 1000);
    if (!transfermarktId || !name || !profileUrl) return [];

    return [{
      transfermarkt_player_id: transfermarktId,
      player_name: name,
      profile_url: profileUrl,
      photo_url: cleanText(entity.photo_url as string | null, 1000),
      source_provider: "transfermarkt",
      source_payload: {
        source: "market_link_registry",
        registryEntityId: entity.id,
        registryStatus: entity.status,
        note: "Created from Touchline Transfermarkt Link Registry. Stores link metadata only.",
      },
      last_updated_at: new Date().toISOString(),
    }];
  });

  if (!rows.length) return [];

  const { data: saved } = await admin
    .from("global_player_profiles")
    .upsert(rows, { onConflict: "transfermarkt_player_id" })
    .select("id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at")
    .limit(limit);

  return (saved ?? []) as Record<string, unknown>[];
}

async function hydrateProfiles(admin: NonNullable<ReturnType<typeof createAdminClient>>, rows: Record<string, unknown>[]) {
  const ids = rows.map((row) => String(row.id)).filter(Boolean);
  if (!ids.length) return rows;

  const { data } = await admin
    .from("global_player_profiles")
    .select("id, transfermarkt_player_id, player_name, profile_url, photo_url, current_club, position, nationality, date_of_birth, age, agent_name, agency_name, market_value, market_value_text, currency, source_provider, source_payload, last_updated_at")
    .in("id", ids);

  const byId = new Map(((data ?? []) as Record<string, unknown>[]).map((row) => [String(row.id), row]));
  return rows.map((row) => byId.get(String(row.id)) ?? row);
}

async function searchWorkspacePlayers(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  agencyId: string,
  query: string,
  limit: number,
) {
  const pattern = `%${query}%`;
  const { data } = await admin
    .from("players")
    .select("id, first_name, last_name, nationality, position, status, market_value, currency, photo_url, contract_end_date, external_market_provider, external_market_player_id, external_market_url, updated_at, clubs:current_club_id(name)")
    .eq("agency_id", agencyId)
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},position.ilike.${pattern},nationality.ilike.${pattern}`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Array<Record<string, unknown>>).map((player) => {
    const clubs = player.clubs as { name?: string | null } | Array<{ name?: string | null }> | null;
    const club = Array.isArray(clubs) ? clubs[0]?.name : clubs?.name;
    const name = `${String(player.first_name ?? "")} ${String(player.last_name ?? "")}`.trim() || "Unnamed player";
    const externalId = player.external_market_player_id ? String(player.external_market_player_id) : `touchline-${String(player.id)}`;
    return {
      id: String(player.id),
      transfermarktPlayerId: externalId,
      sourceProvider: player.external_market_provider ? String(player.external_market_provider) : "touchline_workspace",
      sourceId: externalId,
      sourceLabel: "Touchline Portfolio",
      sourceLinkLabel: player.external_market_url ? "Source Link" : "Touchline Profile",
      name,
      profileUrl: player.external_market_url ? String(player.external_market_url) : `/players/${String(player.id)}`,
      internalProfileUrl: `/players/${String(player.id)}`,
      photoUrl: (player.photo_url as string | null) ?? null,
      currentClub: club ?? null,
      position: (player.position as string | null) ?? null,
      nationality: (player.nationality as string | null) ?? null,
      dateOfBirth: null,
      age: null,
      agentName: null,
      agencyName: null,
      marketValue: (player.market_value as number | null) ?? null,
      marketValueText: null,
      currency: (player.currency as string | null) ?? "EUR",
      lastUpdatedAt: (player.updated_at as string | null) ?? null,
      relevance: searchResultScore(name, query),
    };
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });
  const { agencyId } = await ensureUserWorkspace(user);

  const { searchParams } = new URL(request.url);
  const query = cleanQuery(searchParams.get("q"));
  const limit = cleanLimit(searchParams.get("limit"));
  const shouldDiscover = searchParams.get("discover") === "1" || searchParams.get("discover") === "true";
  const shouldEnrich = searchParams.get("enrich") === "1" || searchParams.get("enrich") === "true";

  if (query.length < 2) return NextResponse.json({ players: [] });

  const { data, error } = await admin.rpc("search_global_player_profiles", {
    search_query: query,
    result_limit: limit,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length) rows = await hydrateProfiles(admin, rows);

  const workspacePlayers = await searchWorkspacePlayers(admin, agencyId, query, limit);
  const workspaceIds = new Set(workspacePlayers.map((player) => player.transfermarktPlayerId).filter(Boolean));
  rows = [
    ...workspacePlayers,
    ...rows.filter((row) => !workspaceIds.has(String(row.transfermarkt_player_id ?? ""))),
  ];

  if (!rows.length) {
    rows = await discoverFromMarketLinkRegistry(admin, query, limit);
  }

  if (!rows.length && shouldDiscover) {
    await discoverTransfermarktLinksByName(admin, {
      query,
      entityType: "player",
      limit,
      createdBy: user.id,
    });
    rows = await discoverFromMarketLinkRegistry(admin, query, limit);
  }

  if (rows.length && shouldEnrich) {
    const localRows = rows.filter((row) => "internalProfileUrl" in row);
    const globalRows = rows.filter((row) => !("internalProfileUrl" in row));
    const enrichedRows: Record<string, unknown>[] = [];
    for (const row of globalRows.slice(0, Math.min(limit, 6))) {
      enrichedRows.push(await enrichGlobalPlayerProfileFromTransfermarkt(admin, row));
    }
    rows = [...localRows, ...enrichedRows, ...globalRows.slice(enrichedRows.length)];
  }

  rows = sortRowsForQuery(rows, query).slice(0, limit);

  return NextResponse.json({
    players: rows.map((row) => "internalProfileUrl" in row ? row : mapGlobalPlayer(row)),
    discovered: !data?.length && rows.length > 0,
    enriched: shouldEnrich,
  });
}
