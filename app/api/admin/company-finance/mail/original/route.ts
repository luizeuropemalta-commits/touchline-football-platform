import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/admin/owner";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { documentUuid } from "@/lib/admin/company-documents";
import { createHash } from "node:crypto";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function GET(request:NextRequest){
 try{
  const client=await createClient();if(!client)return NextResponse.json({error:"FORBIDDEN"},{status:403,headers});
  const {data:{user},error}=await client.auth.getUser();
  if(error||!hasTouchLineArenaAccess(user)||!isOwnerEmail(user?.email))return NextResponse.json({error:"FORBIDDEN"},{status:403,headers});
  let id:string;try{id=documentUuid(request.nextUrl.searchParams.get("id"));}catch{return NextResponse.json({error:"INVALID_INPUT"},{status:400,headers});}
  const admin=createAdminClient();if(!admin)throw Error("unavailable");
  const result=await admin.from("touchline_company_mail_evidence").select("original,checksum").eq("id",id).maybeSingle();
  if(result.error)throw Error("unavailable");if(!result.data)return NextResponse.json({error:"NOT_FOUND"},{status:404,headers});
  const value=result.data.original;
  if(typeof value!=="string"||value.length<4||value.length>4194306||value.length%2!==0||!value.startsWith("\\x")||/[^0-9a-f]/i.test(value.slice(2)))throw Error("invalid");
  const bytes=Buffer.from(value.slice(2),"hex");
  if(createHash("sha256").update(bytes).digest("hex")!==result.data.checksum)throw Error("invalid");
  return new Response(bytes,{headers:{...headers,"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="message-${id}.eml"`}});
 }catch{return NextResponse.json({error:"UNAVAILABLE"},{status:503,headers});}
}
