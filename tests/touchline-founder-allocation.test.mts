import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateTouchlineFounder,
  TOUCHLINE_FOUNDER_CAPACITY,
  type TouchlineFounderAllocation,
} from "../lib/touchlineArena/founder-allocation.ts";

const eligible = (userId: string, operation = "11111111-1111-4111-8111-111111111111") => ({
  userId,
  initialActivationOperationId: operation,
  competition: "england" as const,
  paymentConfirmedServerSide: true,
  clubActivated: true,
});

test("Founder requires server payment confirmation and an activated England club", () => {
  assert.deepEqual(allocateTouchlineFounder({
    eligibility: { ...eligible("user-a"), paymentConfirmedServerSide: false },
    existingAllocations: [],
  }), { ok: false, reason: "ineligible" });
  assert.deepEqual(allocateTouchlineFounder({
    eligibility: { ...eligible("user-a"), clubActivated: false },
    existingAllocations: [],
  }), { ok: false, reason: "ineligible" });
});

test("the final Founder slot is unique under serialized concurrent allocation", () => {
  const allocations: TouchlineFounderAllocation[] = Array.from({ length: 99 }, (_, index) => ({
    userId: `user-${index + 1}`,
    founderNumber: index + 1,
    initialActivationOperationId: `operation-${index + 1}`,
  }));
  const first = allocateTouchlineFounder({ eligibility: eligible("user-100"), existingAllocations: allocations });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.allocation.founderNumber, TOUCHLINE_FOUNDER_CAPACITY);
  const second = allocateTouchlineFounder({
    eligibility: eligible("user-101", "22222222-2222-4222-8222-222222222222"),
    existingAllocations: [...allocations, first.allocation],
  });
  assert.deepEqual(second, { ok: false, reason: "sold-out" });
});

test("webhook replay for an existing Founder is idempotent and never allocates #101", () => {
  const existing: TouchlineFounderAllocation[] = [{
    userId: "user-a",
    founderNumber: 1,
    initialActivationOperationId: "11111111-1111-4111-8111-111111111111",
  }];
  const replay = allocateTouchlineFounder({ eligibility: eligible("user-a"), existingAllocations: existing });
  assert.deepEqual(replay, { ok: true, allocation: existing[0], idempotent: true });
});
