import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server.js";

import { isAllowedLoginPost, safeReturnTo } from "../lib/server/login-request-security.ts";

function loginRequest(headers: HeadersInit = {}) {
  return new NextRequest("https://qa.touchline.example/api/auth/login", {
    method: "POST",
    headers,
  });
}

test("login request provenance fails closed for missing and cross-site browser metadata", () => {
  assert.equal(isAllowedLoginPost(loginRequest({ origin: "https://qa.touchline.example", "sec-fetch-site": "same-origin" })), true);
  assert.equal(isAllowedLoginPost(loginRequest({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(isAllowedLoginPost(loginRequest({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })), false);
  assert.equal(isAllowedLoginPost(loginRequest({ origin: "https://evil.example", "sec-fetch-site": "same-origin" })), false);
  assert.equal(isAllowedLoginPost(loginRequest({ "sec-fetch-site": "cross-site" })), false);
  assert.equal(isAllowedLoginPost(loginRequest()), false);
});

test("login returns only a local path and preserves a safe hash", () => {
  const request = loginRequest({ origin: "https://qa.touchline.example", "sec-fetch-site": "same-origin" });
  assert.equal(safeReturnTo(request, "/my-club?lang=pt-BR#squad"), "/my-club?lang=pt-BR#squad");
  assert.equal(safeReturnTo(request, "https://evil.example/#token"), "/arena");
  assert.equal(safeReturnTo(request, "//evil.example/#token"), "/arena");
});

test("the login handler rejects provenance before any identity-provider call", () => {
  const source = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  const guard = source.indexOf("if (!isAllowedLoginPost(request))");
  const providerCall = source.indexOf("supabase.auth.signInWithPassword");
  assert.ok(guard >= 0 && guard < providerCall, "the 403 provenance guard must precede signInWithPassword");
  assert.match(source, /return NextResponse\.json\(\{ ok: false, error: "invalid_origin" \}, \{ status: 403 \}\);/);
});
