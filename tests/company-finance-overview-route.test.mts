import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parseCompanyOverview } from "../lib/admin/company-finance-overview.ts";
const source = readFileSync(new URL("../app/api/admin/company-finance/overview/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const empty = { asOf: "2026-10-27", suppliers: "0", contracts: "0", contractDeadlines: "0", currencies: [] };
function harness(mode = "ok") {
  let calls = 0;
  const exports = {} as { GET(): Promise<{ status: number; body: unknown; headers: Record<string, string> }> };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init: object) => ({ body, ...init }) } },
    "@/lib/admin/owner": { isOwnerEmail: () => mode !== "customer" },
    "@/lib/touchlineArena/auth-access": { hasTouchLineArenaAccess: () => mode !== "no-access" },
    "@/lib/supabase/server": { createClient: async () => mode === "anonymous" ? null : ({ auth: { getUser: async () => ({ data: { user: { email: "fixture@example.invalid" } }, error: mode === "auth-error" ? {} : null }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => { calls++; return { rpc: async (name: string) => { assert.equal(name, "touchline_company_finance_overview"); return { data: mode === "malformed" ? {} : empty, error: mode === "db-error" ? { message: "PRIVATE" } : null }; } }; } },
    "@/lib/admin/company-finance-overview": { parseCompanyOverview },
  };
  vm.runInNewContext(compiled, { exports, require: (key: string) => { assert.ok(key in deps); return deps[key]; } });
  return { get: exports.GET, calls: () => calls };
}
test("company overview denies untrusted sessions before privileged reads", async () => {
  for (const mode of ["anonymous", "customer", "no-access", "auth-error"]) { const h = harness(mode); assert.equal((await h.get()).status, 403); assert.equal(h.calls(), 0); }
});
test("company overview preserves private/no-store and distinguishes confirmed empty from unavailable", async () => {
  const result = await harness().get(); assert.equal(result.status, 200); assert.deepEqual(result.body, empty); assert.equal(result.headers["Cache-Control"], "private, no-store");
  for (const mode of ["malformed", "db-error"]) { const result = await harness(mode).get(); assert.equal(result.status, 503); assert.ok(!JSON.stringify(result).includes("PRIVATE")); }
});
