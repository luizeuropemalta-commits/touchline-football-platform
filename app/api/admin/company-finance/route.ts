import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { companyKinds, parseCompanyCommand, companyReplayMatches, readCompanyJson } from "@/lib/admin/company-finance-api";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
async function authorize(){const session=await createClient();if(!session)return null;const {data:{user},error}=await session.auth.getUser();return !error&&hasTouchLineArenaAccess(user)&&isOwnerEmail(user?.email)?user:null;}
export async function GET(request:NextRequest){
 try{
  if(!await authorize())return reply({error:"FORBIDDEN"},403);
  const kind=request.nextUrl.searchParams.get("kind")??"suppliers",raw=request.nextUrl.searchParams.get("page")??"0",page=Number(raw);
  if(!companyKinds.includes(kind as typeof companyKinds[number])||!/^\d+$/.test(raw)||!Number.isSafeInteger(page)||page>10000)return reply({error:"INVALID_INPUT"},400);
  const admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);
  const {data,error}=await admin.from(`touchline_company_${kind}`).select("*").order("id",{ascending:true}).range(page*50,page*50+50);
  if(error)return reply({error:"UNAVAILABLE"},503);
  return reply({rows:(data??[]).slice(0,50),hasNext:(data?.length??0)>50,page,kind});
 }catch{return reply({error:"UNAVAILABLE"},503);}
}
export async function POST(request:NextRequest){
 try{
  const user=await authorize();if(!user)return reply({error:"FORBIDDEN"},403);
  if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"INVALID_ORIGIN"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return reply({error:"INVALID_INPUT"},400);
  let command;try{command=parseCompanyCommand(await readCompanyJson(request),user.id,new Date().toISOString().slice(0,10));}catch{return reply({error:"INVALID_INPUT"},400);}
  const admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);
  if(command.kind==="settlements"){
   const row=command.row as Record<string,unknown>;
   const {data,error}=await admin.rpc("touchline_company_record_settlement",{p_request_id:row.id,p_obligation_id:row.obligation_id,p_currency:row.currency,p_unit_exponent:row.unit_exponent,p_amount_minor:row.amount_minor,p_paid_on:row.paid_on,p_source:row.source,p_source_reference:row.source_reference,p_actor_id:user.id});
   if(error)return reply({error:"RECORD_NOT_CONFIRMED"},["23505","23503","40001","22023","23514"].includes(error.code??"")?409:503);
   return reply({record:data});
  }
  const table=`touchline_company_${command.kind}`,row=command.row as Record<string,unknown>;
  const before=await admin.from(table).select("*").eq("id",row.id).maybeSingle();
  if(before.error)return reply({error:"UNAVAILABLE"},503);
  if(before.data)return companyReplayMatches(before.data,row)?reply({record:before.data}):reply({error:"REQUEST_CONFLICT"},409);
  const inserted=await admin.from(table).insert(row).select("*").single();
  if(!inserted.error)return reply({record:inserted.data},201);
  if(inserted.error.code==="23505"){
   const retry=await admin.from(table).select("*").eq("id",row.id).maybeSingle();
   if(!retry.error&&retry.data&&companyReplayMatches(retry.data,row))return reply({record:retry.data});
   return reply({error:"REQUEST_CONFLICT"},409);
  }
  return reply({error:"RECORD_NOT_CONFIRMED"},["23503","23514","22007","22008"].includes(inserted.error.code??"")?409:503);
 }catch{return reply({error:"UNAVAILABLE"},503);}
}
