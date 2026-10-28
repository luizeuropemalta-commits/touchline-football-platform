import type { SupabaseClient } from "@supabase/supabase-js";

import { persistFantasyFixtureFeed } from "@/lib/football-data/fantasy-store";
import { syncSportmonksFixtureSchedule } from "@/lib/football-data/fixture-schedule-sync";
import { readPublicCompetitionFixtures, readPublicCompetitionFixtureByProviderId } from "@/lib/football-data/fixture-schedule-store";
import { persistLiveFixtureStates, mergeCanonicalLiveFixture } from "@/lib/football-data/live-fixture-store";
import { persistLiveScoreSnapshot } from "@/lib/football-data/live-score-persistence";
import { observePersistedConfirmedEvents, type ConfirmedEventObservationResult } from "@/lib/football-data/confirmed-event-observer";
import { runMatchPushProducer } from "@/lib/football-data/match-push-producer";
import { syncTouchLinePlayerSeasonStatistics } from "@/lib/football-data/player-season-statistics-store";
import { decideLiveSyncCadence, selectPostMatchRechecks } from "@/lib/football-data/live-sync-cadence";
import { acquireTouchlineLiveSyncRun } from "@/lib/football-data/live-sync-lease";
import { createGuardedFixtureProvider } from "@/lib/football-data/fixture-provider-server";
import type { FootballDataProvider, TouchlineFixture } from "@/lib/football-data/types";
import { inspectTouchlineIsolatedPreviewEnvironment } from "@/lib/touchlinePreview/isolation";
import { inspectTouchlineProductionSyncRuntime } from "@/lib/football-data/production-sync-runtime";
import { readCompetitionCoachAssignments, stageObservedCoachFixture } from "@/lib/touchlineArena/coach-catalogue-server";
import { recordTouchlineLineupAvailableObservation } from "@/lib/football-data/official-team-sheet-readiness";
import { reconcilePendingTouchlineFantasyGameweeks } from "@/lib/touchlineFantasy/gameweek-lifecycle";
import { publishTouchlineLivePresentationSnapshot } from "@/lib/touchlineArena/live-presentation-read-model";
import { resolveTouchlineRecoveryScope, recoveryFixtureMatches, recoveryFeedComplete, claimTouchlineFixtureRecovery,
  finishTouchlineFixtureRecovery, deferTouchlineFixtureRecovery, persistTouchlineRecoveryFeed, BACKLOG_MAX_PER_RUN, BACKLOG_DEADLINE_MS } from "@/lib/football-data/fixture-backlog-recovery";

const COMPETITION_ID = "8";
const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
const FIXTURE_SCHEDULE_REFRESH_MS = 6 * 60 * 60 * 1000;

type Dependencies = {
  provider?: FootballDataProvider;
  readFixtures?: typeof readPublicCompetitionFixtures;
  readPostMatchCandidates?: typeof readPostMatchCandidates;
  recordPostMatchAttempt?: typeof recordPostMatchAttempt;
  readFixtureById?: typeof readPublicCompetitionFixtureByProviderId;
  persistStates?: typeof persistLiveFixtureStates;
  persistSnapshot?: typeof persistLiveScoreSnapshot;
  publishLivePresentation?: typeof publishTouchlineLivePresentationSnapshot;
  persistFantasyFeed?: typeof persistFantasyFixtureFeed;
  acquireRun?: typeof acquireTouchlineLiveSyncRun;
  recordLineupObservation?: typeof recordTouchlineLineupAvailableObservation;
  now?: () => number;
  resolveRecoveryScope?: typeof resolveTouchlineRecoveryScope;
  claimRecovery?: typeof claimTouchlineFixtureRecovery;
  finishRecovery?: typeof finishTouchlineFixtureRecovery;
  deferRecovery?: typeof deferTouchlineFixtureRecovery;
  persistRecoveryFeed?: typeof persistTouchlineRecoveryFeed;
  observeConfirmedEvents?: typeof observePersistedConfirmedEvents;
  produceMatchPush?: typeof runMatchPushProducer;
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
  coachPendingFixtures?: Array<{ fixtureProviderId: string; reason: string }>;
  playerScoringFixtureIds: string[];
  playerFailedFixtureIds: string[];
  playerMissingSettlementFixtureIds: string[];
  errors: string[];
  syncRunId?: string;
  skippedReason?: string;
  confirmedEventObservation?: ConfirmedEventObservationResult | { status: "unconfirmed"; attempted: null; observed: null };
  matchPushProduction?: Awaited<ReturnType<typeof runMatchPushProducer>> | { status: "unconfirmed"; attempted: null };
};

// An explicit nested opt-in in the existing private policy is required; merely
// enabling the dispatch worker must never start producing historical alerts.
function pushEnrollmentPolicy(raw: string | undefined) {
  if (!raw || raw.length > 1024) return null;
  try {
    const policy = JSON.parse(raw);
    const enrollment = policy?.enrollment;
    if (enrollment?.enabled !== true || !Number.isSafeInteger(enrollment.maximumEventLagSeconds)
      || enrollment.maximumEventLagSeconds <= 0 || !Number.isSafeInteger(enrollment.maximumSourceAgeSeconds)
      || enrollment.maximumSourceAgeSeconds <= 0) return null;
    for (const key of ["eventSyncedAt", "settlementSyncedAt", "fixtureUpdatedAt", "lastObservedAt"]) {
      if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0) return null;
    }
    return { maximumEventLagSeconds: enrollment.maximumEventLagSeconds,
      maximumSourceAgeSeconds: enrollment.maximumSourceAgeSeconds, sourceAgeMs: policy };
  } catch { return null; }
}

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

async function refreshFixtureScheduleWhenStale(admin: SupabaseClient, now: number, provider: FootballDataProvider) {
  try {
    const latest = Date.parse(await latestFixtureScheduleRun(admin) ?? "");
    if (Number.isFinite(latest) && now - latest < FIXTURE_SCHEDULE_REFRESH_MS) return [] as string[];
    const refreshed = await syncSportmonksFixtureSchedule(admin, { competitionId: COMPETITION_ID }, { provider });
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
      coachPendingFixtures: result.coachPendingFixtures ?? [],
      playerScoringFixtureIds: result.playerScoringFixtureIds,
      playerFailedFixtureIds: result.playerFailedFixtureIds,
      playerMissingSettlementFixtureIds: result.playerMissingSettlementFixtureIds,
      confirmedEventObservation: result.confirmedEventObservation ?? null,
      matchPushProduction: result.matchPushProduction ?? null,
      cadenceExecuted: result.status !== "skipped" && result.skippedReason !== "cadence_not_due",
      skippedReason: result.skippedReason ?? null,
    },
  }).eq("id", result.syncRunId);
  const observationFailed = result.confirmedEventObservation && result.confirmedEventObservation.status !== "completed";
  const productionFailed = result.matchPushProduction && result.matchPushProduction.status !== "completed";
  console[result.status === "success" && !observationFailed && !productionFailed ? "info" : "warn"](JSON.stringify({
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
    coachPendingFixtures: result.coachPendingFixtures ?? [],
    confirmedEventObservation: result.confirmedEventObservation ?? null,
    matchPushProduction: result.matchPushProduction ?? null,
    errorCount: result.errors.length + (error ? 1 : 0),
    errorCategories: [...errorCategories(result.errors), ...(error ? ["run_write"] : [])],
  }));
}

async function readPostMatchCandidates(admin: SupabaseClient, seasonId: string, now: number) {
  const history = await readPublicCompetitionFixtures({ providedAdmin: admin, seasonId,
    includeHistorical: true, readAllPages: true, strictRead: true, through: new Date(now).toISOString(), now });
  const checked = new Map<string, string>();
  const attempted = new Map<string, string>();
  // Chunk metadata reads so the database row limit cannot silently truncate history.
  for (let offset = 0; offset < history.length; offset += 200) {
    const { data, error } = await admin.from("football_fantasy_fixture_feeds")
      .select("provider_fixture_id,last_synced_at").eq("provider", "sportmonks")
      .in("provider_fixture_id", history.slice(offset, offset + 200).map(f => f.providerId));
    if (error || !Array.isArray(data)) throw new Error("POSTMATCH_FRESHNESS_UNAVAILABLE");
    for (const row of data) checked.set(row.provider_fixture_id, row.last_synced_at);
    const attempts = await admin.from("football_postmatch_check_attempts")
      .select("provider_fixture_id,attempted_at").eq("provider", "sportmonks")
      .in("provider_fixture_id", history.slice(offset, offset + 200).map(f => f.providerId));
    if (attempts.error || !Array.isArray(attempts.data)) throw new Error("POSTMATCH_ATTEMPTS_UNAVAILABLE");
    for (const row of attempts.data) attempted.set(row.provider_fixture_id, row.attempted_at);
  }
  return selectPostMatchRechecks(history, checked, now, attempted);
}

async function recordPostMatchAttempt(admin: SupabaseClient, fixtureId: string, now: number) {
  const { error } = await admin.from("football_postmatch_check_attempts").upsert({
    provider: "sportmonks", provider_fixture_id: fixtureId, attempted_at: new Date(now).toISOString(),
  }, { onConflict: "provider,provider_fixture_id" });
  if (error) throw new Error("POSTMATCH_ATTEMPT_WRITE_FAILED");
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
  let executionStage = "provider-initialization";
  try {
    const provider = dependencies.provider ?? createGuardedFixtureProvider(admin);
    executionStage = "orchestration";
    const readFixtures = dependencies.readFixtures ?? readPublicCompetitionFixtures;
    const fixtureScheduleErrors = dependencies.readFixtures
      ? []
      : await refreshFixtureScheduleWhenStale(admin, now, provider);
    result.errors.push(...fixtureScheduleErrors);
    // These diagnostics describe independent maintenance work. Keep them in
    // the run outcome without withholding a verified current Live revision.
    const publicationIndependentErrors = new Set(fixtureScheduleErrors);
    const recordRecoveryIssue = (message: string) => {
      result.errors.push(message);
      publicationIndependentErrors.add(message);
    };
    const scope = await (dependencies.resolveRecoveryScope ?? resolveTouchlineRecoveryScope)(admin);
    const schedule = await readFixtures({ providedAdmin: admin, seasonId: scope.seasonId,
      through: new Date(now + 24 * 60 * 60 * 1000).toISOString(), now });
    // Cadence is anchored to when the last effective successful run started.
    // A cadence_not_due row remains auditable but cannot postpone real work.
    // The durable lease above remains the authority for overlapping runs.
    const lastSuccessfulSyncAt = await latestSuccessfulRunStartedAt(admin);
    let postMatchFixtureIds: string[] = [];
    try {
      postMatchFixtureIds = await (dependencies.readPostMatchCandidates ?? readPostMatchCandidates)(admin, scope.seasonId, now);
    } catch {
      recordRecoveryIssue("postmatch:freshness-unavailable");
    }
    const decision = decideLiveSyncCadence(schedule, {
      postMatchFixtureIds,
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
    const liveResponse = await provider.getLiveScores({ competitionId: COMPETITION_ID });
    const incoming: TouchlineFixture[] = [];
    if (liveResponse.ok) incoming.push(...liveResponse.data.filter((fixture) => recoveryFixtureMatches(fixture, scope)));
    else {
      // Persist only closed diagnostics, never provider messages or URLs. A
      // pre-HTTP refusal remains an error, not a successful sync or quota reset.
      const status = liveResponse.error.status;
      const http = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
        ? `:http_${status}` : "";
      const admission = liveResponse.error.requestDisposition === "deferred-before-http"
        && (status === undefined || status === 0) ? ":admission_denied_before_http" : "";
      result.errors.push(`live-scores:${liveResponse.error.code}${http}${admission}`);
    }

    const candidateIds = new Set([
      ...decision.candidateFixtureIds,
      ...incoming.map((fixture) => fixture.providerId),
    ]);
    let providerRateLimited = !liveResponse.ok && liveResponse.error.code === "rate_limited";
    const persistedCurrentFeedIds = new Set<string>();
    for (const fixtureId of candidateIds) {
      if (providerRateLimited) break;
      if (postMatchFixtureIds.includes(fixtureId)) {
        try { await (dependencies.recordPostMatchAttempt ?? recordPostMatchAttempt)(admin, fixtureId, dependencies.now?.() ?? Date.now()); }
        catch { result.errors.push(`${fixtureId}:postmatch_attempt_unavailable`); continue; }
      }
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
        const coachStagingError = await stageObservedCoachFixture(admin, fixtureId);
        if (coachStagingError) result.errors.push(coachStagingError);
        // Corrections must not replay historical push notifications.
        if (!postMatchFixtureIds.includes(fixtureId)) persistedCurrentFeedIds.add(fixtureId);
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
        recordRecoveryIssue(`${claim.providerFixtureId}:recovery-needs-review`);
        continue;
      }
      const response = await provider.getFixtureFantasyFeed(claim.providerFixtureId);
      if (!response.ok) {
        if (response.error.code === "deferred") {
          try {
            await (dependencies.deferRecovery ?? deferTouchlineFixtureRecovery)(admin, claim, lease.runId);
            recordRecoveryIssue(`${claim.providerFixtureId}:recovery-deferred`);
          } catch {
            recordRecoveryIssue(`${claim.providerFixtureId}:recovery-deferral-unconfirmed`);
          }
          // Neither a second claim nor normal finish may consume an uncertain refund.
          break;
        }
        await finishRecovery(admin, claim, lease.runId, now, "pending", response.error.code, response.error.retryAfterSeconds);
        recordRecoveryIssue(`${claim.providerFixtureId}:recovery-${response.error.code}`);
        if (response.error.code === "rate_limited") break;
        continue;
      }
      if (!response.data || !recoveryFixtureMatches(response.data.fixture, scope, claim.providerFixtureId)) {
        await finishRecovery(admin, claim, lease.runId, now, "needs_review", "fixture_identity_mismatch");
        recordRecoveryIssue(`${claim.providerFixtureId}:recovery-identity-mismatch`);
        continue;
      }
      const persisted = await (dependencies.persistRecoveryFeed ?? persistTouchlineRecoveryFeed)(admin, claim, lease.runId, response.data);
      if (persisted.persisted) {
        const coachStagingError = await stageObservedCoachFixture(admin, response.data.fixture.providerId);
        if (coachStagingError) result.errors.push(coachStagingError);
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
      if (!complete) recordRecoveryIssue(`${claim.providerFixtureId}:recovery-${claim.attemptCount >= 8 ? "needs-review" : "pending"}`);
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

    // The display/cadence schedule is time-bounded. A forced historical feed
    // still needs its existing canonical row, never a provider-derived fallback.
    const canonicalCurrent = new Map(schedule.map((fixture) => [fixture.providerId, fixture]));
    const canonicalReadErrors: string[] = [];
    for (const incomingFixture of canonicalIncoming) {
      if (canonicalCurrent.has(incomingFixture.providerId)) continue;
      try {
        const current = await (dependencies.readFixtureById ?? readPublicCompetitionFixtureByProviderId)(
          incomingFixture.providerId, { providedAdmin: admin, competitionProviderId: COMPETITION_ID },
        );
        if (!current || !recoveryFixtureMatches(current, scope, incomingFixture.providerId)) {
          canonicalReadErrors.push(`${incomingFixture.providerId}:canonical-state-unavailable`);
          continue;
        }
        canonicalCurrent.set(current.providerId, current);
      } catch {
        canonicalReadErrors.push(`${incomingFixture.providerId}:canonical-state-unavailable`);
      }
    }
    const statePersistence = await (dependencies.persistStates ?? persistLiveFixtureStates)(
      admin,
      [...canonicalCurrent.values()],
      canonicalIncoming.filter((fixture) => canonicalCurrent.has(fixture.providerId)),
      fetchedAt,
    );
    const persistence = { ...statePersistence, errors: [...canonicalReadErrors, ...statePersistence.errors] };
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
    result.playerFixtureRowsWritten = playerReconciliation.v4FixtureRowsWritten;
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
      .rpc("touchline_reconcile_verified_coach_fixture_points", {
        p_fixture_id: null,
        p_competition_coaches: await readCompetitionCoachAssignments(),
      });
    // Fixture-aware reconciliation may commit verified fixtures while keeping
    // other fixtures or the public ranking pending. Retain its confirmed count.
    const coachReceiptConfirmed = !coachReconciliationError
      && Number.isSafeInteger(coachReconciliation?.reconciled) && coachReconciliation.reconciled >= 0;
    if (coachReceiptConfirmed) result.coachPointsReconciled = coachReconciliation.reconciled;
    if (coachReceiptConfirmed && Array.isArray(coachReconciliation.pending)) {
      result.coachPendingFixtures = coachReconciliation.pending.flatMap((entry: unknown) => {
        if (!entry || typeof entry !== "object") return [];
        const pending = entry as Record<string, unknown>;
        return typeof pending.fixtureProviderId === "string" && /^[1-9]\d{0,15}$/.test(pending.fixtureProviderId)
          && typeof pending.reason === "string" && /^PCC0[1235]$/.test(pending.reason)
          ? [{ fixtureProviderId: pending.fixtureProviderId, reason: pending.reason }] : [];
      });
    }
    if (!coachReceiptConfirmed || coachReconciliation?.ok !== true) {
      result.errors.push(`coach-points:${coachReconciliationError?.code ?? (coachReceiptConfirmed ? "attribution-pending" : "unconfirmed")}`);
    }

    // Distribution follows acknowledged canonical writes, not provider input.
    // Otherwise a failed fixture update could publish a score which cards and
    // settlements never received. Preserve the previous state for failed rows.
    const persistedById = new Map(persistence.merged.map((fixture) => [fixture.providerId, fixture]));
    const snapshot = schedule.map((fixture) => {
      const update = persistedById.get(fixture.providerId);
      return update ? mergeCanonicalLiveFixture(fixture, update, fetchedAt, now) : fixture;
    });
    const snapshotResult = await (dependencies.persistSnapshot ?? persistLiveScoreSnapshot)(snapshot, fetchedAt);
    if (!snapshotResult.persisted) result.errors.push(`snapshot:${snapshotResult.reason ?? "failed"}`);
    else result.snapshotFixtures = snapshot.length;

    // Publish a single immutable source revision only after canonical fixture,
    // ranking and score-snapshot writes have completed. This remains behind
    // the same guarded provider/quota admission at the start of this run.
    if (snapshotResult.persisted
      && playerReconciliation.failedFixtureIds.length === 0
      && playerReconciliation.missingSettlementFixtureIds.length === 0
      && result.errors.every((error) => publicationIndependentErrors.has(error))) {
      try {
        await (dependencies.publishLivePresentation ?? publishTouchlineLivePresentationSnapshot)(admin);
      } catch {
        result.errors.push("live-presentation:publication-failed");
      }
    }

    // Observe only freshly persisted current feeds after canonical events and
    // ratings have reconciled. Historical recovery never generates this input.
    // This records stability, not novelty, admission, enqueue or delivery.
    if (process.env.TOUCHLINE_MATCH_PUSH_WORKER_ENABLED === "true"
      && snapshotResult.persisted && persistence.errors.length === 0
      && playerReconciliation.errors.length === 0
      && playerReconciliation.failedFixtureIds.length === 0
      && playerReconciliation.missingSettlementFixtureIds.length === 0
      && persistedCurrentFeedIds.size > 0) {
      try {
        result.confirmedEventObservation = await (dependencies.observeConfirmedEvents ?? observePersistedConfirmedEvents)({
          admin, fixtureProviderIds: [...persistedCurrentFeedIds], enabled: true,
          signal: new AbortController().signal,
        });
      } catch {
        result.confirmedEventObservation = { status: "unconfirmed", attempted: null, observed: null };
      }
      const policy = pushEnrollmentPolicy(process.env.TOUCHLINE_MATCH_PUSH_SOURCE_AGE_POLICY);
      if (result.confirmedEventObservation.status === "completed" && policy) {
        try {
          result.matchPushProduction = await (dependencies.produceMatchPush ?? runMatchPushProducer)({
            admin, fixtureProviderIds: [...persistedCurrentFeedIds], enabled: true,
            signal: new AbortController().signal, policy, locale: "en-GB",
            now: () => new Date((dependencies.now ?? Date.now)()),
          });
        } catch {
          result.matchPushProduction = { status: "unconfirmed", attempted: null };
        }
      }
    }

    // Notification readiness is recorded separately above. It cannot invalidate
    // a completed football ingestion and cause premature provider refetches.

    result.ok = snapshotResult.persisted
      && result.errors.length === 0
      && (liveResponse.ok || canonicalIncoming.length > 0);
    result.status = !snapshotResult.persisted
      ? "error"
      : result.errors.length
        ? "partial"
        : "success";
    return result;
  } catch (error) {
    // Never persist arbitrary provider/transport exception text: it may contain
    // request URLs or credentials. Still identify failures before result.errors
    // is populated, so a failed acquired run cannot look diagnostically empty.
    result.ok = false;
    result.status = "error";
    result.errors.push(`live-sync:${executionStage}-failed`);
    throw error;
  } finally {
    await completeRun(admin, result);
  }
}
