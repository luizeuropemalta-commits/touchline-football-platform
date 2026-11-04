import assert from "node:assert/strict";
import test from "node:test";
import { inspectTouchlineProductionRuntime as runtime, inspectTouchlineProductionCredentialBinding as credentials,
  inspectTouchlineProductionServiceRoleBinding as serviceOnly } from "../lib/touchlinePreview/production-environment-core.ts";
import { SYNTHETIC_PRODUCTION_PROJECT_REF as projectRef, syntheticProjectCredential as token,
  syntheticProductionEnvironment as environment } from "./helpers/touchline-production-runtime-fixture.mts";

const qaRef = "xgxbwqxjssxxuihuwmgy";
const inspect = (env = environment(), approvedSupabaseProjectRef: string | undefined = env.TOUCHLINE_PRODUCTION_SUPABASE_PROJECT_REF) =>
  runtime({ environment: env, approvedSupabaseProjectRef });

test("pure Production envelope returns only its explicit synthetic target without enabling features", () => {
  const env = environment({ TOUCHLINE_PRODUCTION_DATA_SYNC_ENABLED: undefined });
  const before = { ...env };
  assert.deepEqual(inspect(env), { allowed: true, target: {
    projectRef, supabaseOrigin: `https://${projectRef}.supabase.co`, publicOrigin: "https://touchline.com.br",
  } });
  assert.deepEqual(env, before);
  assert.equal(inspect(environment({ SUPABASE_URL: `https://${projectRef}.supabase.co/`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co/`, NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN: "https://touchline.com.br/" })).allowed, true);
  assert.doesNotMatch(JSON.stringify(inspect(env)), /synthetic-fixture-signature|anonKey|serviceRoleKey|enabled/);
});

test("Production requires its explicit non-QA ref, exact deployment and established project/team", () => {
  for (const ref of [undefined, "", qaRef, projectRef.toUpperCase(), ` ${projectRef}`, `${projectRef}\n`, "short", "a".repeat(21)]) {
    assert.equal(runtime({ environment: environment(), approvedSupabaseProjectRef: ref }).allowed, false);
  }
  for (const key of ["VERCEL_ENV", "VERCEL_PROJECT_ID", "VERCEL_ORG_ID"]) {
    for (const value of [undefined, "", "preview", "development", "wrong-secret-sentinel"]) {
      const result = inspect(environment({ [key]: value })); assert.equal(result.allowed, false);
      assert.equal(JSON.stringify(result).includes("wrong-secret-sentinel"), false);
    }
  }
  for (const key of ["TOUCHLINE_DEPLOYMENT_MODE", "NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE"])
    for (const value of ["qa-preview", "isolated-preview", "production", ""]) {
      assert.equal(inspect(environment({ [key]: value })).allowed, false);
    }
  const qaOrigin = `https://${qaRef}.supabase.co`;
  assert.equal(runtime({ environment: environment({ SUPABASE_URL: qaOrigin, NEXT_PUBLIC_SUPABASE_URL: qaOrigin }), approvedSupabaseProjectRef: qaRef }).allowed, false);
});

test("each origin is exact and both database clients bind to the approved target", () => {
  const valid = environment();
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN"] as const) {
    const origin = valid[key], host = origin.slice("https://".length);
    for (const value of [undefined, "", `http://${host}`, `https://${host}.evil.test`, `https://${host}:443`,
      `${origin}/path`, `${origin}?x=1`, `${origin}#x`, `https://user:pass@${host}`, ` ${origin}`, `${origin}\n`,
      `${origin}/%2e`, `${origin}/../`, `${origin}//`, `https://${qaRef}.supabase.co`]) {
      assert.equal(inspect(environment({ [key]: value })).allowed, false, `${key}: ${value}`);
    }
  }
});

test("legacy credential binding requires distinct anon and service keys on the same non-QA target", () => {
  const anonKey = token("anon"), serviceRoleKey = token("service_role");
  assert.deepEqual(credentials({ projectRef, anonKey, serviceRoleKey }), { allowed: true });
  assert.deepEqual(serviceOnly({ projectRef, serviceRoleKey }), { allowed: true });
  // The synthetic signatures above are not proof of JWT authenticity or access.
  for (const value of [undefined, "", anonKey, token("authenticated"), token("service_role", qaRef), token("service_role", "tsrqponmlkjihgfedcba")]) {
    assert.equal(credentials({ projectRef, anonKey, serviceRoleKey: value }).allowed, false);
    assert.equal(serviceOnly({ projectRef, serviceRoleKey: value }).allowed, false);
  }
  for (const value of [undefined, "", serviceRoleKey, token("authenticated"), token("anon", qaRef), token("anon", "tsrqponmlkjihgfedcba")]) {
    assert.equal(credentials({ projectRef, anonKey: value, serviceRoleKey }).allowed, false);
  }
  assert.equal(credentials({ projectRef: qaRef, anonKey: token("anon", qaRef), serviceRoleKey: token("service_role", qaRef) }).allowed, false);
});

test("malformed, opaque and oversized credentials fail with names-only diagnostics", () => {
  const malformedPayload = (value: string) => `e30.${Buffer.from(value).toString("base64url")}.c3ludGhldGlj`;
  for (const invalid of ["wrong-secret-sentinel", "sb_secret_synthetic", "sb_publishable_synthetic", "a.b", "a..c", "a.b.c.d",
    token("service_role") + "\n", " " + token("service_role"), "a".repeat(4097), malformedPayload("not-json"),
    malformedPayload("null"), malformedPayload("[]"), malformedPayload('{}'),
    malformedPayload(JSON.stringify({ ref: projectRef, role: ["service_role"] })),
    malformedPayload(JSON.stringify({ ref: [projectRef], role: "service_role" })),
    "e30._w.c3ludGhldGlj"]) {
    const result = serviceOnly({ projectRef, serviceRoleKey: invalid });
    assert.deepEqual(result, { allowed: false, reason: "credential-mismatch" });
    assert.equal(JSON.stringify(result).includes(invalid), false);
  }
});


test("service-only binding rejects noncanonical ref and trailing credential whitespace", () => {
  for (const suffix of ["\n", "\r", "\r\n", "\t", " ", "\u2028", "\u2029"]) {
    const malformedRef = projectRef + suffix;
    assert.deepEqual(serviceOnly({ projectRef: malformedRef, serviceRoleKey: token("service_role", malformedRef) }),
      { allowed: false, reason: "credential-mismatch" });
    assert.equal(serviceOnly({ projectRef, serviceRoleKey: token("service_role") + suffix }).allowed, false);
    assert.equal(credentials({ projectRef, anonKey: token("anon") + suffix, serviceRoleKey: token("service_role") }).allowed, false);
  }
});
