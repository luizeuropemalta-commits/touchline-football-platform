import type { SupabaseClient } from "@supabase/supabase-js";
import { SportmonksFootballProvider } from "@/lib/football-data/providers/sportmonks";
import { createSportmonksFixtureAuthority } from "@/lib/football-data/sportmonks-fixture-authority";

/** Deliberately no fallback to an unguarded provider. The non-secret account
 * binding must be explicitly configured consistently across guarded workers.
 */
export function createGuardedFixtureProvider(
  admin: SupabaseClient,
  accountScope: string | undefined = process.env.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE,
) {
  if (!accountScope) throw new Error("Fixture authority account binding unavailable.");
  const guard = createSportmonksFixtureAuthority(accountScope, async (name, args, signal) => {
    if (signal.aborted) throw new Error("Fixture authority unavailable.");
    const { data, error } = await admin.rpc(name, args).abortSignal(signal);
    if (error || signal.aborted) throw new Error("Fixture authority unavailable.");
    return data;
  });
  return new SportmonksFootballProvider({ fixtureGuard: guard });
}
