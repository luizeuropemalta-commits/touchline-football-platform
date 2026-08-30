import type { SupabaseClient } from "@supabase/supabase-js";

import { persistFantasyFixtureFeed } from "@/lib/football-data/fantasy-store";
import { syncSportmonksFixtureSchedule } from "@/lib/football-data/fixture-schedule-sync";
import { readPublicCompetitionFixtures } from "@/lib/football-data/fixture-schedule-store";
import { persistLiveFixtureStates, mergeCanonicalLiveFixture } from "@/lib/football-data/live-fixture-store";
import { persistLiveScoreSnapshot } from "@/lib/football-data/live-score-persistence";
import { syncTouchLinePlayerSeasonStatistics } from "@/lib/football-data/player-season-statistics-store";
import { decideLiveSyncCadence } from "@/lib/football-data/live-sync-cadence";
import { acquireTouchlineLiveSyncRun } from "@/lib/football-data/live-sync-lease";
import { createFootballDataProvider } from "@/lib/football-data/provider-factory";
import type { FootballDataProvider, TouchlineFixture } from "@/lib/football-data/types";
import { inspectTouchlineIsolatedPreviewEnvironment } from "@/lib/touchlinePreview/isolation";
import { touchlineCompetitionCoachAssignments } from "@/lib/touchlineArena/live-coaches";

const COMPETITION_ID = "8";
const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const FIXTURE_SCHEDULE_REFRESH_MS = 6 * 60 * 60 * 1000;

type Dependencies = {
  provider?: FootballDataProvider;
  readFixtures?: typeof readPublicCompetitionFixtures;
  persistStates?: typeof persistLiveFixtureStates;
  persistSnapshot?: typeof persistLiveScoreSnapshot;
  persistFantasyFeed?: typeof persistFantasyFixtureFeed;
  acquireRun?: typeof acquireTouchlineLiveSyncRun;
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
  playerScoringFixtureIds: string[];
  playerFailedFixtureIds: string[];
  playerMissingSettlementFixtureIds: string[];
  errors: string[];
  syncRunId?: string;
  skippedReason?: string;
};

async function latestSuccessfulRunStartedAt(admin: SupabaseClient) {
  const { data } = await admin
    .from("football_data_sync_runs")
    .select("started_at")
    .eq("provider", "sportmonks")
    .eq("sync_type", "live_scores")
    .eq("status", "success")
    .eq("source_payload->>cadenceExecuted", "true")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.started_at === "string" ? data.started_at : null;
}

async function latestFixtureScheduleRun(admin: SupabaseClient) {
  const { data } = await admin
    .from("football_data_sync_runs")
    .select("completed_at")
    .eq("provider", "sportmonks")
    .eq("sync_type", "fixture_schedule")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.completed_at === "string" ? data.completed_at : null;
}

async function refreshFixtureScheduleWhenStale(admin: SupabaseClient, now: number) {
  try {
    const latest = Date.parse(await latestFixtureScheduleRun(admin) ?? "");
    if (Number.isFinite(latest) && now - latest < FIXTURE_SCHEDULE_REFRESH_MS) return [] as string[];
    const refreshed = await syncSportmonksFixtureSchedule(admin, { competitionId: COMPETITION_ID });
    return refreshed.ok ? [] : refreshed.errors.map((error) => `fixture-schedule:${error}`);
  } catch {
    // Schedule refresh is additive. A temporary provider or persistence error
    // must not stop the existing live-state reconciler from using its last
    // complete canonical schedule.
    return ["fixture-schedule:refresh-failed"];
  }
}

export { acquireTouchlineLiveSyncRun } from "@/lib/football-data/live-sync-lease";

function errorCategories(errors: string[]) {
  return [...new Set(errors.map((error) => error.split(":", 1)[0]).filter(Boolean))].slice(0, 12);
}

async function completeRun(admin: SupabaseClient, result: LiveSyncResult) {
  if (!result.syncRunId) return;
  const { error } = await admin.from("football_data_sync_runs").update({
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
      playerScoringFixtureIds: result.playerScoringFixtureIds,
      playerFailedFixtureIds: result.playerFailedFixtureIds,
      playerMissingSettlementFixtureIds: result.playerMissingSettlementFixtureIds,
      cadenceExecuted: result.status !== "skipped",
      skippedReason: result.skippedReason ?? null,
    },
  }).eq("id", result.syncRunId);
  console[result.status === "success" ? "info" : "warn"](JSON.stringify({
    event: "touchline.live_sync.completed",
    syncRunId: result.syncRunId,
    status: result.status,
    cadence: result.cadence,
    fetched: result.fetched,
    updated: result.updated,
    snapshotFixtures: result.snapshotFixtures,
    fantasyFeedsStored: result.fantasyFeedsStored,
    playerFixtureRowsWritten: result.playerFixtureRowsWritten,
    coachPointsReconciled: result.coachPointsReconciled,
    errorCount: result.errors.length + (error ? 1 : 0),
    errorCategories: [...errorCategories(result.errors), ...(error ? ["run_write"] : [])],
  }));
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
  const result: LiveSyncResult = {
    ok: false,
    status: "error",
    cadence: "idle",
    fetched: 0,
    updated: 0,
    snapshotFixtures: 0,
    fantasyFeedsStored: 0,
    playerFixtureRowsWritten: 0,
    coachPointsReconciled: 0,
    playerScoringFixtureIds: [],
    playerFailedFixtureIds: [],
    playerMissingSettlementFixtureIds: [],
    errors: [],
  };
  // The durable QA RPC serializes acquisition and creates the running row in
  // one transaction. No schedule refresh, provider request or fixture write
  // is allowed before this lease exists.
  const lease = await (dependencies.acquireRun ?? acquireTouchlineLiveSyncRun)(
    admin,
    now,
    options.forceFixtureId,
  );
  if (!lease.acquired) {
    return { ...result, ok: true, status: "skipped", skippedReason: lease.reason };
  }
  result.syncRunId = lease.runId;
  try {
    const readFixtures = dependencies.readFixtures ?? readPublicCompetitionFixtures;
    const fixtureScheduleErrors = dependencies.readFixtures
      ? []
      : await refreshFixtureScheduleWhenStale(admin, now);
    result.errors.push(...fixtureScheduleErrors);
    const schedule = await readFixtures({ includeHistorical: true, limit: 240, now });
    // Cadence is anchored to when the last effective successful run started.
    // A cadence_not_due row remains auditable but cannot postpone real work.
    // The durable lease above remains the authority for overlapping runs.
    const lastSuccessfulSyncAt = await latestSuccessfulRunStartedAt(admin);
    const decision = decideLiveSyncCadence(schedule, {
      now,
      lastSuccessfulSyncAt,
      forceFixtureId: options.forceFixtureId,
    });
    result.cadence = decision.cadence;
    if (!decision.due) {
      result.ok = true;
      result.status = "skipped";
      result.skippedReason = "cadence_not_due";
      return result;
    }

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
    result.playerScoringFixtureIds = playerReconciliation.scoringFixtureIds;
    result.playerFailedFixtureIds = playerReconciliation.failedFixtureIds;
    result.playerMissingSettlementFixtureIds = playerReconciliation.missingSettlementFixtureIds;
    result.errors.push(...playerReconciliation.errors.map((error) => `player-points:${error}`));
    const { data: coachReconciliation, error: coachReconciliationError } = await admin
      .rpc("touchline_reconcile_coach_fixture_points", {
        p_fixture_id: null,
        p_competition_coaches: touchlineCompetitionCoachAssignments(),
      });
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
