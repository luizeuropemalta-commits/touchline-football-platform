import type { SupabaseClient } from "@supabase/supabase-js";
import "server-only";
import { createConfiguredCentralFootballDataProvider } from "./central-provider-server.ts";

/** Deliberately no fallback to an unguarded provider. The non-secret account
 * binding must be explicitly configured consistently across guarded workers.
 * The legacy admin argument is retained for caller compatibility only: it is
 * NEVER used for quota RPCs. Content writes remain owned by each sync job.
 */
export function createGuardedFixtureProvider(
  _admin: SupabaseClient,
  accountScope?: string,
) {
  return createConfiguredCentralFootballDataProvider(accountScope);
}
