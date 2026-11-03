import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as diagnostic from "../lib/football-data/coach-reconciliation-diagnostic.ts";

type Row = Record<string, unknown>;
function compile(file: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, (...args: unknown[]) => Promise<Row>> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, process: { env: {} }, require(name: string) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  return exports;
}
async function scenario(receipt: unknown, error: unknown = null, fixtureWriteFails = false) {
  const rows = new Map<string, Row[]>(), calls: string[] = [], completions: Row[] = [];
  const assignments = [{ coach_provider_id: "99991", club_provider_id: "10" }];
  const store = compile("lib/football-data/fixture-schedule-store.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => assert.fail("No alternate client") },
    "@/lib/touchlineArena/coach-catalogue-server": { readCompetitionCoachAssignments: async () => assignments },
    "@/lib/football-data/coach-reconciliation-diagnostic": diagnostic,
  });
  const sync = compile("lib/football-data/fixture-schedule-sync.ts", {
    "@/lib/football-data/fixture-schedule-store": store,
    "@/lib/football-data/fixture-provider-server": { createGuardedFixtureProvider: () => assert.fail("No network") },
    "@/lib/football-data/coach-reconciliation-diagnostic": diagnostic,
  });
  const admin = {
    async rpc(name: string, args: unknown) {
      assert.equal(name, "touchline_reconcile_verified_coach_fixture_points");
      assert.equal(JSON.stringify(args), JSON.stringify({ p_fixture_id: null, p_competition_coaches: assignments }));
      assert.ok(calls.includes("write:football_fixtures"));
      calls.push("reconcile"); return { data: receipt, error };
    },
    from(table: string) {
      let action = "read", payload: unknown, single = false;
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        single() { single = true; return query; },
        insert(value: unknown) { action = "insert"; payload = value; return query; },
        update(value: unknown) { action = "update"; payload = value; return query; },
        upsert(value: unknown) { action = "upsert"; payload = value; return query; },
        then(resolve: (value: unknown) => unknown) {
          let data: unknown = rows.get(table) ?? [];
          if (action === "insert") { assert.equal(table, "football_data_sync_runs"); data = { id: "run" }; }
          if (action === "update") { assert.equal(table, "football_data_sync_runs"); completions.push(payload as Row); }
          if (action === "upsert") {
            calls.push(`write:${table}`);
            const values = (Array.isArray(payload) ? payload : [payload]) as Row[];
            rows.set(table, values.map((row, i) => ({ ...row, id: `${table}-${i}` })));
            data = single ? rows.get(table)![0] : rows.get(table);
          }
          return Promise.resolve(resolve({ data, error: fixtureWriteFails && table === "football_fixtures" ? { message: "fixture-write-failed" } : null }));
        },
      }; return query;
    },
  };
  const fixture = { provider: "sportmonks", providerId: "901", competitionId: "8", startsAt: "2026-10-31T15:00:00Z", status: "Full Time", homeScore: 2, awayScore: 0,
    homeTeam: { provider: "sportmonks", providerId: "10", name: "Synthetic Home", source: { provider: "sportmonks", providerId: "10" } }, awayTeam: { provider: "sportmonks", providerId: "11", name: "Synthetic Away", source: { provider: "sportmonks", providerId: "11" } } };
  const provider = { getCompetitionById: async () => ({ ok: true, data: { provider: "sportmonks", providerId: "8", name: "Synthetic League" } }),
    getFixturesBetween: async () => ({ ok: true, data: [fixture] }) };
  const result = await sync.syncSportmonksFixtureSchedule(admin, { fromDate: "2026-10-31", throughDate: "2026-10-31" }, { provider });
  assert.equal(completions.length, 1);
  return { result, completions, calls, rows };
}
for (const reason of ["season-unavailable", "fixture-attribution-pending", "coach-editorial-identity-pending", "fixture-results-unavailable"]) {
  test(`schedule preserves ${reason} from the confirmed RPC through its private completion receipt`, async () => {
    const s = await scenario({ ok: false, reconciled: 2, pending: [], ranking: { ok: false, reason, pendingCoachIds: ["99991"] } });
    assert.equal(s.result.ok, false); assert.equal(s.result.status, "error");
    assert.equal(s.result.fixturesStored, 1, "already stored provider facts are not rolled back by presentation diagnostics");
    assert.deepEqual(Array.from(s.result.errors as string[]), [`coach-points-reconciliation-failed:${reason}`]);
    const summary = (s.completions[0].source_payload as Row).coachRankingDiagnostic as Row;
    assert.equal(summary.reason, reason);
    assert.equal(JSON.stringify(summary).includes("99991"), false);
    assert.equal(s.calls.filter(value => value === "reconcile").length, 1);
    assert.equal(s.rows.get("football_fixtures")![0].home_score, 2);
  });
}
test("schedule keeps legacy unknown diagnostics generic without exposing arbitrary nested values", async () => {
  const s = await scenario({ ok: false, reconciled: 0, pending: [], ranking: { ok: false, reason: "PRIVATE_provider@example.invalid", raw: "secret" } });
  assert.deepEqual(Array.from(s.result.errors as string[]), ["coach-points-reconciliation-failed:attribution-pending"]);
  assert.equal(JSON.stringify(s.result).includes("PRIVATE"), false);
  assert.equal((s.result.coachRankingDiagnostic as Row).reason, "ranking-unconfirmed");
});
test("transport ambiguity cannot turn a useful-looking coach receipt into confirmed ranking evidence", async () => {
  const s = await scenario({ ok: false, reconciled: 2, ranking: { ok: false, reason: "coach-editorial-identity-pending" } }, { code: "XX000" });
  assert.equal(s.result.ok, false);
  assert.equal((s.result.coachRankingDiagnostic as Row).reason, "reconciliation-unconfirmed");
  assert.deepEqual(Array.from(s.result.errors as string[]), ["coach-points-reconciliation-failed:XX000"]);
});
test("successful schedule has no pending diagnostic and fixture failures never reconcile coaches", async () => {
  const ok = await scenario({ ok: true, reconciled: 2, ranking: { ok: true }, pending: [] });
  assert.equal(ok.result.ok, true); assert.equal(ok.result.status, "success"); assert.equal(ok.result.coachRankingDiagnostic, null);
  const failed = await scenario(null, null, true);
  assert.equal(failed.result.ok, false); assert.equal(failed.calls.includes("reconcile"), false);
  assert.equal(failed.result.coachRankingDiagnostic, null);
});
