import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  touchlineCoachClassificationForProviderId,
  touchlineLiveCoachForProviderId,
} from "../lib/touchlineArena/live-coaches.ts";

const source = readFileSync(
  new URL("../app/touchline-coaches/[coach]/page.tsx", import.meta.url),
  "utf8",
);

test("Coach Profile resolves the canonical live-coach registry and shared competition ranking", () => {
  assert.match(source, /TOUCHLINE_LIVE_COACHES/);
  assert.match(source, /touchlineCoachClassificationForProviderId/);
  assert.match(source, /loadTouchLineCoachRanking/);
  assert.match(source, /coachCompetitionFromRanking\(coachRanking, entry\.coach\.providerId, TOUCHLINE_ENGLAND_SEASON\)/);
  assert.match(source, /TouchlineCoachPerformance contract=\{null\} competition=\{competition\}/);
  assert.doesNotMatch(source, /offer\.displayPrice|Official price|Preço oficial|WalletCards/);
  assert.match(source, /notFound\(\)/);
});

test("Coach Profile keeps unverified historical evidence explicit instead of inventing it", () => {
  assert.match(source, /historyAvailable/);
  assert.match(source, /has not yet been confirmed by the official source/);
  assert.match(source, /keeps the classification pending instead of inventing data/);
});

test("Coach Profile uses a balanced official-facts rail without repeating TouchLine points", () => {
  assert.match(source, /coach-profile-facts/);
  assert.match(source, /coach-profile-campaign/);
  assert.match(source, /Current club/);
  assert.match(source, /Home campaign/);
  assert.match(source, /Away campaign/);
  assert.doesNotMatch(source, /record\.touchlinePoints}L?\s*PTS/);
});

test("Coach performance exposes yellow and red cards separately and never invents unavailable totals", () => {
  const performanceSource = readFileSync(
    new URL("../components/touchline/cards/TouchlineCoachPerformance.tsx", import.meta.url),
    "utf8",
  );
  assert.match(performanceSource, /officialCardCount/);
  assert.match(performanceSource, /data-coach-discipline="yellow"/);
  assert.match(performanceSource, /data-coach-discipline="red"/);
  assert.match(performanceSource, /yellowCards \?\? "—"/);
  assert.match(performanceSource, /redCards \?\? "—"/);
  assert.doesNotMatch(performanceSource, /Discipline data pending/);
});

test("every current England coach has a profile identity and pending-safe classification", () => {
  for (const providerId of ["307", "455907", "107439", "523911"]) {
    assert.ok(touchlineLiveCoachForProviderId(providerId));
    assert.ok(touchlineCoachClassificationForProviderId(providerId));
  }
});
