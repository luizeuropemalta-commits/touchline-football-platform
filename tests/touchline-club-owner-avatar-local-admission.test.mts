import assert from "node:assert/strict";
import test from "node:test";
import {
  allowsClubOwnerAvatarLocalCore,
  allowsClubOwnerAvatarLocalEnvironment,
  isClubOwnerAvatarLocalRequestOrigin,
} from "../lib/touchlineArena/club-owner-avatar-local-admission.ts";

const qa = "https://xgxbwqxjssxxuihuwmgy.supabase.co";
const local = "http://localhost:3319";
const fixture = () => ({
  NODE_ENV: "development",
  TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED: "true",
  SUPABASE_URL: qa,
  NEXT_PUBLIC_SUPABASE_URL: qa,
});

test("local avatar admission requires explicit development opt-in and exact QA origins", () => {
  for (const origin of [local]) {
    assert.equal(allowsClubOwnerAvatarLocalEnvironment(fixture(), origin), true);
    assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
      NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview", TOUCHLINE_QA_SUPABASE_PROJECT_REF: "xgxbwqxjssxxuihuwmgy" }, origin), true);
  }
  for (const flag of [undefined, "", "false", "TRUE", "1"]) {
    assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED: flag }, local), false);
  }
  for (const nodeEnv of [undefined, "", "production", "test"]) {
    assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), NODE_ENV: nodeEnv }, local), false);
  }
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    for (const value of [undefined, qa + "/", qa + "?x=1", qa.replace("https", "http"), "https://vxireiswggllwhbsmdcj.supabase.co"]) {
      assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), [key]: value }, local), false, key);
    }
  }
});

test("local origins reject normalization tricks, LAN, hosted domains and other ports", () => {
  for (const value of [undefined, null, "", "http://localhost", "https://localhost:3319", "http://localhost:3320",
    "http://localhost:3319/", "http://LOCALHOST:3319", "http://localhost.:3319", "http://localhost.evil:3319",
    "http://127.0.0.1:3319", "http://127.1:3319", "http://[::1]:3319", "http://192.168.1.2:3319", "http://user@localhost:3319",
    "http://localhost:3319?x=1", "http://localhost:3319#x", " http://localhost:3319", "https://qa.touchline.com.br"]) {
    assert.equal(isClubOwnerAvatarLocalRequestOrigin(value), false, String(value));
    if (typeof value === "string") assert.equal(allowsClubOwnerAvatarLocalEnvironment(fixture(), value), false);
  }
});

test("hosted and isolated environments cannot use the local exception", () => {
  for (const key of ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_REGION", "NEXT_PUBLIC_VERCEL_ENV"]) {
    for (const value of ["", "0", "development", "preview", "production"]) {
      assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), [key]: value }, local), false, key);
    }
  }
  for (const [server, client] of [["qa-preview", undefined], [undefined, "qa-preview"], ["isolated-preview", "isolated-preview"],
    ["production", "production"], ["", ""], ["qa-preview", "isolated-preview"]]) {
    assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), TOUCHLINE_DEPLOYMENT_MODE: server,
      NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: client }, local), false);
  }
  assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), TOUCHLINE_ISOLATED_PREVIEW_PROJECT_ID: "" }, local), false);
  assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), TOUCHLINE_QA_SUPABASE_PROJECT_REF: "other" }, local), false);
});

test("core exception remains local-only, exact-QA and separate from feature activation", () => {
  const core = { environment: "local", requestOrigin: local, supabaseOrigin: qa, publicSupabaseOrigin: qa };
  assert.equal(allowsClubOwnerAvatarLocalCore(core), true);
  for (const environment of [undefined, "qa", "production", "development"]) {
    assert.equal(allowsClubOwnerAvatarLocalCore({ ...core, environment }), false);
  }
  assert.equal(allowsClubOwnerAvatarLocalCore({ ...core, publicSupabaseOrigin: "https://other.supabase.co" }), false);
  assert.equal(allowsClubOwnerAvatarLocalCore({ ...core, supabaseOrigin: "https://other.supabase.co" }), false);
  assert.equal(allowsClubOwnerAvatarLocalEnvironment({ ...fixture(), TOUCHLINE_CLUB_OWNER_AVATAR_LOCAL_ENABLED: undefined,
    TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED: "true", TOUCHLINE_CLUB_OWNER_AVATAR_UPLOAD_ENABLED: "true",
    TOUCHLINE_CLUB_OWNER_AVATAR_RETENTION_READY: "true" }, local), false);
});
