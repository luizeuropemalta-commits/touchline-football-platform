import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerEmails, isOwnerEmail } from '@/lib/admin/owner';
import { hasTouchLineArenaAccess } from './auth-access';
import { parsePublicOwnerProfile, publicOwnerId } from './clubowner-public-contract';
import { resolveServerReadWithin } from './server-read-deadline';
import { clubExchangeEnabled } from '../touchlineFantasy/club-exchange-server';
import { parseExchangeDiscovery } from '../touchlineFantasy/exchange-discovery';
import { createClubCollectionStore } from '../touchlineFantasy/club-collection-server';
import { marketObject } from './clubowner-public-market-contract';
import type { PublicMarketDependencies } from './clubowner-public-market-handler';

// Bounded per-process abuse guard, supplementary to auth/atomic SQL. It is not a
// distributed quota, and never counts a request against another customer.
const attempts = new Map<string, { until: number; read: number; write: number }>();
function allow(actor: string, write: boolean) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  let window = attempts.get(actor);
  if (!window) {
    if (attempts.size >= 1000) return false;
    window = { until: now + 60_000, read: 0, write: 0 }; attempts.set(actor, window);
  }
  const kind = write ? 'write' : 'read';
  return ++window[kind] <= (write ? 10 : 30);
}
export function publicMarketDependencies(): PublicMarketDependencies {
  let admin: ReturnType<typeof createAdminClient> | undefined;
  const getAdmin = () => {
    admin ??= createAdminClient();
    if (!admin) throw new Error('CLUB_STORAGE_UNAVAILABLE');
    return admin;
  };
  return {
    enabled: process.env.TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED === 'true' && clubExchangeEnabled(), allow,
    actor: async () => {
      const client = await createClient();
      if (!client) throw new Error('AUTH_UNAVAILABLE');
      const result = await resolveServerReadWithin(client.auth.getUser(), null, 8_000);
      if (!result) throw new Error('AUTH_UNAVAILABLE');
      if (result.error) {
        if (result.error.name === 'AuthSessionMissingError') return null;
        throw new Error('AUTH_UNAVAILABLE');
      }
      const user = result.data.user;
      return user ? { accountId: user.id, allowed: !user.is_anonymous && !!user.email && ownerEmails().length > 0
        && !isOwnerEmail(user.email) && hasTouchLineArenaAccess(user) } : null;
    },
    target: async (publicId, actorId) => {
      const result = await getAdmin().rpc('touchline_people_directory_candidates', { p_viewer: actorId }).abortSignal(AbortSignal.timeout(10_000));
      if (result.error || !Array.isArray(result.data) || result.data.length > 10_000) throw new Error('PEOPLE_UNAVAILABLE');
      const ids = new Set<string>(), accounts = new Set<string>(); let target: string | null = null;
      for (const value of result.data) {
        if (!marketObject(value) || !publicOwnerId(value.accountId)) throw new Error('PEOPLE_UNAVAILABLE');
        const profile = parsePublicOwnerProfile(value);
        if (!profile || ids.has(profile.publicId) || accounts.has(value.accountId)) throw new Error('PEOPLE_UNAVAILABLE');
        ids.add(profile.publicId); accounts.add(value.accountId);
        if (profile.publicId.toLowerCase() === publicId.toLowerCase()) target = value.accountId;
      }
      return target;
    },
    snapshot: async (actorId) => {
      const db = getAdmin(), signal = AbortSignal.timeout(10_000);
      const config = await db.from('touchline_fantasy_configs').select('season_id').eq('competition_key', 'england').eq('status', 'active').abortSignal(signal).single();
      if (config.error || !publicOwnerId(config.data?.season_id)) throw new Error('CLUB_STORAGE_UNAVAILABLE');
      const seasonId = config.data.season_id;
      // Only the authenticated caller's collection is read; no target wallet,
      // contract, non-listed squad or private photo is selected or projected.
      const collection = await resolveServerReadWithin(createClubCollectionStore(db).read(actorId, seasonId).then(state => ({ state })), null, 10_000);
      if (!collection) throw new Error('CLUB_STORAGE_UNAVAILABLE');
      const state = collection.state;
      if (!state || state.players.length !== 35) throw new Error('CLUB_COMPLETE_ROSTER_REQUIRED');
      const result = await db.rpc('touchline_club_exchange_discovery', { p_actor: actorId, p_season: seasonId }).abortSignal(signal);
      if (result.error) throw new Error('CLUB_STORAGE_UNAVAILABLE');
      const discovery = parseExchangeDiscovery(result.data, { ready: true, accountId: actorId, seasonId, collectionRevision: state.revision });
      if (!discovery || signal.aborted) throw new Error('CLUB_CONTEXT_CHANGED');
      return { seasonId, plan: state.plan, discovery };
    },
    propose: async (actorId, targetId, c) => {
      const result = await getAdmin().rpc('touchline_club_exchange_propose', { p_actor: actorId, p_season: c.seasonId,
        p_id: c.proposalId, p_other: targetId, p_out: c.outgoingPlayerId, p_in: c.incomingPlayerId,
        p_actor_revision: c.expectedRevision, p_other_revision: c.otherExpectedRevision }).abortSignal(AbortSignal.timeout(12_000));
      if (result.error) throw new Error(result.error.message.match(/\bCLUB_[A-Z_]+\b/)?.[0] ?? 'CLUB_STORAGE_UNAVAILABLE');
      return result.data;
    },
  };
}
