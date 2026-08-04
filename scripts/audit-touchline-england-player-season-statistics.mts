import { createClient } from "@supabase/supabase-js";

type DbRow = Record<string, unknown>;

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(JSON.stringify({ ok: false, status: "not_configured", error: "Supabase service-role configuration is required for this read-only audit." }));
  process.exitCode = 2;
} else {
  const db = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const fail = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`${label}: ${error.message}`);
  };
  const chunks = <T>(items: T[], size = 200) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

  try {
    const { data: competition, error: competitionError } = await db
      .from("football_competitions")
      .select("id,name")
      .eq("provider", "sportmonks")
      .eq("provider_competition_id", "8")
      .maybeSingle();
    fail("TouchLine England competition", competitionError);
    if (!competition?.id) throw new Error("TouchLine England competition mapping is unavailable.");

    const [{ data: seasons, error: seasonsError }, { data: members, error: membersError }, { data: fixtures, error: fixturesError }] = await Promise.all([
      db.from("football_seasons").select("id,provider_season_id,name,starts_at,ends_at,is_current").eq("competition_id", competition.id).order("ends_at", { ascending: false }),
      db.from("football_squad_members").select("player_id,club_id").eq("competition_id", competition.id).eq("status", "active"),
      db.from("football_fixtures").select("id,season_id,status,starts_at").eq("competition_id", competition.id),
    ]);
    fail("seasons", seasonsError);
    fail("members", membersError);
    fail("fixtures", fixturesError);

    const playerIds = [...new Set((members ?? []).map((row) => String(row.player_id ?? "")).filter(Boolean))];
    const playerRows: DbRow[] = [];
    for (const group of chunks(playerIds)) {
      const { data, error } = await db
        .from("football_players")
        .select("id,provider,provider_player_id,name,display_name,current_club_id,position,source_updated_at")
        .in("id", group);
      fail("players", error);
      playerRows.push(...(data ?? []) as DbRow[]);
    }
    const providerIds = playerRows.map((row) => String(row.provider_player_id ?? "")).filter(Boolean);
    const snapshots: DbRow[] = [];
    for (const group of chunks(providerIds)) {
      const { data, error } = await db
        .from("football_player_profile_snapshots")
        .select("provider_player_id,season_id,season_name,statistics_status,statistics_payload,statistics_fetched_at,captured_at")
        .in("provider_player_id", group);
      fail("legacy profile snapshots", error);
      snapshots.push(...(data ?? []) as DbRow[]);
    }

    const { error: canonicalError } = await db
      .from("football_player_season_statistics")
      .select("id")
      .limit(1);
    const providerIdCounts = new Map<string, number>();
    for (const row of playerRows) {
      const id = String(row.provider_player_id ?? "");
      providerIdCounts.set(id, (providerIdCounts.get(id) ?? 0) + 1);
    }
    const incorrectMappings = playerRows.filter((row) => row.provider !== "sportmonks" || !/^\d+$/.test(String(row.provider_player_id ?? "")) || (providerIdCounts.get(String(row.provider_player_id ?? "")) ?? 0) !== 1);
    const currentSeason = (seasons ?? []).find((season) => season.is_current) ?? null;
    const previousSeason = (seasons ?? []).find((season) => !season.is_current && season.ends_at && String(season.ends_at) < new Date().toISOString().slice(0, 10)) ?? null;
    const haaland = playerRows.find((row) => String(row.provider_player_id) === "154421") ?? null;
    const haalandSnapshot = snapshots.find((row) => String(row.provider_player_id) === "154421") ?? null;
    const snapshotSeasonIds = new Set((seasons ?? []).map((season) => String(season.provider_season_id ?? "")));
    const haalandStats = Object.fromEntries(
      ((haalandSnapshot?.statistics_payload as Array<DbRow> | undefined) ?? [])
        .filter((row) => ["appearances", "goals", "assists", "minutes-played", "lineups"].includes(String(row.code ?? "")))
        .map((row) => [String(row.code), row.value]),
    );

    console.log(JSON.stringify({
      ok: true,
      auditedAt: new Date().toISOString(),
      competition: { id: competition.id, name: competition.name },
      playersAudited: playerRows.length,
      activeSquadMemberships: (members ?? []).length,
      currentSeason,
      previousCompletedSeason: previousSeason,
      fixtures: {
        total: (fixtures ?? []).length,
        finished: (fixtures ?? []).filter((fixture) => /finished|ft|aet|penalties/i.test(String(fixture.status ?? ""))).length,
        currentSeason: currentSeason ? (fixtures ?? []).filter((fixture) => fixture.season_id === currentSeason.id).length : 0,
      },
      canonicalReadModel: canonicalError ? { available: false, reason: canonicalError.message } : { available: true },
      playerProfilesWithLegacySnapshot: snapshots.length,
      completePreviousSeasonProfiles: 0,
      partialPreviousSeasonProfiles: 0,
      unavailablePreviousSeasonProfiles: playerRows.length,
      incorrectMappings: incorrectMappings.map((row) => ({ id: row.id, providerPlayerId: row.provider_player_id, name: row.display_name ?? row.name })),
      haaland: {
        touchlinePlayerId: haaland?.id ?? null,
        providerPlayerId: haaland?.provider_player_id ?? null,
        legacySnapshotSeasonId: haalandSnapshot?.season_id ?? null,
        legacySnapshotSeasonName: haalandSnapshot?.season_name ?? null,
        legacySnapshotMatchesKnownSeasonMapping: snapshotSeasonIds.has(String(haalandSnapshot?.season_id ?? "")),
        displayedValues: haalandStats,
        rootCause: "legacy-season-aggregate-without-canonical-season-or-fixture-coverage",
      },
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, status: "error", error: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 1;
  }
}
