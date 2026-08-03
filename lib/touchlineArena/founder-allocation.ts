export const TOUCHLINE_FOUNDER_CAPACITY = 100;

export type TouchlineFounderAllocation = Readonly<{
  userId: string;
  founderNumber: number;
  initialActivationOperationId: string;
}>;

export type TouchlineFounderEligibility = Readonly<{
  userId: string;
  initialActivationOperationId: string;
  competition: "england";
  paymentConfirmedServerSide: boolean;
  clubActivated: boolean;
}>;

export type TouchlineFounderAllocationResult =
  | Readonly<{ ok: true; allocation: TouchlineFounderAllocation; idempotent: boolean }>
  | Readonly<{ ok: false; reason: "ineligible" | "sold-out" }>;

/**
 * Pure policy for the permanent Founder #001–#100 allocation. Persistence must
 * serialize this decision with the corresponding England fulfillment inside a
 * single server transaction; see migration 042 for that database boundary.
 */
export function allocateTouchlineFounder(input: {
  eligibility: TouchlineFounderEligibility;
  existingAllocations: readonly TouchlineFounderAllocation[];
}): TouchlineFounderAllocationResult {
  const { eligibility, existingAllocations } = input;
  if (!eligibility.paymentConfirmedServerSide || !eligibility.clubActivated) {
    return { ok: false, reason: "ineligible" };
  }

  const existing = existingAllocations.find((allocation) => allocation.userId === eligibility.userId);
  if (existing) return { ok: true, allocation: existing, idempotent: true };

  const assigned = new Set(existingAllocations.map((allocation) => allocation.founderNumber));
  const founderNumber = Array.from({ length: TOUCHLINE_FOUNDER_CAPACITY }, (_, index) => index + 1)
    .find((candidate) => !assigned.has(candidate));
  if (founderNumber === undefined) return { ok: false, reason: "sold-out" };

  return {
    ok: true,
    idempotent: false,
    allocation: {
      userId: eligibility.userId,
      founderNumber,
      initialActivationOperationId: eligibility.initialActivationOperationId,
    },
  };
}
