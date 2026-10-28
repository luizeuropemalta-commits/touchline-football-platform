import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseCompanyMailEvidence } from "../lib/admin/company-mail.ts";
const actor="11111111-1111-4111-8111-111111111111", mailbox="22222222-2222-4222-8222-222222222222", scan="33333333-3333-4333-8333-333333333333";
test("mail SQL preserves originals, gates writes and atomically commits cursor/retry/evidence", async t => {
 const db=new PGlite();
 try {
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
   create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
   insert into auth.users values('${actor}');set request.jwt.claim.role='service_role';`);
  await db.exec(await readFile(new URL("../supabase/migrations/20261025205533_touchline_company_finance_foundation.sql",import.meta.url),"utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261027210557_touchline_company_mail_intake.sql",import.meta.url),"utf8"));
  await db.exec(`set role service_role;insert into public.touchline_company_mailboxes(id,email,credential_key,created_by) values('${mailbox}','finance@example.test','FINANCE','${actor}');
   insert into public.touchline_company_mail_scans(id,mailbox_id,query,created_by) values('${scan}','${mailbox}','from:billing@example.test','${actor}');`);
  const evidence=parseCompanyMailEvidence({id:"one",threadId:"thread",internalDate:"1700000000000",payload:{mimeType:"text/plain",headers:[],body:{data:""}}},{id:"one",raw:Buffer.from("immutable original").toString("base64url")},"one");
  const page={scanId:scan,expectedRevision:0,expectedCursor:null,nextCursor:"next",messages:[evidence],failures:[{messageId:"bad",code:"MAIL_READ_FAILED"}]};
  const commit=(body:unknown)=>db.query(`select public.touchline_company_commit_mail_page($1::jsonb) result`,[JSON.stringify(body)]);
  await t.test("gate defaults off and cursor stays untouched",async()=>{
   await assert.rejects(commit(page),/MAIL_DISABLED/);
   assert.equal((await db.query(`select revision from public.touchline_company_mail_scans`)).rows[0].revision,0);
   await db.exec(`update public.touchline_company_mailboxes set enabled=true`);
  });
  await t.test("original, retry and cursor persisted once; replay is stale",async()=>{
   assert.equal((await commit(page)).rows[0].result,"APPLIED");
   assert.equal((await commit(page)).rows[0].result,"STALE");
   const stored=(await db.query(`select checksum,convert_from(original,'UTF8') original from public.touchline_company_mail_evidence`)).rows[0];
   assert.equal(stored.checksum,evidence.sha256);assert.equal(stored.original,"immutable original");
   assert.equal((await db.query(`select count(*)::integer n from public.touchline_company_mail_retries where resolved_at is null`)).rows[0].n,1);
  });
  await t.test("bad checksum rolls back all writes including cursor",async()=>{
   await assert.rejects(commit({...page,expectedRevision:1,expectedCursor:"next",nextCursor:null,messages:[{...evidence,messageId:"two",sha256:"0".repeat(64)}]}),/MAIL_CHECKSUM_MISMATCH/);
   assert.equal((await db.query(`select revision from public.touchline_company_mail_scans`)).rows[0].revision,1);
   assert.equal((await db.query(`select count(*)::integer n from public.touchline_company_mail_evidence`)).rows[0].n,1);
  });
  await t.test("final cursor can complete while unresolved retries remain visible",async()=>{
   await commit({...page,expectedRevision:1,expectedCursor:"next",nextCursor:null,messages:[],failures:[]});
   assert.equal((await db.query(`select completed from public.touchline_company_mail_scans`)).rows[0].completed,true);
   assert.equal((await db.query(`select count(*)::integer n from public.touchline_company_mail_retries where resolved_at is null`)).rows[0].n,1);
  });
  await t.test("retry cooldown, recovered evidence and idempotent resolution",async()=>{
   const recovered={...evidence,messageId:"bad"};
   const retry=()=>db.query(`select public.touchline_company_retry_mail($1::uuid,'bad',$2::jsonb,null) result`,[scan,JSON.stringify(recovered)]);
   assert.equal((await retry()).rows[0].result,"COOLDOWN");
   await db.exec(`reset role;update public.touchline_company_mail_retries set updated_at=now()-interval '16 minutes';set role service_role;`);
   assert.equal((await db.query(`select public.touchline_company_claim_mail_retry('${scan}','bad') value`)).rows[0].value,"CLAIMED");
   assert.equal((await db.query(`select public.touchline_company_claim_mail_retry('${scan}','bad') value`)).rows[0].value,"BUSY");
   assert.equal((await retry()).rows[0].result,"RESOLVED");
   assert.equal((await retry()).rows[0].result,"ALREADY_RESOLVED");
   assert.equal((await db.query(`select count(*)::integer n from public.touchline_company_mail_retries where resolved_at is null`)).rows[0].n,0);
  });
  await t.test("automatic queue is scoped, replays do not duplicate and claims exclude concurrent work",async()=>{
   assert.equal((await db.query(`select public.touchline_company_enqueue_mail_scans() n`)).rows[0].n,0);
   await db.exec(`update public.touchline_company_mailboxes set business_query='from:billing@example.test'`);
   assert.equal((await db.query(`select public.touchline_company_enqueue_mail_scans() n`)).rows[0].n,1);
   assert.equal((await db.query(`select public.touchline_company_enqueue_mail_scans() n`)).rows[0].n,0);
   const next=(await db.query(`select id,query from public.touchline_company_mail_scans where not completed`)).rows[0];
   assert.match(String(next.query),/^\(from:billing@example.test\) after:0 before:\d+$/);
   const claimed=await db.query(`select public.touchline_company_claim_mail_scan($1::uuid) value`,[next.id]);
   assert.equal(claimed.rows[0].value.enabled,true);assert.equal(claimed.rows[0].value.busy,undefined);
   const busy=await db.query(`select public.touchline_company_claim_mail_scan($1::uuid) value`,[next.id]);assert.equal(busy.rows[0].value.busy,true);
   await commit({scanId:next.id,expectedRevision:0,expectedCursor:null,nextCursor:null,messages:[],failures:[]});
   assert.equal((await db.query(`select public.touchline_company_enqueue_mail_scans() n`)).rows[0].n,0);
   assert.ok(Number((await db.query(`select last_scan_before from public.touchline_company_mailboxes`)).rows[0].last_scan_before)>0);
  });
  await t.test("review links existing finance without creating money, retries are immutable",async()=>{
   const supplier="44444444-4444-4444-8444-444444444444",obligation="55555555-5555-4555-8555-555555555555";
   await db.exec(`insert into public.touchline_company_suppliers(id,name,created_by) values('${supplier}','Provider','${actor}');
    insert into public.touchline_company_obligations(id,supplier_id,source_reference,issued_on,due_on,currency,unit_exponent,amount_minor,created_by) values('${obligation}','${supplier}','invoice-42','2026-10-01','2026-10-30','EUR',2,10000,'${actor}')`);
   const evidenceId=(await db.query(`select id from public.touchline_company_mail_evidence where message_id='one'`)).rows[0].id;
   const command={requestId:"66666666-6666-4666-8666-666666666666",evidenceId,action:"LINK",kind:"obligations",targetId:obligation,note:"Invoice checked against original"};
   const review=(value:unknown)=>db.query(`select public.touchline_company_review_mail($1::jsonb,$2::uuid) value`,[JSON.stringify(value),actor]);
   const first=await review(command);assert.deepEqual((await review(command)).rows,first.rows);
   await assert.rejects(review({...command,note:"different"}),/MAIL_REVIEW_CONFLICT/);
   await assert.rejects(review({...command,requestId:"77777777-7777-4777-8777-777777777777",targetId:"88888888-8888-4888-8888-888888888888"}),/foreign key/i);
   assert.equal((await db.query(`select count(*)::integer n from public.touchline_company_settlements`)).rows[0].n,0);
   assert.equal((await db.query(`select amount_minor::integer n from public.touchline_company_obligations`)).rows[0].n,10000);
   assert.equal((await db.query(`select count(*)::integer n from public.touchline_company_mail_reviews`)).rows[0].n,1);
   await assert.rejects(db.exec(`delete from public.touchline_company_mail_reviews`),/permission denied/i);
  });
  await t.test("service cannot rewrite evidence, public cannot read or execute",async()=>{
   await assert.rejects(db.exec(`update public.touchline_company_mail_evidence set subject='tampered'`),/permission denied/i);
   await assert.rejects(db.exec(`update public.touchline_company_mailboxes set email='another@example.test'`),/permission denied/i);
   for(const role of ["anon","authenticated"]){
    await db.exec(`reset role;set role ${role}`);
    await assert.rejects(db.query(`select * from public.touchline_company_mail_evidence`),/permission denied/i);
    await assert.rejects(commit(page),/permission denied/i);
   }
  });
 }finally{await db.close();}
});
