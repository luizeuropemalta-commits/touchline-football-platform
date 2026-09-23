import assert from "node:assert/strict";
import test from "node:test";
import { inspectTouchlineProductionSyncRuntime as inspect } from "../lib/football-data/production-sync-runtime.ts";

const valid: Record<string, string | undefined> = {
  VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM",
  VERCEL_ORG_ID: "team_P1d7YNrmUObvbJJTJRlGcXoz", TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED: "true",
  SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: "https://touchline.com.br",
};
test("only the explicit complete Production contract is admitted", () => {
  assert.deepEqual(inspect(valid), { allowed: true, reason: "production-sync-authorized" });
  assert.equal(inspect({}).allowed, false);
  assert.equal(inspect({ ...valid, SUPABASE_URL: `${valid.SUPABASE_URL}/` }).allowed, true);
});
for (const key of Object.keys(valid)) test(`required binding cannot be omitted or changed: ${key}`, () => {
  assert.equal(inspect({ ...valid, [key]: undefined }).allowed, false);
  assert.equal(inspect({ ...valid, [key]: "wrong-secret-sentinel" }).allowed, false);
  assert.equal(JSON.stringify(inspect({ ...valid, [key]: "wrong-secret-sentinel" })).includes("wrong-secret-sentinel"), false);
});
for (const flag of ["false", "1", "TRUE", " true", "true ", ""]) test(`activation is exact, not truthy: ${JSON.stringify(flag)}`, () => {
  assert.equal(inspect({ ...valid, TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED: flag }).allowed, false);
});
for (const runtime of ["preview", "development", "test", ""]) test(`non-Production runtime rejected: ${runtime}`, () => {
  assert.equal(inspect({ ...valid, VERCEL_ENV: runtime }).allowed, false);
});
for (const key of ["TOUCHLINE_DEPLOYMENT_MODE", "NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE"])
  for (const mode of ["qa-preview", "isolated-preview", "production", ""]) test(`conflicting mode rejected: ${key}=${mode}`, () => {
    assert.equal(inspect({ ...valid, [key]: mode }).allowed, false);
  });
for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN"])
  test(`origin binding rejects ambiguous and attacker-controlled variants: ${key}`, () => {
    const origin = valid[key]!;
    const host = origin.slice("https://".length);
    for (const value of [
      `http://${host}`, `https://${host}.evil.test`, `https://${host}:443`, `${origin}/path`,
      `${origin}?x=1`, `${origin}#fragment`, `https://user@${host}`, ` ${origin}`, `${origin}\n`,
      `${origin}/%2e`, `${origin}/../`, `https://${host}/?`, "not-a-url", "", `${origin}//`,
    ]) assert.equal(inspect({ ...valid, [key]: value }).allowed, false, value);
  });
