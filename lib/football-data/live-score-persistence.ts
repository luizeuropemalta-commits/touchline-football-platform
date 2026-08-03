import { createAdminClient } from "@/lib/supabase/admin";
import type { TouchlineFixture } from "@/lib/football-data/types";

const SNAPSHOT_KEY = "touchline-england-live";

type PersistedLiveScoreSnapshot = {
  fixtures: TouchlineFixture[];
  fetchedAt: string;
  storedAt: number;
};

function isFixture(value: unknown): value is TouchlineFixture {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fixture = value as Partial<TouchlineFixture>;
  return typeof fixture.id === "string"
    && typeof fixture.providerId === "string"
    && typeof fixture.provider === "string"
    && Boolean(fixture.source && typeof fixture.source === "object");
}

function parseSnapshot(value: unknown): PersistedLiveScoreSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<PersistedLiveScoreSnapshot>;
  if (!Array.isArray(snapshot.fixtures) || !snapshot.fixtures.every(isFixture)) return null;
  if (typeof snapshot.fetchedAt !== "string" || !Number.isFinite(Date.parse(snapshot.fetchedAt))) return null;
  if (typeof snapshot.storedAt !== "number" || !Number.isFinite(snapshot.storedAt)) return null;
  return snapshot as PersistedLiveScoreSnapshot;
}

export async function readPersistedLiveScoreSnapshot(options: { maxAgeMs?: number; now?: number } = {}) {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("football_live_snapshots")
    .select("payload, fetched_at, updated_at")
    .eq("snapshot_key", SNAPSHOT_KEY)
    .maybeSingle();
  if (error || !data) return null;

  const parsed = parseSnapshot(data.payload);
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
