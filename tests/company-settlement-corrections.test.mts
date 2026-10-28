import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const actor='11111111-1111-4111-8111-111111111111', supplier='22222222-2222-4222-8222-222222222222', obligation='33333333-3333-4333-8333-333333333333', first='44444444-4444-4444-8444-444444444444', correction='55555555-5555-4555-8555-555555555555', replacement='66666666-6666-4666-8666-666666666666';
test('settlement correction preserves history and reconciles only active payments',async t=>{
 const db=new PGlite();
 try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;insert into auth.users values('${actor}');`);
 for(const name of ['20261025205533_touchline_company_finance_foundation.sql','20261027122953_touchline_company_finance_overview.sql','20261027125654_touchline_company_settlement_corrections.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.exec(`set role service_role;insert into public.touchline_company_suppliers(id,name,created_by) values('${supplier}','Test supplier','${actor}');insert into public.touchline_company_obligations(id,supplier_id,source_reference,issued_on,due_on,currency,unit_exponent,amount_minor,created_by) values('${obligation}','${supplier}','invoice',current_date-10,current_date-1,'EUR',2,10000,'${actor}');`);
 const record=async(id:string,amount=4000)=>(await db.query(`select public.touchline_company_record_settlement($1,$2,'EUR',2::smallint,$3::bigint,current_date,'MANUAL','bank-reference',$4) result`,[id,obligation,amount,actor])).rows[0].result;
 const cancel=async(id=correction,reason='Incorrect amount entered during bookkeeping')=>(await db.query(`select public.touchline_company_cancel_settlement($1,$2,$3,$4) result`,[id,first,reason,actor])).rows[0].result;
 const totals=async()=>((await db.query<{result:{currencies:Record<string,string>[]}}>('select public.touchline_company_finance_overview() result')).rows[0].result.currencies[0]);
 const original=await record(first);
 await t.test('active source cannot be duplicated',async()=>{await assert.rejects(record(replacement),/SOURCE_UNIQUE_CONFLICT/);assert.equal((await totals()).paid,'4000');});
 await t.test('cancellation returns outstanding and retains original',async()=>{await cancel();assert.equal((await totals()).paid,'0');assert.equal((await totals()).outstanding,'10000');assert.deepEqual(await record(first),original);assert.equal((await totals()).paid,'0');});
 await t.test('same correction is idempotent, changed or duplicate requests rejected',async()=>{const a=await cancel();assert.deepEqual(await cancel(),a);await assert.rejects(cancel(correction,'A different reason must not overwrite this'),/IDEMPOTENCY_CONFLICT/);await assert.rejects(cancel(replacement),/ALREADY_CANCELLED/);});
 await t.test('correct replacement may reuse evidence once',async()=>{await record(replacement,3000);assert.equal((await totals()).paid,'3000');assert.equal((await totals()).outstanding,'7000');await assert.rejects(record('77777777-7777-4777-8777-777777777777'),/SOURCE_UNIQUE_CONFLICT/);const count=await db.query<{n:number}>('select count(*)::int n from public.touchline_company_settlements');assert.equal(count.rows[0].n,2);});
 await t.test('audit failure rolls back cancellation and keeps outstanding unchanged',async()=>{
 await db.exec(`reset role;create function public.fixture_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'AUDIT_UNAVAILABLE';end $$;create trigger fixture_fail_audit before insert on public.touchline_company_audit_events for each row execute function public.fixture_fail_audit();set role service_role;`);
 await assert.rejects(db.query(`select public.touchline_company_cancel_settlement($1,$2,$3,$4)`,['88888888-8888-4888-8888-888888888888',replacement,'This entry must fail with audit unavailable',actor]),/AUDIT_UNAVAILABLE/);
 assert.equal((await totals()).paid,'3000');const count=await db.query<{n:number}>('select count(*)::int n from public.touchline_company_settlement_corrections');assert.equal(count.rows[0].n,1);
 await db.exec('reset role;drop trigger fixture_fail_audit on public.touchline_company_audit_events;set role service_role');
 });
 await t.test('corrections are immutable to service and private to public users',async()=>{await assert.rejects(db.exec('delete from public.touchline_company_settlement_corrections'),/permission denied/);for(const role of ['anon','authenticated']){await db.exec(`reset role;set role ${role}`);await assert.rejects(cancel(),/permission denied/);await assert.rejects(db.exec('select * from public.touchline_company_settlement_corrections'),/permission denied/);}});
 }finally{await db.close();}
});
