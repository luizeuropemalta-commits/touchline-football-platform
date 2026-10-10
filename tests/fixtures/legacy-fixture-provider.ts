// Historical per-content-database factory, retained ONLY to exercise old
// migrations. It is NOT the runtime factory or evidence of central protection.
import type { SupabaseClient } from '@supabase/supabase-js';
import { SportmonksFootballProvider } from '../../lib/football-data/providers/sportmonks.ts';
import { createSportmonksFixtureAuthority } from '../../lib/football-data/sportmonks-fixture-authority.ts';
export function createGuardedFixtureProvider(admin: SupabaseClient, accountScope?: string) {
  if (!accountScope) throw new Error('Fixture authority account binding unavailable.');
  const guard = createSportmonksFixtureAuthority(accountScope, async (name, args, signal) => {
    if (signal.aborted) throw new Error('Fixture authority unavailable.');
    const { data, error } = await admin.rpc(name, args).abortSignal(signal);
    if (error || signal.aborted) throw new Error('Fixture authority unavailable.');
    return data;
  });
  return new SportmonksFootballProvider({ fixtureGuard: guard });
}
