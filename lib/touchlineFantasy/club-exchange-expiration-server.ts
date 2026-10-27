import "server-only";
import type {createAdminClient} from "@/lib/supabase/admin";
import {clubExchangeEnabled} from "./club-exchange-server";
export type ExchangeExpirationResult={status:"disabled"|"complete"|"partial"|"unavailable";examined:number;expired:number;skipped:number};
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
/** Existing authenticated live tick supplies this server-only invocation. Each
 * proposal gets its own RPC transaction, so locks from separate owner pairs are
 * never accumulated in an inconsistent order. No timed-out mutation is retried. */
export async function expireClubExchangeProposals(admin:NonNullable<ReturnType<typeof createAdminClient>>):Promise<ExchangeExpirationResult>{
 const result:ExchangeExpirationResult={status:"disabled",examined:0,expired:0,skipped:0};
 if(!clubExchangeEnabled())return result;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),5000);
 try{
  const rows=await admin.from("touchline_club_exchange_proposals").select("id,season_id,proposer_id")
   .eq("status","pending").lte("expires_at",new Date().toISOString()).order("expires_at").order("id").limit(25).abortSignal(controller.signal);
  if(rows.error||!Array.isArray(rows.data))return {...result,status:"unavailable"};
  result.status="complete";
  for(const row of rows.data){
   if(controller.signal.aborted){result.status="partial";break;}
   if(!uuid(row.id)||!uuid(row.season_id)||!uuid(row.proposer_id)){result.status="partial";continue;}
   result.examined++;
   const response=await admin.rpc("touchline_club_exchange_resolve",{p_actor:row.proposer_id,p_season:row.season_id,p_id:row.id,p_action:"expire"}).abortSignal(controller.signal);
   if(response.error){
    // A concurrent terminal result or DB clock discrepancy is not permission
    // to force expiry. All other failures are reported without account data.
    if(/\bCLUB_PROPOSAL_(?:CLOSED|NOT_EXPIRED)\b/.test(response.error.message)){result.skipped++;continue;}
    result.status="partial";break;
   }
   if(response.data?.ok!==true||response.data?.status!=="expired"||typeof response.data?.replayed!=="boolean"){result.status="partial";break;}
   if(response.data.replayed)result.skipped++;else result.expired++;
  }
  return result;
 }catch{return {...result,status:result.examined?"partial":"unavailable"};}
 finally{clearTimeout(timer);}
}
