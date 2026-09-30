import assert from "node:assert/strict";
import test from "node:test";

import { resolveTouchlineQuickSubstitutionReadiness } from "../lib/touchlineArena/quick-substitution-readiness.ts";
test("Quick Substitution stays loading until both persisted reads have settled", () => {
  assert.deepEqual(
    resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup: false,
      hasLoadedClubOwnerRoster: true,
      starterCount: 11,
      benchCount: 9,
    }),
    {
      state: "loading",
      starterCount: 11,
      benchCount: 9,
      missingStarters: 0,
      missingBench: 0,
    },
  );
});

test("Quick Substitution fails closed for an incomplete or malformed matchday", () => {
  assert.deepEqual(
    resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup: true,
      hasLoadedClubOwnerRoster: true,
      starterCount: 0,
      benchCount: 0,
    }),
    {
      state: "setup-required",
      starterCount: 0,
      benchCount: 0,
      missingStarters: 11,
      missingBench: 9,
    },
  );

  assert.equal(
    resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup: true,
      hasLoadedClubOwnerRoster: true,
      starterCount: 12,
      benchCount: 10,
    }).state,
    "setup-required",
  );
});

test("Quick Substitution opens only for exactly eleven starters and nine substitutes", () => {
  assert.deepEqual(
    resolveTouchlineQuickSubstitutionReadiness({
      hasLoadedSavedLineup: true,
      hasLoadedClubOwnerRoster: true,
      starterCount: 11,
      benchCount: 9,
    }),
    {
      state: "ready",
      starterCount: 11,
      benchCount: 9,
      missingStarters: 0,
      missingBench: 0,
    },
  );
});
