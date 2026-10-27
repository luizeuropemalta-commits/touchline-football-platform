import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { NextResponse } from "next/server.js";
import ts from "typescript";
import { hasTouchLineArenaAccess } from "../lib/touchlineArena/auth-access.ts";

const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routeCode = compile("../app/api/admin/finance/export/route.ts");
const ownerCode = compile("../lib/admin/owner.ts");
type Options = { email?: string | null; access?: boolean; authError?: boolean; authThrow?: boolean;
  data?: Record<string, unknown>[] | null; failure?: "error" | "throw"; configured?: boolean };
function load(options: Options = {}) {
  const calls: unknown[][] = [];
  const owner: Record<string, unknown> = {};
  runInNewContext(ownerCode, { exports: owner, process: { env: { TOUCHLINE_OWNER_EMAILS: "owner@example.test" } } });
  const query = {
    select(fields: string) { calls.push(["select", fields]); return query; },
    order(field: string, order: unknown) { calls.push(["order", field, order]); return query; },
    async limit(limit: number) {
      calls.push(["limit", limit]);
      if (options.failure === "throw") throw new Error("private-database-detail");
      return { data: options.data === null ? null : (options.data ?? []).slice(0, limit), error: options.failure === "error" ? { message: "private-database-detail" } : null };
    },
  };
  const imports: Record<string, unknown> = {
    "next/server": { NextResponse }, "@/lib/admin/owner": owner,
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess },
    "@/lib/supabase/admin": { createAdminClient: () => options.configured === false ? null : { from(table: string) { calls.push(["from", table]); return query; } } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => {
      if (options.authThrow) throw new Error("private-auth-detail");
      return { data: { user: options.email === null ? null : { email: options.email ?? "owner@example.test", app_metadata: { touchline_arena_access_v1: options.access !== false } } }, error: options.authError ? { message: "private-auth-detail" } : null };
    } } }) },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(routeCode, { exports, require(name: string) {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`); return imports[name];
  } }, { timeout: 1000 });
  return { GET: exports.GET as () => Promise<NextResponse>, calls };
}
const invoice = (number: string, index = 1) => ({ number, status: "paid", currency: "eur", subtotal: -100,
  tax: 0, total: 100, amount_paid: 100, amount_due: 100, stripe_invoice_id: `in_${index}`, created_at: "2026-10-25T00:00:00Z" });

test("export requires both the configured owner and trusted Arena access before querying", async () => {
  for (const options of [{ email: null }, { email: "other@example.test" }, { access: false }]) {
    const run = load(options); const response = await run.GET();
    assert.equal(response.status, 403); assert.deepEqual(run.calls, []);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});
test("export is explicitly a bounded sample with stable ordering and unchanged provider units", async () => {
  const run = load({ data: Array.from({ length: 1001 }, (_, i) => invoice(`Invoice ${i}`, i)) });
  const response = await run.GET(); const body = await response.text();
  assert.equal(response.status, 200); assert.equal(body.split("\n").length, 1001);
  assert.ok(body.includes('"Invoice 999"')); assert.ok(!body.includes('"Invoice 1000"'));
  assert.match(response.headers.get("content-disposition")!, /latest-1000-invoices/);
  assert.equal(response.headers.get("x-touchline-export-scope"), "latest-1000-invoices; amounts-in-provider-minor-units");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(JSON.parse(JSON.stringify(run.calls.filter(call => call[0] === "order"))), [
    ["order", "created_at", { ascending: false }], ["order", "stripe_invoice_id", { ascending: false }],
  ]);
  assert.match(body, /"-100","0","100","100","100"/);
});
test("export rejects missing data and failures instead of returning a partial or empty CSV", async () => {
  for (const options of [{ data: null }, { failure: "error" as const }, { failure: "throw" as const }, { authError: true }, { authThrow: true }, { configured: false }]) {
    const run = load(options); const response = await run.GET();
    assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("content-disposition"), null);
    assert.deepEqual(await response.json(), { error: "Financial export is unavailable." });
  }
  const confirmedEmpty = await load({ data: [] }).GET();
  assert.equal(confirmedEmpty.status, 200); assert.equal((await confirmedEmpty.text()).split("\n").length, 1);
});
test("CSV neutralizes formulas in strings, preserves numbers, and escapes quotes and line breaks", async () => {
  const labels = ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '\t=1', '\r=1', '  =1', 'A,"B"\nC'];
  const response = await load({ data: labels.map(label => invoice(label)) }).GET();
  const body = await response.text();
  for (const label of labels.slice(0, -1)) assert.ok(body.includes(`"'${label}"`));
  assert.ok(body.includes('"A,""B""\nC"'));
  assert.ok(body.includes('"-100","0"')); assert.ok(!body.includes('"\'-100"'));
});
