import assert from "node:assert/strict";
import test from "node:test";

import {
  createTouchlineCommercialOperationalObservation,
  reconcileTouchlineCommercialOperation,
} from "../lib/touchlineArena/commercial-operation-observability.ts";

test("operational observation allowlists only opaque references and a code", () => {
  assert.deepEqual(createTouchlineCommercialOperationalObservation({
    code: "ROUND_ENTRY_LOCKED",
    operationId: "operation-1",
  }), {
    code: "ROUND_ENTRY_LOCKED",
    operationId: "operation-1",
    roundEntryId: null,
    testOnly: true,
  });
});

test("reconciliation detects missing fulfillment evidence without a financial calculation", () => {
  assert.deepEqual(reconcileTouchlineCommercialOperation({
    operationState: "FULFILLED",
    hasCompetitionEntitlementReference: false,
    hasFulfillmentReference: false,
    webhookLiveMode: false,
  }), { status: "needs-reconciliation", reasons: ["fulfilled-without-entitlement-reference"] });
});

test("failed, cancelled and live-mode inconsistencies are visible as safe codes", () => {
  assert.deepEqual(reconcileTouchlineCommercialOperation({
    operationState: "CANCELLED",
    hasCompetitionEntitlementReference: false,
    hasFulfillmentReference: true,
    webhookLiveMode: true,
  }), {
    status: "needs-reconciliation",
    reasons: ["terminal-operation-has-fulfillment-reference", "live-event-in-test-boundary"],
  });
});
