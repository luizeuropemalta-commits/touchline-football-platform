import type {SupabaseClient} from '@supabase/supabase-js';
import {createFootballDataProvider} from './provider-factory';
import {inspectTouchlineIsolatedPreviewEnvironment} from '@/lib/touchlinePreview/isolation';

type MissingIdentity = {providerPlayerId: string; fixtureId: string};

/** Recover identity only, never infer a current club, shirt, value or publication.
 * SQL claims serialize requests and enforce a durable fifteen-minute cooldown.
 * Caller must re-read canonical identities before allowing score writes.
 */
export async function recoverMissingLineupIdentities(admin: SupabaseClient, missing: readonly MissingIdentity[]) {
  if (process.env.VERCEL_ENV === 'production'
    || inspectTouchlineIsolatedPreviewEnvironment().status !== 'qa'
    || process.env.TOUCHLINE_QA_SUPABASE_PROJECT_REF !== 'xgxbwqxjssxxuihuwmgy') return;
  const seen = new Set<string>();
  let claimed = 0;
  for (const identity of missing) {
    if (claimed >= 3) break;
    if (seen.has(identity.providerPlayerId) || !/^[1-9][0-9]{0,19}$/.test(identity.providerPlayerId)) continue;
    seen.add(identity.providerPlayerId);
    const {data: runId, error: claimError} = await admin.rpc('touchline_claim_player_identity_recovery', {
      p_player_id: identity.providerPlayerId, p_fixture_id: identity.fixtureId,
    });
    if (claimError || typeof runId !== 'string') continue;
    claimed++;
    try {
      const result = await createFootballDataProvider('sportmonks').getPlayerById(identity.providerPlayerId);
      if (!result.ok || !result.data || result.data.provider !== 'sportmonks'
        || result.data.providerId !== identity.providerPlayerId || !result.data.name.trim()) {
        throw new Error('identity-unavailable');
      }
      const p = result.data;
      const {error} = await admin.rpc('touchline_complete_player_identity_recovery', {
        p_run_id: runId, p_identity: {
          provider: p.provider, providerId: p.providerId, name: p.name,
          displayName: p.displayName, nationality: p.nationality,
          broadPosition: p.broadPosition, broadPositionId: p.broadPositionId,
          position: p.position, positionId: p.positionId,
          detailedPosition: p.detailedPosition, detailedPositionId: p.detailedPositionId,
        },
      });
      if (error) throw new Error('identity-persistence-unavailable');
    } catch {
      // Keep the score barrier. Do not expose upstream messages or retry here.
      await admin.from('football_data_sync_runs').update({status: 'error',
        completed_at: new Date().toISOString(), error_message: 'identity-recovery-unavailable',
      }).eq('id', runId).eq('status', 'running');
    }
  }
}
