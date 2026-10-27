import assert from "node:assert/strict";
import test from "node:test";
import { buildQaAvatarLocalEnvironment } from "../scripts/local/qa-avatar-local-environment.mts";
import { allowsClubOwnerAvatarLocalEnvironment } from "../lib/touchlineArena/club-owner-avatar-local-admission.ts";
const source = () => ({ SUPABASE_URL: "https://xgxbwqxjssxxuihuwmgy.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
  TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "true",
  TOUCHLINE_CLUB_OWNER_AVATAR_SELECTION_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY: "true",
  TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID: "11111111-1111-4111-8111-111111111111", TOUCHLINE_OWNER_EMAILS: "admin@example.invalid" });
test("explicit composition admits only existing3319 local contract, preserves source and excludes host flags", () => {
  const input = source(), before = JSON.stringify(input);
  const { preview, origin } = buildQaAvatarLocalEnvironment(input, { VERCEL_ENV: "production", TOUCHLINE_CLUB_RELEASE_ENABLED: "true" });
  assert.equal(JSON.stringify(input), before); assert.equal(origin, "http://localhost:3319");
  assert.equal(allowsClubOwnerAvatarLocalEnvironment(preview, origin), true);
  assert.equal(allowsClubOwnerAvatarLocalEnvironment(preview, "http://localhost:3100"), false);
  assert.equal(preview.TOUCHLINE_CLUB_RELEASE_ENABLED, undefined);
  assert.equal(preview.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID, input.TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID);
  assert.equal(Object.keys(preview).some(key => key.startsWith("VERCEL")), false);
});
test("retention and every capability require explicit opt-in; absent or malformed actor/owners denied", () => {
  for (const key of Object.keys(source()).filter(key => /ENABLED$|READY$/.test(key))) for (const value of [undefined, "false", "TRUE", "1"]) {
    assert.throws(() => buildQaAvatarLocalEnvironment({ ...source(), [key]: value }, {}));
  }
  for (const key of ["TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ACCOUNT_ID", "TOUCHLINE_OWNER_EMAILS"]) {
    assert.throws(() => buildQaAvatarLocalEnvironment({ ...source(), [key]: "invalid" }, {}));
  }
});
test("hosted, isolated, wrong database and nondirect source envelopes cannot be laundered", () => {
  for (const patch of [{ VERCEL_ENV: "preview" }, { NEXT_PUBLIC_VERCEL_URL: "" }, { TOUCHLINE_ISOLATED_PREVIEW_MODE: "" },
    { SUPABASE_URL: "https://other.supabase.co" }, { TOUCHLINE_DATA_SOURCE: "demo" }]) assert.throws(() => buildQaAvatarLocalEnvironment({ ...source(), ...patch }, {}));
});
