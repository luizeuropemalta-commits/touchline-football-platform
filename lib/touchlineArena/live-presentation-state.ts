export const TOUCHLINE_LIVE_PRESENTATION_STATE_VERSION = 1 as const;
// A five-second shared server cache plus a ten-second browser cadence keeps a
// newly published snapshot observable within the fifteen-second product SLA.
export const TOUCHLINE_LIVE_PRESENTATION_POLL_MS = 10_000;
export const TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS = 30_000;
export const TOUCHLINE_PREMATCH_PRESENTATION_WINDOW_MS = 60 * 60 * 1_000;

export type TouchlineLivePresentationMode = "live" | "prematch" | "settling" | "idle";

export type TouchlineLivePresentationState = Readonly<{
  version: typeof TOUCHLINE_LIVE_PRESENTATION_STATE_VERSION;
  available: boolean;
  playerRankingSnapshotId: string | null;
  coachRankingSnapshotId: string | null;
  mode: TouchlineLivePresentationMode;
  pollAfterMs: number | null;
  resumeAt: string | null;
}>;

export type TouchlineLivePresentationFixture = Readonly<{
  fixtureId: string;
  startsAt: string | null;
  state: "live" | "upcoming" | "finished" | "unknown";
  scoreable: boolean;
}>;

function normalizedId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value.trim())
    ? value.trim()
    : null;
}

function normalizedTimestamp(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function parseTouchlineLivePresentationState(value: unknown): TouchlineLivePresentationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<TouchlineLivePresentationState>;
  const playerRankingSnapshotId = candidate.playerRankingSnapshotId === null
    ? null
    : normalizedId(candidate.playerRankingSnapshotId);
  const coachRankingSnapshotId = candidate.coachRankingSnapshotId === null
    ? null
    : normalizedId(candidate.coachRankingSnapshotId);
  const resumeAt = normalizedTimestamp(candidate.resumeAt);
  const mode = candidate.mode;
  const pollAfterMs = candidate.pollAfterMs;

  if (
    candidate.version !== TOUCHLINE_LIVE_PRESENTATION_STATE_VERSION
    || typeof candidate.available !== "boolean"
    || !["live", "prematch", "settling", "idle"].includes(String(mode))
    || (candidate.playerRankingSnapshotId !== null && !playerRankingSnapshotId)
    || (candidate.coachRankingSnapshotId !== null && !coachRankingSnapshotId)
    || (candidate.resumeAt !== null && !resumeAt)
    || !(
      pollAfterMs === null
      || pollAfterMs === TOUCHLINE_LIVE_PRESENTATION_POLL_MS
      || pollAfterMs === TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS
    )
  ) return null;

  if (!candidate.available && (mode !== "idle" || pollAfterMs !== null || resumeAt !== null)) return null;
  if (mode === "live" && pollAfterMs !== TOUCHLINE_LIVE_PRESENTATION_POLL_MS) return null;
  if (mode === "settling" && pollAfterMs !== TOUCHLINE_LIVE_PRESENTATION_POLL_MS) return null;
  if (mode === "prematch" && pollAfterMs !== TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS) return null;
  if (mode === "idle" && pollAfterMs !== null) return null;

  return {
    version: TOUCHLINE_LIVE_PRESENTATION_STATE_VERSION,
    available: candidate.available,
    playerRankingSnapshotId,
    coachRankingSnapshotId,
    mode: mode as TouchlineLivePresentationMode,
    pollAfterMs,
    resumeAt,
  };
}

export function resolveTouchlineLivePresentationTiming(input: {
  fixtures: readonly TouchlineLivePresentationFixture[];
  playerRankingFixtureIds: readonly string[];
  coachRankingFixtureIds: readonly string[];
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const playerCoverage = new Set(input.playerRankingFixtureIds.map(normalizedId).filter(Boolean));
  const coachCoverage = new Set(input.coachRankingFixtureIds.map(normalizedId).filter(Boolean));
  const fixtures = input.fixtures.filter((fixture) => normalizedId(fixture.fixtureId));
  const hasLiveFixture = fixtures.some((fixture) => fixture.state === "live");
  const settling = fixtures.some((fixture) => (
    fixture.state === "finished"
    && fixture.scoreable
    && (!playerCoverage.has(fixture.fixtureId) || !coachCoverage.has(fixture.fixtureId))
  ));

  if (hasLiveFixture) {
    return { mode: "live" as const, pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null };
  }
  if (settling) {
    return { mode: "settling" as const, pollAfterMs: TOUCHLINE_LIVE_PRESENTATION_POLL_MS, resumeAt: null };
  }

  const upcomingKickoffs = fixtures
    .filter((fixture) => fixture.state === "upcoming")
    .map((fixture) => Date.parse(fixture.startsAt ?? ""))
    .filter((startsAt) => Number.isFinite(startsAt) && startsAt > now)
    .sort((left, right) => left - right);
  const nextKickoff = upcomingKickoffs[0] ?? null;
  if (nextKickoff !== null && nextKickoff - now <= TOUCHLINE_PREMATCH_PRESENTATION_WINDOW_MS) {
    return { mode: "prematch" as const, pollAfterMs: TOUCHLINE_PREMATCH_PRESENTATION_POLL_MS, resumeAt: null };
  }

  return {
    mode: "idle" as const,
    pollAfterMs: null,
    resumeAt: nextKickoff === null
      ? null
      : new Date(nextKickoff - TOUCHLINE_PREMATCH_PRESENTATION_WINDOW_MS).toISOString(),
  };
}

export function touchlineLivePresentationRevisionChanged(
  current: Pick<TouchlineLivePresentationState, "playerRankingSnapshotId" | "coachRankingSnapshotId">,
  next: Pick<TouchlineLivePresentationState, "playerRankingSnapshotId" | "coachRankingSnapshotId">,
) {
  return current.playerRankingSnapshotId !== next.playerRankingSnapshotId
    || current.coachRankingSnapshotId !== next.coachRankingSnapshotId;
}

export function mergeTouchlineLivePresentationRevision(
  current: Pick<TouchlineLivePresentationState, "playerRankingSnapshotId" | "coachRankingSnapshotId">,
  next: Pick<TouchlineLivePresentationState, "playerRankingSnapshotId" | "coachRankingSnapshotId">,
  watches: { player: boolean; coach: boolean },
) {
  return {
    playerRankingSnapshotId: watches.player
      ? next.playerRankingSnapshotId ?? current.playerRankingSnapshotId
      : current.playerRankingSnapshotId,
    coachRankingSnapshotId: watches.coach
      ? next.coachRankingSnapshotId ?? current.coachRankingSnapshotId
      : current.coachRankingSnapshotId,
  };
}
