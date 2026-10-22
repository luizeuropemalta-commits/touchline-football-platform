import { NextResponse, type NextRequest } from "next/server";
import { readClubCommand } from "@/lib/touchlineFantasy/club-request";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clubCollectionEnabled, createClubCollectionStore } from "@/lib/touchlineFantasy/club-collection-server";
import { allocateClubPlayers, parseClubAllocationCommand } from "@/lib/touchlineFantasy/club-allocation";
import { loadTouchlineFantasyReadSnapshot } from "@/lib/touchlineFantasy/server";
import { clubPrimaryPositionIndex } from "@/lib/touchlineFantasy/club-primary-position-index";
import { parseClubCommandAuthority, clubCommandMatchesAuthority } from "@/lib/touchlineFantasy/club-command-authority";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers});
export async function POST(request:NextRequest) {
  if(request.headers.get("origin")!==request.nextUrl.origin)return fail("INVALID_ORIGIN",403);
  if(!clubCollectionEnabled())return fail("CLUB_COLLECTION_UNAVAILABLE",503);
  try {
  const client=await createClient();
  const {data,error:authError}=client?await client.auth.getUser():{data:{user:null},error:null};
  if(authError||!data.user)return fail("AUTH_REQUIRED",401);
  const parsed=await readClubCommand(request);
  const envelope=parseClubCommandAuthority(parsed);
  const command=parseClubAllocationCommand(envelope?.command);
  if(!envelope||!command)return fail("INVALID_REQUEST",400);
  const admin=createAdminClient();if(!admin)return fail("CLUB_STORAGE_UNAVAILABLE",503);
    const {data:config,error}=await admin.from("touchline_fantasy_configs").select("season_id").eq("competition_key","england").eq("status","active").single();
    if(error||!config?.season_id)return fail("CLUB_SEASON_UNAVAILABLE",503);
    if(!clubCommandMatchesAuthority(envelope.authority,data.user.id,String(config.season_id)))return fail("CLUB_CONTEXT_CHANGED",409);
    const state=await createClubCollectionStore(admin).read(data.user.id,String(config.season_id));
    if(!state)return fail("CLUB_COLLECTION_REQUIRED",409);
    // Resolve completed retries before recomputing a stale transition.
    const {data:prior,error:priorError}=await admin.from("touchline_club_collection_operations").select("command")
      .eq("user_id",data.user.id).eq("season_id",config.season_id).eq("idempotency_key",command.idempotencyKey).maybeSingle();
    if(priorError)return fail("CLUB_STORAGE_UNAVAILABLE",503);
    if(prior) {
      const a=Object.entries(prior.command).sort(),b=Object.entries(command).sort();
      if(JSON.stringify(a)!==JSON.stringify(b))return fail("CLUB_IDEMPOTENCY_CONFLICT",409);
      return NextResponse.json({ok:true,state,replayed:true},{headers});
    }
    const snapshot=await loadTouchlineFantasyReadSnapshot(data.user);
    if(!snapshot?.entitlementActive||snapshot.marketAccess?.planKey!==state.plan)return fail("CLUB_ACCESS_REQUIRED",403);
    const formation=command.action==="formation"?command.formationCode:state.formationCode;
    const geometry=formation?snapshot.formationRegistry[formation]:null;
    if(!geometry)return fail("CLUB_FORMATION_INVALID",409);
    const {data:reservations,error:reservationError}=await admin.from("touchline_club_player_reservations").select("player_id")
      .eq("user_id",data.user.id).eq("season_id",config.season_id);
    if(reservationError)return fail("CLUB_STORAGE_UNAVAILABLE",503);
    const round=snapshot.activeGameweek,now=Date.now();
    const next=allocateClubPlayers(state,command,{geometry,primaryDetails:clubPrimaryPositionIndex(snapshot.catalogue),reservedIds:(reservations??[]).map(r=>String(r.player_id)),
      marketOpen:snapshot.qaClubMarketOpen===true||(round?.state==="MARKET_OPEN"&&Date.parse(round.marketOpensAt)<=now&&Date.parse(round.locksAt)>now)});
    const {data:saved,error:saveError}=await admin.rpc("touchline_club_commit_allocation",{
      p_user_id:data.user.id,p_season_id:config.season_id,p_expected_revision:state.revision,p_next:next,p_command:command});
    if(saveError)throw new Error(saveError.message.match(/CLUB_[A-Z_]+/)?.[0]??"CLUB_STORAGE_UNAVAILABLE");
    return NextResponse.json({ok:true,state:saved},{headers});
  } catch(error) {
    const code=error instanceof Error?error.message.match(/^CLUB_[A-Z_]+$/)?.[0]:null;
    return fail(code??"CLUB_STORAGE_UNAVAILABLE",!code||code.includes("UNAVAILABLE")?503:409);
  }
}
