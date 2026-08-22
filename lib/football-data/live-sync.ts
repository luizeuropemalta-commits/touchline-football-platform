import type { SupabaseClient } from "@supabase/supabase-js";

import { persistFantasyFixtureFeed } from "@/lib/football-data/fantasy-store";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { persistLiveFixtureStates, mergeCanonicalLiveFixture } from "@/lib/football-data/live-fixture-store";
import { persistLiveScoreSnapshot } from "@/lib/football-data/live-score-persistence";
import { syncTouchLinePlayerSeasonStatistics } from "@/lib/football-data/player-season-statistics-store";
import { decideLiveSyncCadence } from "@/lib/football-data/live-sync-cadence";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { FootballDataProvider, TouchlineFixture } from "@/lib/football-data/types";
import { inspectTouchlineIsolatedPreviewEnvironment } from "@/lib/touchlinePreview/isolation";

const COMPETITION_ID = "8";
const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";

type Dependencies = {
  provider?: FootballDataProvider;
  readFixtures?: typeof readPublicCompetitionFixtures;
  persistStates?: typeof persistLiveFixtureStates;
  persistSnapshot?: typeof persistLiveScoreSnapshot;
  persistFantasyFeed?: typeof persistFantasyFixtureFeed;
  now?: () => number;
};

export type LiveSyncResult = {
  ok: boolean;
  status: "success" | "partial" | "error" | "not_configured" | "skipped";
  cadence: "live" | "matchday" | "idle";
  fetched: number;
  updated: number;
  snapshotFixtures: number;
  fantasyFeedsStored: number;
  playerFixtureRowsWritten: number;
  coachPointsReconciled: number;
  errors: string[];
  syncRunId?: string;
  skippedReason?: string;
};

async function latestSuccessfulRun(admin: SupabaseClient) {
  const { data } = await admin
    .from("football_data_sync_runs")
    .select("completed_at")
    .eq("provider", "sportmonks")
    .eq("sync_type", "live_scores")
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.completed_at === "string" ? data.completed_at : null;
}

async function createRun(admin: SupabaseClient, cadence: string, forceFixtureId?: string | null) {
  const { data, error } = await admin.from("football_data_sync_runs").insert({
    provider: "sportmonks",
    sync_type: "live_scores",
    status: "running",
    source_payload: { competitionProviderId: COMPETITION_ID, cadence, forcedFixture: Boolean(forceFixtureId) },
  }).select("id").single();
  if (error) throw new Error(`Could not create live sync run: ${error.message}`);
  return typeof data?.id === "string" ? data.id : undefined;
}

async function completeRun(admin: SupabaseClient, result: LiveSyncResult) {
  if (!result.syncRunId) return;
  await admin.from("football_data_sync_runs").update({
    status: result.status === "skipped" ? "success" : result.status,
    completed_at: new Date().toISOString(),
    records_updated: result.updated,
    records_skipped: Math.max(0, result.fetched - result.updated),
    error_message: result.errors.join("\n") || null,
    source_payload: {
      competitionProviderId: COMPETITION_ID,
      cadence: result.cadence,
      fetched: result.fetched,
      updated: result.updated,
      snapshotFixtures: result.snapshotFixtures,
      fantasyFeedsStored: result.fantasyFeedsStored,
      playerFixtureRowsWritten: result.playerFixtureRowsWritten,
      coachPointsReconciled: result.coachPointsReconciled,
      skippedReason: result.skippedReason ?? null,
    },
  }).eq("id", result.syncRunId);
}

function uniqueFixtures(fixtures: TouchlineFixture[]) {
  return [...new Map(fixtures.map((fixture) => [fixture.providerId, fixture])).values()];
}

function assertQaLiveSyncRuntime() {
  const inspection = inspectTouchlineIsolatedPreviewEnvironment();
  if (inspection.status !== "qa"
    || process.env.VERCEL_ENV !== "preview"
    || process.env.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== QA_PROJECT_REF) {
    throw new Error("Live synchronization is available only in the dedicated functional QA Preview.");
  }
}

export async function syncSportmonksLiveState(
  admin: SupabaseClient,
  options: { forceFixtureId?: string | null } = {},
  dependencies: Dependencies = {},
): Promise<LiveSyncResult> {
  assertQaLiveSyncRuntime();
  const now = dependencies.now?.() ?? Date.now();
  const readFixtures = dependencies.readFixtures ?? readPublicCompetitionFixtures;
  const schedule = await readFixtures({ includeHistorical: true, limit: 240, now });
  const lastSuccessfulSyncAt = await latestSuccessfulRun(admin);
  const decision = decideLiveSyncCadence(schedule, {
    now,
    lastSuccessfulSyncAt,
    forceFixtureId: options.forceFixtureId,
  });
  const result: LiveSyncResult = {
    ok: false,
    status: "error",
    cadence: decision.cadence,
    fetched: 0,
    updated: 0,
    snapshotFixtures: 0,
    fantasyFeedsStored: 0,
    playerFixtureRowsWritten: 0,
    coachPointsReconciled: 0,
    errors: [],
  };

  if (!decision.due) {
    return { ...result, ok: true, status: "skipped", skippedReason: "cadence_not_due" };
  }

  result.syncRunId = await createRun(admin, decision.cadence, options.forceFixtureId);
  try {
    if (!dependencies.provider && !process.env.SPORTMONKS_API_TOKEN) {
      result.status = "not_configured";
      result.errors.push("SPORTMONKS_API_TOKEN is not configured.");
      return result;
    }
    const provider = dependencies.provider ?? createFootballDataProvider("sportmonks");
    const liveResponse = await provider.getLiveScores({ competitionId: COMPETITION_ID });
    const incoming: TouchlineFixture[] = [];
    if (liveResponse.ok) incoming.push(...liveResponse.data.filter((fixture) => fixture.competitionId === COMPETITION_ID));
    else result.errors.push(`live-scores:${liveResponse.error.code}`);

    const candidateIds = new Set([
      ...decision.candidateFixtureIds,
      ...incoming.map((fixture) => fixture.providerId),
    ]);
    for (const fixtureId of candidateIds) {
      const feedResponse = await provider.getFixtureFantasyFeed(fixtureId);
      if (!feedResponse.ok) {
        result.errors.push(`${fixtureId}:${feedResponse.error.code}`);
        continue;
      }
      if (!feedResponse.data) continue;
      incoming.push(feedResponse.data.fixture);
      const persisted = await (dependencies.persistFantasyFeed ?? persistFantasyFixtureFeed)(feedResponse.data);
      if (persisted.persisted) result.fantasyFeedsStored += 1;
      else result.errors.push(`${fixtureId}:fantasy-feed:${persisted.reason ?? "failed"}`);
    }

    const fetchedAt = new Date(now).toISOString();
    const canonicalIncoming = uniqueFixtures(incoming)
      .filter((fixture) => fixture.competitionId === COMPETITION_ID)
      .map((fixture) => ({
        ...fixture,
        source: { provider: "sportmonks" as const, providerId: fixture.providerId, lastSyncedAt: fetchedAt },
      }));
    result.fetched = canonicalIncoming.length;

    if (!liveResponse.ok && canonicalIncoming.length === 0) {
      result.status = "error";
      return result;
    }

    const persistence = await (dependencies.persistStates ?? persistLiveFixtureStates)(
      admin,
      schedule,
      canonicalIncoming,
      fetchedAt,
    );
    result.updated = persistence.updated;
    result.errors.push(...persistence.errors);

    // The canonical fixture write is the distribution boundary. Reconcile
    // both player and coach game data immediately so a finished match cannot
    // remain visible in Live while cards, profiles and tables still show the
    // previous score.
    const playerReconciliation = await syncTouchLinePlayerSeasonStatistics(admin);
    result.playerFixtureRowsWritten = playerReconciliation.fixtureRowsWritten;
    result.errors.push(...playerReconciliation.errors.map((error) => `player-points:${error}`));
    const { data: coachReconciliation, error: coachReconciliationError } = await admin
      .rpc("touchline_reconcile_coach_fixture_points", { p_fixture_id: null });
    if (coachReconciliationError) {
      result.errors.push(`coach-points:${coachReconciliationError.code ?? "unknown"}`);
    } else {
      result.coachPointsReconciled = Number((coachReconciliation as { reconciled?: unknown } | null)?.reconciled ?? 0);
    }

    const incomingById = new Map(canonicalIncoming.map((fixture) => [fixture.providerId, fixture]));
    const snapshot = schedule.map((fixture) => {
      const update = incomingById.get(fixture.providerId);
      return update ? mergeCanonicalLiveFixture(fixture, update, fetchedAt, now) : fixture;
    });
    const snapshotResult = await (dependencies.persistSnapshot ?? persistLiveScoreSnapshot)(snapshot, fetchedAt);
    if (!snapshotResult.persisted) result.errors.push(`snapshot:${snapshotResult.reason ?? "failed"}`);
    else result.snapshotFixtures = snapshot.length;

    result.ok = snapshotResult.persisted
      && persistence.errors.length === 0
      && (liveResponse.ok || canonicalIncoming.length > 0);
    result.status = !snapshotResult.persisted
      ? "error"
      : result.errors.length
        ? "partial"
        : "success";
    return result;
  } finally {
    await completeRun(admin, result);
  }
}
