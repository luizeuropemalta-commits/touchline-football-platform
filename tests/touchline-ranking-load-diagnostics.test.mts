import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRankingLoadDiagnostics } from "../lib/touchlineArena/ranking-load-diagnostics.ts";
const env = { TOUCHLINE_QA_RANKING_TIMINGS: "true", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa", NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co" };
const labels = ["activeRanking", "topXI", "catalog", "coach", "count", "fixtures", "auth"] as const;
test("page instruments seven independent branches and seals collection", () => {
  const page = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
  for (const label of labels) assert.ok(page.includes(`measure("${label}"`), label);
  assert.match(page, /diagnostics\.seal\(\)/);
});
test("enabled collector preserves promises, parallel starts, rejection and redacts payloads", async () => {
  const summaries: unknown[] = [], starts: string[] = [];
  let now = 10;
  const d = createRankingLoadDiagnostics(env, () => now, s => summaries.push(s));
  const releases: Array<() => void> = [];
  const error = new Error("private token");
  const values = labels.map((label, index) => {
    const promise = new Promise((resolve, reject) => releases.push(() => index === 2 ? reject(error) : resolve({ secret: "private payload" })));
    assert.equal(d.measure(label, () => { starts.push(label); return promise; }), promise);
    return promise;
  });
  assert.deepEqual(starts, labels);
  const outcomes = Promise.allSettled(values);
  d.seal(); now = 35;
  releases.slice(0, 6).forEach(release => release());
  await Promise.resolve(); assert.equal(summaries.length, 0);
  releases[6]();
  assert.equal((await outcomes)[2].status, "rejected");
  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0], { event: "TL_QA_RANKING_TIMINGS", timings: labels.map(label => ({ label, durationMs: 25, status: label === "catalog" ? "rejected" : "fulfilled" })) });
  assert.ok(!JSON.stringify(summaries).includes("private"));
  d.seal(); assert.equal(summaries.length, 1);
});
test("disabled and forged environments are silent without clock work", async () => {
  for (const patch of [{ TOUCHLINE_QA_RANKING_TIMINGS: undefined }, { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, ...["http://xgxbwqxjssxxuihuwmgy.supabase.co", "https://xgxbwqxjssxxuihuwmgy.supabase.co.evil.test", "https://user@xgxbwqxjssxxuihuwmgy.supabase.co", "https://xgxbwqxjssxxuihuwmgy.supabase.co/?token=x"].map(NEXT_PUBLIC_SUPABASE_URL => ({ NEXT_PUBLIC_SUPABASE_URL }))]) {
    const d = createRankingLoadDiagnostics({ ...env, ...patch }, () => assert.fail("clock"), () => assert.fail("log"));
    for (const label of labels) assert.equal(await d.measure(label, () => Promise.resolve(42)), 42);
    d.seal();
  }
});
test("request state is isolated and logging failure never rejects observed work", async () => {
  let calls = 0;
  const first = createRankingLoadDiagnostics(env, () => 0, () => { calls++; throw new Error("sink"); });
  const second = createRankingLoadDiagnostics(env, () => 0, () => { calls++; });
  await Promise.all(labels.map(label => first.measure(label, () => Promise.resolve(1))));
  first.seal(); second.seal();
  assert.equal(calls, 1);
});
