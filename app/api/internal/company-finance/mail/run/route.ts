import { NextRequest,NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCompanyMailJob } from "@/lib/admin/company-mail-job";
export const dynamic="force-dynamic";
export const maxDuration=300;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest){
 const configured=process.env.TOUCHLINE_COMPANY_MAIL_JOB_SECRET;
 const supplied=request.headers.get("x-touchline-job-secret")??"";
 if(!configured||configured.length<32||Buffer.byteLength(supplied)!==Buffer.byteLength(configured)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(configured)))return reply({error:"FORBIDDEN"},403);
 if(process.env.TOUCHLINE_COMPANY_MAIL_JOB_ENABLED!=="1")return reply({state:"DISABLED"});
 try{const admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);return reply(await runCompanyMailJob(admin));}
 catch{return reply({error:"IMPORT_NOT_CONFIRMED"},503);}
}
