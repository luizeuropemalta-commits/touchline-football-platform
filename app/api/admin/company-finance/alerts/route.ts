import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { alertUuid,parseCompanyAlertRun,readAlertJson,runCompanyAdminAlertJob } from "@/lib/admin/company-alert-job";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
async function authorize(){const client=await createClient();if(!client)return null;const {data:{user},error}=await client.auth.getUser();return !error&&user&&hasTouchLineArenaAccess(user)&&isOwnerEmail(user.email)?user:null;}
export async function GET(request:NextRequest){try{
 if(!await authorize())return reply({error:"FORBIDDEN"},403);
 const raw=request.nextUrl.searchParams.get("page")??"0";if(!/^\d{1,5}$/.test(raw))return reply({error:"INVALID_INPUT"},400);
 const page=Number(raw),admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);
 const query=admin.from("touchline_company_admin_alerts").select("*").order("created_at",{ascending:false}).order("id",{ascending:true});
 if(request.nextUrl.searchParams.get("unread")==="true")query.is("read_at",null);
 const result=await query.range(page*50,page*50+50);if(result.error)return reply({error:"UNAVAILABLE"},503);
 return reply({alerts:result.data?.slice(0,50)??[],hasNext:(result.data?.length??0)>50});
}catch{return reply({error:"UNAVAILABLE"},503);}}
export async function POST(request:NextRequest){try{
 const user=await authorize();if(!user)return reply({error:"FORBIDDEN"},403);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"INVALID_ORIGIN"},403);
 let action:string,id:string|undefined,input:ReturnType<typeof parseCompanyAlertRun>|undefined;
 try{const value=await readAlertJson(request);if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_INPUT");const body=value as Record<string,unknown>;
  if(body.action==="run"){action="run";input=parseCompanyAlertRun(body);}else if(body.action==="read"){action="read";id=alertUuid(body.alertId);}else throw Error("INVALID_INPUT");
 }catch{return reply({error:"INVALID_INPUT"},400);}
 const admin=createAdminClient();if(!admin)return reply({error:"UNAVAILABLE"},503);
 if(action==="run"&&input){const result=await runCompanyAdminAlertJob(admin,input);if(result.error||!result.data)return reply({error:"RUN_FAILED"},503);return reply({result:result.data});}
 const result=await admin.rpc("touchline_company_mark_admin_alert_read",{p_alert_id:id,p_actor_id:user.id});
 if(result.error)return reply({error:"READ_FAILED"},503);
 if(!result.data)return reply({error:"NOT_FOUND"},404);
 if(result.data.id!==id||typeof result.data.read_at!=="string"||!Number.isFinite(Date.parse(result.data.read_at)))return reply({error:"READ_FAILED"},503);
 return reply({alert:result.data});
}catch{return reply({error:"UNAVAILABLE"},503);}}
