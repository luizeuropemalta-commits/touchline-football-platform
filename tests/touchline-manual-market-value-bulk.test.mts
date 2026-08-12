import assert from "node:assert/strict";
import test from "node:test";

import { previewTouchlineManualMarketValueBulk } from "../lib/touchlineArena/manual-market-value-bulk.ts";

const CLUB_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CLUB_ID = "10000000-0000-4000-8000-000000000002";
const HAALAND_ID = "10000000-0000-4000-8000-000000000003";

const shared = {
  selectedClubId: CLUB_ID,
  effectiveSeason: "2026-27",
  publicationState: "ready_for_review" as const,
  lastReviewedAt: "2026-08-11T10:00:00.000Z",
  canonicalClubCandidates: [
    { playerId: HAALAND_ID, canonicalName: "Erling Haaland", clubId: CLUB_ID, clubName: "Manchester City", position: "Forward", canonicalAge: 25, hasOneActiveMembership: true },
    { playerId: "10000000-0000-4000-8000-000000000004", canonicalName: "Phil Foden", clubId: CLUB_ID, clubName: "Manchester City", position: "Midfielder", canonicalAge: 26, hasOneActiveMembership: false },
  ],
  outsideClubCandidates: [
    { playerId: "10000000-0000-4000-8000-000000000005", canonicalName: "Bukayo Saka", clubId: OTHER_CLUB_ID, clubName: "Arsenal", position: "Forward", canonicalAge: 24, hasOneActiveMembership: true },
  ],
};

test("bulk preview resolves a canonical club row and calculates the exact tier/price", () => {
  const preview = previewTouchlineManualMarketValueBulk({ ...shared, text: "Erling Haaland | 25 | 180000000" });
  assert.equal(preview.rowsReceived, 1);
  assert.equal(preview.counts.READY, 1);
  assert.deepEqual(preview.rows[0], {
    rowNumber: 1, referenceName: "Erling Haaland", referenceAge: 25, marketValueEur: 180000000, currency: "EUR", status: "READY",
    canonicalPlayerId: HAALAND_ID, canonicalName: "Erling Haaland", clubName: "Manchester City", position: "Forward",
    calculatedTier: "diamond-gold", nominalPriceGbp: 15, detail: "Exact canonical player and active membership resolved.",
  });
});

test("bulk preview does not publish names alone and reports each rejection reason", () => {
  const preview = previewTouchlineManualMarketValueBulk({ ...shared, text: [
    "Phil Foden | 26 | 100000000",
    "Bukayo Saka | 24 | 90000000",
    "Unknown Player | 20 | 1",
    "Erling Haaland | 25 | 1",
    "Erling Haaland | 25 | 2",
    "Bad value | 24 | 1.5",
  ].join("\n") });
  assert.deepEqual(preview.rows.map((row) => row.status), ["NO_ACTIVE_MEMBERSHIP", "WRONG_CLUB", "NOT_FOUND", "READY", "DUPLICATE", "REVIEW_REQUIRED"]);
  assert.equal(preview.counts.READY, 1);
  assert.equal(preview.counts.DUPLICATE, 1);
  assert.equal(preview.counts.NO_ACTIVE_MEMBERSHIP, 1);
});

test("bulk preview caps the protected workflow at fifty rows", () => {
  const preview = previewTouchlineManualMarketValueBulk({ ...shared, text: Array.from({ length: 51 }, (_, index) => `Erling Haaland ${index} | 25 | 1`).join("\n") });
  assert.equal(preview.rowsReceived, 51);
  assert.equal(preview.rows.at(-1)?.status, "REVIEW_REQUIRED");
  assert.match(preview.rows.at(-1)?.detail ?? "", /maximum bulk size/);
});

test("bulk preview keeps typed age as a matching aid and fails a strong canonical age conflict", () => {
  const preview = previewTouchlineManualMarketValueBulk({ ...shared, text: "Erling Haaland | 35 | 180000000" });
  assert.equal(preview.rows[0]?.status, "AGE_MISMATCH");
  assert.equal(preview.counts.AGE_MISMATCH, 1);
});
