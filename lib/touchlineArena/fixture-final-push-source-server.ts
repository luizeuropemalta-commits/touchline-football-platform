import "server-only";
import { createHash } from "node:crypto";
import { readTouchlineFinalScorePushEvidence, type TouchlineFinalScorePushEvidence } from "./social-final-score-draft-server.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_ID = /^[1-9][0-9]{0,19}$/;
const SHA = /^sha256:[a-f0-9]{64}$/;
const AGE_KEYS = ["capturedAt", "fixtureUpdatedAt", "playerSyncedAt", "coachSourceUpdatedAt"] as const;
type SourceAgePolicy = Readonly<Record<typeof AGE_KEYS[number], number>>;
export type FixtureFinalPushSource = Readonly<{
  kind: "fixture-final"; fixtureId: string; providerFixtureId: string;
  factsFingerprint: string; editorialChecksum: string; sourceRevisionChecksum: string;
  sourceRevisionManifest: Readonly<Record<string, number>>; clockRevision: number;
  validUntil: string; score: Readonly<{ home: number; away: number }>;
  homeName: string; awayName: string; evidence: TouchlineFinalScorePushEvidence;
}>;
export type FixtureFinalPushSourceResult =
  | Readonly<{ ok: true; source: FixtureFinalPushSource }>
  | Readonly<{ ok: false; reason: string }>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function agePolicy(value: unknown): SourceAgePolicy | null {
  const input = record(value);
  if (!input) return null;
  const result = {} as Record<typeof AGE_KEYS[number], number>;
  for (const key of AGE_KEYS) {
    const age = input[key];
    if (typeof age !== "number" || !Number.isSafeInteger(age) || age <= 0) return null;
    result[key] = age;
  }
  return Object.freeze(result);
}

/** Preparation only. No queue, registration, consent mutation or transport.
 * Callers must choose server-trusted age budgets explicitly: persisted update
 * time is not a fresh provider observation, and settled_at is not an age source.
 * These rules do not define how historical finals should be enrolled/deduped.
 * Atomic timestamp evidence is a separate unresolved integration gate; this
 * factory must not be treated as permission to enqueue or transport a final.
 */
export function createFixtureFinalPushSource(configuration: unknown) {
  const config = record(configuration);
  const enabled = config?.enabled === true;
  const ages = agePolicy(config?.maximumAgeMs);
  const maxRows = config?.maxRows, timeoutMs = config?.timeoutMs, now = config?.now;
  const configured = ages !== null && typeof now === "function"
    && typeof maxRows === "number" && Number.isSafeInteger(maxRows) && maxRows >= 1 && maxRows <= 1000
    && typeof timeoutMs === "number" && Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30_000;
  return async (request: unknown): Promise<FixtureFinalPushSourceResult> => {
    if (!enabled) return { ok: false, reason: "disabled" };
    if (!configured) return { ok: false, reason: "unconfigured-source-policy" };
    const input = record(request);
    if (!input || typeof input.canonicalFixtureId !== "string" || !UUID.test(input.canonicalFixtureId)
      || typeof input.providerFixtureId !== "string" || !PROVIDER_ID.test(input.providerFixtureId)) return { ok: false, reason: "invalid-fixture-binding" };
    const fixtureId = input.canonicalFixtureId, providerFixtureId = input.providerFixtureId;
    try {
      const result = await readTouchlineFinalScorePushEvidence({ canonicalFixtureId: fixtureId, providerFixtureId }, {
        enabled: true, maxRows, timeoutMs, now: now as () => number,
      });
      if (!result.ok) return result;
      const { data, evidence: e } = result;
      const instant: unknown = now();
      if (typeof instant !== "number" || !Number.isFinite(instant) || e.fixtureId !== fixtureId || e.providerFixtureId !== providerFixtureId
        || data.fixtureId !== providerFixtureId || ![e.competitionId, e.seasonId, e.roundId, e.homeClubId, e.awayClubId].every(id => typeof id === "string" && UUID.test(id))
        || e.competitionProviderId !== "8" || ![e.seasonProviderId, e.homeProviderTeamId, e.awayProviderTeamId].every(id => typeof id === "string" && PROVIDER_ID.test(id))
        || e.homeClubId === e.awayClubId || e.homeProviderTeamId === e.awayProviderTeamId
        || data.home.teamId !== e.homeProviderTeamId || data.away.teamId !== e.awayProviderTeamId
        || !SHA.test(data.sourceChecksum) || !SHA.test(data.sourceRevisionChecksum)
        || !Number.isSafeInteger(e.clockRevision) || e.clockRevision < 0
        || !Number.isSafeInteger(data.score.home) || data.score.home < 0 || !Number.isSafeInteger(data.score.away) || data.score.away < 0
        || !Array.isArray(e.players) || !e.players.length || !Array.isArray(e.coaches) || !e.coaches.length) return { ok: false, reason: "invalid-private-source" };
      const times: [unknown, number][] = [[e.capturedAt, ages.capturedAt], [e.fixtureUpdatedAt, ages.fixtureUpdatedAt],
        ...e.players.map(row => [row.sourceSyncedAt, ages.playerSyncedAt] as [unknown, number]),
        ...e.coaches.map(row => [row.sourceUpdatedAt, ages.coachSourceUpdatedAt] as [unknown, number])];
      let deadline = Infinity;
      for (const [raw, age] of times) {
        const timestamp = typeof raw === "string" && raw.trim() === raw && raw.length ? Date.parse(raw) : NaN;
        const expiry = timestamp + age;
        if (!Number.isFinite(timestamp) || timestamp > instant || !Number.isSafeInteger(expiry)
          || !Number.isFinite(new Date(expiry).getTime())) return { ok: false, reason: "invalid-source-time" };
        if (expiry <= instant) return { ok: false, reason: "stale-source" };
        deadline = Math.min(deadline, expiry);
      }
      // Do not reuse the render checksum: top-card edits, translations and sound
      // choices are not a correction to the football score. The revision fence
      // still binds every admission; it is deliberately separate from identity.
      const factsFingerprint = `sha256:${createHash("sha256").update(JSON.stringify([
        "touchline-fixture-final-facts-v1", fixtureId, providerFixtureId, e.competitionId, e.competitionProviderId,
        e.seasonId, e.seasonProviderId, e.homeClubId, e.homeProviderTeamId, e.awayClubId, e.awayProviderTeamId,
        "finished", data.score.home, data.score.away,
      ]), "utf8").digest("hex")}`;
      return { ok: true, source: Object.freeze({ kind: "fixture-final", fixtureId, providerFixtureId,
        factsFingerprint, editorialChecksum: data.sourceChecksum, sourceRevisionChecksum: data.sourceRevisionChecksum,
        sourceRevisionManifest: Object.freeze({ ...data.sourceRevisionManifest }), clockRevision: e.clockRevision,
        validUntil: new Date(deadline).toISOString(), score: Object.freeze({ ...data.score }),
        homeName: data.home.name, awayName: data.away.name, evidence: e }) };
    } catch {
      return { ok: false, reason: "source-unavailable" };
    }
  };
}
