import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyMailIntakeStore, MailScan } from "./company-mail-intake.ts";
import { createCompanyGmailReader } from "./company-mail-gmail.ts";

export function companyMailStore(admin: SupabaseClient): CompanyMailIntakeStore {
 return {
  async scan(scanId) {
   const result=await admin.rpc("touchline_company_claim_mail_scan",{p_scan_id:scanId});
   if(result.error||!result.data)throw Error("MAIL_SCAN_UNAVAILABLE");
   const row=result.data;
   if(typeof row.enabled!=="boolean")throw Error("MAIL_SCAN_UNAVAILABLE");
   return row as MailScan;
  },
  async commit(page) {
   const result=await admin.rpc("touchline_company_commit_mail_page",{p_page:page});
   if(result.error||!["APPLIED","STALE"].includes(result.data))throw Error("MAIL_COMMIT_UNCONFIRMED");
   return result.data as "APPLIED"|"STALE";
  },
 };
}
/** Only an explicit, private configuration row can select server-side credentials. */
export async function connectCompanyMailbox(admin: SupabaseClient,mailboxId:string) {
 const result=await admin.from("touchline_company_mailboxes").select("email,credential_key,enabled").eq("id",mailboxId).single();
 if(result.error||!result.data)throw Error("MAIL_CONNECTION_REQUIRED");
 const row=result.data;
 if(!row.enabled)throw Error("MAIL_DISABLED");
 if(typeof row.credential_key!=="string"||!/^[A-Z][A-Z0-9_]{0,39}$/.test(row.credential_key))throw Error("MAIL_CONNECTION_REQUIRED");
 const prefix=`TOUCHLINE_COMPANY_GMAIL_${row.credential_key}_`;
 return createCompanyGmailReader({expectedEmail:row.email,
  clientId:process.env[`${prefix}CLIENT_ID`]??"",clientSecret:process.env[`${prefix}CLIENT_SECRET`]??"",
  refreshToken:process.env[`${prefix}REFRESH_TOKEN`]??""});
}
