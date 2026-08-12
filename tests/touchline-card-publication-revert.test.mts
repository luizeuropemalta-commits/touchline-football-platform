import assert from "node:assert/strict";
import test from "node:test";

import { hasTouchlineCardPublicationRevertSnapshot } from "../lib/touchlineArena/card-publication-revert.ts";

const PLAYER_ID = "d9428888-122b-11e1-b85c-61cd3cbb3210";
const PUBLICATION_ID = "18f1a57f-bb4c-49b5-b5a9-c46017e5585c";
const MEMBERSHIP_ID = "0a7f4c7d-2ffd-4ac0-ac49-2f5523b9b2d4";
const VALUE_ID = "078cbd0c-c11d-4e31-b0fd-62b92bafd3e9";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    publication: { id: PUBLICATION_ID, player_id: PLAYER_ID, current_membership_id: MEMBERSHIP_ID },
    market_value: { id: VALUE_ID, player_id: PLAYER_ID },
    ...overrides,
  };
}

test("only a complete matching immutable prior state may offer a revert", () => {
  assert.equal(hasTouchlineCardPublicationRevertSnapshot(snapshot()), true);
  assert.equal(hasTouchlineCardPublicationRevertSnapshot(null), false);
  assert.equal(hasTouchlineCardPublicationRevertSnapshot({ publication: null, market_value: null }), false);
  assert.equal(hasTouchlineCardPublicationRevertSnapshot(snapshot({ market_value: { id: VALUE_ID, player_id: "d9428888-122b-11e1-b85c-61cd3cbb3211" } })), false);
  assert.equal(hasTouchlineCardPublicationRevertSnapshot(snapshot({ publication: { id: PUBLICATION_ID, player_id: PLAYER_ID } })), false);
});
