import { createAdminClient } from "@/lib/supabase/admin";
import { parseLiveScoreSnapshot, type PersistedLiveScoreSnapshot } from "./live-score-snapshot-contract";
import { readPublishedTouchlineLivePresentationInput } from "@/lib/touchlineArena/live-presentation-read-model";
import type { TouchlineFixture } from "@/lib/football-data/types";

const SNAPSHOT_KEY = "touchline-england-live";

export async function readPersistedLiveScoreSnapshot(options: { maxAgeMs?: number; now?: number } = {}) {
  const admin = createAdminClient();
  if (!admin) return null;
  // Prefer the immutable shared revision so Live fixture scores/events and
  // its player/coach/fixture pointers are read from one published contract.
  // Only a verified absence of the first publication permits compatibility
  // reads. A failed or malformed publication read must not expose newer
  // mutable input which has not passed the shared publication gate.
  let payload: unknown = null;
  try {
    payload = (await readPublishedTouchlineLivePresentationInput(admin))?.liveScorePayload ?? null;
  } catch {
    return null;
  }
  if (!payload) {
    const { data, error } = await admin
      .from("football_live_snapshots")
      .select("payload, fetched_at, updated_at")
      .eq("snapshot_key", SNAPSHOT_KEY)
      .maybeSingle();
    if (error || !data) return null;
    payload = data.payload;
  }

  const parsed = parseLiveScoreSnapshot(payload);
  if (!parsed) return null;
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;
  if (now - parsed.storedAt > maxAgeMs) return null;
  return parsed;
}

/** Replaces the complete league snapshot in one database operation. */
export async function persistLiveScoreSnapshot(fixtures: TouchlineFixture[], fetchedAt: string) {
  const admin = createAdminClient();
  if (!admin) return { persisted: false as const, reason: "supabase_admin_not_configured" };

  const storedAt = Date.now();
  const normalizedFetchedAt = Number.isFinite(Date.parse(fetchedAt))
    ? fetchedAt
    : new Date(storedAt).toISOString();
  const payload: PersistedLiveScoreSnapshot = { fixtures, fetchedAt: normalizedFetchedAt, storedAt };
  const { error } = await admin.from("football_live_snapshots").upsert({
    snapshot_key: SNAPSHOT_KEY,
    payload,
    fetched_at: normalizedFetchedAt,
    updated_at: new Date(storedAt).toISOString(),
  }, { onConflict: "snapshot_key" });

  return error
    ? { persisted: false as const, reason: error.message }
    : { persisted: true as const };
}
