import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clubReleaseEnabled } from "@/lib/touchlineFantasy/club-collection-server";
import { inspectClubAcquisition } from "@/lib/touchlineFantasy/club-acquisition";
import { readClubCommand } from "@/lib/touchlineFantasy/club-request";
import { parseClubCommandAuthority, clubCommandMatchesAuthority } from "@/lib/touchlineFantasy/club-command-authority";
import { parseClubReleaseCommand, isClubReleaseReceipt } from "@/lib/touchlineFantasy/club-release";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers});

export async function POST(request:NextRequest) {
  if(request.headers.get("origin")!==request.nextUrl.origin)return fail("INVALID_ORIGIN",403);
  if(!clubReleaseEnabled())return fail("CLUB_RELEASE_UNAVAILABLE",503);
  try {
    const client=await createClient();
    const {data,error}=client?await client.auth.getUser():{data:{user:null},error:null};
    if(error||!data.user)return fail("AUTH_REQUIRED",401);
    const envelope=parseClubCommandAuthority(await readClubCommand(request));
    const command=parseClubReleaseCommand(envelope?.command);
    if(!envelope||!command)return fail("INVALID_REQUEST",400);
    const admin=createAdminClient();
    if(!admin)return fail("CLUB_STORAGE_UNAVAILABLE",503);
    const {data:config,error:configError}=await admin.from("touchline_fantasy_configs").select("season_id")
      .eq("competition_key","england").eq("status","active").single();
    if(configError||!config?.season_id)return fail("CLUB_SEASON_UNAVAILABLE",503);
    if(!clubCommandMatchesAuthority(envelope.authority,data.user.id,String(config.season_id)))return fail("CLUB_CONTEXT_CHANGED",409);
    // No client balance, refund, fee or owner is accepted. One RPC owns the transaction.
    const {data:saved,error:saveError}=await admin.rpc("touchline_club_release_player",{
      p_user_id:data.user.id,p_season_id:String(config.season_id),p_command:command,
    });
    if(saveError)throw new Error(saveError.message.match(/CLUB_[A-Z_]+/)?.[0]??"CLUB_STORAGE_UNAVAILABLE");
    if(!saved?.state||saved.state.seasonId!==String(config.season_id)
      ||!isClubReleaseReceipt(saved.receipt, command)
      ||typeof saved.replayed!=="boolean")return fail("CLUB_STORAGE_UNAVAILABLE",503);
    // The RPC may have committed. A malformed success snapshot is ambiguous,
    // not an atomic rejection; retain the command for exact reconciliation.
    try { inspectClubAcquisition(saved.state); }
    catch { return fail("CLUB_STORAGE_UNAVAILABLE",503); }
    return NextResponse.json({ok:true,...saved},{headers});
  } catch(error) {
    const code=error instanceof Error?error.message.match(/^CLUB_[A-Z_]+$/)?.[0]:null;
    if (code === "CLUB_RELEASE_RECEIPT_REQUIRED") return fail("CLUB_STORAGE_UNAVAILABLE",503);
    return fail(code??"CLUB_STORAGE_UNAVAILABLE",!code||code.includes("UNAVAILABLE")?503:409);
  }
}
