import assert from "node:assert/strict";
import test from "node:test";

import {
  canSendTouchlineAnalyticsObservation,
  parseTouchlineAnalyticsNextSendAt,
  TOUCHLINE_ANALYTICS_MIN_CADENCE_MS,
} from "../lib/touchlineArena/analytics-cadence.ts";

test("analytics keeps navigation requests outside the server recording cadence", () => {
  const now = 1_700_000_000_000;
  const nextSendAt = now + TOUCHLINE_ANALYTICS_MIN_CADENCE_MS;

  assert.equal(TOUCHLINE_ANALYTICS_MIN_CADENCE_MS, 12_000);
  assert.equal(canSendTouchlineAnalyticsObservation(nextSendAt, now), false);
  assert.equal(canSendTouchlineAnalyticsObservation(nextSendAt, nextSendAt), true);
  assert.equal(parseTouchlineAnalyticsNextSendAt(String(nextSendAt)), nextSendAt);
  assert.equal(parseTouchlineAnalyticsNextSendAt("invalid"), null);
  assert.equal(parseTouchlineAnalyticsNextSendAt("0"), null);
});
