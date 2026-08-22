import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  isSameOriginAnalyticsRequest,
  parseTouchlineAnalyticsPayload,
  readBoundedTouchlineAnalyticsJson,
  touchlineAnalyticsAreaFromReferrer,
  touchlineAnalyticsDeviceFromHeaders,
} from "../lib/touchlineArena/analytics-contract.ts";
import {
  getOrCreateIdentityBoundBrowserSessionId,
} from "../lib/touchlineArena/browser-storage.ts";

const routeSource = fs.readFileSync(
  new URL("../app/api/touchline-analytics/route.ts", import.meta.url),
  "utf8",
);
const trackerSource = fs.readFileSync(
  new URL("../components/touchline-activity-tracker.tsx", import.meta.url),
  "utf8",
);
const migrationSource = fs.readFileSync(
  new URL("../supabase/qa/012_touchline_qa_analytics_secure_recording.sql", import.meta.url),
  "utf8",
);
const rollbackSource = fs.readFileSync(
  new URL("../supabase/qa/012_touchline_qa_analytics_secure_recording_rollback.sql", import.meta.url),
  "utf8",
);

const validPayload = {
  sessionId: "4b5ee71f-4b8e-4a28-b833-ecc53dd87663",
};

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("touchline-analytics-session", initial);
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    read(key: string) {
      return values.get(key) ?? null;
    },
  };
}

test("analytics accepts only the exact request origin", () => {
  const requestUrl = "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/api/touchline-analytics";
  assert.equal(isSameOriginAnalyticsRequest(requestUrl, new URL(requestUrl).origin), true);
  assert.equal(isSameOriginAnalyticsRequest(requestUrl, "https://attacker.example"), false);
  assert.equal(isSameOriginAnalyticsRequest(requestUrl, null), false);
  assert.equal(isSameOriginAnalyticsRequest(requestUrl, "not-a-url"), false);
});

test("analytics derives its area from the same-origin referring page", () => {
  const requestUrl = "https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app/api/touchline-analytics";
  assert.equal(
    touchlineAnalyticsAreaFromReferrer(requestUrl, `${new URL(requestUrl).origin}/touchline-tables?lang=en-GB`),
    "ranking",
  );
  assert.equal(
    touchlineAnalyticsAreaFromReferrer(requestUrl, "https://attacker.example/admin"),
    null,
  );
  assert.equal(
    touchlineAnalyticsAreaFromReferrer(requestUrl, `${new URL(requestUrl).origin}/football-search`),
    "other",
  );
  assert.equal(
    touchlineAnalyticsAreaFromReferrer(requestUrl, `${new URL(requestUrl).origin}/admin`),
    "admin",
  );
  assert.equal(touchlineAnalyticsAreaFromReferrer(requestUrl, null), null);
});

test("analytics derives device class from server-visible request headers", () => {
  assert.equal(touchlineAnalyticsDeviceFromHeaders(new Headers({ "sec-ch-ua-mobile": "?1" })), "mobile");
  assert.equal(touchlineAnalyticsDeviceFromHeaders(new Headers({ "user-agent": "Mozilla/5.0 (iPad) Safari" })), "tablet");
  assert.equal(touchlineAnalyticsDeviceFromHeaders(new Headers({ "user-agent": "Mozilla/5.0 Safari/605.1.15" })), "desktop");
  assert.equal(touchlineAnalyticsDeviceFromHeaders(new Headers()), "unknown");
});

test("analytics JSON reader rejects unsupported and oversized bodies", async () => {
  const requestUrl = "https://touchline.example/api/touchline-analytics";
  const accepted = new Request(requestUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  assert.deepEqual(await readBoundedTouchlineAnalyticsJson(accepted), validPayload);

  const wrongType = new Request(requestUrl, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify(validPayload),
  });
  assert.equal(await readBoundedTouchlineAnalyticsJson(wrongType), null);

  const oversized = new Request(requestUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...validPayload, padding: "x".repeat(2_000) }),
  });
  assert.equal(await readBoundedTouchlineAnalyticsJson(oversized), null);
});

test("analytics payload contract rejects malformed or oversized activity", () => {
  assert.deepEqual(parseTouchlineAnalyticsPayload(validPayload), validPayload);
  assert.equal(parseTouchlineAnalyticsPayload({ ...validPayload, sessionId: "forged" }), null);
  assert.equal(parseTouchlineAnalyticsPayload({ ...validPayload, area: "ranking" }), null);
  assert.equal(parseTouchlineAnalyticsPayload({ ...validPayload, device: "desktop" }), null);
  assert.equal(parseTouchlineAnalyticsPayload({ ...validPayload, activeSeconds: 15 }), null);
  assert.equal(parseTouchlineAnalyticsPayload({ ...validPayload, ignored: true }), null);
  assert.equal(parseTouchlineAnalyticsPayload(null), null);
});

test("analytics session ownership cannot be forged by the client", () => {
  assert.equal(parseTouchlineAnalyticsPayload({ ...validPayload, userId: "user-b" }), null);
  assert.match(migrationSource, /owner_mismatch/);
  assert.match(migrationSource, /where id = p_session_id[\s\S]*and user_id = p_user_id/);
});

test("analytics browser session rotates when the authenticated identity changes", async () => {
  const storage = memoryStorage("4b5ee71f-4b8e-4a28-b833-ecc53dd87663");
  const first = await getOrCreateIdentityBoundBrowserSessionId(
    "touchline-analytics-session",
    "user-a",
    { storage, identityFingerprint: "fingerprint-a", randomUuid: () => "8a73491d-c3e2-4ba1-9603-702fa75fac2c" },
  );
  const repeated = await getOrCreateIdentityBoundBrowserSessionId(
    "touchline-analytics-session",
    "user-a",
    { storage, identityFingerprint: "fingerprint-a", randomUuid: () => "d5889ae5-229a-4c42-8f7a-ce1dd521f82d" },
  );
  const switched = await getOrCreateIdentityBoundBrowserSessionId(
    "touchline-analytics-session",
    "user-b",
    { storage, identityFingerprint: "fingerprint-b", randomUuid: () => "e391c220-b5d2-4b21-8e42-67613040964f" },
  );

  assert.equal(first, "8a73491d-c3e2-4ba1-9603-702fa75fac2c");
  assert.equal(repeated, first);
  assert.equal(switched, "e391c220-b5d2-4b21-8e42-67613040964f");
  assert.notEqual(switched, first);
  assert.doesNotMatch(storage.read("touchline-analytics-session") ?? "", /user-a|user-b/);
});

test("analytics route keeps auth, RBAC, origin and forged-session boundaries server-side", () => {
  assert.match(routeSource, /isSameOriginAnalyticsRequest/);
  assert.match(routeSource, /supabase\.auth\.getUser\(\)/);
  assert.match(routeSource, /hasTouchLineArenaAccess\(user\)/);
  assert.match(routeSource, /touchline_record_analytics_observation/);
  assert.match(routeSource, /session_owner_mismatch/);
  assert.match(routeSource, /parseTouchlineAnalyticsPayload/);
  assert.match(routeSource, /touchlineAnalyticsDeviceFromHeaders/);
  assert.doesNotMatch(trackerSource, /userId\s*:/);
  assert.doesNotMatch(trackerSource, /activeSeconds|device:/);
  assert.match(trackerSource, /credentials:\s*"same-origin"/);
});

test("analytics database command is atomic, service-only and principal-bounded", () => {
  assert.equal(
    fs.existsSync(new URL("../supabase/migrations/20260820170000_qa_touchline_analytics_nonblocking_guard.sql", import.meta.url)),
    false,
  );
  assert.match(migrationSource, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(migrationSource, /security definer/);
  assert.match(migrationSource, /set search_path = ''/);
  assert.match(migrationSource, /auth\.role\(\)[\s\S]*service_role/);
  assert.match(migrationSource, /pg_try_advisory_xact_lock/);
  assert.doesNotMatch(migrationSource, /perform pg_advisory_xact_lock/);
  assert.match(migrationSource, /for update/);
  assert.match(migrationSource, /max\(last_seen_at\), count\(\*\)::integer/);
  assert.match(migrationSource, /v_user_elapsed_seconds < v_minimum_cadence_seconds/);
  assert.match(migrationSource, /v_total_sessions >= v_session_limit/);
  assert.match(migrationSource, /least\(v_user_elapsed_seconds, v_maximum_credit_seconds\)/);
  assert.match(migrationSource, /active_seconds = active_seconds \+ v_credited_seconds/);
  assert.match(migrationSource, /where id = p_session_id[\s\S]*and user_id = p_user_id/);
  assert.doesNotMatch(migrationSource, /p_active_seconds|interval '24 hours'/);
  assert.match(migrationSource, /revoke all[\s\S]*public, anon, authenticated/);
  assert.match(migrationSource, /grant execute[\s\S]*service_role/);
  assert.match(rollbackSource, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  assert.match(rollbackSource, /drop function if exists public\.touchline_record_analytics_observation/);
  assert.match(rollbackSource, /commit;/);
});
