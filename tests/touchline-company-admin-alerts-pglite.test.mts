import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const { PGlite } = runtime ? await import(pathToFileURL(runtime).href) : await import("@electric-sql/pglite");
const migration = await readFile(new URL("../supabase/migrations/20261027210433_touchline_company_admin_alerts.sql", import.meta.url), "utf8");

async function db() {
  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create role anon;
    create role authenticated;
    create role service_role;
    create function public.gen_random_uuid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
    create table auth.users(id uuid primary key);
    create table public.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql as $$ select '{"role":"service_role"}'::jsonb $$;
    create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
    create function public.touchline_company_append_audit() returns trigger language plpgsql as $$ begin return new; end $$;
    create table public.touchline_company_suppliers(id uuid primary key, name text not null, created_by uuid not null, created_at timestamptz default now());
    create table public.touchline_company_contracts(id uuid primary key, supplier_id uuid not null, title text not null, starts_on date not null, ends_on date, renewal_on date, cancellation_deadline_on date, document_reference text, created_by uuid not null, created_at timestamptz default now());
    create table public.touchline_company_obligations(id uuid primary key, supplier_id uuid not null, contract_id uuid, source_reference text not null, issued_on date not null, due_on date not null, currency text not null, unit_exponent smallint not null, amount_minor bigint not null, created_by uuid not null, created_at timestamptz default now());
    create table public.touchline_company_settlements(id uuid primary key, obligation_id uuid not null, amount_minor bigint not null, source text not null, source_reference text not null, confirmed_by uuid not null, paid_on date not null, currency text not null, unit_exponent smallint not null);
    create table public.touchline_company_settlement_corrections(id uuid primary key, settlement_id uuid not null);
  `);
  await database.exec(migration);
  return database;
}

test("company alert job is service-only, disabled by default, and deduplicates replay", async () => {
  try {
  const database = await db();
  const actor = "11111111-1111-4111-8111-111111111111";
  const supplier = "22222222-2222-4222-8222-222222222222";
  const contract = "33333333-3333-4333-8333-333333333333";
  const obligation = "44444444-4444-4444-8444-444444444444";
  await database.exec(`insert into auth.users values ('${actor}'); insert into public.users values ('${actor}');
    insert into public.touchline_company_suppliers values ('${supplier}','Provider','${actor}',now());
    insert into public.touchline_company_contracts values ('${contract}','${supplier}','Hosting','2026-01-01','2026-11-25','2026-11-10','2026-11-05',null,'${actor}',now());
    insert into public.touchline_company_obligations values ('${obligation}','${supplier}','${contract}','invoice-1','2026-10-01','2026-10-10','EUR',2,10000,'${actor}',now());
    insert into public.touchline_company_settlements values ('55555555-5555-4555-8555-555555555555','${obligation}',4000,'MANUAL','bank-1','${actor}','2026-10-09','EUR',2);`);
  await database.exec(`create or replace function auth.jwt() returns jsonb language sql as $$ select '{"role":"anon"}'::jsonb $$`);
  await assert.rejects(
    database.query(`select public.touchline_company_generate_admin_alerts('66666666-6666-4666-8666-666666666666','2026-10-27',30)`),
    /COMPANY_ADMIN_ALERTS_INVALID_RUN|COMPANY_ADMIN_ALERTS_SERVICE_ONLY/,
  );
  await database.exec(`create or replace function auth.jwt() returns jsonb language sql as $$ select '{"role":"service_role"}'::jsonb $$`);
  const disabled = await database.query(`select public.touchline_company_generate_admin_alerts('66666666-6666-4666-8666-666666666666','2026-10-27',30) as result`);
  assert.equal(disabled.rows[0].result.state, "DISABLED");
  await database.exec(`select public.touchline_company_set_admin_alert_job_enabled(true,'${actor}');`);
  const first = await database.query(`select public.touchline_company_generate_admin_alerts('77777777-7777-4777-8777-777777777777','2026-10-27',30) as result`);
  const second = await database.query(`select public.touchline_company_generate_admin_alerts('88888888-8888-4888-8888-888888888888','2026-10-27',30) as result`);
  assert.equal(first.rows[0].result.state, "COMPLETED");
  assert.equal(second.rows[0].result.inserted, 0);
  const alerts = await database.query(`select alert_kind from public.touchline_company_admin_alerts order by alert_kind`);
  assert.deepEqual(alerts.rows.map((row) => row.alert_kind), ["CONTRACT_CANCELLATION_DEADLINE", "CONTRACT_RENEWAL", "CONTRACT_EXPIRY", "OBLIGATION_OVERDUE", "OBLIGATION_PARTIAL"].sort());
  // Paying the balance resolves historical alerts; cancelling a recorded payment reopens them.
  await database.exec(`insert into public.touchline_company_settlements values ('99999999-9999-4999-8999-999999999999','${obligation}',6000,'MANUAL','bank-2','${actor}','2026-10-20','EUR',2);`);
  await database.query(`select public.touchline_company_generate_admin_alerts(gen_random_uuid(),'2026-10-27',30)`);
  let moneyAlerts=await database.query(`select resolved_at,metadata->>'outstandingMinor' outstanding from public.touchline_company_admin_alerts where obligation_id='${obligation}'`);
  assert.equal(moneyAlerts.rows.length,2);assert.ok(moneyAlerts.rows.every(row=>row.resolved_at!==null&&row.outstanding==='0'));
  await database.exec(`insert into public.touchline_company_settlement_corrections values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555');`);
  await database.query(`select public.touchline_company_generate_admin_alerts(gen_random_uuid(),'2026-10-27',30)`);
  moneyAlerts=await database.query(`select resolved_at,metadata->>'outstandingMinor' outstanding from public.touchline_company_admin_alerts where obligation_id='${obligation}'`);
  assert.ok(moneyAlerts.rows.every(row=>row.resolved_at===null&&row.outstanding==='4000'));
  const firstId=(await database.query(`select id from public.touchline_company_admin_alerts limit 1`)).rows[0].id;
  const read1=await database.query(`select public.touchline_company_mark_admin_alert_read($1,'${actor}') result`,[firstId]);
  const read2=await database.query(`select public.touchline_company_mark_admin_alert_read($1,'${actor}') result`,[firstId]);
  assert.equal(read1.rows[0].result.read_by,actor);assert.equal(read1.rows[0].result.read_at,read2.rows[0].result.read_at);
  await database.exec(`insert into public.touchline_company_obligations values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${supplier}',null,'invoice-upcoming','2026-10-01','2026-11-01','EUR',2,5000,'${actor}',now());`);
  await database.query(`select public.touchline_company_generate_admin_alerts(gen_random_uuid(),'2026-10-27',30)`);
  assert.equal((await database.query(`select count(*)::integer n from public.touchline_company_admin_alerts where alert_kind='OBLIGATION_DUE'`)).rows[0].n,1);
  await assert.rejects(database.query(`select public.touchline_company_generate_admin_alerts(gen_random_uuid(),'infinity',30)`),/INVALID_RUN/);
  await database.exec('set role service_role');
  await assert.rejects(database.query(`update public.touchline_company_admin_alerts set title='tampered'`),/permission denied/i);
  await database.exec('reset role;set role authenticated');
  await assert.rejects(database.query(`select * from public.touchline_company_admin_alerts`),/permission denied/i);
  await assert.rejects(database.query(`select public.touchline_company_generate_admin_alerts(gen_random_uuid(),'2026-10-27',30)`),/permission denied/i);
  await database.close();
  } catch (error) { console.error(error); throw error; }
});

test("alerts integrate with real company finance and correction migrations",async()=>{
 const database=new PGlite();try{
 await database.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;create function auth.jwt() returns jsonb language sql as $$select '{"role":"service_role"}'::jsonb$$;insert into auth.users values('11111111-1111-4111-8111-111111111111');`);
 for(const file of ['20261025205533_touchline_company_finance_foundation.sql','20261027125654_touchline_company_settlement_corrections.sql','20261027210433_touchline_company_admin_alerts.sql'])await database.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
 await database.exec(`set role service_role;
 insert into public.touchline_company_suppliers(id,name,created_by) values('22222222-2222-4222-8222-222222222222','Real schema supplier','11111111-1111-4111-8111-111111111111');
 insert into public.touchline_company_obligations(id,supplier_id,source_reference,issued_on,due_on,currency,unit_exponent,amount_minor,created_by) values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','INV-real',current_date-2,current_date-1,'EUR',2,10000,'11111111-1111-4111-8111-111111111111');
 select public.touchline_company_set_admin_alert_job_enabled(true,'11111111-1111-4111-8111-111111111111');
 select public.touchline_company_generate_admin_alerts(gen_random_uuid(),current_date,30);
 select public.touchline_company_record_settlement('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','EUR',2::smallint,10000::bigint,current_date,'MANUAL','bank-real','11111111-1111-4111-8111-111111111111');
 select public.touchline_company_generate_admin_alerts(gen_random_uuid(),current_date,30);`);
 assert.ok((await database.query(`select resolved_at from public.touchline_company_admin_alerts`)).rows[0].resolved_at);
 await database.exec(`select public.touchline_company_cancel_settlement('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','Bookkeeping correction with original evidence','11111111-1111-4111-8111-111111111111');select public.touchline_company_generate_admin_alerts(gen_random_uuid(),current_date,30);`);
 const reopened=(await database.query(`select resolved_at,metadata->>'outstandingMinor' outstanding from public.touchline_company_admin_alerts`)).rows[0];assert.equal(reopened.resolved_at,null);assert.equal(reopened.outstanding,'10000');
 assert.equal((await database.query(`select count(*)::integer n from public.touchline_company_settlements`)).rows[0].n,1);
 }finally{await database.close();}
});
