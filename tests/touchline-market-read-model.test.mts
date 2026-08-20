import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTouchlineMarketCardReadModel,
  resolveTouchlineMarketCardReadModels,
  resolveTouchlineMarketIdentity,
  touchlineMarketClubKey,
  touchlineMarketPlayerKey,
} from "../lib/touchlineArena/market-read-model.ts";
import type { TouchlineMarketInventorySnapshot } from "../lib/touchlineArena/market-inventory.ts";

const snapshot: TouchlineMarketInventorySnapshot = {
  ok: true,
  source: "supabase",
  providerTeamId: "9",
  walletBalanceTc: 0,
  activeContractCount: 0,
  openContractSlots: 35,
  squadValueGbp: 0,
  representedClubCount: 0,
  cards: [{
    inventoryId: "123e4567-e89b-42d3-a456-426614174000",
    playerId: "123e4567-e89b-42d3-a456-426614174001",
    providerPlayerId: "12345",
    tierKey: "ruby-red",
    priceTableVersion: "2026-07-premier-v1",
    priceTc: 0,
    marketValueEur: 5_000_000,
    previousMarketValueEur: null,
    marketValueChangeEur: null,
    marketValueUpdatedAt: "2026-07-30T12:00:00.000Z",
    marketValueSource: "provider",
    supplyLimit: 1000,
    soldCopies: 0,
    availableCopies: 1000,
    alreadyOwned: false,
  }],
};

test("Market identity uses provider IDs and never player names", () => {
  const identity = resolveTouchlineMarketIdentity({
    id: "legacy-name-key",
    providerId: "12345",
    clubTeamId: "9",
  });

  assert.deepEqual(identity, {
    providerPlayerId: "12345",
    providerTeamId: "9",
    playerKey: "sportmonks:player:12345",
    clubKey: "sportmonks:club:9",
  });
  assert.equal(touchlineMarketPlayerKey("HaAlAnD"), null);
  assert.equal(touchlineMarketClubKey("Manchester City"), null);
});

test("only a matching club inventory can enrich a Market player", () => {
  const card = resolveTouchlineMarketCardReadModel({
    id: "12345",
    providerId: "12345",
    clubTeamId: "9",
  }, snapshot);
  assert.equal(card.inventoryId, snapshot.cards[0].inventoryId);
  assert.equal(card.source, "supabase");

  const wrongClub = resolveTouchlineMarketCardReadModel({
    id: "12345",
    providerId: "12345",
    clubTeamId: "18",
  }, snapshot);
  assert.equal(wrongClub.inventoryId, null);
  assert.equal(wrongClub.source, "public");
});

test("list and detail share the same card identity without client-created products", () => {
  const [listed] = resolveTouchlineMarketCardReadModels([{
    id: "12345",
    providerId: "12345",
    clubTeamId: "9",
  }], snapshot);

  assert.equal(listed.card.inventoryId, snapshot.cards[0].inventoryId);
  assert.equal(listed.card.inventory?.priceTc, 0);
  assert.equal(Object.hasOwn(listed.card, "checkoutPrice"), false);
  assert.equal(Object.hasOwn(listed.card, "walletBalanceTc"), false);
});

test("missing provider identity remains public and cannot become a checkout card", () => {
  const card = resolveTouchlineMarketCardReadModel({
    id: "legacy-haaland",
    providerId: null,
    clubTeamId: "9",
  }, snapshot);
  assert.equal(card.playerKey, null);
  assert.equal(card.inventoryId, null);
  assert.equal(card.source, "public");
});
