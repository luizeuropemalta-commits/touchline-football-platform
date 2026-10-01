import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createCatalogueLoadDiagnostics } from "../lib/touchlineArena/ranking-load-diagnostics.ts";
const labels = ["identityAndClubs", "memberships", "settlements", "seasonPoints", "publication"] as const;
test("catalogue wires five measurements and seals without awaiting the summary", () => {
  const source = readFileSync(new URL("../lib/touchlineArena/ranked-card-catalog-server.ts", import.meta.url), "utf8");
  for (const label of labels) assert.ok(source.includes(`measure("${label}"`), label);
  assert.match(source, /diagnostics\.seal\(\)/);
});
test("catalogue timings preserve rejection identity and emit one redacted summary after all settle", async () => {
  let now = 100;
  const logs: unknown[] = [];
  const diagnostics = createCatalogueLoadDiagnostics({ TOUCHLINE_QA_RANKING_TIMINGS: "true", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co" }, () => now, log => logs.push(log));
  const error = new Error("private");
  let release!: () => void;
  const pending = new Promise(resolve => { release = () => resolve("private"); });
  const failed = Promise.reject(error);
  const values = labels.map(label => diagnostics.measure(label, () => label === "publication" ? failed : pending));
  assert.equal(values[4], failed);
  const outcomes = Promise.allSettled(values); diagnostics.seal();
  await Promise.resolve(); assert.equal(logs.length, 0);
  now = 140; release();
  const result = await outcomes;
  assert.equal(result[4].status === "rejected" && result[4].reason, error);
  assert.deepEqual(logs, [{ event: "TL_QA_CATALOGUE_TIMINGS", timings: labels.map(label => ({ label, durationMs: label === "publication" ? 0 : 40, status: label === "publication" ? "rejected" : "fulfilled" })) }]);
  diagnostics.seal(); assert.equal(logs.length, 1);
});
test("disabled catalogue timing does not read clock or log", async () => {
  const diagnostics = createCatalogueLoadDiagnostics({}, () => assert.fail("clock"), () => assert.fail("log"));
  for (const label of labels) assert.equal(await diagnostics.measure(label, () => Promise.resolve(1)), 1);
  diagnostics.seal();
});

test("synchronous start failure preserves exact identity with diagnostics on or off", async () => {
  for (const active of [false, true]) {
    const logs: unknown[] = [];
    const diagnostics = createCatalogueLoadDiagnostics(active ? { TOUCHLINE_QA_RANKING_TIMINGS: "true", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co" } : {}, () => 0, log => logs.push(log));
    const error = new Error("private synchronous error");
    assert.throws(() => diagnostics.measure("publication", () => { throw error; }), value => value === error);
    await Promise.all(labels.filter(label => label !== "publication").map(label => diagnostics.measure(label, () => Promise.resolve(null))));
    diagnostics.seal();
    assert.equal(logs.length, active ? 1 : 0);
    if (active) assert.ok(!JSON.stringify(logs).includes("private"));
  }
});
