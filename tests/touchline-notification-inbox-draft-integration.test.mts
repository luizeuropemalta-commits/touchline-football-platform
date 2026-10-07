import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { resolveTouchlineCentralInbox } from "../lib/touchlineArena/central-inbox.ts";
import type { TouchlineInboxList } from "../components/touchline/TouchlineInboxList.tsx";

const nativeRequire = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const inboxSource = read("app/(app)/inbox/page.tsx");
const notificationSource = read("app/(app)/notifications/page.tsx");
const listSource = read("components/touchline/TouchlineInboxList.tsx");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
function evaluate<T>(source: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, { exports, require: (id: string) => {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`); return dependencies[id];
  } });
  return exports as T;
}
const common = { react: React, "react/jsx-runtime": nativeRequire("react/jsx-runtime"),
  "@/lib/touchlineArena/site-locales-release": { isTouchLineSiteLocalesEnabled: () => false },
  "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale } };
const list = evaluate<{ TouchlineInboxList: typeof TouchlineInboxList; visibleInboxEnum: (value: string, locale: string, draft?: boolean) => string }>(
  listSource + "\nexport { visibleInboxEnum };", common,
);
function fixture(mode: "ready" | "empty" | "unavailable" | "guest" = "ready") {
  let authReads = 0;
  const reads: string[] = [];
  const message = { id: "message-1", origin: "ADMIN", publication_status: "PUBLISHED", lifecycle_state: "ACTIVE",
    category: "MAINTENANCE", priority: "HIGH", audience_scope: "GLOBAL", published_at: "2026-10-03T10:00:00Z",
    touchline_central_message_localizations: locales.map(locale => ({ locale, title: `Official ${locale} $&`, body: `Canonical body ${locale}`, deep_link: null })),
  };
  const admin = { from(table: string) {
    reads.push(table);
    if (table === "touchline_central_messages") return { select: () => Promise.resolve({ data: mode === "empty" ? [] : [message], error: null }) };
    assert.equal(table, "touchline_central_inbox_receipts");
    return { select: () => ({ eq: (column: string, user: string) => {
      assert.equal(column, "user_id"); assert.equal(user, "account-1"); return Promise.resolve({ data: [], error: null });
    } }) };
  } };
  const page = evaluate<{ default: (props: unknown) => Promise<React.ReactNode>; renderTouchlineInboxPage: (props: unknown, draft?: boolean) => Promise<React.ReactNode> }>(
    inboxSource + "\nexport { renderTouchlineInboxPage };", { ...common,
      "next/link": { __esModule: true, default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { authReads++; return { data: { user: mode === "guest" ? null : { id: "account-1" } } }; } } }) },
      "@/lib/supabase/admin": { createAdminClient: () => mode === "unavailable" ? null : admin },
      "@/components/touchline/TouchlineInboxList": list,
      "@/lib/touchlineArena/central-inbox": { resolveTouchlineCentralInbox },
    },
  );
  return { async render(locale: string, draft = false) {
    const props = { searchParams: Promise.resolve({ lang: locale }) };
    return renderToStaticMarkup(await (draft ? page.renderTouchlineInboxPage(props, true) : page.default(props)));
  }, reads, authReads: () => authReads };
}

test("real Inbox route and list render eight opt-in locales, literal editorial data and ClubOwner return", async () => {
  const maintenance = ["Maintenance", "Manutenção", "Mantenimiento", "Manutenzione", "Maintenance", "صيانة", "Bakım", "Wartung"];
  for (const [index, locale] of locales.entries()) {
    const f = fixture(); const html = await f.render(locale, true);
    assert.ok(html.includes(maintenance[index]), locale);
    assert.ok(html.includes(`Official ${locale} $&amp;`), locale);
    assert.ok(html.includes(`Canonical body ${locale}`), locale);
    assert.ok(html.includes(`/clubowner?lang=${locale}`));
    assert.match(html, locale === "ar-SA" ? /dir="rtl"/ : /dir="ltr"/);
    assert.equal(f.authReads(), 1);
    assert.deepEqual(f.reads, ["touchline_central_messages", "touchline_central_inbox_receipts"]);
    const linkText = html.match(/class="back"[^>]*>(.*?)<\/a>/)?.[1] ?? "";
    assert.ok(linkText.includes("ClubOwner"));
    const publicPage = fixture(); const publicHtml = await publicPage.render(locale);
    assert.ok(publicHtml.includes(`Canonical body ${locale === "pt-BR" ? "pt-BR" : "en-GB"}`));
  }
});

test("Inbox enums retain gates and unknown values; unavailable/guest/empty paths do not create messages", async () => {
  assert.equal(list.visibleInboxEnum("MAINTENANCE", "de-DE", true), "Wartung");
  assert.equal(list.visibleInboxEnum("MAINTENANCE", "de-DE"), "Maintenance");
  assert.equal(list.visibleInboxEnum("Official $&", "ar-SA", true), "Official $&");
  for (const mode of ["empty", "unavailable", "guest"] as const) {
    const f = fixture(mode); const html = await f.render("de-DE", true);
    assert.ok(!html.includes("Canonical body"));
    assert.equal(f.authReads(), 1);
    assert.equal(f.reads.length, mode === "empty" ? 2 : 0);
    assert.ok(html.includes(mode === "empty" ? "Zurzeit gibt es keine Mitteilungen" : "Der Posteingang ist in dieser Umgebung nicht verfügbar"));
  }
});

test("page wrappers cannot enable drafts through route props and preference dates remain Gregorian", () => {
  assert.match(notificationSource, /const siteLocalesEnabled = useSiteLocaleRelease\(\)/);
  assert.match(notificationSource, /<NotificationsContent draftLocalesEnabled=\{siteLocalesEnabled\}/);
  assert.match(notificationSource, /function NotificationsContent\(\{ draftLocalesEnabled = false \}/);
  assert.match(inboxSource, /return renderTouchlineInboxPage\(props, isTouchLineSiteLocalesEnabled\("\/inbox"\)\);/);
  assert.match(inboxSource, /async function renderTouchlineInboxPage\([^\n]*draftLocalesEnabled = false/);
  const dateHelper = notificationSource.slice(notificationSource.indexOf("function preferenceDate"), notificationSource.indexOf("export default function NotificationsPage"));
  assert.match(dateHelper, /calendar: "gregory"/);
  assert.doesNotMatch(dateHelper, /timeZone:/);
  assert.match(inboxSource, /<TouchlineInboxList draftLocalesEnabled=\{draftLocalesEnabled\}/);
});
