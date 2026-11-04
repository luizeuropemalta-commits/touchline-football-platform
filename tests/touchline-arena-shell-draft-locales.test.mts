import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as auth from "../lib/touchlineArena/auth-i18n.ts";
import { TOUCHLINE_LOCALE_STORAGE_KEY } from "../lib/touchlineArena/i18n.ts";
import { getTouchlineArenaShellCopy, TOUCHLINE_ARENA_SHELL_CATALOGUES } from "../lib/touchlineArena/arena-shell-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const source = readFileSync(new URL("../components/arena-admin-shell.tsx", import.meta.url), "utf8");
// SSR uses the real shared dialog hooks; effects intentionally do not run on
// the server. The browser fixture separately proves focus and inert cleanup.
const dialogExports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../components/touchline/a11y/TouchlineDialog.tsx", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: dialogExports, require: (name: string) => { assert.equal(name, "react"); return React; } });
function render(locale: string, draftLocalesEnabled = false, isOwner = false, pathname = "/notifications", options: { accountId?: string; menuOpen?: boolean; selectorProps?: Record<string, unknown>[] } = {}) {
  let stateSlot = 0;
  const empty = () => null;
  const modules: Record<string, unknown> = {
    // Only the initial menu state is varied for SSR composition; real browser
    // tests cover the menu event handlers and canonical selector lifecycle.
    react: { ...React, useState: (initial: unknown) => { const state = React.useState(initial); return stateSlot++ === 0 && options.menuOpen ? [true, state[1]] : state; } }, "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
    "next/navigation": { usePathname: () => pathname, useSearchParams: () => new URLSearchParams({ lang: locale }) },
    "lucide-react": Object.fromEntries(["Activity", "Bell", "CircleDollarSign", "Database", "Inbox", "Loader2", "LogOut", "Menu", "Search", "ShieldCheck", "Sparkles", "Trophy", "WalletCards", "X"].map(name => [name, empty])),
    "@/components/logo": { Logo: empty },
    "@/components/auth-language-switcher": { AuthLanguageSwitcher: (props: Record<string, unknown>) => { options.selectorProps?.push(props); return React.createElement("div", { "data-canonical-language-selector": true }); } },
    "@/components/touchline/a11y/TouchlineDialog": dialogExports,
    "./arena-admin-shell.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
    // Legacy callers have no verified accountId and must retain the old shell.
    "@/components/touchline/TouchlineCustomerUtilityShell": { __esModule: true, default: () => { throw Error("Legacy fixture must not enter customer shell"); }, customerUtilityRoute: (path: string) => ["/notifications", "/inbox", "/football-search"].includes(path) ? "notifications" : null },
    "@/lib/supabase/client": { createClient: () => { throw Error("SSR must not authenticate or sign out"); } },
    "@/lib/touchlineArena/auth-i18n": auth,
    "@/lib/touchlineArena/i18n": { TOUCHLINE_LOCALE_STORAGE_KEY },
    "@/lib/touchlineArena/arena-shell-i18n": { getTouchlineArenaShellCopy },
  };
  const exports: { ArenaAdminShell?: React.ComponentType<{ children?: React.ReactNode; accountId?: string; profileName: string; profileEmail: string; isOwner: boolean; draftLocalesEnabled: boolean }> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, { exports, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  return renderToStaticMarkup(React.createElement(exports.ArenaAdminShell!, {
    accountId: options.accountId, profileName: "Official $&", profileEmail: "fixture@example.test", isOwner, draftLocalesEnabled,
  }, React.createElement("p", null, "Unchanged page content")));
}

test("customer shell catalogues retain EN/PT defaults and all nineteen real opt-in labels", () => {
  const expected = ["Notifications", "Notificações", "Notificaciones", "Notifiche", "Notifications", "الإشعارات", "Bildirimler", "Benachrichtigungen"];
  for (const [index, locale] of locales.entries()) {
    const copy = getTouchlineArenaShellCopy(locale, true);
    assert.equal(copy.notificationsLabel, expected[index]);
    assert.equal(Object.keys(copy).length, 19);
    assert.deepEqual(Object.keys(copy), Object.keys(TOUCHLINE_ARENA_SHELL_CATALOGUES["en-GB"]));
    for (const value of Object.values(copy)) assert.ok(value.trim());
    assert.equal(getTouchlineArenaShellCopy(locale), TOUCHLINE_ARENA_SHELL_CATALOGUES[locale === "pt-BR" ? "pt-BR" : "en-GB"]);
  }
  assert.equal(getTouchlineArenaShellCopy("__proto__", true), TOUCHLINE_ARENA_SHELL_CATALOGUES["en-GB"]);
  assert.equal(getTouchlineArenaShellCopy("it-IT", true).notificationsDescription, "Le tue preferenze di ricezione");
});

test("real customer chrome renders opt-in labels without changing destinations, identity or granting owner links", () => {
  for (const locale of locales) {
    const html = render(locale, true);
    const copy = getTouchlineArenaShellCopy(locale, true);
    const label = renderToStaticMarkup(React.createElement("span", null, copy.notificationsLabel)).slice(6, -7);
    assert.ok(html.includes(label), locale);
    assert.ok(html.includes("Official $&amp;"));
    assert.ok(html.includes("fixture@example.test"));
    assert.ok(html.includes("Unchanged page content"));
    assert.match(html, /dir="ltr"/);
    assert.doesNotMatch(html, /href="\/admin\?lang=|href="\/admin\/analytics/);
    const operational = locale === "pt-BR" ? "pt-BR" : "en-GB";
    for (const path of ["/intro", "/notifications", "/inbox", "/football-search"]) assert.ok(html.includes(`href="${path}?lang=${operational}"`));
    const switchHref = auth.touchLineAuthEntryHref("/login", operational, `/notifications?lang=${locale}`);
    assert.ok(html.includes(`href="${switchHref.replaceAll("&", "&amp;")}"`), "customer switch account preserves locale and destination");
    assert.ok(!html.includes("/admin/login?"));
    const defaultHtml = render(locale);
    assert.ok(defaultHtml.includes(getTouchlineArenaShellCopy(operational).notificationsLabel));
    for (const path of ["/intro", "/notifications", "/inbox", "/football-search"]) assert.ok(defaultHtml.includes(`href="${path}?lang=${operational}"`));
  }
});

test("admin paths cannot opt into drafts and owner navigation remains operational EN/PT", () => {
  for (const path of ["/admin", "/admin/cards", "/admin/analytics"]) {
    assert.equal(render("ar-SA", true, true, path), render("ar-SA", false, true, path));
  }
  const ownerCustomer = render("es-ES", true, true);
  assert.ok(ownerCustomer.includes("Notificaciones"));
  assert.ok(ownerCustomer.includes("Official owner controls"));
  assert.ok(ownerCustomer.includes("href=\"/admin?lang=en-GB\""));
  assert.ok(ownerCustomer.includes("TouchLine Owner"));
  const ownerSwitchHref = auth.touchLineAuthEntryHref("/admin/login", "en-GB", "/notifications?lang=es-ES");
  assert.ok(ownerCustomer.includes(`href="${ownerSwitchHref.replaceAll("&", "&amp;")}"`));
});

test("admin mounts one canonical selector with verified account and closed locale gates in either menu state", () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  for (const menuOpen of [false, true]) for (const requested of ["pt-BR", "en-GB", "ar-SA"]) {
    const selectorProps: Record<string, unknown>[] = [];
    const html = render(requested, true, true, "/admin/cards", { accountId, menuOpen, selectorProps });
    assert.equal(selectorProps.length, 1, "the hidden rail and mobile dialog must not duplicate locale hosts");
    assert.deepEqual(JSON.parse(JSON.stringify(selectorProps[0])), { locale: requested === "pt-BR" ? "pt-BR" : "en-GB", context: { mode: "account", accountId }, draftLocalesEnabled: false, siteLocalesEnabled: false });
    assert.equal((html.match(/data-canonical-language-selector/g) ?? []).length, 1);
  }
  const selectorProps: Record<string, unknown>[] = [];
  render("pt-BR", false, true, "/admin/cards", { selectorProps });
  assert.equal(selectorProps.length, 0, "an absent verified account must not be inferred from email or owner presentation");
});
