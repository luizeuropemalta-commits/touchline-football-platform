import assert from "node:assert/strict";
import test from "node:test";

import { parseAuthoritativeRosterResponse } from "../lib/touchlineArena/authoritative-roster-client.ts";

const INVENTORY_ID = "123e4567-e89b-42d3-a456-426614174002";

function validPayload() {
  return {
    ok: true,
    state: "authenticated",
    source: "supabase",
    activeContractCount: 1,
    cards: [{
      id: "123e4567-e89b-42d3-a456-426614174003",
      inventoryId: INVENTORY_ID,
      name: "Erling Haaland",
      shortName: "Haaland",
      role: "forward",
      position: "ST",
      clubName: "Manchester City",
      shirtNumber: 9,
      countryCode3: "NOR",
      marketValue: "€180M",
      marketValueSource: "verified-cache",
      cardTier: "emerald-green",
      cardPriceVersion: "2026-07-tc-v2",
      cardPriceAuthority: "active-contract",
      touchlinePoints: 12,
    }],
  };
}

test("accepts a complete authoritative roster and preserves its inventory identity", () => {
  const result = parseAuthoritativeRosterResponse(validPayload());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.cards[0].inventoryId, INVENTORY_ID);
  assert.equal(result.cards[0].cardTier, "emerald-green");
  assert.equal(result.cards[0].cardPriceAuthority, "active-contract");
  assert.equal(result.cards[0].shirtNumber, 9);
});

test("rejects a partial count, malformed UUID, duplicate contract or non-authoritative state", () => {
  const partial = validPayload();
  partial.activeContractCount = 2;
  assert.deepEqual(parseAuthoritativeRosterResponse(partial), { ok: false });

  const malformed = validPayload();
  malformed.cards[0].inventoryId = "not-a-uuid";
  assert.deepEqual(parseAuthoritativeRosterResponse(malformed), { ok: false });

  const duplicate = validPayload();
  duplicate.activeContractCount = 2;
  duplicate.cards.push({ ...duplicate.cards[0], id: "another-player" });
  assert.deepEqual(parseAuthoritativeRosterResponse(duplicate), { ok: false });

  const anonymous = validPayload();
  anonymous.state = "anonymous";
  assert.deepEqual(parseAuthoritativeRosterResponse(anonymous), { ok: false });
});
