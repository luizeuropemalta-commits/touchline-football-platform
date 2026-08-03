import type { TouchlineFixture } from "@/lib/football-data/types";

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

export type LiveScoreSnapshot = {
  fixtures: TouchlineFixture[];
  fetchedAt: string;
  storedAt: number;
};

let lastCoherentSnapshot: LiveScoreSnapshot | null = null;

function cloneFixture(fixture: TouchlineFixture): TouchlineFixture {
  return {
    ...fixture,
    source: { ...fixture.source },
    homeTeam: fixture.homeTeam
      ? { ...fixture.homeTeam, source: { ...fixture.homeTeam.source } }
      : undefined,
    awayTeam: fixture.awayTeam
      ? { ...fixture.awayTeam, source: { ...fixture.awayTeam.source } }
      : undefined,
  };
}

function snapshotMaxAgeMs() {
  const configured = Number(process.env.FOOTBALL_DATA_LIVE_SNAPSHOT_MAX_AGE_MS);
  return Number.isFinite(configured) && configured >= 1_000
    ? configured
    : DEFAULT_MAX_AGE_MS;
}

/** Replaces the whole snapshot atomically; partial fixture unions are forbidden. */
export function writeLiveScoreSnapshot(fixtures: TouchlineFixture[], fetchedAt: string) {
  const storedAt = Date.now();
  lastCoherentSnapshot = {
    fixtures: fixtures.map(cloneFixture),
    fetchedAt: Number.isFinite(Date.parse(fetchedAt)) ? fetchedAt : new Date(storedAt).toISOString(),
    storedAt,
  };
}

export function readLiveScoreSnapshot(options: { maxAgeMs?: number; now?: number } = {}) {
  const snapshot = lastCoherentSnapshot;
  if (!snapshot) return null;

  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? snapshotMaxAgeMs();
  if (!Number.isFinite(now) || now - snapshot.storedAt > maxAgeMs) return null;

  return {
    fixtures: snapshot.fixtures.map(cloneFixture),
    fetchedAt: snapshot.fetchedAt,
    storedAt: snapshot.storedAt,
  } satisfies LiveScoreSnapshot;
}

export function resetLiveScoreSnapshotForTests() {
  lastCoherentSnapshot = null;
}
