import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseCompanyAlertRun,readAlertJson,runCompanyAdminAlertJob } from "@/lib/admin/company-alert-job";
import { timingSafeEqual } from "node:crypto";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function POST(request:NextRequest){
 const expected=process.env.TOUCHLINE_COMPANY_ALERT_JOB_SECRET,provided=request.headers.get("x-touchline-job-secret");
 if(!expected||!provided||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return reply({error:"FORBIDDEN"},403);
 let input:ReturnType<typeof parseCompanyAlertRun>;try{input=parseCompanyAlertRun(await readAlertJson(request,2048));}catch{return reply({error:"INVALID_INPUT"},400);}
 try{const admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);const result=await runCompanyAdminAlertJob(admin,input);if(result.error||!result.data)return reply({error:"RUN_FAILED"},503);return reply({result:result.data});}catch{return reply({error:"UNAVAILABLE"},503);}
}
export function GET(){return reply({error:"METHOD_NOT_ALLOWED"},405);}
