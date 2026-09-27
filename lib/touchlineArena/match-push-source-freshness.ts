/** Private server policy input, never a browser-supplied delivery permission.
 * No default window: a caller must provide an explicitly configured maximum
 * age for every required constituent. This validates age only, not identity,
 * revision, claim ownership, provenance, consent or transport safety.
 */
export const MATCH_PUSH_SOURCE_TIMES = [
  "eventSyncedAt", "settlementSyncedAt", "fixtureUpdatedAt", "lastObservedAt",
] as const;

export type MatchPushSourceAgePolicy = Readonly<Record<typeof MATCH_PUSH_SOURCE_TIMES[number], number>>;

/** Copy each numeric value once; retain no mutable caller-owned policy. */
export function normalizeMatchPushSourceAgePolicy(maximumAgeMs: unknown): MatchPushSourceAgePolicy | null {
  if (!maximumAgeMs || typeof maximumAgeMs !== "object" || Array.isArray(maximumAgeMs)) return null;
  const input = maximumAgeMs as Record<string, unknown>;
  const policy = {} as Record<typeof MATCH_PUSH_SOURCE_TIMES[number], number>;
  for (const key of MATCH_PUSH_SOURCE_TIMES) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
    policy[key] = value;
  }
  return Object.freeze(policy);
}

export function matchPushSourceFreshness(
  evidence: unknown,
  maximumAgeMs: unknown,
  now: Date,
): "current" | "unconfigured" | "invalid-evidence" | "stale" {
  const policy = normalizeMatchPushSourceAgePolicy(maximumAgeMs);
  if (!policy) return "unconfigured";
  return sourceFreshness(evidence, policy, now);
}

function sourceFreshness(evidence: unknown, policy: MatchPushSourceAgePolicy, now: Date): "current" | "invalid-evidence" | "stale" {
  const instant = now.getTime();
  if (!Number.isFinite(instant) || !evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "invalid-evidence";
  const facts = evidence as Record<string, unknown>;
  let stale = false;
  for (const key of MATCH_PUSH_SOURCE_TIMES) {
    const raw = facts[key];
    const time = typeof raw === "string" && raw.trim() ? Date.parse(raw) : NaN;
    if (!Number.isFinite(time) || time > instant) return "invalid-evidence";
    if (instant - time > policy[key]) stale = true;
  }
  return stale ? "stale" : "current";
}

/** Bounds queue lifetime by every source. This is not permission to enqueue or send. */
export function matchPushSourceDeadline(
  evidence: unknown,
  maximumAgeMs: unknown,
  requestedExpiresAt: unknown,
  now: Date,
): string | null {
  const policy = normalizeMatchPushSourceAgePolicy(maximumAgeMs);
  if (!policy || sourceFreshness(evidence, policy, now) !== "current") return null;
  if (typeof requestedExpiresAt !== "string" || !requestedExpiresAt.trim()) return null;
  let deadline = Date.parse(requestedExpiresAt);
  if (!Number.isFinite(deadline) || deadline <= now.getTime()) return null;
  const facts = evidence as Record<string, string>;
  for (const key of MATCH_PUSH_SOURCE_TIMES) {
    const sourceDeadline = Date.parse(facts[key]) + policy[key];
    if (!Number.isSafeInteger(sourceDeadline) || !Number.isFinite(new Date(sourceDeadline).getTime())) return null;
    deadline = Math.min(deadline, sourceDeadline);
  }
  return deadline > now.getTime() ? new Date(deadline).toISOString() : null;
}
