import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";
import * as hostRouting from "../lib/server/touchline-host-routing.ts";
import * as publicOrigin from "../lib/touchlineArena/public-origin.ts";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";
import * as access from "../lib/touchlineArena/auth-access.ts";
import * as locale from "../lib/touchlineArena/root-locale.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as publicErrors from "../lib/touchlineArena/public-error-i18n.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../proxy.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const customer = { id: "synthetic-customer", email: "customer@example.test", app_metadata: { touchline_arena_access_v1: true } };
const admin = { id: "synthetic-admin", email: "admin@example.test", app_metadata: { touchline_arena_access_v1: true } };

function harness(options: {
  user?: typeof customer | null;
  offline?: boolean;
  audit?: boolean;
  isolated?: boolean;
  policyThrows?: boolean;
  missingAuth?: boolean;
  authThrows?: boolean;
} = {}) {
  let authImports = 0;
  let identityReads = 0;
  const siteLocales = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: siteLocales, process: { env: {} } });
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/site-locales-release": siteLocales,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/public-error-i18n": publicErrors,
    "next/server": { NextResponse },
    "@/lib/server/touchline-host-routing": hostRouting,
    "@/lib/touchlineArena/public-origin": publicOrigin,
    "@/lib/touchlineArena/auth-i18n": auth,
    "@/lib/touchlineArena/auth-access": access,
    "@/lib/touchlineArena/root-locale": locale,
    "@/lib/touchlineAudit/access": { isTouchlineAuditMode: () => options.audit, hasTouchlineAuditToken: () => false, isTouchlineAuditExpired: () => false },
    "@/lib/touchlinePreview/isolation": {
      TOUCHLINE_ISOLATED_PREVIEW_HEADER: "x-touchline-isolated-preview",
      resolveTouchlineIsolatedPreviewRoutePolicy: () => {
        if (options.policyThrows) throw new Error("synthetic policy failure");
        return options.isolated ? { status: "blocked", reason: "route-not-allowed" } : { status: "not-preview" };
      },
    },
    "@/lib/touchlinePreview/qa-visual-review": { isTouchlineQaAuthenticatedVisualReviewRoute: () => false, TOUCHLINE_STABLE_QA_HOST: "qa.example.test" },
    "@/lib/admin/owner": { isOwnerEmail: (email: string) => email === admin.email },
    "@supabase/ssr": { createServerClient: (_url: string, _key: string, config: { cookies: { setAll: (items: object[]) => void } }) => ({
      auth: { getUser: async () => {
        identityReads++;
        if (options.authThrows) throw new Error("synthetic auth failure");
        config.cookies.setAll([{ name: "sb-refresh", value: "synthetic-refreshed", options: { path: "/", httpOnly: true } }]);
        return { data: { user: options.user ?? null }, error: null };
      } },
    }) },
  };
  const exports: { proxy?: (request: NextRequest) => Promise<NextResponse> } = {};
  runInNewContext(compiled, {
    exports, URL, Headers, console: { error() {} },
    process: { env: {
      TOUCHLINE_SITE_OFFLINE: options.offline ? "true" : "false",
      ...(options.missingAuth ? {} : { NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-key" }),
    } },
    require(name: string) {
      assert.ok(name in modules, `Unexpected proxy dependency: ${name}`);
      if (name === "@supabase/ssr") authImports++;
      return modules[name];
    },
  });
  assert.ok(exports.proxy);
  return { run: exports.proxy, imports: () => authImports, reads: () => identityReads };
}

function request(path: string, origin = "https://qa.example.test") {
  return new NextRequest(`${origin}${path}`, { headers: { cookie: "sb-existing=synthetic-existing; preference=keep" } });
}

test("all retired ClubOwner paths redirect directly to Market without importing Auth or touching cookies", async () => {
  for (const user of [null, customer, admin]) {
    for (const origin of ["https://qa.example.test", "http://localhost:3000"]) {
      const h = harness({ user });
      for (const path of ["/club-owner", "/club-owner/", "/club-owner/me", "/club-owner/me/history", "/club-owner/foreign/renewals", "/club-owner/luiz-lopez/substitution"]) {
        const input = request(`${path}?lang=pt-BR&owner=foreign&returnTo=/admin`, origin);
        const result = await h.run(input);
        assert.equal(result.status, 307, path);
        assert.equal(result.headers.get("location"), `${origin}/clubowner?lang=pt-BR`, path);
        assert.equal(result.headers.get("set-cookie"), null);
        assert.equal(input.cookies.get("sb-existing")?.value, "synthetic-existing");
        assert.equal(input.cookies.get("preference")?.value, "keep");
      }
      assert.equal(h.imports(), 0);
      assert.equal(h.reads(), 0);
    }
  }
});

test("lookalike paths remain outside ClubOwner compatibility", async () => {
  const h = harness();
  for (const path of ["/club-owner-other", "/club-ownership/me", "/club-owner%2Fme"]) {
    const result = await h.run(request(path));
    assert.equal(result.headers.get("location"), null);
    assert.equal(result.headers.get("x-middleware-next"), "1");
  }
  assert.equal(h.imports(), 0);
});

test("locale canonicalization remains ahead of the retired redirect", async () => {
  const h = harness();
  const first = await h.run(request("/club-owner/me?lang=es-ES"));
  assert.equal(first.headers.get("location"), "https://qa.example.test/club-owner/me?lang=en-GB");
  const second = await h.run(new NextRequest(first.headers.get("location")!));
  assert.equal(second.headers.get("location"), "https://qa.example.test/clubowner?lang=en-GB");
  assert.equal(h.imports(), 0);
});

test("isolated Preview and audit boundaries take precedence over retired redirects", async () => {
  for (const options of [{ isolated: true }, { audit: true }]) {
    const h = harness(options);
    const result = await h.run(request("/club-owner/me/history?lang=pt-BR"));
    assert.equal(result.status, 404);
    assert.equal(result.headers.get("location"), null);
    assert.equal(h.imports(), 0);
  }
  const local = harness({ isolated: true });
  assert.equal((await local.run(request("/club-owner/me", "http://localhost:3000"))).status, 404);
});

test("offline public policy still wins while technical QA and local development retain their existing exemption", async () => {
  const h = harness({ offline: true });
  const publicResult = await h.run(request("/club-owner/me", "https://touchline.example"));
  assert.equal(publicResult.status, 503);
  assert.equal(publicResult.headers.get("location"), null);
  for (const origin of ["https://synthetic.vercel.app", "http://localhost:3000"]) {
    assert.equal((await h.run(request("/club-owner/me", origin))).headers.get("location"), `${origin}/clubowner?lang=en-GB`);
  }
  assert.equal(h.imports(), 0);
});

test("retired redirects work without auth configuration but Market remains protected", async () => {
  const h = harness({ missingAuth: true });
  assert.equal((await h.run(request("/club-owner/me"))).headers.get("location"), "https://qa.example.test/clubowner?lang=en-GB");
  const market = await h.run(request("/clubowner?lang=pt-BR"));
  assert.equal(new URL(market.headers.get("location")!).pathname, "/login");
  assert.equal(h.imports(), 0);
});

test("My Club keeps its anonymous and Admin gates and refreshed cookies for customers", async () => {
  for (const origin of ["https://qa.example.test", "http://localhost:3000"]) {
    const anonymous = harness();
    assert.equal(new URL((await anonymous.run(request("/my-club?lang=pt-BR", origin))).headers.get("location")!).pathname, "/login");
    const administrator = harness({ user: admin });
    assert.equal((await administrator.run(request("/my-club", origin))).status, 404);
    const owner = harness({ user: customer });
    const result = await owner.run(request("/my-club", origin));
    assert.equal(result.headers.get("x-middleware-next"), "1");
    assert.match(result.headers.get("set-cookie") ?? "", /sb-refresh=synthetic-refreshed/);
    assert.equal(owner.reads(), 1);
  }
});

test("Admin, Market capability and failed-session boundaries remain enforced", async () => {
  const withoutCapability = harness({ user: { ...customer, app_metadata: { touchline_arena_access_v1: false } } });
  assert.equal(new URL((await withoutCapability.run(request("/clubowner"))).headers.get("location")!).pathname, "/login");
  for (const lang of ["pt-BR", "en-GB"]) {
    const owner = harness({ user: customer });
    const forbidden = await owner.run(request(`/admin/finance?lang=${lang}`));
    assert.equal(forbidden.status, 307);
    assert.equal(forbidden.headers.get("location"), `https://qa.example.test/intro?lang=${lang}`);
    assert.match(forbidden.headers.get("set-cookie") ?? "", /sb-refresh=synthetic-refreshed/);
  }
  const failed = harness({ authThrows: true });
  const result = await failed.run(request("/my-club"));
  assert.equal(new URL(result.headers.get("location")!).pathname, "/login");
  assert.match(result.headers.get("set-cookie") ?? "", /sb-existing=;/);
  assert.doesNotMatch(result.headers.get("set-cookie") ?? "", /preference=/);
});

test("safe 404 links directly to the localized TouchLine intro without losing refreshed cookies", async () => {
  for (const [lang, label] of [["pt-BR", "Voltar para TouchLine"], ["en-GB", "Back to TouchLine"]]) {
    const administrator = harness({ user: admin });
    const result = await administrator.run(request(`/my-club?lang=${lang}`));
    assert.equal(result.status, 404);
    assert.equal(result.headers.get("location"), null);
    assert.match(result.headers.get("set-cookie") ?? "", /sb-refresh=synthetic-refreshed/);
    assert.match(result.headers.get("cache-control") ?? "", /no-store/);
    const body = await result.text();
    assert.ok(body.includes(`<a href="/intro?lang=${lang}">${label}</a>`));
    assert.doesNotMatch(body, /href="\/arena|Return to Arena|Voltar para a Arena/);
  }
});

test("unexpected boundary failures never bypass My Club or redirect a blocked retired route", async () => {
  const h = harness({ policyThrows: true });
  assert.equal((await h.run(request("/club-owner/me/history"))).status, 404);
  assert.equal(new URL((await h.run(request("/my-club"))).headers.get("location")!).pathname, "/login");
  assert.equal(h.imports(), 0);
});
