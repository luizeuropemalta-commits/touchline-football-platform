import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { formatCompanyOverviewAmount, parseCompanyOverview } from "../lib/admin/company-finance-overview.ts";
const actor = "11111111-1111-4111-8111-111111111111", supplier = "22222222-2222-4222-8222-222222222222";
test("company overview reconciles all records beyond the page limit without mixing currencies", async t => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;insert into auth.users values('${actor}');`);
    for (const file of ["20261025205533_touchline_company_finance_foundation.sql", "20261027122953_touchline_company_finance_overview.sql"]) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    const read = async () => (await db.query<{ result: unknown }>("select public.touchline_company_finance_overview() result")).rows[0].result;
    await db.exec("set role service_role");
    await t.test("empty confirmed database is distinct from unavailable data", async () => {
      const empty = parseCompanyOverview(await read());
      assert.ok(empty); assert.equal(empty.suppliers, "0"); assert.deepEqual(empty.currencies, []);
    });
    await db.exec(`insert into public.touchline_company_suppliers(id,name,created_by) values('${supplier}','Fixture supplier','${actor}');
      insert into public.touchline_company_contracts(supplier_id,title,starts_on,renewal_on,cancellation_deadline_on,created_by) values('${supplier}','Service',current_date-30,current_date+30,current_date+1,'${actor}');
      insert into public.touchline_company_obligations(id,supplier_id,source_reference,issued_on,due_on,currency,unit_exponent,amount_minor,created_by)
      select md5(i::text)::uuid,'${supplier}',i::text,current_date-10,case when i=52 then current_date+5 else current_date-1 end,'EUR',2,10000,'${actor}' from generate_series(1,52) i;
      insert into public.touchline_company_obligations(supplier_id,source_reference,issued_on,due_on,currency,unit_exponent,amount_minor,created_by)
      values('${supplier}','GBP',current_date,current_date,'GBP',2,500,'${actor}');
      select public.touchline_company_record_settlement(gen_random_uuid(),md5('1')::uuid,'EUR',2::smallint,4000::bigint,current_date,'MANUAL','payment1','${actor}');
      select public.touchline_company_record_settlement(gen_random_uuid(),md5('2')::uuid,'EUR',2::smallint,12000::bigint,current_date,'MANUAL','payment2','${actor}');`);
    await t.test("partial payments and overpayments reconcile independently for each obligation", async () => {
      const summary = parseCompanyOverview(await read()); assert.ok(summary);
      assert.equal(summary.contractDeadlines, "1");
      assert.deepEqual(summary.currencies[0], { currency: "EUR", exponent: 2, obligations: "52", registered: "520000", paid: "16000", outstanding: "506000", overpaid: "2000", overdue: "496000", overdueCount: "50" });
      assert.equal(summary.currencies[1].currency, "GBP"); assert.equal(summary.currencies[1].overdue, "0");
      assert.equal(summary.currencies[1].outstanding, "500");
    });
    await t.test("refresh does not create financial or audit entries", async () => {
      const before = await db.query("select count(*)::int n from public.touchline_company_audit_events");
      assert.deepEqual(await read(), await read());
      assert.deepEqual(await db.query("select count(*)::int n from public.touchline_company_audit_events"), before);
    });
    await t.test("public identities cannot read company totals through RPC", async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`reset role;set role ${role}`);
        await assert.rejects(read(), /permission denied/);
      }
    });
  } finally { await db.close(); }
});

test("overview amounts remain exact above JavaScript safe integer range", () => {
  assert.equal(formatCompanyOverviewAmount("900719925474099199", 2, "EUR", "pt-BR"), "9.007.199.254.740.991,99 EUR");
  assert.equal(formatCompanyOverviewAmount("1", 3, "KWD", "en-GB"), "0.001 KWD");
});

test("invalid overview never renders a confirmed zero or fabricated totals", () => {
  const base = { asOf: "2026-10-27", suppliers: "0", contracts: "0", contractDeadlines: "0", currencies: [] };
  assert.ok(parseCompanyOverview(base));
  for (const value of [null, {}, { ...base, asOf: "2026-02-30" }, { ...base, suppliers: 0 }, { ...base, currencies: [{ currency: "TC" }] }]) assert.equal(parseCompanyOverview(value), null);
});
