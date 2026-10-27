import { parseTouchlinePublicFixtures } from "../football-data/public-fixture-client.ts";
import type { TouchlinePublicFixture } from "../football-data/public-fixture.ts";
import type { TouchlineLiveAdmissionScope } from "./sports-publication-live-view.ts";
import { isTouchlineLiveReadMetadata, touchlineMatchCentreDisplayState, type TouchlineLiveReadMetadata } from "./match-centre.ts";

export type ClubHubStripSnapshot = { fixtures: TouchlinePublicFixture[]; metadata: TouchlineLiveReadMetadata; admissionScope: TouchlineLiveAdmissionScope | null };

/** An explicit empty schedule is a result; a missing seed needs one durable read. */
export function clubHubStripSeedNeedsRecovery(seed: readonly TouchlinePublicFixture[] | null | undefined) {
  return seed == null;
}

export function parseClubHubStripSnapshot(value: unknown): ClubHubStripSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const fixtures = parseTouchlinePublicFixtures(payload.data);
  const rawScope = payload.admissionScope;
  if (payload.ok !== true || !fixtures || !isTouchlineLiveReadMetadata(payload)) return null;
  const ids = new Set(fixtures.map((fixture) => fixture.providerId));
  if (ids.size !== fixtures.length) return null;
  const scope = rawScope as Record<string, unknown> | null | undefined;
  const admissionScope: TouchlineLiveAdmissionScope | null = scope?.competitionId === "8"
    && typeof scope.seasonId === "string" && scope.seasonId.trim() === scope.seasonId && scope.seasonId.length > 0
    ? { competitionId: "8", seasonId: scope.seasonId } : null;
  return { fixtures, admissionScope, metadata: { state: payload.state, degraded: payload.degraded, fetchedAt: payload.fetchedAt } };
}

/** Missing/failed metadata must never promote an old result to LIVE. */
export function clubHubStripState(fixture: TouchlinePublicFixture, metadata: TouchlineLiveReadMetadata | null, now: number) {
  // Expire a once-fresh snapshot even when the tab slept or a request stalled.
  // No receipt timestamp is invented: missing/invalid/future source timestamps
  // cannot establish LIVE freshness.
  const fetchedAt = metadata?.fetchedAt ? Date.parse(metadata.fetchedAt) : Number.NaN;
  const fresh = metadata?.state === "persisted-live-snapshot" && !metadata.degraded
    && Number.isFinite(now) && Number.isFinite(fetchedAt) && fetchedAt <= now
    && now - fetchedAt <= 5 * 60_000;
  return touchlineMatchCentreDisplayState(fixture, {
    state: metadata?.state ?? "partial-persisted-schedule", degraded: !fresh,
    fetchedAt: metadata?.fetchedAt,
  }, now);
}

export function clubHubStripScore(fixture: TouchlinePublicFixture) {
  return [fixture.homeScore, fixture.awayScore].every((score) => Number.isInteger(score) && (score ?? -1) >= 0)
    ? `${fixture.homeScore} – ${fixture.awayScore}` : "—";
}
