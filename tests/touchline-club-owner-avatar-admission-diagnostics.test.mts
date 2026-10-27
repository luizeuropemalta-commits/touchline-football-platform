import assert from "node:assert/strict";
import test from "node:test";
import { inspectClubOwnerAvatarAdmissionConfiguration as inspect } from "../lib/touchlineArena/club-owner-avatar-admission-diagnostics.ts";
import { allowsClubOwnerAvatarLocalEnvironment } from "../lib/touchlineArena/club-owner-avatar-local-admission.ts";
const actor = "10000000-0000-4000-8000-000000000001", origin = "http://localhost:3319";
const env = () => ({ NODE_ENV: "development", TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED: "true",
  SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co",
  TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "true",
  TOUCHLINE_CLUB_OWNER_AVATAR_SELECTION_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY: "true",
  TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: actor });
const run = (environment: Record<string, string | undefined>, requestOrigin = origin, expectedActorId = actor) => inspect({ environment, transport: "local", requestOrigin, expectedActorId });
test("configuration never claims authentication, Storage or retention proof", () => {
  const environment = env(), before = JSON.stringify(environment), result = run(environment);
  assert.deepEqual(result, { configuration: "checks_pending", codes: [], runtimeVerificationRequired: true });
  assert.equal(JSON.stringify(environment), before);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.codes));
});
test("each capability requires exact true and emits only its reason", () => {
  for (const [key, code] of [["READ_ENABLED", "read_disabled"], ["UPLOAD_ENABLED", "upload_disabled"],
    ["SELECTION_ENABLED", "selection_disabled"], ["RETENTION_READY", "retention_unverified"]]) {
    for (const value of [undefined, "", "false", "TRUE", "1"]) {
      const result = run({ ...env(), [`TOUCHLINE_CLUB_OWNER_AVATAR_${key}`]: value });
      assert.equal(result.configuration, "blocked"); assert.deepEqual(result.codes, [code]);
    }
  }
});
test("diagnostic reuses existing gate without allowing other ports or environments", () => {
  for (const [environment, requestOrigin] of [[env(), "http://localhost:3100"], [env(), "http://127.0.0.1:3319"],
    [{ ...env(), VERCEL: "1" }, origin], [{ ...env(), NODE_ENV: "production" }, origin],
    [{ ...env(), TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED: "false" }, origin],
    [{ ...env(), SUPABASE_URL: "https://other.supabase.co" }, origin]] as const) {
    assert.equal(allowsClubOwnerAvatarLocalEnvironment(environment, requestOrigin), false);
    assert.ok(run(environment, requestOrigin).codes.includes("local_environment_rejected"));
  }
  assert.ok(run(env(), "http://localhost:3100").codes.includes("local_origin_rejected"));
  assert.deepEqual(inspect({ environment: env(), transport: "hosted", requestOrigin: "https://example.com", expectedActorId: actor }).codes, ["hosted_environment_unverified"]);
});
test("absent, invalid and mismatching actors remain distinct", () => {
  assert.deepEqual(run({ ...env(), TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: "invalid" }).codes, ["configured_actor_invalid"]);
  assert.deepEqual(run(env(), origin, "").codes, ["actor_unverified"]);
  assert.deepEqual(run(env(), origin, "10000000-0000-4000-8000-000000000002").codes, ["actor_mismatch"]);
});
test("output never echoes keys, account, origin or arbitrary environment values", () => {
  const secret = "DO_NOT_EMIT_PRIVATE_VALUE";
  const output = JSON.stringify(run({ ...env(), SUPABASE_SERVICE_ROLE_KEY: secret, [secret]: secret,
    TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: secret }, `https://${secret}.invalid`, secret));
  for (const value of [secret, actor, origin, "SUPABASE_SERVICE_ROLE_KEY", "supabase.co"]) assert.ok(!output.includes(value));
  assert.equal(JSON.parse(output).runtimeVerificationRequired, true);
});
