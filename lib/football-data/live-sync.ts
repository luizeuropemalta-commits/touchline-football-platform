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
import { inspectTouchlineProductionSyncRuntime } from "@/lib/football-data/production-sync-runtime";
import { touchlineCompetitionCoachAssignments } from "@/lib/touchlineArena/live-coaches";
import { recordTouchlineLineupAvailableObservation } from "@/lib/football-data/official-team-sheet-readiness";
import { reconcilePendingTouchlineFantasyGameweeks } from "@/lib/touchlineFantasy/gameweek-lifecycle";
import { resolveTouchlineRecoveryScope, recoveryFixtureMatches, recoveryFeedComplete, claimTouchlineFixtureRecovery,
  finishTouchlineFixtureRecovery, persistTouchlineRecoveryFeed, BACKLOG_MAX_PER_RUN, BACKLOG_DEADLINE_MS } from "@/lib/football-data/fixture-backlog-recovery";

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
  recordLineupObservation?: typeof recordTouchlineLineupAvailableObservation;
  now?: () => number;
  resolveRecoveryScope?: typeof resolveTouchlineRecoveryScope;
  claimRecovery?: typeof claimTouchlineFixtureRecovery;
  finishRecovery?: typeof finishTouchlineFixtureRecovery;
  persistRecoveryFeed?: typeof persistTouchlineRecoveryFeed;
};

export type LiveSyncResult = {
  ok: boolean;
  status: "success" | "partial" | "error" | "not_configured" | "skipped";
  cadence: "live" | "matchday" | "idle";
  fetched: number;
  updated: number;
  snapshotFixtures: number;
  fantasyFeedsStored: number;
  lineupObservationsInserted: number;
  lineupObservationsExisting: number;
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
      lineupObservationsInserted: result.lineupObservationsInserted,
      lineupObservationsExisting: result.lineupObservationsExisting,
      playerFixtureRowsWritten: result.playerFixtureRowsWritten,
      coachPointsReconciled: result.coachPointsReconciled,
      playerScoringFixtureIds: result.playerScoringFixtureIds,
      playerFailedFixtureIds: result.playerFailedFixtureIds,
      playerMissingSettlementFixtureIds: result.playerMissingSettlementFixtureIds,
      cadenceExecuted: result.status !== "skipped" && result.skippedReason !== "cadence_not_due",
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
    lineupObservationsInserted: result.lineupObservationsInserted,
    lineupObservationsExisting: result.lineupObservationsExisting,
    playerFixtureRowsWritten: result.playerFixtureRowsWritten,
    coachPointsReconciled: result.coachPointsReconciled,
    errorCount: result.errors.length + (error ? 1 : 0),
    errorCategories: [...errorCategories(result.errors), ...(error ? ["run_write"] : [])],
  }));
}

function uniqueFixtures(fixtures: TouchlineFixture[]) {
  return [...new Map(fixtures.map((fixture) => [fixture.providerId, fixture])).values()];
}

function assertLiveSyncRuntime() {
  const inspection = inspectTouchlineIsolatedPreviewEnvironment();
  if (inspection.status !== "qa"
    || process.env.VERCEL_ENV !== "preview"
    || process.env.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== QA_PROJECT_REF) {
    if (!inspectTouchlineProductionSyncRuntime(process.env).allowed) {
      throw new Error("Live synchronization requires a verified QA or explicitly enabled Production runtime.");
    }
  }
}

export async function syncSportmonksLiveState(
  admin: SupabaseClient,
  options: { forceFixtureId?: string | null } = {},
  dependencies: Dependencies = {},
): Promise<LiveSyncResult> {
  assertLiveSyncRuntime();
  const now = dependencies.now?.() ?? Date.now();
  const result: LiveSyncResult = {
    ok: false,
    status: "error",
    cadence: "idle",
    fetched: 0,
    updated: 0,
    snapshotFixtures: 0,
    fantasyFeedsStored: 0,
    lineupObservationsInserted: 0,
    lineupObservationsExisting: 0,
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
    const scope = await (dependencies.resolveRecoveryScope ?? resolveTouchlineRecoveryScope)(admin);
    const schedule = await readFixtures({ providedAdmin: admin, seasonId: scope.seasonId,
      through: new Date(now + 24 * 60 * 60 * 1000).toISOString(), now });
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
      result.ok = result.errors.length === 0;
      result.status = result.ok ? "skipped" : "partial";
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
    if (liveResponse.ok) incoming.push(...liveResponse.data.filter((fixture) => recoveryFixtureMatches(fixture, scope)));
    else result.errors.push(`live-scores:${liveResponse.error.code}`);

    const candidateIds = new Set([
      ...decision.candidateFixtureIds,
      ...incoming.map((fixture) => fixture.providerId),
    ]);
    let providerRateLimited = !liveResponse.ok && liveResponse.error.code === "rate_limited";
    for (const fixtureId of candidateIds) {
      if (providerRateLimited) break;
      const feedResponse = await provider.getFixtureFantasyFeed(fixtureId);
      if (!feedResponse.ok) {
        result.errors.push(`${fixtureId}:${feedResponse.error.code}`);
        providerRateLimited = feedResponse.error.code === "rate_limited";
        continue;
      }
      if (!feedResponse.data) continue;
      if (!recoveryFixtureMatches(feedResponse.data.fixture, scope, fixtureId)) {
        result.errors.push(`${fixtureId}:fixture-identity-mismatch`);
        continue;
      }
      incoming.push(feedResponse.data.fixture);
      const persisted = await (dependencies.persistFantasyFeed ?? persistFantasyFixtureFeed)(feedResponse.data);
      if (persisted.persisted) {
        result.fantasyFeedsStored += 1;
        const observed = await (
          dependencies.recordLineupObservation ?? recordTouchlineLineupAvailableObservation
        )(admin, feedResponse.data, new Date(now).toISOString());
        if (observed.recorded) result.lineupObservationsInserted += 1;
        else if ("outcome" in observed && observed.outcome === "noop_existing") {
          result.lineupObservationsExisting += 1;
        } else if ("error" in observed) {
          result.errors.push(`${fixtureId}:lineup-observation:${observed.error}`);
        }
      } else result.errors.push(`${fixtureId}:fantasy-feed:${persisted.reason ?? "failed"}`);
    }

    // Current live/deadline traffic is processed first. Backlog is a separate
    // durable claim, never a sweep of every historical fixture on each tick.
    const finishRecovery = dependencies.finishRecovery ?? finishTouchlineFixtureRecovery;
    const recoveredClaims: NonNullable<Awaited<ReturnType<typeof claimTouchlineFixtureRecovery>>>[] = [];
    const excluded = [...candidateIds];
    if (liveResponse.ok && !providerRateLimited) for (let index = 0; index < BACKLOG_MAX_PER_RUN; index += 1) {
      if ((dependencies.now?.() ?? Date.now()) - now >= BACKLOG_DEADLINE_MS) break;
      const claim = await (dependencies.claimRecovery ?? claimTouchlineFixtureRecovery)(admin, scope, lease.runId, now, excluded);
      if (!claim) break;
      excluded.push(claim.providerFixtureId);
      if (/cancelled|canceled|abandoned|awarded|walkover/i.test(claim.status)) {
        await finishRecovery(admin, claim, lease.runId, now, "needs_review", "non_played_terminal");
        result.errors.push(`${claim.providerFixtureId}:recovery-needs-review`);
        continue;
      }
      const response = await provider.getFixtureFantasyFeed(claim.providerFixtureId);
      if (!response.ok) {
        await finishRecovery(admin, claim, lease.runId, now, "pending", response.error.code, response.error.retryAfterSeconds);
        result.errors.push(`${claim.providerFixtureId}:recovery-${response.error.code}`);
        if (response.error.code === "rate_limited") break;
        continue;
      }
      if (!response.data || !recoveryFixtureMatches(response.data.fixture, scope, claim.providerFixtureId)) {
        await finishRecovery(admin, claim, lease.runId, now, "needs_review", "fixture_identity_mismatch");
        result.errors.push(`${claim.providerFixtureId}:recovery-identity-mismatch`);
        continue;
      }
      const persisted = await (dependencies.persistRecoveryFeed ?? persistTouchlineRecoveryFeed)(admin, claim, lease.runId, response.data);
      if (persisted.persisted) {
        // The recovery RPC already writes the exact canonical fixture under
        // its lease fence. Never repeat that write through the legacy path.
        result.fantasyFeedsStored += 1;
      }
      const complete = persisted.persisted && persisted.reconciliationReady && recoveryFeedComplete(response.data);
      if (complete) recoveredClaims.push(claim);
      else await finishRecovery(admin, claim, lease.runId, now,
        persisted.persisted && recoveryFeedComplete(response.data) ? "needs_review" : "pending",
        persisted.persisted && recoveryFeedComplete(response.data) ? "shirt_reconciliation_pending" : persisted.persisted ? "feed_incomplete" : "persistence_failed", undefined,
        /postponed/i.test(response.data.fixture.status ?? ""));
      if (!complete) result.errors.push(`${claim.providerFixtureId}:recovery-${claim.attemptCount >= 8 ? "needs-review" : "pending"}`);
    }

    const fetchedAt = new Date(now).toISOString();
    const canonicalIncoming = uniqueFixtures(incoming)
      .filter((fixture) => recoveryFixtureMatches(fixture, scope))
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
    result.updated = persistence.updated + recoveredClaims.length;
    result.errors.push(...persistence.errors);
    for (const claim of recoveredClaims) {
      await finishRecovery(admin, claim, lease.runId, now, persistence.errors.length ? "pending" : "recovered",
        persistence.errors.length ? "canonical_state_pending" : "complete");
    }

    // Only persisted provider states may drive the Fantasy window. A partial
    // fixture write still has valid canonical observations; a zero-write run
    // has none. Opening/closing rules remain exclusively in the database RPC.
    if (persistence.updated > 0 || recoveredClaims.length > 0) {
      try {
        const { error: fantasyWindowError } = await admin.rpc("touchline_fantasy_sync_gameweeks");
        if (fantasyWindowError) {
          const code = fantasyWindowError.code;
          const safeError = typeof code === "string" && /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(code)
            ? code
            : "unknown";
          result.errors.push(`fantasy-window:${safeError}`);
        }
      } catch {
        result.errors.push("fantasy-window:unavailable");
      }
    }

    // The canonical fixture write is the distribution boundary. Reconcile
    // both player and coach game data immediately so a finished match cannot
    // remain visible in Live while cards, profiles and tables still show the
    // previous score.
    const playerReconciliation = await syncTouchLinePlayerSeasonStatistics(admin).finally(async () => {
      // Retry already-canonical rounds even when this run has no new fixture
      // writes. Also retain pending work if the statistics producer throws.
      // SQL discovers stale score versions durably, without replaying settled
      // history whose source versions still match.
      const lifecycle = await reconcilePendingTouchlineFantasyGameweeks(admin);
      if (lifecycle.error) result.errors.push(`fantasy-lifecycle:${lifecycle.error}`);
      else if (lifecycle.pendingStatistics) result.errors.push("fantasy-lifecycle:statistics-pending");
    });
    result.playerFixtureRowsWritten = playerReconciliation.fixtureRowsWritten;
    result.playerScoringFixtureIds = playerReconciliation.scoringFixtureIds;
    result.playerFailedFixtureIds = playerReconciliation.failedFixtureIds;
    result.playerMissingSettlementFixtureIds = playerReconciliation.missingSettlementFixtureIds;
    result.errors.push(...playerReconciliation.errors.map((error) => `player-points:${error}`));
    // Valid settlements survive deferred publication, but a pending or failed
    // ranking must remain visible in the enclosing synchronization outcome.
    if (playerReconciliation.rankingError !== null) {
      const rankingError = `player-points:ranking:${playerReconciliation.rankingError}`;
      if (!result.errors.includes(rankingError)) result.errors.push(rankingError);
    }
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
      && result.errors.length === 0
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
