import type { TouchlineCommercialActivationOperationState } from "./commercial-activation-operation.ts";

export type TouchlineCommercialObservationCode =
  | "WEBHOOK_CLAIMED"
  | "WEBHOOK_DUPLICATE"
  | "OPERATION_AWAITING_FULFILLMENT"
  | "ROUND_ENTRY_LOCKED"
  | "RECONCILIATION_REQUIRED";

export type TouchlineCommercialOperationalObservation = Readonly<{
  code: TouchlineCommercialObservationCode;
  operationId: string | null;
  roundEntryId: string | null;
  testOnly: boolean;
}>;

export type TouchlineCommercialReconciliation = Readonly<{
  status: "consistent" | "needs-reconciliation";
  reasons: readonly (
    | "fulfilled-without-entitlement-reference"
    | "terminal-operation-has-fulfillment-reference"
    | "live-event-in-test-boundary"
  )[];
}>;

/**
 * Produces an allowlisted operational signal only. It never accepts raw webhook
 * payloads, customer data, totals, card data, secrets or provider diagnostics.
 */
export function createTouchlineCommercialOperationalObservation(input: {
  code: TouchlineCommercialObservationCode;
  operationId?: string;
  roundEntryId?: string;
}): TouchlineCommercialOperationalObservation {
  return {
    code: input.code,
    operationId: input.operationId ?? null,
    roundEntryId: input.roundEntryId ?? null,
    testOnly: true,
  };
}

/**
 * Local reconciliation rule for the eventual server transaction. This sees
 * only opaque references and state flags, not money, personal data or payloads.
 */
export function reconcileTouchlineCommercialOperation(input: {
  operationState: TouchlineCommercialActivationOperationState;
  hasCompetitionEntitlementReference: boolean;
  hasFulfillmentReference: boolean;
  webhookLiveMode: boolean;
}): TouchlineCommercialReconciliation {
  const reasons: TouchlineCommercialReconciliation["reasons"][number][] = [];
  if (input.operationState === "FULFILLED" && !input.hasCompetitionEntitlementReference) {
    reasons.push("fulfilled-without-entitlement-reference");
  }
  if ((input.operationState === "PAYMENT_FAILED" || input.operationState === "CANCELLED")
    && input.hasFulfillmentReference) {
    reasons.push("terminal-operation-has-fulfillment-reference");
  }
  if (input.webhookLiveMode) reasons.push("live-event-in-test-boundary");
  return reasons.length ? { status: "needs-reconciliation", reasons } : { status: "consistent", reasons };
}
