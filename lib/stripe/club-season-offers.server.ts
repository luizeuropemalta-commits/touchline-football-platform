import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {resolveClubSeasonTestConfiguration} from './club-season-test-catalogue';
import type {ClubSeasonCheckoutOffers} from './club-season-checkout-client';
/** Customer-specific read, never a browser-controlled quote or cached globally. */
export async function readClubSeasonCheckoutOffers(ownerId:string):Promise<ClubSeasonCheckoutOffers> {
 if(!resolveClubSeasonTestConfiguration().ok) return {};
 const admin=createAdminClient();if(!admin) return {};
 try {
  const {data,error}=await admin.rpc('touchline_club_quote_season_test_plans',{p_user_id:ownerId}).abortSignal(AbortSignal.timeout(3000));
  if(error || !data || typeof data!=='object' || Array.isArray(data)) return {};
  const offers:ClubSeasonCheckoutOffers={};
  for(const plan of ['standard','master','vip'] as const) {
   const value=data[plan]?.amountMinor;
   if(typeof value==='number' && Number.isSafeInteger(value) && value>0) offers[plan]={amountMinor:value};
  }
  return offers;
 } catch {return {};}
}
