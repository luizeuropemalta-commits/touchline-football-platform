export const TOUCHLINE_SOCIAL_MAX_CANDIDATES_PER_CYCLE = 4;
export const TOUCHLINE_SOCIAL_SOURCE_READ_TIMEOUT_MS = 45_000;
export const TOUCHLINE_SOCIAL_RENDER_NAVIGATION_TIMEOUT_MS = 45_000;
export const TOUCHLINE_SOCIAL_FONT_READY_TIMEOUT_MS = 45_000;
export const TOUCHLINE_SOCIAL_STORAGE_REQUEST_TIMEOUT_MS = 45_000;
export const TOUCHLINE_SOCIAL_STORAGE_ROUND_TRIPS_PER_ARTIFACT = 4;

const CANDIDATE_NON_NETWORK_MARGIN_MS = 30_000;
const WORKER_STARTUP_AND_CLEANUP_MARGIN_MS = 2 * 60_000;

/**
 * The watcher is a last-resort circuit breaker, not the primary request
 * timeout. Keep its deadline above the full supported batch budget so a slow
 * but valid candidate cannot be killed while its bounded stages are healthy.
 */
export function touchlineSocialWorkerCycleTimeoutMs(
  maxCandidates = TOUCHLINE_SOCIAL_MAX_CANDIDATES_PER_CYCLE,
) {
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1) {
    throw new Error("TL_SOCIAL_WORKER_MAX_CANDIDATES_INVALID");
  }
  const perCandidateMs = TOUCHLINE_SOCIAL_RENDER_NAVIGATION_TIMEOUT_MS
    + TOUCHLINE_SOCIAL_FONT_READY_TIMEOUT_MS
    + (TOUCHLINE_SOCIAL_STORAGE_REQUEST_TIMEOUT_MS * TOUCHLINE_SOCIAL_STORAGE_ROUND_TRIPS_PER_ARTIFACT)
    + CANDIDATE_NON_NETWORK_MARGIN_MS;
  return TOUCHLINE_SOCIAL_SOURCE_READ_TIMEOUT_MS
    + (maxCandidates * perCandidateMs)
    + WORKER_STARTUP_AND_CLEANUP_MARGIN_MS;
}
