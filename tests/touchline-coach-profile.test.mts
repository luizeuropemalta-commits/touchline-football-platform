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

test("Coach Profile resolves only the canonical live-coach registry and server-owned offer", () => {
  assert.match(source, /TOUCHLINE_LIVE_COACHES/);
  assert.match(source, /touchlineCoachClassificationForProviderId/);
  assert.match(source, /resolveCompetitionCardOffer/);
  assert.match(source, /subjectType: "coach"/);
  assert.match(source, /competitionId: "england"/);
  assert.match(source, /notFound\(\)/);
});

test("Coach Profile keeps unverified historical evidence explicit instead of inventing it", () => {
  assert.match(source, /historyAvailable/);
  assert.match(source, /has not yet been confirmed by the official source/);
  assert.match(source, /keeps the classification pending instead of inventing data/);
});

test("every current England coach has a profile identity and pending-safe classification", () => {
  for (const providerId of ["307", "455907", "107439", "523911"]) {
    assert.ok(touchlineLiveCoachForProviderId(providerId));
    assert.ok(touchlineCoachClassificationForProviderId(providerId));
  }
});
