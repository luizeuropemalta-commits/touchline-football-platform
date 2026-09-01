import type { SupabaseClient } from "@supabase/supabase-js";

const PROVIDER = "sportmonks";
const COMPETITION_PROVIDER_ID = "8";
const LEAGUE_KEY = "touchline-england";
const MAX_FIXTURES = 240;

export const TOUCHLINE_LIVE_PRESENTATION_DB_QUERY_BUDGET = 6;
export const TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS = Object.freeze({
  activeSnapshot: "snapshot_id",
  playerSnapshot: "snapshot_id,source,status,scoring_version,coverage_status,expected_player_count,actual_player_count,fixture_ids,expected_fixture_ids",
  coachSnapshot: "snapshot_id,scoring_version,fixture_ids",
  competition: "id",
  fixtures: "provider_fixture_id,starts_at,status",
});

export type TouchlineLivePresentationInput = Readonly<{
  playerRankingSnapshotId: string | null;
  playerRankingFixtureIds: readonly string[];
  coachRankingSnapshotId: string | null;
  coachRankingFixtureIds: readonly string[];
  fixtures: readonly Readonly<{
    fixtureId: string;
    startsAt: string | null;
    status: string | null;
  }>[];
}>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown) {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function officialFixtureId(value: unknown) {
  const candidate = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : text(value);
  return candidate && /^[1-9]\d{0,19}$/.test(candidate) ? candidate : null;
}

function ids(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return [...new Set(value.map(text).filter((id): id is string => Boolean(id)))];
}

function sameIds(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((id) => expected.has(id));
}

function queryFailed(error: unknown, operation: string): asserts error is null | undefined {
  if (error) throw new Error(`TouchLine live presentation ${operation} failed.`);
}

async function readPlayerRankingRevision(admin: SupabaseClient) {
  const { data: active, error: activeError } = await admin
    .from("touchline_card_ranking_active_snapshots")
    .select(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.activeSnapshot)
    .eq("league_key", LEAGUE_KEY)
    .maybeSingle();
  queryFailed(activeError, "player active snapshot");
  const activeId = text(active?.snapshot_id);
  if (!activeId) return { snapshotId: null, fixtureIds: [] as string[] };

  const { data: snapshot, error } = await admin
    .from("touchline_card_ranking_snapshots")
    .select(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.playerSnapshot)
    .eq("snapshot_id", activeId)
    .eq("league_key", LEAGUE_KEY)
    .maybeSingle();
  queryFailed(error, "player snapshot");
  const fixtureIds = ids(snapshot?.fixture_ids);
  const expectedFixtureIds = ids(snapshot?.expected_fixture_ids);
  if (
    text(snapshot?.snapshot_id) !== activeId
    || snapshot?.source !== "sportmonks-audited"
    || snapshot?.status !== "published"
    || snapshot?.scoring_version !== "player_scoring_v3"
    || !["complete", "complete_for_scoring"].includes(String(snapshot?.coverage_status))
    || snapshot?.actual_player_count !== snapshot?.expected_player_count
    || !sameIds(fixtureIds, expectedFixtureIds)
  ) return { snapshotId: null, fixtureIds: [] as string[] };
  return { snapshotId: activeId, fixtureIds };
}

async function readCoachRankingRevision(admin: SupabaseClient) {
  const { data: active, error: activeError } = await admin
    .from("touchline_coach_ranking_active_snapshots")
    .select(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.activeSnapshot)
    .eq("league_key", LEAGUE_KEY)
    .maybeSingle();
  queryFailed(activeError, "coach active snapshot");
  const activeId = text(active?.snapshot_id);
  if (!activeId) return { snapshotId: null, fixtureIds: [] as string[] };

  const { data: snapshot, error } = await admin
    .from("touchline_coach_ranking_snapshots")
    .select(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.coachSnapshot)
    .eq("snapshot_id", activeId)
    .eq("league_key", LEAGUE_KEY)
    .maybeSingle();
  queryFailed(error, "coach snapshot");
  if (text(snapshot?.snapshot_id) !== activeId || snapshot?.scoring_version !== "coach_scoring_v2") {
    return { snapshotId: null, fixtureIds: [] as string[] };
  }
  return { snapshotId: activeId, fixtureIds: ids(snapshot?.fixture_ids) };
}

async function readFixtureTiming(admin: SupabaseClient, now: number) {
  const { data: competition, error: competitionError } = await admin
    .from("football_competitions")
    .select(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.competition)
    .eq("provider", PROVIDER)
    .eq("provider_competition_id", COMPETITION_PROVIDER_ID)
    .maybeSingle();
  queryFailed(competitionError, "competition");
  const competitionId = text(competition?.id);
  if (!competitionId) return [];

  const from = new Date(now - 4 * 60 * 60 * 1_000).toISOString();
  const { data, error } = await admin
    .from("football_fixtures")
    .select(TOUCHLINE_LIVE_PRESENTATION_PROJECTIONS.fixtures)
    .eq("provider", PROVIDER)
    .eq("competition_id", competitionId)
    .gte("starts_at", from)
    .order("starts_at", { ascending: true })
    .limit(MAX_FIXTURES);
  queryFailed(error, "fixtures");
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const fixtureId = officialFixtureId(row.provider_fixture_id);
    if (!fixtureId) return [];
    return [{ fixtureId, startsAt: timestamp(row.starts_at), status: text(row.status) }];
  });
}

/**
 * Six bounded reads maximum: two immutable ranking pointers/summaries plus the
 * competition and its minimal fixture timing fields. No ranking payload,
 * cards, clubs, seasons, rounds, scores or provider raw data are selected.
 */
export async function readTouchlineLivePresentationInput(
  admin: SupabaseClient,
  now = Date.now(),
): Promise<TouchlineLivePresentationInput> {
  const [player, coach, fixtures] = await Promise.all([
    readPlayerRankingRevision(admin),
    readCoachRankingRevision(admin),
    readFixtureTiming(admin, now),
  ]);
  return {
    playerRankingSnapshotId: player.snapshotId,
    playerRankingFixtureIds: player.fixtureIds,
    coachRankingSnapshotId: coach.snapshotId,
    coachRankingFixtureIds: coach.fixtureIds,
    fixtures,
  };
}
