import assert from "node:assert/strict";
import test from "node:test";

import {
  planTouchlineCommercialActivationFulfillment,
  transitionTouchlineCommercialActivationOperation,
} from "../lib/touchlineArena/commercial-activation-operation.ts";

test("activation fulfillment cannot begin before a server-confirmed payment state", () => {
  assert.deepEqual(planTouchlineCommercialActivationFulfillment({
    operationState: "PENDING_PAYMENT",
    quotedInventoryIds: ["inventory-1"],
  }), { ok: false, reason: "payment-not-confirmed" });
});

test("confirmed payment progresses through an explicit fulfillment state and replay is idempotent", () => {
  assert.deepEqual(transitionTouchlineCommercialActivationOperation({
    state: "PENDING_PAYMENT",
    event: "payment-confirmed",
  }), { ok: true, state: "PAYMENT_CONFIRMED", idempotent: false });
  assert.deepEqual(transitionTouchlineCommercialActivationOperation({
    state: "PAYMENT_CONFIRMED",
    event: "payment-confirmed",
  }), { ok: true, state: "PAYMENT_CONFIRMED", idempotent: true });
  assert.deepEqual(transitionTouchlineCommercialActivationOperation({
    state: "PAYMENT_CONFIRMED",
    event: "fulfillment-started",
  }), { ok: true, state: "FULFILLMENT_PENDING", idempotent: false });
});

test("all quoted cards and the competition entitlement must persist together", () => {
  const input = {
    operationState: "PAYMENT_CONFIRMED" as const,
    quotedInventoryIds: ["inventory-1", "inventory-2"],
  };
  assert.deepEqual(planTouchlineCommercialActivationFulfillment(input), {
    ok: true,
    inventoryIds: ["inventory-1", "inventory-2"],
    createsCompetitionEntitlement: true,
  });
  assert.deepEqual(planTouchlineCommercialActivationFulfillment({
    ...input,
    persistedContractInventoryIds: ["inventory-1"],
    competitionEntitlementCreated: true,
  }), { ok: false, reason: "partial-persistence" });
  assert.deepEqual(planTouchlineCommercialActivationFulfillment({
    ...input,
    persistedContractInventoryIds: ["inventory-1", "inventory-2"],
    competitionEntitlementCreated: false,
  }), { ok: false, reason: "partial-persistence" });
});

test("terminal operations cannot be fulfilled or reactivated by a later event", () => {
  assert.deepEqual(transitionTouchlineCommercialActivationOperation({
    state: "CANCELLED",
    event: "payment-confirmed",
  }), { ok: false, reason: "terminal-operation" });
  assert.deepEqual(transitionTouchlineCommercialActivationOperation({
    state: "FULFILLED",
    event: "fulfilled",
  }), { ok: false, reason: "terminal-operation" });
});
