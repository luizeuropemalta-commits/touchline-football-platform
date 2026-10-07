import type { SupabaseClient } from "@supabase/supabase-js";
import { inspectTouchlineOfficialTeamSheet } from "./official-team-sheet-readiness.ts";
import { isTouchLineSettledFixtureStatus } from "./fixture-settlement.ts";
import type { TouchlineFantasyFixtureFeed, TouchlineFixture } from "./types.ts";
import { sanitizeProviderPayloadForPersistence } from "./provider-payload-sanitize.ts";
import { selectTouchlineOfficialLineupShirtFacts } from "./card-engine-provisional-lineup-sync.ts";

export type RecoveryScope = { seasonId: string; providerSeasonId: string; competitionId: string };
export type RecoveryClaim = { fixtureId: string; providerFixtureId: string; attemptCount: number; status: string; reservationId?: string };

/** Only called for a provider's proven zero-HTTP deferral. Unconfirmed writes
 * must not be retried or followed by normal finish in the same run. */
export async function deferTouchlineFixtureRecovery(admin: SupabaseClient, claim: RecoveryClaim, runId: string) {
  if (!claim.reservationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claim.reservationId)
    || !Number.isSafeInteger(claim.attemptCount) || claim.attemptCount < 1 || claim.attemptCount > 8) {
    throw new Error("recovery-deferral-invalid");
  }
  const {data,error} = await admin.rpc("touchline_defer_fixture_recovery", {
    p_fixture_id:claim.fixtureId,p_run_id:runId,p_reservation_id:claim.reservationId,p_expected_attempt:claim.attemptCount,
  });
  if (error || data !== true) throw new Error("recovery-deferral-unconfirmed");
}
export const BACKLOG_MAX_PER_RUN = 2;
export const BACKLOG_DEADLINE_MS = 45_000;

/** Never silently choose among duplicate current seasons or a different Fantasy season. */
export async function resolveTouchlineRecoveryScope(admin: SupabaseClient): Promise<RecoveryScope> {
  const { data: competition, error } = await admin.from("football_competitions").select("id")
    .eq("provider", "sportmonks").eq("provider_competition_id", "8").maybeSingle();
  if (error || !competition?.id) throw new Error("recovery-competition-unavailable");
  const { data: seasons, error: seasonError } = await admin.from("football_seasons")
    .select("id,provider_season_id").eq("provider", "sportmonks").eq("competition_id", competition.id).eq("is_current", true).limit(2);
  const { data: config, error: configError } = await admin.from("touchline_fantasy_configs").select("season_id")
    .eq("competition_key", "england").eq("status", "active").maybeSingle();
  if (seasonError || configError || !Array.isArray(seasons) || seasons.length !== 1
    || config?.season_id !== seasons[0].id || !/^[1-9]\d*$/.test(String(seasons[0].provider_season_id))) {
    throw new Error("recovery-season-ambiguous");
  }
  return { seasonId: seasons[0].id, providerSeasonId: String(seasons[0].provider_season_id), competitionId: competition.id };
}

export function recoveryFixtureMatches(fixture: TouchlineFixture, scope: RecoveryScope, expectedId?: string) {
  return fixture.provider === "sportmonks" && fixture.competitionId === "8"
    && fixture.seasonId === scope.providerSeasonId && /^[1-9]\d*$/.test(fixture.providerId)
    && (!expectedId || fixture.providerId === expectedId);
}

export function recoveryFeedComplete(feed: TouchlineFantasyFixtureFeed) {
  return isTouchLineSettledFixtureStatus(feed.fixture.status)
    && Array.isArray(feed.lineups) && Array.isArray(feed.events)
    && inspectTouchlineOfficialTeamSheet(feed).completeTeamSheetsReady;
}

export function recoveryDelaySeconds(attempt: number, retryAfterSeconds?: number, postponed = false) {
  const exponential = Math.min(21_600, 300 * 2 ** Math.min(7, Math.max(0, attempt - 1)));
  // A provider's longer Retry-After must never be shortened by our backoff cap.
  return Math.max(postponed ? 86_400 : exponential,
    Number.isFinite(retryAfterSeconds) ? Math.max(0, retryAfterSeconds!) : 0);
}

export async function claimTouchlineFixtureRecovery(admin: SupabaseClient, scope: RecoveryScope, runId: string, now: number, exclude: string[]) {
  const { data, error } = await admin.rpc("touchline_claim_fixture_recovery", {
    p_season_id: scope.seasonId, p_run_id: runId, p_now: new Date(now).toISOString(), p_exclude: exclude,
  });
  if (error) throw new Error("recovery-claim-failed");
  if (!data) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.fixtureId !== "string" || !/^[1-9]\d*$/.test(String(row.providerFixtureId))
    || typeof row.attemptCount !== "number" || !Number.isSafeInteger(row.attemptCount)
    || row.attemptCount < 1 || row.attemptCount > 8 || typeof row.status !== "string"
    || typeof row.reservationId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.reservationId)) throw new Error("recovery-claim-invalid");
  return row as RecoveryClaim;
}

export async function finishTouchlineFixtureRecovery(admin: SupabaseClient, claim: RecoveryClaim, runId: string,
  now: number, outcome: "recovered" | "pending" | "needs_review", code: string, retryAfter?: number, postponed = false) {
  const safeCode = /^[a-z0-9_-]{1,64}$/.test(code) ? code : "provider_error";
  const { error } = await admin.rpc("touchline_finish_fixture_recovery", {
    p_fixture_id: claim.fixtureId, p_run_id: runId, p_now: new Date(now).toISOString(),
    p_outcome: outcome, p_error_code: safeCode,
    p_reservation_id: claim.reservationId ?? null,
    p_next_attempt_at: new Date(now + recoveryDelaySeconds(claim.attemptCount, retryAfter, postponed) * 1000).toISOString(),
  });
  if (error) throw new Error("recovery-finish-failed");
}

export async function persistTouchlineRecoveryFeed(admin: SupabaseClient, claim: RecoveryClaim, runId: string, feed: TouchlineFantasyFixtureFeed) {
  const { data, error } = await admin.rpc("touchline_persist_recovery_feed", {
    p_fixture_id: claim.fixtureId, p_run_id: runId, p_feed: sanitizeProviderPayloadForPersistence(feed),
    p_shirt_facts: selectTouchlineOfficialLineupShirtFacts(feed),
    p_reservation_id: claim.reservationId ?? null,
  });
  return { persisted: !error, reconciliationReady: !error && data === true, reason: error ? "recovery-fenced-write-failed" : undefined };
}
