import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const modulePath=process.env.TOUCHLINE_COMPANY_PGLITE_MODULE;
const migration="20261025205533_touchline_company_finance_foundation.sql";
const actor="11111111-1111-4111-8111-111111111111", supplier="22222222-2222-4222-8222-222222222222", contract="33333333-3333-4333-8333-333333333333", obligation="44444444-4444-4444-8444-444444444444", request="55555555-5555-4555-8555-555555555555";
test("company finance persistence: identities, monetary invariants, audit and role isolation",{skip:!modulePath},async(t)=>{
 const {PGlite}=await import(modulePath!);const db=new PGlite();
 try{
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;insert into auth.users values('${actor}');`);
  await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),"utf8"));
  await db.exec(`set role service_role;insert into public.touchline_company_suppliers(id,name,created_by) values('${supplier}','Supplier','${actor}');
   insert into public.touchline_company_contracts(id,supplier_id,title,starts_on,ends_on,created_by) values('${contract}','${supplier}','Service','2026-01-01','2026-12-31','${actor}');
   insert into public.touchline_company_obligations(id,supplier_id,contract_id,source_reference,issued_on,due_on,currency,unit_exponent,amount_minor,created_by) values('${obligation}','${supplier}','${contract}','invoice-original','2026-10-01','2026-10-25','EUR',2,10000,'${actor}');`);
  const pay=(amount=4000,currency="EUR",reference="manual-bank-line",id=request)=>db.query(`select public.touchline_company_record_settlement($1::uuid,$2::uuid,$3::text,2::smallint,$4::bigint,'2026-10-01'::date,'MANUAL'::text,$5::text,$6::uuid) result`,[id,obligation,currency,amount,reference,actor]);
  await t.test("manual payment has audited actor/reference, replay is idempotent and conflict rejected",async()=>{
   const first=await pay();const repeat=await pay();assert.deepEqual(repeat.rows,first.rows);
   assert.equal(Number((await db.query(`select count(*) n from public.touchline_company_settlements`)).rows[0].n),1);
   assert.equal(Number((await db.query(`select count(*) n from public.touchline_company_audit_events`)).rows[0].n),4);
   await assert.rejects(pay(5000),/IDEMPOTENCY_CONFLICT/);
  });
  await t.test("mixed currency, duplicate source, unknown obligation and unsafe values rejected atomically",async()=>{
   const next="66666666-6666-4666-8666-666666666666";
   await assert.rejects(pay(4000,"USD","different",next),/foreign key/i);
   await assert.rejects(db.query(`select public.touchline_company_record_settlement(gen_random_uuid(),gen_random_uuid(),'EUR',2::smallint,100::bigint,current_date,'MANUAL','missing','${actor}')`),/OBLIGATION_NOT_FOUND/);
   await assert.rejects(pay(4000,"EUR","manual-bank-line",next),/unique/i);
   await assert.rejects(pay(-1,"EUR","different",next),/check/i);
   await assert.rejects(pay(Number.MAX_SAFE_INTEGER,"EUR","different",next),/OVERFLOW/);
   assert.equal(Number((await db.query(`select count(*) n from public.touchline_company_settlements`)).rows[0].n),1);
   assert.equal(Number((await db.query(`select count(*) n from public.touchline_company_audit_events`)).rows[0].n),4);
  });
  await t.test("future confirmation rejected and service role cannot bypass RPC or alter audit",async()=>{
   await assert.rejects(db.query(`select public.touchline_company_record_settlement(gen_random_uuid(),'${obligation}','EUR',2::smallint,100::bigint,current_date+1,'MANUAL','future','${actor}')`),/INVALID_SETTLEMENT/);
   await assert.rejects(db.query(`select public.touchline_company_record_settlement(gen_random_uuid(),'${obligation}','EUR',2::smallint,100::bigint,'infinity'::date,'MANUAL','infinity','${actor}')`),/INVALID_SETTLEMENT/);
   await assert.rejects(db.query(`insert into public.touchline_company_settlements(id) values(gen_random_uuid())`),/permission denied/i);
   await assert.rejects(db.query(`delete from public.touchline_company_audit_events`),/permission denied/i);
   await assert.rejects(db.query(`update public.touchline_company_obligations set amount_minor=0`),/permission denied/i);
  });
  await t.test("obligation source is unique and player/TC domains cannot enter supplier money",async()=>{
   await assert.rejects(db.query(`insert into public.touchline_company_obligations(supplier_id,source_reference,issued_on,due_on,currency,unit_exponent,amount_minor,created_by) values('${supplier}','invoice-original','2026-10-01','2026-10-25','EUR',2,10000,'${actor}')`),/unique/i);
   await assert.rejects(db.query(`insert into public.touchline_company_obligations(supplier_id,source_reference,issued_on,due_on,currency,unit_exponent,amount_minor,created_by) values('${supplier}','tc-invalid','2026-10-01','2026-10-25','TC',2,10000,'${actor}')`),/foreign key/i);
   await assert.rejects(db.query(`insert into public.touchline_company_contracts(supplier_id,title,starts_on,ends_on,created_by) values('${supplier}','Bad term','2026-12-01','2026-01-01','${actor}')`),/check/i);
  });
  await t.test("anonymous and authenticated users cannot read or record settlements",async()=>{
   for(const role of ["anon","authenticated"]){await db.exec(`reset role;set role ${role}`);await assert.rejects(db.query(`select * from public.touchline_company_obligations`),/permission denied/i);await assert.rejects(pay(),/permission denied/i);}
   await db.exec('reset role');
   const result=await db.query(`select count(*) n from pg_class where relname like 'touchline_company_%' and relkind='r' and relrowsecurity`);assert.equal(Number(result.rows[0].n),6);
  });
 }finally{await db.close();}
});
