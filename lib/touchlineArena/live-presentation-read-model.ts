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

export type TouchlinePublishedLivePresentationInput = TouchlineLivePresentationInput & Readonly<{
  snapshotId: string;
  contentDigest: string;
  publishedAt: string;
  liveScoreSnapshotDigest: string;
  liveScorePayload: Readonly<Record<string, unknown>>;
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
    || snapshot?.scoring_version !== "player_scoring_v4"
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

function snapshotIdentity(value: unknown) {
  const candidate = text(value);
  return candidate && /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(candidate) ? candidate : null;
}

function parsePublishedPayload(value: unknown): (TouchlineLivePresentationInput & {
  liveScoreSnapshotDigest: string;
  liveScorePayload: Readonly<Record<string, unknown>>;
}) | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || candidate.scopeKey !== LEAGUE_KEY
    || !timestamp(candidate.windowStart)
    || !Array.isArray(candidate.fixtures) || candidate.fixtures.length > MAX_FIXTURES) return null;

  const fixtures = candidate.fixtures.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const fixtureId = officialFixtureId(row.fixtureId);
    if (!fixtureId || (row.startsAt !== null && !timestamp(row.startsAt))
      || (row.status !== null && typeof row.status !== "string")) return [];
    return [{ fixtureId, startsAt: timestamp(row.startsAt), status: text(row.status) }];
  });
  if (fixtures.length !== candidate.fixtures.length) return null;
  const playerRankingSnapshotId = candidate.playerRankingSnapshotId === null
    ? null
    : text(candidate.playerRankingSnapshotId);
  const coachRankingSnapshotId = candidate.coachRankingSnapshotId === null
    ? null
    : text(candidate.coachRankingSnapshotId);
  const liveScoreSnapshotDigest = text(candidate.liveScoreSnapshotDigest);
  const liveScorePayload = candidate.liveScorePayload;
  if ((playerRankingSnapshotId && playerRankingSnapshotId.length > 128)
    || (coachRankingSnapshotId && coachRankingSnapshotId.length > 128)
    || !liveScoreSnapshotDigest || !/^[0-9a-f]{32}$/.test(liveScoreSnapshotDigest)
    || !liveScorePayload || typeof liveScorePayload !== "object" || Array.isArray(liveScorePayload)) return null;
  const score = liveScorePayload as Record<string, unknown>;
  if (!timestamp(score.fetchedAt) || !Array.isArray(score.fixtures) || score.fixtures.length > MAX_FIXTURES) return null;

  return {
    playerRankingSnapshotId,
    playerRankingFixtureIds: ids(candidate.playerRankingFixtureIds),
    coachRankingSnapshotId,
    coachRankingFixtureIds: ids(candidate.coachRankingFixtureIds),
    fixtures,
    liveScoreSnapshotDigest,
    liveScorePayload: score,
  };
}

/**
 * Read the atomic pointer first, then its immutable payload. A concurrent
 * publication cannot mix fixture data with a different ranking revision.
 * Null means no publication exists yet; unreadable or invalid publications
 * throw so callers cannot confuse corruption with legacy compatibility.
 */
export async function readPublishedTouchlineLivePresentationInput(
  admin: SupabaseClient,
): Promise<TouchlinePublishedLivePresentationInput | null> {
  const { data: pointer, error: pointerError } = await admin
    .from("touchline_live_presentation_active_snapshots")
    .select("snapshot_id")
    .eq("scope_key", LEAGUE_KEY)
    .maybeSingle();
  queryFailed(pointerError, "published snapshot pointer");
  if (!pointer) return null;
  const snapshotId = snapshotIdentity(pointer?.snapshot_id);
  if (!snapshotId) throw new Error("TouchLine live presentation published snapshot pointer is invalid.");

  const { data: snapshot, error } = await admin
    .from("touchline_live_presentation_snapshots")
    .select("id,scope_key,content_digest,payload,created_at")
    .eq("id", snapshotId)
    .eq("scope_key", LEAGUE_KEY)
    .maybeSingle();
  queryFailed(error, "published snapshot");
  if (snapshotIdentity(snapshot?.id) !== snapshotId
    || snapshot?.scope_key !== LEAGUE_KEY
    || !/^[0-9a-f]{32}$/.test(text(snapshot?.content_digest) ?? "")) {
    throw new Error("TouchLine live presentation published snapshot is invalid.");
  }
  const input = parsePublishedPayload(snapshot?.payload);
  const publishedAt = timestamp(snapshot?.created_at);
  if (!input || !publishedAt) throw new Error("TouchLine live presentation published snapshot payload is invalid.");
  return { ...input, snapshotId, contentDigest: String(snapshot.content_digest), publishedAt };
}

/** Called only after the guarded sync path has persisted its canonical writes. */
export async function publishTouchlineLivePresentationSnapshot(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("touchline_live_presentation_publish_current");
  queryFailed(error, "snapshot publication");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("TouchLine live presentation snapshot publication returned an invalid result.");
  }
  const result = data as Record<string, unknown>;
  if (!snapshotIdentity(result.snapshotId)
    || !/^[0-9a-f]{32}$/.test(text(result.contentDigest) ?? "")
    || !parsePublishedPayload(result.payload)) {
    throw new Error("TouchLine live presentation snapshot publication returned an invalid result.");
  }
  return { snapshotId: String(result.snapshotId), contentDigest: String(result.contentDigest) };
}
