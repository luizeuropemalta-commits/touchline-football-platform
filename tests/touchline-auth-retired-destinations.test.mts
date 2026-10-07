import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";
import { normalizeTouchLineAuthLocale, normalizeTouchLineAuthReturnTo, normalizeTouchLineAdminReturnTo, touchLinePostAuthHref } from "../lib/touchlineArena/auth-i18n.ts";
import { touchlineRegistrationEntryHref } from "../lib/touchlineArena/arena-onboarding.ts";
import { resolveTouchLineAuthCallbackDestination } from "../lib/server/auth-callback-destination.ts";
import { isAllowedLoginPost, safeReturnTo } from "../lib/server/login-request-security.ts";
import { shouldSecureLoginCookie } from "../lib/server/login-cookie-security.ts";

const origin = "https://touchline.example";
const request = new NextRequest(`${origin}/api/auth/login`, { method: "POST" });

test("ordinary authentication defaults to Market while registration always requests the complete intro", () => {
  assert.equal(touchLinePostAuthHref(null, "pt-BR"), "/clubowner?lang=pt-BR");
  assert.equal(touchLinePostAuthHref(undefined, "unsupported"), "/clubowner?lang=en-GB");
  assert.equal(safeReturnTo(request, undefined), "/clubowner");
  assert.equal(resolveTouchLineAuthCallbackDestination(null, origin).href, `${origin}/clubowner`);
  for (const returnTo of [null, "/intro?skipIntro=1", "/club-owner/me", "/clubowner"]) {
    const registration = new URL(touchlineRegistrationEntryHref(returnTo, "pt-BR"), origin);
    assert.equal(registration.pathname, "/intro");
    assert.equal(registration.searchParams.get("intro"), "first");
    assert.equal(registration.searchParams.get("lang"), "pt-BR");
    assert.equal(registration.searchParams.has("skipIntro"), false);
  }
});

test("retired ClubOwner returns land in Market without carrying private route context", () => {
  for (const path of ["/club-owner", "/club-owner/me", "/club-owner/new-owner/history", "/club-owner/new-owner/substitution"]) {
    const input = `${path}?lang=pt-BR&owner=someone&returnTo=/admin#old-squad`;
    const expected = "/clubowner?lang=pt-BR";
    assert.equal(normalizeTouchLineAuthReturnTo(input), expected);
    assert.equal(safeReturnTo(request, input), expected);
    assert.equal(resolveTouchLineAuthCallbackDestination(input, origin).href, `${origin}${expected}`);
    assert.equal(touchLinePostAuthHref(input, "en-GB"), "/clubowner?lang=en-GB");
  }
});

test("new and legacy first-entry links preserve intro while ordinary Arena returns become Market", () => {
  for (const input of ["/intro?intro=first&lang=pt-BR", "/arena?intro=first&lang=pt-BR"]) {
    assert.equal(normalizeTouchLineAuthReturnTo(input), "/intro?intro=first&lang=pt-BR");
    assert.equal(resolveTouchLineAuthCallbackDestination(input, origin).href, `${origin}/intro?intro=first&lang=pt-BR`);
  }
  assert.equal(normalizeTouchLineAuthReturnTo("/arena/bench?lang=pt-BR"), "/clubowner?lang=pt-BR");
});

test("destination migration refuses external and prefix-lookalike targets on every auth seam", () => {
  for (const input of ["https://evil.example/admin", "//evil.example/admin", "/\\evil.example/admin", "/admin-other", "/visual-qa-other", "javascript:alert(1)", "http://["]) {
    assert.equal(normalizeTouchLineAuthReturnTo(input), null, input);
    assert.equal(safeReturnTo(request, input), "/clubowner", input);
    assert.equal(resolveTouchLineAuthCallbackDestination(input, origin).href, `${origin}/clubowner`, input);
    assert.equal(normalizeTouchLineAdminReturnTo(input), "/admin", input);
  }
  for (const input of ["/club-owner-other", "/intro-other", "/intro/nested"]) {
    assert.equal(normalizeTouchLineAuthReturnTo(input), null, input);
    assert.equal(resolveTouchLineAuthCallbackDestination(input, origin).href, `${origin}/clubowner`, input);
  }
});

test("native login retains its existing public same-origin return destinations", () => {
  for (const path of ["/live?lang=pt-BR#match", "/rankings?lang=en-GB", "/touchline-players/123?lang=pt-BR", "/touchline-clubs/arsenal?lang=en-GB#squad"]) {
    assert.equal(safeReturnTo(request, path), path);
  }
});

test("raw control characters cannot be normalized into accepted auth destinations", () => {
  for (const input of ["/ad\tmin", "/clubowner\n", "/intro?intro=first\r", "/club-owner/\u0000me", "/admin\u007f"]) {
    assert.equal(normalizeTouchLineAuthReturnTo(input), null);
    assert.equal(safeReturnTo(request, input), "/clubowner");
    assert.equal(resolveTouchLineAuthCallbackDestination(input, origin).href, `${origin}/clubowner`);
  }
});

test("approved admin, QA, recovery and current Market destinations retain their boundaries", () => {
  for (const path of ["/admin/finance?lang=pt-BR#ledger", "/visual-qa/cards?lang=pt-BR", "/clubowner?club=arsenal&lang=pt-BR#my-club-xi-pitch"]) {
    assert.equal(normalizeTouchLineAuthReturnTo(path), path);
    assert.equal(safeReturnTo(request, path), path);
    assert.equal(resolveTouchLineAuthCallbackDestination(path, origin).href, `${origin}${path}`);
  }
  assert.equal(resolveTouchLineAuthCallbackDestination("/reset-password?lang=pt-BR", origin).href, `${origin}/reset-password?lang=pt-BR`);
  assert.equal(normalizeTouchLineAdminReturnTo("/intro?intro=first"), "/admin");
  assert.equal(normalizeTouchLineAdminReturnTo("/club-owner/me"), "/admin");
  assert.equal(touchlineRegistrationEntryHref("/admin/finance", "pt-BR"), "/admin/finance?lang=pt-BR");
});

function loginRoute() {
  let exchanges = 0;
  let accessChecks = 0;
  const source = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
  const exports: { POST?: (request: NextRequest) => Promise<Response> } = {};
  const release = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: release, process: { env: {} } });
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/auth-i18n": { normalizeTouchLineAuthLocale, normalizeTouchLineAuthReturnTo },
    "@/lib/touchlineArena/site-locales-release": release,
    "next/server": { NextRequest, NextResponse },
    "@/lib/server/login-request-security": { isAllowedLoginPost, safeReturnTo },
    "@/lib/server/login-cookie-security": { shouldSecureLoginCookie },
    "@/lib/server/touchline-arena-access": { ensureTouchlineArenaAccess: async () => { accessChecks++; } },
    "@supabase/ssr": { createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[]) => void } }) => ({
      auth: { signInWithPassword: async () => {
        exchanges++;
        options.cookies.setAll([{ name: "sb-test", value: "synthetic-session", options: { httpOnly: true, domain: "untrusted.example", sameSite: "none" } }]);
        return { data: { user: { id: "synthetic-user" }, session: { access_token: "synthetic-access", refresh_token: "synthetic-refresh" } }, error: null };
      } },
    }) },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-key", NODE_ENV: "production" } },
    require: (name: string) => { assert.ok(name in modules, `Unexpected route dependency: ${name}`); return modules[name]; },
  });
  assert.ok(exports.POST);
  return { post: exports.POST, exchanges: () => exchanges, accessChecks: () => accessChecks };
}

function nativePost(fields: Record<string, string>, provenance = origin) {
  return new NextRequest(`${origin}/api/auth/login`, {
    method: "POST", headers: { origin: provenance, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

test("native login redirects to Market and preserves session protections and the access check", async () => {
  const route = loginRoute();
  const response = await route.post(nativePost({ email: "synthetic@example.test", password: "synthetic-only", return_to: "/club-owner/me/history?lang=pt-BR" }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}/clubowner?lang=pt-BR`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Path=\//i);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(route.exchanges(), 1);
  assert.equal(route.accessChecks(), 1);
});

test("native errors retain locale and admin login entry without echoing unsafe return targets", async () => {
  const route = loginRoute();
  const response = await route.post(nativePost({ login_path: "/admin/login", locale: "pt-BR", return_to: "https://evil.example/admin" }));
  const destination = new URL(response.headers.get("location")!);
  assert.equal(response.status, 303);
  assert.equal(destination.origin, origin);
  assert.equal(destination.pathname, "/admin/login");
  assert.equal(destination.searchParams.get("lang"), "pt-BR");
  assert.equal(destination.searchParams.get("error"), "invalid_credentials");
  assert.equal(destination.searchParams.has("returnTo"), false);
  const refused = await route.post(nativePost({ email: "synthetic@example.test", password: "synthetic-only" }, "https://evil.example"));
  assert.equal(refused.status, 403);
  assert.equal(route.exchanges(), 0);
  assert.equal(route.accessChecks(), 0);
});
