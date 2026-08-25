import assert from "node:assert/strict";
import test from "node:test";

import {
  loadTouchlineMarketInventorySnapshot,
  marketInventoryCardByProviderPlayerId,
  parseTouchlineMarketInventorySnapshot,
} from "../lib/touchlineArena/market-inventory.ts";

const INVENTORY_ID = "123e4567-e89b-42d3-a456-426614174000";
const PLAYER_ID = "123e4567-e89b-42d3-a456-426614174001";

function validSnapshot() {
  return {
    ok: true,
    source: "supabase",
    providerTeamId: "9",
    walletBalanceTc: 60,
    activeContractCount: 32,
    openContractSlots: 3,
    squadValueGbp: 171,
    representedClubCount: 7,
    cards: [{
      inventoryId: INVENTORY_ID,
      playerId: PLAYER_ID,
      providerPlayerId: "12345",
      tierKey: "ruby-red",
      priceTableVersion: "2026-07-premier-v1",
      priceTc: 0,
      marketValueEur: 5_000_000,
      previousMarketValueEur: 4_000_000,
      marketValueChangeEur: 1_000_000,
      marketValueUpdatedAt: "2026-07-30T12:00:00.000Z",
      marketValueSource: "sportmonks",
      supplyLimit: 1000,
      soldCopies: 1,
      availableCopies: 999,
      alreadyOwned: false,
    }],
  };
}

test("parses one authoritative market inventory snapshot", () => {
  const snapshot = parseTouchlineMarketInventorySnapshot(validSnapshot());
  assert.ok(snapshot);
  assert.equal(snapshot.walletBalanceTc, 60);
  assert.equal(snapshot.openContractSlots, 3);
  assert.equal(snapshot.squadValueGbp, 171);
  assert.equal(snapshot.representedClubCount, 7);
  assert.equal(snapshot.cards[0].priceTc, 0);
  assert.equal(snapshot.cards[0].marketValueEur, 5_000_000);
  assert.equal(snapshot.cards[0].marketValueChangeEur, 1_000_000);
  assert.equal(snapshot.checkoutPolicy, null);
  assert.equal(marketInventoryCardByProviderPlayerId(snapshot, "12345")?.inventoryId, INVENTORY_ID);
});

test("accepts only a complete server-authorized launch test policy", () => {
  const payload = validSnapshot();
  payload.checkoutPolicy = {
    key: "launch-test-2026-27",
    mode: "zero-tc-test",
    notice: "Launch test period",
  };
  assert.deepEqual(parseTouchlineMarketInventorySnapshot(payload)?.checkoutPolicy, payload.checkoutPolicy);

  payload.checkoutPolicy = { key: "launch-test-2026-27", mode: "free", notice: "no" };
  assert.equal(parseTouchlineMarketInventorySnapshot(payload)?.checkoutPolicy, null);
});

test("accepts numeric values serialized by PostgreSQL", () => {
  const payload = validSnapshot();
  payload.walletBalanceTc = "60" as unknown as number;
  const snapshot = parseTouchlineMarketInventorySnapshot(payload);
  assert.equal(snapshot?.walletBalanceTc, 60);
});

test("preserves an authoritative zero wallet balance", () => {
  const payload = validSnapshot();
  payload.walletBalanceTc = 0;
  assert.equal(parseTouchlineMarketInventorySnapshot(payload)?.walletBalanceTc, 0);
});

test("preserves an authoritative FREE card price", () => {
  const payload = validSnapshot();
  payload.cards[0].priceTc = 0;
  assert.equal(parseTouchlineMarketInventorySnapshot(payload)?.cards[0].priceTc, 0);
});

test("discards a card with a negative authoritative market value without rejecting the snapshot", () => {
  const payload = validSnapshot();
  payload.cards[0].marketValueEur = -1;
  const snapshot = parseTouchlineMarketInventorySnapshot(payload);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.cards, []);
});

test("discards a card with inconsistent supply arithmetic without rejecting the snapshot", () => {
  const payload = validSnapshot();
  payload.cards[0].availableCopies = 998;
  const snapshot = parseTouchlineMarketInventorySnapshot(payload);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.cards, []);
});

test("preserves valid cards when another inventory record is invalid", () => {
  const payload = validSnapshot();
  payload.cards.push({
    ...payload.cards[0],
    inventoryId: "123e4567-e89b-42d3-a456-426614174002",
    playerId: "123e4567-e89b-42d3-a456-426614174003",
    providerPlayerId: "67890",
    supplyLimit: 1000,
    soldCopies: 1,
    availableCopies: 998,
  });

  const snapshot = parseTouchlineMarketInventorySnapshot(payload);
  assert.ok(snapshot);
  assert.equal(snapshot.cards.length, 1);
  assert.equal(snapshot.cards[0].inventoryId, INVENTORY_ID);
  assert.equal(snapshot.activeContractCount, 32);
  assert.equal(snapshot.openContractSlots, 3);
});

test("rejects duplicate inventory or provider player ids", () => {
  const payload = validSnapshot();
  payload.cards.push({ ...payload.cards[0] });
  assert.equal(parseTouchlineMarketInventorySnapshot(payload), null);
});

test("rejects roster totals that do not equal 35", () => {
  const payload = validSnapshot();
  payload.openContractSlots = 2;
  assert.equal(parseTouchlineMarketInventorySnapshot(payload), null);
});

test("rejects a missing, fractional or impossible account summary", () => {
  const missingValue = validSnapshot();
  delete (missingValue as Partial<typeof missingValue>).squadValueGbp;
  assert.equal(parseTouchlineMarketInventorySnapshot(missingValue), null);

  const fractionalValue = validSnapshot();
  fractionalValue.squadValueGbp = 171.5;
  assert.equal(parseTouchlineMarketInventorySnapshot(fractionalValue), null);

  const impossibleClubCount = validSnapshot();
  impossibleClubCount.representedClubCount = 33;
  assert.equal(parseTouchlineMarketInventorySnapshot(impossibleClubCount), null);
});

test("recovers the authoritative account summary after one transient Market failure", async () => {
  const statuses = [503, 200];
  const waits: number[] = [];
  let requests = 0;
  const snapshot = await loadTouchlineMarketInventorySnapshot(async () => {
    const status = statuses[requests++] ?? 500;
    return {
      ok: status === 200,
      status,
      payload: status === 200 ? validSnapshot() : { error: "temporarily unavailable" },
    };
  }, {
    retryDelaysMs: [10, 20],
    wait: async (delayMs) => { waits.push(delayMs); },
  });

  assert.equal(requests, 2);
  assert.deepEqual(waits, [10]);
  assert.equal(snapshot?.walletBalanceTc, 60);
  assert.equal(snapshot?.squadValueGbp, 171);
  assert.equal(snapshot?.activeContractCount, 32);
  assert.equal(snapshot?.representedClubCount, 7);
});

test("does not retry a rejected authenticated Market request", async () => {
  let requests = 0;
  const snapshot = await loadTouchlineMarketInventorySnapshot(async () => {
    requests += 1;
    return { ok: false, status: 401, payload: { error: "Authentication required." } };
  }, {
    retryDelaysMs: [10, 20],
    wait: async () => assert.fail("authorization failures must not wait for a retry"),
  });

  assert.equal(snapshot, null);
  assert.equal(requests, 1);
});

test("bounds transient Market retries and never fabricates account totals", async () => {
  let requests = 0;
  const snapshot = await loadTouchlineMarketInventorySnapshot(async () => {
    requests += 1;
    throw new Error("offline");
  }, {
    retryDelaysMs: [1, 2],
    wait: async () => undefined,
  });

  assert.equal(snapshot, null);
  assert.equal(requests, 3);
});
