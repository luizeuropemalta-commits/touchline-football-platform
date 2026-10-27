import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {isOwnerEmail,ownerEmails} from "@/lib/admin/owner";
import {hasTouchLineArenaAccess} from "@/lib/touchlineArena/auth-access";
import {readClubCommand} from "@/lib/touchlineFantasy/club-request";
import {clubExchangeEnabled,readClubExchangeDiscovery} from "@/lib/touchlineFantasy/club-exchange-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers});
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const revision=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>=0;
export async function POST(request:NextRequest){
 if(request.headers.get("origin")!==request.nextUrl.origin) return fail("INVALID_ORIGIN",403);
 if(!clubExchangeEnabled()) return fail("CLUB_EXCHANGE_UNAVAILABLE",503);
 try{
  const body:unknown=await readClubCommand(request);
  if(!object(body)||!uuid(body.expectedAccountId)||!uuid(body.expectedSeasonId)||!object(body.command)
   ||Object.keys(body).some(k=>!["expectedAccountId","expectedSeasonId","command"].includes(k))) return fail("INVALID_REQUEST",400);
  const c=body.command;
  const listing=c.action==="list"||c.action==="unlist";
  const proposal=c.action==="propose";
  const resolve=["accept","decline","cancel","expire"].includes(String(c.action));
  const keys=listing?["action","playerId"]:proposal?["action","proposalId","otherAccountId","outgoingPlayerId","incomingPlayerId","expectedRevision","otherExpectedRevision"]:["action","proposalId"];
  if(!(listing||proposal||resolve)||Object.keys(c).some(k=>!keys.includes(k))
   ||listing&&!uuid(c.playerId)||!listing&&!uuid(c.proposalId)
   ||proposal&&(!uuid(c.otherAccountId)||!uuid(c.outgoingPlayerId)||!uuid(c.incomingPlayerId)||!revision(c.expectedRevision)||!revision(c.otherExpectedRevision))) return fail("INVALID_REQUEST",400);
  const client=await createClient();const {data,error}=client?await client.auth.getUser():{data:{user:null},error:null};
  if(error||!data.user) return fail("AUTH_REQUIRED",401);
  if(!ownerEmails().length||!data.user.email||isOwnerEmail(data.user.email)||!hasTouchLineArenaAccess(data.user)) return fail("CLUB_ACCESS_REQUIRED",403);
  if(body.expectedAccountId!==data.user.id) return fail("CLUB_CONTEXT_CHANGED",409);
  const admin=createAdminClient();if(!admin)return fail("CLUB_STORAGE_UNAVAILABLE",503);
  // Existing proposals retain their original season. SQL checks eligibility for
  // a fresh acceptance; cancellation, expiry and durable replay survive rollover.
  if(listing||proposal){
   const config=await admin.from("touchline_fantasy_configs").select("season_id").eq("competition_key","england").eq("status","active").single();
   if(config.error||!config.data?.season_id)return fail("CLUB_SEASON_UNAVAILABLE",503);
   if(config.data.season_id!==body.expectedSeasonId)return fail("CLUB_CONTEXT_CHANGED",409);
  }
  const common={p_actor:data.user.id,p_season:body.expectedSeasonId};
  const result=listing?await admin.rpc("touchline_club_exchange_listing",{...common,p_player:c.playerId,p_publish:c.action==="list"})
   :proposal?await admin.rpc("touchline_club_exchange_propose",{...common,p_id:c.proposalId,p_other:c.otherAccountId,p_out:c.outgoingPlayerId,p_in:c.incomingPlayerId,p_actor_revision:c.expectedRevision,p_other_revision:c.otherExpectedRevision})
   :await admin.rpc("touchline_club_exchange_resolve",{...common,p_id:c.proposalId,p_action:c.action});
  if(result.error){const code=result.error.message.match(/\bCLUB_[A-Z_]+\b/)?.[0];return fail(code??"CLUB_STORAGE_UNAVAILABLE",code?409:503);}
  if(!object(result.data)||result.data.ok!==true)return fail("CLUB_STORAGE_UNAVAILABLE",503);
  // Bilateral receipts contain both private wallets; only history projects the
  // caller's perspective. Mutation responses acknowledge scope, never wallets.
  const scope={accountId:data.user.id,seasonId:body.expectedSeasonId};
  if(listing)return NextResponse.json({ok:true,...scope,playerId:result.data.playerId,listed:result.data.listed},{headers});
  if(typeof result.data.replayed!=="boolean")return fail("CLUB_STORAGE_UNAVAILABLE",503);
  if(c.action==="accept" && (!object(result.data.receipt)||result.data.receipt.tradeId!==c.proposalId
   ||result.data.receipt.seasonId!==body.expectedSeasonId||!object(result.data.receipt.accepter)
   ||result.data.receipt.accepter.accountId!==data.user.id))return fail("CLUB_STORAGE_UNAVAILABLE",503);
  const response={ok:true,...scope,proposalId:c.proposalId,status:result.data.status,replayed:result.data.replayed};
  return NextResponse.json(proposal?{...response,terms:result.data.terms}:response,{headers});
 }catch{return fail("CLUB_STORAGE_UNAVAILABLE",503);}
}

/** Read discovery without changing reservations, wallet or proposal status. */
export async function GET(request:NextRequest){
 const origin=request.headers.get("origin");
 if(request.headers.get("sec-fetch-site")==="cross-site"||origin!==null&&origin!==request.nextUrl.origin)return fail("INVALID_ORIGIN",403);
 if(!clubExchangeEnabled())return fail("CLUB_EXCHANGE_UNAVAILABLE",503);
 const expectedAccountId=request.headers.get("X-Touchline-Account"),expectedSeasonId=request.nextUrl.searchParams.get("expectedSeasonId");
 if(!uuid(expectedAccountId)||!uuid(expectedSeasonId))return fail("INVALID_REQUEST",400);
 try{
  const client=await createClient();const {data,error}=client?await client.auth.getUser():{data:{user:null},error:null};
  if(error||!data.user)return fail("AUTH_REQUIRED",401);
  if(!ownerEmails().length||!data.user.email||isOwnerEmail(data.user.email)||!hasTouchLineArenaAccess(data.user))return fail("CLUB_ACCESS_REQUIRED",403);
  if(expectedAccountId!==data.user.id)return fail("CLUB_CONTEXT_CHANGED",409);
  const admin=createAdminClient();if(!admin)return fail("CLUB_STORAGE_UNAVAILABLE",503);
  const config=await admin.from("touchline_fantasy_configs").select("season_id").eq("competition_key","england").eq("status","active").single();
  if(config.error||!config.data?.season_id)return fail("CLUB_SEASON_UNAVAILABLE",503);
  if(expectedSeasonId!==config.data.season_id)return fail("CLUB_CONTEXT_CHANGED",409);
  const discovery=await readClubExchangeDiscovery(admin,data.user.id,expectedSeasonId);
  return NextResponse.json({ok:true,discovery},{headers});
 }catch{return fail("CLUB_STORAGE_UNAVAILABLE",503);}
}
