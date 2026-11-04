import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {resolveClubSeasonPaymentConfiguration} from './club-season-configuration.server';
import type {ClubSeasonCheckoutOffers} from './club-season-checkout-client';
/** Customer-specific read, never a browser-controlled quote or cached globally. */
export async function readClubSeasonCheckoutOffers(ownerId:string):Promise<ClubSeasonCheckoutOffers> {
 const resolved=resolveClubSeasonPaymentConfiguration('create');
 if(!resolved.ok || !resolved.config.profile) return {};
 const {profile}=resolved.config;
 const admin=createAdminClient();if(!admin) return {};
 try {
  const quote=profile.mode==='test'
   ? admin.rpc('touchline_club_quote_season_test_plans',{p_user_id:ownerId})
   : admin.rpc('touchline_club_quote_season_plans',{p_user_id:ownerId,p_profile_id:profile.profileId});
  const {data,error}=await quote.abortSignal(AbortSignal.timeout(3000));
  if(error || !data || typeof data!=='object' || Array.isArray(data)) return {};
  const offers:ClubSeasonCheckoutOffers={};
  for(const plan of ['standard','master','vip'] as const) {
   const value=data[plan]?.amountMinor;
   if(typeof value==='number' && Number.isSafeInteger(value) && value>0) offers[plan]={amountMinor:value,...(profile.mode==='live'?{paymentMode:'live' as const}:{})};
  }
  return offers;
 } catch {return {};}
}
