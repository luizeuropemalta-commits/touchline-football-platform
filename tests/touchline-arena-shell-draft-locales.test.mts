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
function render(locale: string, draftLocalesEnabled = false, isOwner = false, pathname = "/notifications") {
  const empty = () => null;
  const modules: Record<string, unknown> = {
    react: React, "react/jsx-runtime": jsx,
    "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
    "next/navigation": { usePathname: () => pathname, useSearchParams: () => new URLSearchParams({ lang: locale }) },
    "lucide-react": Object.fromEntries(["Activity", "Bell", "CircleDollarSign", "Database", "Inbox", "Loader2", "LogOut", "Menu", "Search", "ShieldCheck", "Sparkles", "Trophy", "WalletCards", "X"].map(name => [name, empty])),
    "@/components/logo": { Logo: empty },
    "@/lib/supabase/client": { createClient: () => { throw Error("SSR must not authenticate or sign out"); } },
    "@/lib/touchlineArena/auth-i18n": auth,
    "@/lib/touchlineArena/i18n": { TOUCHLINE_LOCALE_STORAGE_KEY },
    "@/lib/touchlineArena/arena-shell-i18n": { getTouchlineArenaShellCopy },
  };
  const exports: { ArenaAdminShell?: React.ComponentType<{ children?: React.ReactNode; profileName: string; profileEmail: string; isOwner: boolean; draftLocalesEnabled: boolean }> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, { exports, require: (name: string) => { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; } });
  return renderToStaticMarkup(React.createElement(exports.ArenaAdminShell!, {
    profileName: "Official $&", profileEmail: "fixture@example.test", isOwner, draftLocalesEnabled,
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
