import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { readCompanyJson } from "@/lib/admin/company-finance-api";
import { documentUuid } from "@/lib/admin/company-documents";
import { companyMailStore, connectCompanyMailbox } from "@/lib/admin/company-mail-store";
import { ingestCompanyMailPage } from "@/lib/admin/company-mail-intake";
export const dynamic="force-dynamic";
export const maxDuration=300;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
async function authorize(){const client=await createClient();if(!client)return null;const {data:{user},error}=await client.auth.getUser();return !error&&hasTouchLineArenaAccess(user)&&isOwnerEmail(user?.email)?user:null;}
export async function GET(request:NextRequest){
 try{
  if(!await authorize())return reply({error:"FORBIDDEN"},403);
  const admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);
  const kind=request.nextUrl.searchParams.get("kind")??"evidence";
  const fields={evidence:"id,mailbox_id,message_id,received_at,subject,sender,plain_text,checksum,category,reviews:touchline_company_mail_reviews(action,created_at)",scans:"id,mailbox_id,query,revision,completed,updated_at",retries:"scan_id,message_id,code,attempts,resolved_at,updated_at"} as const;
  if(!(kind in fields))return reply({error:"INVALID_INPUT"},400);
  const raw=request.nextUrl.searchParams.get("page")??"0";
  if(!/^\d{1,5}$/.test(raw))return reply({error:"INVALID_INPUT"},400);
  const page=Number(raw),key=kind as keyof typeof fields;
  const table=key==="evidence"?"touchline_company_mail_evidence":`touchline_company_mail_${key}`;
  const query=admin.from(table).select(fields[key]).order(key==="evidence"?"id":key==="scans"?"id":"scan_id",{ascending:true});
  if(key==="evidence")query.order("created_at",{ascending:false,referencedTable:"reviews"}).order("id",{ascending:false,referencedTable:"reviews"}).limit(1,{referencedTable:"reviews"});
  if(key==="retries")query.order("message_id",{ascending:true});
  const result=await query.range(page*20,page*20+20);
  if(result.error)return reply({error:"UNAVAILABLE"},503);
  const rows=(result.data?.slice(0,20)??[]).map(value=>{const row=value as unknown as Record<string,unknown>;if(key!=="evidence")return row;
   const {reviews,...rest}=row;
   if(reviews!=null&&(!Array.isArray(reviews)||reviews.length>1))throw Error("INVALID_REVIEW_RESULT");
   const latest=Array.isArray(reviews)?reviews[0]:null;
   return {...rest,review_action:latest?.action??null,plain_text:typeof row.plain_text==="string"?row.plain_text.slice(0,16384):""};});
  return reply({rows,hasNext:(result.data?.length??0)>20,page});
 }catch{return reply({error:"UNAVAILABLE"},503);}
}
export async function POST(request:NextRequest){
 try{
  const user=await authorize();if(!user)return reply({error:"FORBIDDEN"},403);
  if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"INVALID_ORIGIN"},403);
  const input=await readCompanyJson(request);
  if(!input||typeof input!=="object"||Array.isArray(input))return reply({error:"INVALID_INPUT"},400);
  const body=input as Record<string,unknown>;
  if(body.action==="review"){
   const command=body.command;
   if(!command||typeof command!=="object"||Array.isArray(command))return reply({error:"INVALID_INPUT"},400);
   const c=command as Record<string,unknown>;let clean;
   try{
    if(!["LINK","IGNORE"].includes(String(c.action))||typeof c.note!=="string"||!c.note.trim()||c.note.length>2000)throw Error("invalid");
    if(c.action==="LINK"&&!["contracts","obligations","settlements"].includes(String(c.kind)))throw Error("invalid");
    clean={requestId:documentUuid(typeof c.requestId==="string"?c.requestId:null),evidenceId:documentUuid(typeof c.evidenceId==="string"?c.evidenceId:null),action:c.action,note:c.note.trim(),kind:c.action==="LINK"?c.kind:null,targetId:c.action==="LINK"?documentUuid(typeof c.targetId==="string"?c.targetId:null):null};
   }catch{return reply({error:"INVALID_INPUT"},400);}
   const admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);
   const reviewed=await admin.rpc("touchline_company_review_mail",{p_command:clean,p_actor_id:user.id});
   if(reviewed.error)return reply({error:"REVIEW_NOT_CONFIRMED"},503);
   return reply({review:reviewed.data});
  }
  if(body.action!=="run"||typeof body.scanId!=="string")return reply({error:"INVALID_INPUT"},400);
  let scanId:string;try{scanId=documentUuid(body.scanId);}catch{return reply({error:"INVALID_INPUT"},400);}
  const admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);
  const result=await ingestCompanyMailPage(scanId,companyMailStore(admin),id=>connectCompanyMailbox(admin,id));
  return reply({result});
 }catch{return reply({error:"IMPORT_NOT_CONFIRMED"},503);}
}
