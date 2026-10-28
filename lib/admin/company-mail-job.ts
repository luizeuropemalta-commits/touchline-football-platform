import type { SupabaseClient } from "@supabase/supabase-js";
import { companyMailStore,connectCompanyMailbox } from "./company-mail-store.ts";
import { ingestCompanyMailPage } from "./company-mail-intake.ts";
export async function runCompanyMailJob(admin:SupabaseClient){
 const enqueue=await admin.rpc("touchline_company_enqueue_mail_scans");
 if(enqueue.error)throw Error("MAIL_QUEUE_UNAVAILABLE");
 const due=new Date(Date.now()-15*60_000).toISOString();
 const retry=await admin.from("touchline_company_mail_retries").select("scan_id,message_id,scan:touchline_company_mail_scans!inner(mailbox_id,mailbox:touchline_company_mailboxes!inner(enabled))").eq("scan.mailbox.enabled",true).is("resolved_at",null).lte("updated_at",due).order("updated_at",{ascending:true}).limit(1).maybeSingle();
 if(retry.error)throw Error("MAIL_RETRY_UNAVAILABLE");
 let retryState="NONE";
 if(retry.data){
  const row=retry.data,scan=Array.isArray(row.scan)?row.scan[0]:row.scan;
  if(!scan?.mailbox_id)throw Error("MAIL_RETRY_UNAVAILABLE");
  const claim=await admin.rpc("touchline_company_claim_mail_retry",{p_scan_id:row.scan_id,p_message_id:row.message_id});
  if(claim.error)throw Error("MAIL_RETRY_UNAVAILABLE");
  retryState=String(claim.data);
  if(claim.data==="CLAIMED"){
  let evidence=null,failure:string|null=null;
  try{const reader=await connectCompanyMailbox(admin,scan.mailbox_id);evidence=await reader.message(row.message_id);}
  catch(error){failure=error instanceof Error&&/^MAIL_[A-Z_0-9]{1,80}$/.test(error.message)?error.message:"MAIL_READ_FAILED";}
  const saved=await admin.rpc("touchline_company_retry_mail",{p_scan_id:row.scan_id,p_message_id:row.message_id,p_evidence:evidence,p_failure:failure});
  if(saved.error)throw Error("MAIL_RETRY_UNCONFIRMED");retryState=String(saved.data);
  }
 }
 const scan=await admin.from("touchline_company_mail_scans").select("id,mailbox:touchline_company_mailboxes!inner(enabled)").eq("mailbox.enabled",true).eq("completed",false).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).order("updated_at",{ascending:true}).limit(1).maybeSingle();
 if(scan.error)throw Error("MAIL_SCAN_UNAVAILABLE");
 const page=scan.data?await ingestCompanyMailPage(scan.data.id,companyMailStore(admin),id=>connectCompanyMailbox(admin,id)):{state:"IDLE",imported:0,pending:0};
 return {page,retryState};
}
