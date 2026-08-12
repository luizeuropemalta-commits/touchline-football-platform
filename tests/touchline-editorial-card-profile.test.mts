import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTouchlineEditorialCardPrice,
  parseTouchlinePublicEditorialCardPresentation,
  parseTouchlineEditorialCardRecord,
  resolveTouchlinePublicEditorialCardPresentation,
} from "../lib/touchlineArena/editorial-card-profile.ts";

const PLAYER_ID = "d9428888-122b-11e1-b85c-61cd3cbb3210";
function editorialRecord(overrides: Record<string, unknown> = {}) {
  return {
    playerId: PLAYER_ID,
    tierKey: "ruby-red",
    cardPrice: { amountMinor: 1500, currency: "TC" },
    publicationState: "published",
    lastReviewedAt: "2026-08-10T10:15:30.000Z",
    internalNote: "Editor approval reference 2026-08-10.",
    internalSource: "Internal editorial board.",
    ...overrides,
  };
}

test("a published editorial record exposes only its approved card presentation", () => {
  const result = resolveTouchlinePublicEditorialCardPresentation(editorialRecord());

  assert.deepEqual(result, {
    tierKey: "ruby-red",
    cardPrice: { amountMinor: 1500, currency: "TC" },
    lastReviewedAt: "2026-08-10T10:15:30.000Z",
  });
});

test("all non-published lifecycle records stay hidden from the public card", () => {
  assert.equal(
    resolveTouchlinePublicEditorialCardPresentation(editorialRecord({ publicationState: "market_value_required" })),
    null,
  );
  assert.equal(
    resolveTouchlinePublicEditorialCardPresentation(editorialRecord({ publicationState: "ready_to_publish" })),
    null,
  );
});

test("invalid identifiers, tiers, prices and review timestamps fail closed", () => {
  assert.equal(parseTouchlineEditorialCardRecord(editorialRecord({ playerId: "not-a-uuid" })), null);
  assert.equal(parseTouchlineEditorialCardRecord(editorialRecord({ tierKey: "invented-tier" })), null);
  assert.equal(
    parseTouchlineEditorialCardRecord(editorialRecord({ cardPrice: { amountMinor: 12.5, currency: "TC" } })),
    null,
  );
  assert.equal(
    parseTouchlineEditorialCardRecord(editorialRecord({ cardPrice: { amountMinor: 1500, currency: "USD" } })),
    null,
  );
  assert.equal(
    parseTouchlineEditorialCardRecord(editorialRecord({ lastReviewedAt: "2026-02-30T10:15:30.000Z" })),
    null,
  );
});

test("internal editorial text cannot serialize across the public boundary", () => {
  const publicPresentation = resolveTouchlinePublicEditorialCardPresentation(editorialRecord({
    internalNote: "Never render this private note.",
    internalSource: "Never render this private source.",
  }));

  assert.ok(publicPresentation);
  const serialized = JSON.stringify(publicPresentation);
  assert.deepEqual(Object.keys(publicPresentation).sort(), ["cardPrice", "lastReviewedAt", "tierKey"]);
  assert.doesNotMatch(serialized, /private note|private source|internal/i);
});

test("the browser-facing editorial projection accepts only the published public shape", () => {
  const publicRecord = {
    tierKey: "emerald-green",
    cardPrice: { amountMinor: 700, currency: "TC" },
    lastReviewedAt: "2026-08-10T10:15:30.000Z",
  };
  assert.deepEqual(parseTouchlinePublicEditorialCardPresentation(publicRecord), publicRecord);
  assert.equal(
    parseTouchlinePublicEditorialCardPresentation({ ...publicRecord, publicationState: "published" }),
    null,
  );
  assert.equal(
    parseTouchlinePublicEditorialCardPresentation({ ...publicRecord, internalNote: "must not cross" }),
    null,
  );
});

test("editorial display prices format locally without checkout authority", () => {
  assert.equal(
    formatTouchlineEditorialCardPrice({ amountMinor: 1500, currency: "TC" }, "en-GB"),
    "15 TC",
  );
  assert.equal(
    formatTouchlineEditorialCardPrice({ amountMinor: 1500, currency: "GBP" }, "pt-BR"),
    "£ 15,00",
  );
});
