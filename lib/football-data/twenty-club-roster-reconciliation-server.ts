import "server-only";

import {
  planTouchlineTwentyClubRosterReconciliation,
  type TouchlineTwentyClubRosterReconciliationInput,
} from "./twenty-club-roster-reconciliation.ts";

/**
 * Server-only facade for a future protected reconciliation job.
 *
 * It deliberately accepts already captured input and returns a dry-run plan.
 * This candidate has no database client, provider client, route, scheduler or
 * executor, so importing it cannot apply a roster change.
 */
export function prepareTouchlineTwentyClubRosterReconciliation(
  input: TouchlineTwentyClubRosterReconciliationInput,
) {
  return planTouchlineTwentyClubRosterReconciliation(input);
}
