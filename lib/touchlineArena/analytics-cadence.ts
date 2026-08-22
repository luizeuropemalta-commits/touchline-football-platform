// The server records one observation per principal at most every ten seconds.
// Leave a small client margin so a fresh navigation never turns an expected
// analytics throttle into a visible Safari console error.
export const TOUCHLINE_ANALYTICS_MIN_CADENCE_MS = 12_000;

export function parseTouchlineAnalyticsNextSendAt(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function canSendTouchlineAnalyticsObservation(nextSendAt: number | null, now: number) {
  return nextSendAt === null || now >= nextSendAt;
}
