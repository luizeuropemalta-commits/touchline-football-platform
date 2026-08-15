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
      marketValue: "",
      marketValueSource: "unavailable",
      cardTier: "emerald-green",
      cardPriceVersion: "2026-07-tc-v2",
      cardPriceAuthority: "active-contract",
      touchlinePoints: 12,
      editorialCard: {
        tierKey: "radiant-gold",
        cardPrice: { amountMinor: 1500, currency: "TC" },
        lastReviewedAt: "2026-08-10T10:15:30.000Z",
      },
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
  assert.equal(result.cards[0].canonicalPlayerId, result.cards[0].id);
  assert.deepEqual(result.cards[0].editorialCard, {
    tierKey: "radiant-gold",
    cardPrice: { amountMinor: 1500, currency: "TC" },
    lastReviewedAt: "2026-08-10T10:15:30.000Z",
  });
});

test("accepts the published editorial roster contract without legacy active-contract pricing fields", () => {
  const payload = validPayload();
  delete (payload.cards[0] as Partial<typeof payload.cards[0]>).cardPriceAuthority;
  delete (payload.cards[0] as Partial<typeof payload.cards[0]>).cardPriceVersion;

  const result = parseAuthoritativeRosterResponse(payload);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.cards[0].cardPriceAuthority, undefined);
  assert.equal(result.cards[0].cardPriceVersion, undefined);
  assert.equal(result.cards[0].editorialCard?.tierKey, "radiant-gold");
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

test("drops malformed or private editorial fields at the browser boundary", () => {
  const payload = validPayload();
  payload.cards[0].editorialCard = {
    tierKey: "radiant-gold",
    cardPrice: { amountMinor: 1500, currency: "TC" },
    lastReviewedAt: "2026-08-10T10:15:30.000Z",
    internalNote: "must never cross the server boundary",
  } as never;
  const result = parseAuthoritativeRosterResponse(payload);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.cards[0].editorialCard, null);
});

test("rejects a roster card with neither a published editorial profile nor frozen contract authority", () => {
  const payload = validPayload();
  delete (payload.cards[0] as Partial<typeof payload.cards[0]>).cardPriceAuthority;
  payload.cards[0].editorialCard = null as never;
  assert.deepEqual(parseAuthoritativeRosterResponse(payload), { ok: false });

  const forgedAuthority = validPayload();
  forgedAuthority.cards[0].cardPriceAuthority = "editorial";
  assert.deepEqual(parseAuthoritativeRosterResponse(forgedAuthority), { ok: false });
});
