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
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as publicError from "../lib/touchlineArena/public-error-i18n.ts";

function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

const proxyCode = compile("../proxy.ts");
const syncCode = compile("../components/touchline/DocumentLocaleSync.tsx");

function proxyHarness(releaseFlag?: string) {
  const process = { env: { TOUCHLINE_SITE_LOCALES_ENABLED: releaseFlag } };
  const siteLocales = {};
  runInNewContext(compile("../lib/touchlineArena/site-locales-release.ts"), { exports: siteLocales, process });
  const modules: Record<string, unknown> = {
    "@/lib/touchlineArena/site-locales-release": siteLocales,
    "next/server": { NextResponse },
    "@/lib/server/touchline-host-routing": hostRouting,
    "@/lib/touchlineArena/public-origin": publicOrigin,
    "@/lib/touchlineArena/auth-i18n": auth,
    "@/lib/touchlineArena/auth-access": access,
    "@/lib/touchlineArena/root-locale": locale,
    "@/lib/touchlineArena/catalogue-locale": catalogueLocale,
    "@/lib/touchlineArena/public-error-i18n": publicError,
    "@/lib/touchlineAudit/access": { isTouchlineAuditMode: () => false },
    "@/lib/touchlinePreview/isolation": { resolveTouchlineIsolatedPreviewRoutePolicy: () => ({ status: "inactive" }) },
    "@/lib/touchlinePreview/qa-visual-review": { TOUCHLINE_STABLE_QA_HOST: "qa.example.test" },
  };
  const exports: { proxy?: (request: NextRequest) => Promise<NextResponse> } = {};
  runInNewContext(proxyCode, {
    exports, URL, Headers, process,
    require(name: string) {
      assert.ok(name in modules, `Unexpected proxy dependency: ${name}`);
      return modules[name];
    },
  });
  assert.ok(exports.proxy);
  return exports.proxy;
}

function request(path: string, saved?: string, method = "GET") {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: saved === undefined ? {} : { cookie: `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=${saved}` },
  });
}

test("saved game language restores a canonical SSR destination and survives refresh", async () => {
  const run = proxyHarness();
  for (const saved of ["pt-BR", "en-GB"]) {
    const first = await run(request("/touchline-clubs?club=42#players", saved));
    assert.equal(first.status, 307);
    assert.equal(first.headers.get("location"), `http://localhost:3000/touchline-clubs?club=42&lang=${saved}#players`);
    assert.match(first.headers.get("cache-control") ?? "", /no-store/);
    const second = await run(new NextRequest(first.headers.get("location")!, {
      headers: { cookie: `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=${saved}` },
    }));
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("x-middleware-request-x-touchline-presentation-locale"), saved);
  }
});

test("real proxy restores eight saved locales only under the server release policy", async () => {
  for (const flag of [undefined, "false", "true"]) for (const { code } of i18n.TOUCHLINE_APPROVED_LOCALES) {
    const run = proxyHarness(flag);
    const expected = flag === "true" || code === "pt-BR" ? code : "en-GB";
    const first = await run(request("/intro", code));
    const location = first.headers.get("location");
    const final = location ? await run(new NextRequest(location, { headers: { cookie: `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=${code}` } })) : first;
    assert.equal(final.status, 200);
    assert.equal(final.headers.get("x-middleware-request-x-touchline-presentation-locale"), expected);
    assert.equal(final.headers.get("location"), null);
    if (location) assert.match(first.headers.get("cache-control") ?? "", /private.*no-store/);
  }
});

test("saved language wins over incidental old links, including unsupported and empty queries", async () => {
  const run = proxyHarness();
  for (const saved of ["en-GB", "pt-BR"]) {
    for (const query of ["en-GB", "pt-BR", "es-ES", "", "invalid"]) {
      const result = await run(request(`/intro?lang=${query}&club=42`, saved));
      if (query === saved) {
        assert.equal(result.status, 200);
        assert.equal(result.headers.get("x-middleware-request-x-touchline-presentation-locale"), saved);
      } else {
        assert.equal(result.status, 307);
        assert.equal(result.headers.get("location"), `http://localhost:3000/intro?lang=${saved}&club=42`);
        assert.match(result.headers.get("cache-control") ?? "", /private, no-store/);
        const canonical = await run(request(`/intro?lang=${saved}&club=42`, saved));
        assert.equal(canonical.status, 200);
        assert.equal(canonical.headers.get("location"), null);
      }
    }
  }
});

test("without a saved preference the explicit URL still follows the existing complete-locale gate", async () => {
  const run = proxyHarness();
  for (const saved of [undefined, "invalid", "ar-SA"]) {
    const portuguese = await run(request("/intro?lang=pt-BR", saved));
    assert.equal(portuguese.status, 200);
    assert.equal(portuguese.headers.get("x-middleware-request-x-touchline-presentation-locale"), "pt-BR");
    const draft = await run(request("/intro?lang=ar-SA", saved));
    assert.equal(draft.headers.get("location"), "http://localhost:3000/intro?lang=en-GB");
  }
});

test("absent, malformed and incomplete-language cookies preserve the English default", async () => {
  const run = proxyHarness();
  for (const saved of [undefined, "", "es-ES", "PT-br", "%", "invalid"]) {
    const result = await run(request("/intro", saved));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("location"), null);
    assert.equal(result.headers.get("x-middleware-request-x-touchline-presentation-locale"), "en-GB");
  }
});

test("saved browser language does not redirect APIs, callbacks, resources or mutations", async () => {
  const run = proxyHarness();
  for (const path of ["/api/notifications/preferences", "/auth/callback?code=synthetic", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml"]) {
    const result = await run(request(path, "pt-BR"));
    assert.equal(result.headers.get("location"), null, path);
  }
  const post = await run(request("/login", "pt-BR", "POST"));
  assert.equal(post.headers.get("location"), null);
  for (const path of ["/api/notifications/preferences", "/auth/callback?code=synthetic", "/manifest.webmanifest", "/_next/data/sample"]) {
    const join = path.includes("?") ? "&" : "?";
    const result = await run(request(`${path}${join}lang=en-GB`, "pt-BR"));
    assert.equal(result.headers.get("location"), null, path);
  }
  const explicitPost = await run(request("/login?lang=en-GB", "pt-BR", "POST"));
  assert.equal(explicitPost.headers.get("location"), null);
  const head = await run(request("/intro?lang=en-GB", "pt-BR", "HEAD"));
  assert.equal(head.headers.get("location"), "http://localhost:3000/intro?lang=pt-BR");
});

test("excluded requests never reach locale fallback for invalid or draft queries, with or without a cookie", async () => {
  const run = proxyHarness();
  const excludedPaths = [
    "/api/notifications/preferences",
    "/auth/callback?code=synthetic",
    "/auth/callback/nested?code=synthetic",
    "/_next/data/sample",
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
  ];
  for (const saved of [undefined, "pt-BR"]) {
    for (const lang of ["invalid", "ar-SA", "es-ES", ""]) {
      for (const path of excludedPaths) {
        for (const method of ["GET", "HEAD"]) {
          const join = path.includes("?") ? "&" : "?";
          const result = await run(request(`${path}${join}lang=${lang}`, saved, method));
          assert.equal(result.headers.get("location"), null, `${method} ${path} lang=${lang} saved=${saved}`);
        }
      }
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        for (const path of ["/intro", "/login"]) {
          const result = await run(request(`${path}?lang=${lang}`, saved, method));
          assert.equal(result.headers.get("location"), null, `${method} ${path} lang=${lang} saved=${saved}`);
        }
      }
    }
  }
});

function syncDocument(query: string, initialLocale: string, storageAvailable: boolean, pathname = "/intro") {
  const document = {
    cookie: "touchline:locale:v1=en-GB",
    documentElement: { lang: initialLocale as string, dir: "ltr" },
    querySelector: () => null,
  };
  const writes: string[] = [];
  const modules: Record<string, unknown> = {
    react: { useEffect: (effect: () => void) => effect() },
    "next/navigation": { usePathname: () => pathname, useSearchParams: () => new URLSearchParams(query) },
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/root-locale": locale,
    "@/lib/touchlineArena/auth-i18n": auth,
    "@/lib/touchlineArena/browser-storage": { writeBrowserStorage: (_kind: string, _key: string, value: string) => {
      if (storageAvailable) writes.push(value);
      return storageAvailable;
    } },
  };
  const exports: { default?: (props: { initialLocale: string }) => unknown } = {};
  runInNewContext(syncCode, { exports, document, require(name: string) {
    assert.ok(name in modules, `Unexpected locale-sync dependency: ${name}`);
    return modules[name];
  } });
  assert.ok(exports.default);
  exports.default({ initialLocale });
  return { document, writes };
}

test("login alone keeps an explicitly selected authored draft locale while product routes stay gated", async () => {
  const run = proxyHarness();
  for (const localeCode of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const login = await run(request(`/login?lang=${localeCode}&returnTo=%2Fclubowner%3Flang%3Dpt-BR`, "pt-BR"));
    assert.equal(login.status, 200, `login ${localeCode} should not redirect`);
    assert.equal(login.headers.get("location"), null);
    assert.equal(login.headers.get("x-middleware-request-x-touchline-presentation-locale"), localeCode);
    assert.equal(login.headers.get("x-middleware-request-x-touchline-login-presentation-locale"), localeCode);

    for (const path of ["/intro", "/clubowner", "/fantasy", "/register", "/forgot-password", "/reset-password", "/admin/login"]) {
      const product = await run(request(`${path}?lang=${localeCode}`, "pt-BR"));
      assert.equal(product.headers.get("location"), `http://localhost:3000${path}?lang=pt-BR`, `${path} ${localeCode}`);
    }
  }
  const nestedLogin = await run(request("/login/help?lang=es-ES", "pt-BR"));
  assert.equal(nestedLogin.headers.get("location"), "http://localhost:3000/login/help?lang=pt-BR");
  const staleLogin = await run(request("/login?lang=en-GB&returnTo=%2Fclubowner%3Flang%3Den-GB", "pt-BR"));
  assert.equal(staleLogin.headers.get("location"), "http://localhost:3000/login?lang=pt-BR&returnTo=%2Fclubowner%3Flang%3Den-GB");
});

test("Arabic login publishes an RTL document locale without changing saved game preference", () => {
  const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const syncSource = readFileSync(new URL("../components/touchline/DocumentLocaleSync.tsx", import.meta.url), "utf8");
  const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(layoutSource, /requestHeaders\.get\(TOUCHLINE_LOGIN_PRESENTATION_LOCALE_HEADER\)/);
  assert.match(layoutSource, /normalizeTouchLineLoginLocale\(loginLocale\)/);
  assert.match(proxySource, /pathname === "\/login" && !protectedReturn && isTouchLineLoginDraftLocale\(requestedLocale\)/);
  assert.match(syncSource, /const loginRoute = pathname === "\/login"/);
  assert.doesNotMatch(syncSource, /document\.cookie\s*=|writeBrowserStorage/);
  const arabic = syncDocument("lang=ar-SA", "ar-SA", true, "/login");
  assert.equal(arabic.document.documentElement.lang, "ar-SA");
  assert.equal(arabic.document.documentElement.dir, "rtl");
  assert.equal(arabic.document.cookie, "touchline:locale:v1=en-GB");
  assert.deepEqual(arabic.writes, []);
});

test("incidental in-game navigation never overwrites the saved preference", () => {
  for (const storageAvailable of [false, true]) {
    const result = syncDocument("lang=pt-BR", "en-GB", storageAvailable);
    assert.equal(result.document.documentElement.lang, "pt-BR");
    assert.equal(result.document.cookie, "touchline:locale:v1=en-GB");
    assert.deepEqual(result.writes, []);
  }
});

test("navigation without explicit language retains SSR language without overwriting browser choice", () => {
  const result = syncDocument("", "pt-BR", true);
  assert.equal(result.document.documentElement.lang, "pt-BR");
  assert.equal(result.document.cookie, "touchline:locale:v1=en-GB");
  assert.deepEqual(result.writes, []);
});
