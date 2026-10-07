import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushRehearsalDependencies } from './push-rehearsal-handler.ts';
import { parseTouchlineDeviceRegistration } from './push-device-contract.ts';
import { touchlinePushSubscriptionFingerprint } from './push-subscription-fingerprint.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid=(value:unknown):value is string=>typeof value==='string'&&UUID.test(value);
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
type Store=Pick<PushRehearsalDependencies,'loadOwnedDevice'|'reserve'|'finish'>;

/** Create once per authenticated request with a server-only service client.
 * The snapshot is merely an exact binding witness sent to the atomic RPC;
 * this map is NOT an in-memory reservation or deduplication authority.
 * Never expose this client or raw subscriptions to the browser.
 */
export function createPushRehearsalStore(client:Pick<SupabaseClient,'from'|'rpc'>):Store {
  const snapshots=new Map<string,{deviceId:string;fingerprint:string;subscription:unknown}>();
  const key=(actor:string,installation:string)=>`${actor}:${installation}`;
  return {
    async loadOwnedDevice(actorId,installationId,signal){
      snapshots.delete(key(actorId,installationId));
      signal.throwIfAborted();
      let response;
      try {
        response=await client.from('notification_devices').select('id,user_id,installation_id,permission,push_subscription')
          .eq('user_id',actorId).eq('installation_id',installationId).abortSignal(signal).maybeSingle();
      } catch { throw new Error('device-read-unconfirmed'); }
      signal.throwIfAborted();
      if(response.error) throw new Error('device-read-unconfirmed');
      const row=record(response.data);
      if(!row||!uuid(row.id)||!uuid(row.user_id)||!uuid(row.installation_id)
        ||row.user_id.toLowerCase()!==actorId||row.installation_id.toLowerCase()!==installationId) return null;
      const registration=parseTouchlineDeviceRegistration({installationId,permission:row.permission,subscription:row.push_subscription});
      if(!registration||registration.permission!=='granted'||!registration.subscription) return null;
      const fingerprint=touchlinePushSubscriptionFingerprint(registration);
      if(!fingerprint) return null;
      const deviceId=row.id.toLowerCase();
      // Preserve exact JSON for SQL equality, even if legacy metadata was
      // ignored by the public subscription parser. Never log this witness.
      snapshots.set(key(actorId,installationId),{deviceId,fingerprint,subscription:structuredClone(row.push_subscription)});
      return {ownerId:actorId,deviceId,registration};
    },
    async reserve(input,signal){
      if(signal.aborted) return {status:'unknown'};
      const snapshot=snapshots.get(key(input.actorId,input.installationId));
      if(!snapshot||snapshot.deviceId!==input.deviceId||snapshot.fingerprint!==input.fingerprint) return {status:'unavailable'};
      try {
        const response=await client.rpc('touchline_reserve_push_rehearsal',{
          p_actor:input.actorId,p_request:input.requestId,p_installation:input.installationId,p_device:input.deviceId,
          p_fingerprint:input.fingerprint,p_subscription:snapshot.subscription,p_expires_at:input.expiresAt,
        }).abortSignal(signal);
        if(signal.aborted||response.error) return {status:'unknown'};
        const row=record(response.data);
        if(row?.status==='duplicate'||row?.status==='cooldown'||row?.status==='unavailable') return {status:row.status};
        if(row?.status!=='reserved'||!uuid(row.reservationId)||typeof row.expiresAt!=='string') return {status:'unknown'};
        for(const field of ['actorId','requestId','installationId','deviceId','fingerprint'] as const) {
          if(row[field]!==input[field]) return {status:'unknown'};
        }
        const returned=Date.parse(row.expiresAt),expected=Date.parse(input.expiresAt);
        if(!Number.isFinite(returned)||!Number.isFinite(expected)||returned!==expected) return {status:'unknown'};
        return {status:'reserved',reservationId:row.reservationId,...input,expiresAt:new Date(returned).toISOString()};
      } catch { return {status:'unknown'}; }
    },
    async finish(input,signal){
      if(signal.aborted) return false;
      try {
        const response=await client.rpc('touchline_finish_push_rehearsal',{
          p_reservation:input.reservationId,p_actor:input.actorId,p_request:input.requestId,p_outcome:input.outcome,
        }).abortSignal(signal);
        return !signal.aborted&&!response.error&&response.data===true;
      } catch { return false; }
    },
  };
}
