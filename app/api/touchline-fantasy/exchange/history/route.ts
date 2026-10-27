import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {isOwnerEmail,ownerEmails} from "@/lib/admin/owner";
import {hasTouchLineArenaAccess} from "@/lib/touchlineArena/auth-access";
import {clubExchangeEnabled,readClubExchangeHistory} from "@/lib/touchlineFantasy/club-exchange-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers});
const uuid=(value:string|null)=>typeof value==="string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export async function GET(request:NextRequest){
 const origin=request.headers.get("origin");
 if(request.headers.get("sec-fetch-site")==="cross-site" || origin!==null && origin!==request.nextUrl.origin) return fail("INVALID_ORIGIN",403);
 if(!clubExchangeEnabled()) return fail("CLUB_EXCHANGE_UNAVAILABLE",503);
 const expectedAccountId=request.headers.get("X-Touchline-Account"),expectedSeasonId=request.nextUrl.searchParams.get("expectedSeasonId");
 if(!uuid(expectedAccountId)||!uuid(expectedSeasonId)) return fail("INVALID_REQUEST",400);
 try{
  const client=await createClient();
  const {data,error}=client?await client.auth.getUser():{data:{user:null},error:null};
  if(error||!data.user) return fail("AUTH_REQUIRED",401);
  if(!ownerEmails().length||!data.user.email||isOwnerEmail(data.user.email)||!hasTouchLineArenaAccess(data.user)) return fail("CLUB_ACCESS_REQUIRED",403);
  if(expectedAccountId!==data.user.id) return fail("CLUB_CONTEXT_CHANGED",409);
  const admin=createAdminClient();if(!admin) return fail("CLUB_STORAGE_UNAVAILABLE",503);
  const config=await admin.from("touchline_fantasy_configs").select("season_id").eq("competition_key","england").eq("status","active").single();
  if(config.error||!config.data?.season_id) return fail("CLUB_SEASON_UNAVAILABLE",503);
  if(expectedSeasonId!==config.data.season_id) return fail("CLUB_CONTEXT_CHANGED",409);
  const history=await readClubExchangeHistory(admin,data.user.id,expectedSeasonId!);
  return NextResponse.json({ok:true,history},{headers});
 }catch{return fail("CLUB_STORAGE_UNAVAILABLE",503);}
}
