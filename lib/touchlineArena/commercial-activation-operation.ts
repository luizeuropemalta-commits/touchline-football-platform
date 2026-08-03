export type TouchlineCommercialActivationOperationState =
  | "PENDING_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "FULFILLMENT_PENDING"
  | "FULFILLED"
  | "PAYMENT_FAILED"
  | "CANCELLED";

export type TouchlineCommercialActivationOperationEvent =
  | "payment-confirmed"
  | "payment-failed"
  | "fulfillment-started"
  | "fulfilled"
  | "cancelled";

export type TouchlineCommercialActivationOperationTransition =
  | { ok: true; state: TouchlineCommercialActivationOperationState; idempotent: boolean }
  | { ok: false; reason: "invalid-transition" | "terminal-operation" };

/**
 * Pure, provider-agnostic operation lifecycle. It does not receive a payment
 * amount, call a provider, write a ledger or persist a contract. A future
 * server transaction must use this state contract to make fulfillment atomic.
 */
export function transitionTouchlineCommercialActivationOperation(input: {
  state: TouchlineCommercialActivationOperationState;
  event: TouchlineCommercialActivationOperationEvent;
}): TouchlineCommercialActivationOperationTransition {
  const { state, event } = input;
  if (state === "FULFILLED" || state === "CANCELLED") {
    return { ok: false, reason: "terminal-operation" };
  }
  if (state === "PENDING_PAYMENT") {
    if (event === "payment-confirmed") return { ok: true, state: "PAYMENT_CONFIRMED", idempotent: false };
    if (event === "payment-failed") return { ok: true, state: "PAYMENT_FAILED", idempotent: false };
    if (event === "cancelled") return { ok: true, state: "CANCELLED", idempotent: false };
  }
  if (state === "PAYMENT_CONFIRMED") {
    if (event === "payment-confirmed") return { ok: true, state, idempotent: true };
    if (event === "fulfillment-started") return { ok: true, state: "FULFILLMENT_PENDING", idempotent: false };
  }
  if (state === "FULFILLMENT_PENDING" && event === "fulfilled") {
    return { ok: true, state: "FULFILLED", idempotent: false };
  }
  if (state === "PAYMENT_FAILED" && event === "payment-failed") {
    return { ok: true, state, idempotent: true };
  }
  return { ok: false, reason: "invalid-transition" };
}

export type TouchlineCommercialActivationFulfillmentPlan =
  | { ok: true; inventoryIds: string[]; createsCompetitionEntitlement: true }
  | { ok: false; reason: "payment-not-confirmed" | "empty-or-duplicate-inventory" | "partial-persistence" };

/**
 * Accepts only an all-or-nothing server persistence plan. The resulting plan
 * may later be executed inside one database transaction; this function cannot
 * create an entitlement, contract, ledger entry or notification by itself.
 */
export function planTouchlineCommercialActivationFulfillment(input: {
  operationState: TouchlineCommercialActivationOperationState;
  quotedInventoryIds: string[];
  persistedContractInventoryIds?: string[];
  competitionEntitlementCreated?: boolean;
}): TouchlineCommercialActivationFulfillmentPlan {
  if (input.operationState !== "PAYMENT_CONFIRMED") {
    return { ok: false, reason: "payment-not-confirmed" };
  }
  const quoted = input.quotedInventoryIds.map((value) => value.trim()).filter(Boolean);
  if (!quoted.length || new Set(quoted).size !== quoted.length) {
    return { ok: false, reason: "empty-or-duplicate-inventory" };
  }
  if (input.persistedContractInventoryIds !== undefined || input.competitionEntitlementCreated !== undefined) {
    const persisted = input.persistedContractInventoryIds ?? [];
    const sameInventory = persisted.length === quoted.length
      && persisted.every((inventoryId) => quoted.includes(inventoryId));
    if (!sameInventory || input.competitionEntitlementCreated !== true) {
      return { ok: false, reason: "partial-persistence" };
    }
  }
  return { ok: true, inventoryIds: quoted, createsCompetitionEntitlement: true };
}
