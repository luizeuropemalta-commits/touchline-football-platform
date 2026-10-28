import type { SupabaseClient } from "@supabase/supabase-js";

export function alertUuid(value: unknown): string {
 if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw Error("INVALID_INPUT");
 return value.toLowerCase();
}
export function parseCompanyAlertRun(value: unknown) {
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_INPUT");
 const input=value as Record<string,unknown>, runId=alertUuid(input.runId), today=input.today;
 if(typeof today!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(today)||!Number.isFinite(Date.parse(today+"T00:00:00Z"))||new Date(today+"T00:00:00Z").toISOString().slice(0,10)!==today)throw Error("INVALID_INPUT");
 const horizonDays=input.horizonDays??30;
 if(typeof horizonDays!=="number"||!Number.isInteger(horizonDays)||horizonDays<0||horizonDays>366)throw Error("INVALID_INPUT");
 return {runId,today,horizonDays};
}
export async function readAlertJson(request:Request,limit=4096) {
 if(request.headers.get("content-type")?.split(";",1)[0].toLowerCase()!=="application/json")throw Error("INVALID_INPUT");
 if(Number(request.headers.get("content-length"))>limit||!request.body)throw Error("BODY_LIMIT");
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let length=0;
 const deadline=Date.now()+10000;
 try{for(;;){let timer:ReturnType<typeof setTimeout>|undefined;let chunk:ReadableStreamReadResult<Uint8Array>;
  try{chunk=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("READ_TIMEOUT")),Math.max(0,deadline-Date.now()));})]);}finally{if(timer)clearTimeout(timer);}
  if(chunk.done)break;length+=chunk.value.byteLength;if(length>limit)throw Error("BODY_LIMIT");parts.push(chunk.value);
 }}catch(error){void reader.cancel().catch(()=>undefined);throw error;}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}
/** Database gate is OFF by default; this adapter never sends messages. */
export async function runCompanyAdminAlertJob(admin:SupabaseClient,input:{runId:string;today:string;horizonDays?:number}) {
 const parsed=parseCompanyAlertRun(input);
 return admin.rpc("touchline_company_generate_admin_alerts",{p_run_id:parsed.runId,p_today:parsed.today,p_horizon_days:parsed.horizonDays});
}
