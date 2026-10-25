import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { touchLineAuthEntryHref } from "../lib/touchlineArena/auth-i18n.ts";
import { getTouchlineArenaShellCopy } from "../lib/touchlineArena/arena-shell-i18n.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const accountId = "11111111-1111-4111-8111-111111111111";
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
type Input = { path?: string; locale?: string; owner?: boolean; accountId?: string | null; release?: boolean; busy?: boolean; error?: string };

/** Real shell/header/navigation/catalogues. Only framework, visuals and
 * account-preference controls are explicit boundaries; not browser proof. */
function fixture(input: Input = {}) {
  const path = input.path ?? "/notifications";
  const locale = input.locale ?? "pt-BR";
  const account = input.accountId === undefined ? accountId : input.accountId;
  type ModuleExports = Record<string, unknown>;
  const cache = new Map<string, ModuleExports>();
  const empty = () => null;
  const modules: Record<string, unknown> = {
    react: React, "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children), useLinkStatus: () => ({ pending: false }) },
    "next/navigation": { usePathname: () => path, useSearchParams: () => new URLSearchParams({ lang: locale }) },
    "lucide-react": new Proxy({}, { get: () => empty }),
    "@/components/logo": { Logo: ({ href }: { href?: string }) => React.createElement("a", { href, "data-logo": true }, "TouchLine") },
    "@/components/auth-ambient-audio": { AuthAmbientAudio: empty },
    "@/lib/supabase/client": { createClient: () => { throw Error("No auth calls during render"); } },
  };
  function load(file: string): ModuleExports {
    const cached = cache.get(file);
    if (cached) return cached;
    const exports: ModuleExports = {};
    cache.set(file, exports);
    const source = readFileSync(file, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, { exports, URL, URLSearchParams, require(name: string) {
      if (Object.hasOwn(modules, name)) return modules[name];
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.endsWith("/TouchlinePageControls") || name === "./TouchlinePageControls") return { __esModule: true, default: ({ accountLocaleContext }: { accountLocaleContext: { mode: string; accountId?: string } }) => React.createElement("div", { "data-controls-mode": accountLocaleContext.mode, "data-controls-account": accountLocaleContext.accountId }) };
      if (name === "./TouchlineSignOutButton") return { __esModule: true, default: () => { throw Error("Automatic duplicate logout must not render"); } };
      if (name === "./TouchlineNavigationRail") return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-navigation-rail": true }, children) };
      const base = name.startsWith("@/") ? resolve(root, name.slice(2)) : name.startsWith(".") ? resolve(dirname(file), name) : null;
      assert.ok(base, `Unexpected import ${name}`);
      const resolved = [base, `${base}.tsx`, `${base}.ts`].find(candidate => existsSync(candidate));
      assert.ok(resolved, name);
      return load(resolved);
    } });
    return exports;
  }
  const Shell = load(resolve(root, "components/arena-admin-shell.tsx")).ArenaAdminShell as typeof import("../components/arena-admin-shell.tsx").ArenaAdminShell;
  const Provider = load(resolve(root, "components/touchline/SiteLocaleReleaseContext.tsx")).SiteLocaleReleaseProvider as typeof import("../components/touchline/SiteLocaleReleaseContext.tsx").SiteLocaleReleaseProvider;
  const Utility = load(resolve(root, "components/touchline/TouchlineCustomerUtilityShell.tsx"));
  const UtilityShell = Utility.default as typeof import("../components/touchline/TouchlineCustomerUtilityShell.tsx").default;
  const utilityRoute = Utility.customerUtilityRoute as typeof import("../components/touchline/TouchlineCustomerUtilityShell.tsx").customerUtilityRoute;
  const content = React.createElement(path === "/inbox" ? "main" : "section", { "data-original-content": true }, "Original content");
  function renderShell() {
    return renderToStaticMarkup(jsx.jsx(Provider, { enabled: input.release ?? false, children: jsx.jsx(Shell, { accountId: account ?? undefined, profileName: "Owner $&", profileEmail: "fixture@example.test", isOwner: input.owner ?? false, children: content }) }));
  }
  function renderUtility() {
    const currentRoute = utilityRoute(path);
    assert.ok(currentRoute, "Utility renderer requires an exact customer route");
    return renderToStaticMarkup(jsx.jsx(UtilityShell, { accountId, currentRoute, pathname: path, locale, profileName: "Owner", profileEmail: "fixture@example.test", signingOut: input.busy ?? false, signOutError: input.error ?? "", onSignOut: async () => {}, switchAccountHref: touchLineAuthEntryHref("/login", locale, `${path}?lang=${locale}`), children: content }));
  }
  return { renderShell, renderUtility };
}

test("verified customer uses one real shared header, logout and main on each exact utility route", () => {
  for (const path of ["/notifications", "/inbox", "/football-search"]) {
    const html = fixture({ path }).renderShell();
    assert.equal((html.match(/<header\b/g) ?? []).length, 1);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1);
    assert.equal((html.match(/>Sair<\/button>/g) ?? []).length, 1);
    assert.match(html, /data-touchline-navigation-surface="authenticated"/);
    assert.match(html, /data-controls-mode="account"/);
    assert.ok(html.includes(`data-controls-account="${accountId}"`));
    assert.match(html, /Owner \$&amp;|fixture@example.test/);
    assert.match(html, /Original content/);
    for (const destination of ["/clubowner", "/touchline-clubs", "/live", "/rankings", "/intro", "/notifications", "/inbox", "/football-search"]) assert.ok(html.includes(`href="${destination}?lang=pt-BR"`), destination);
    const switchHref = touchLineAuthEntryHref("/login", "pt-BR", `${path}?lang=pt-BR`).replaceAll("&", "&amp;");
    assert.ok(html.includes(`href="${switchHref}"`));
    assert.doesNotMatch(html, /href="\/admin|<aside\b/);
  }
});

test("owner, unverified context and non-exact paths retain the original shell", () => {
  for (const input of [{ owner: true }, { accountId: null }, { path: "/admin" }, { path: "/admin/notifications" }, { path: "/notifications/extra" }, { path: "/intro" }]) {
    const html = fixture(input).renderShell();
    assert.doesNotMatch(html, /data-touchline-customer-utility|data-controls-account/);
    assert.match(html, /<aside\b/);
    assert.match(html, /Original content/);
    if (input.owner) assert.match(html, /href="\/admin\?lang=pt-BR"/);
  }
});

test("eight customer locales obey the existing site release gate without changing switch-account policy", () => {
  for (const locale of locales) {
    for (const release of [false, true]) {
      const html = fixture({ locale, release }).renderShell();
      const effective = release || locale === "pt-BR" ? locale : "en-GB";
      const copy = getTouchlineArenaShellCopy(effective, release);
      assert.ok(html.includes(renderToStaticMarkup(React.createElement("span", null, copy.notificationsLabel)).slice(6, -7)));
      assert.ok(html.includes(`href="/live?lang=${effective}"`));
      assert.ok(html.includes(`href="/inbox?lang=${effective}"`));
      const operational = locale === "pt-BR" ? locale : "en-GB";
      const switchHref = touchLineAuthEntryHref("/login", operational, `/notifications?lang=${locale}`).replaceAll("&", "&amp;");
      assert.ok(html.includes(`href="${switchHref}"`));
    }
  }
});

test("logout presentation preserves pending and error, while server identity and existing handler remain authoritative", () => {
  const html = fixture({ busy: true, error: "Existing error" }).renderUtility();
  assert.match(html, /disabled="" aria-busy="true"/);
  assert.match(html, /Saindo…/);
  assert.match(html, /role="alert"[^>]*>Existing error/);
  const source = readFileSync(resolve(root, "components/arena-admin-shell.tsx"), "utf8");
  assert.match(source, /onSignOut=\{signOut\}/);
  assert.match(source, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(source, /setSignOutError\(error.message\)/);
  assert.match(source, /window.location.assign\(touchLineAuthHref\("\/login", locale\)\)/);
  assert.match(source, /if \(!isOwner && accountId && customerRoute\)/);
  const layout = readFileSync(resolve(root, "app/(app)/layout.tsx"), "utf8");
  assert.match(layout, /accountId=\{user.id\}/);
  assert.ok(layout.indexOf('if (!user) redirect("/login")') < layout.indexOf("accountId={user.id}"));
  const css = readFileSync(resolve(root, "components/touchline/TouchlineCustomerUtilityShell.module.css"), "utf8");
  assert.match(css, /flex-wrap: nowrap/);
  assert.match(css, /overflow-x: auto/);
});
