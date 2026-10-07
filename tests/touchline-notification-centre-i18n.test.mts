import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as canonical from "../lib/touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { normalizeTouchLineAuthLocale } from "../lib/touchlineArena/auth-i18n.ts";

const nativeRequire = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const path = "app/(app)/notifications/page.tsx";
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const categories = ["playerRumours", "availability", "confirmedLineup", "goalsAndEvents", "selectedLiveMatches", "leagueLeadership", "transfersAndOffers", "creditsPromotionsRewards", "accountSecurity", "generalComms"];
const timestamp = "2026-10-03T10:20:30.123456+02:00";
const data = (explicitConsentAt: unknown) => ({ settings: {
  playerRumours: true, availability: true, confirmedLineup: true, goalsAndEvents: true, selectedLiveMatches: false, leagueLeadership: true,
  transfersAndOffers: true, creditsPromotionsRewards: true, accountSecurity: true, generalComms: false,
  silentPush: true, lineupReminders: false, scopes: { clubs: ["A & B"], players: [], competitions: ["TouchLine England"], fixtures: [] },
}, channels: { in_app: true, push: false, email: false }, frequency: "realtime", quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: "UTC" },
explicitConsentAt, updatedAt: null, gameLocale: "pt-BR", accountId: "fixture-account" });
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; }
function evaluate<T>(source: string, dependencies: Record<string, unknown>, globals = {}): T {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { exports, ...globals, require: (id: string) => { assert.ok(Object.hasOwn(dependencies, id), id); return dependencies[id]; } });
  return exports as T;
}
type CopyModule = { getTouchlineNotificationCentreCopy: (locale?: string | null, draft?: boolean) => Record<string, string>; formatTouchlineNotificationActiveCount: (count: number, locale?: string | null, draft?: boolean) => string; TOUCHLINE_NOTIFICATION_CENTRE_CATALOGUES: Record<string, Record<string, string>>; TOUCHLINE_NOTIFICATION_CENTRE_DRAFT_STATUS: string; TOUCHLINE_NOTIFICATION_CENTRE_DRAFT_LOCALES: readonly string[] };
async function catalogue(): Promise<CopyModule> {
  return import("../lib/touchlineArena/notification-centre-i18n.ts");
}
type Element = React.ReactElement<Record<string, unknown>>;
function nodes(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement(node)) return [];
  const item = node as Element; return [item, ...nodes(item.props.children as React.ReactNode)];
}
// Real page, JSX, state/effect callbacks and handlers. React scheduling, query,
// fetch and responses are controlled; not a DOM/auth/permission/delivery proof.
function fixture(copy?: CopyModule, initialLocale = "en-GB", future = false, releaseFlag?: string) {
  const policy = evaluate<{ isTouchLineSiteLocalesEnabled: () => boolean }>(read('lib/touchlineArena/site-locales-release.ts'), {}, { process: { env: { TOUCHLINE_SITE_LOCALES_ENABLED: releaseFlag } } });
  const slots: unknown[] = [], effects: { index: number; callback: () => (() => void) | void }[] = [], cleanups = new Map<number, () => void>();
  let cursor = 0, locale = initialLocale;
  const requests: { url: string; options: RequestInit; response: ReturnType<typeof deferred<unknown>> }[] = [];
  const hooks = { ...React,
    useState: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo: (callback: () => unknown) => callback(),
    useEffect: (callback: () => (() => void) | void, deps: unknown[]) => { const index = cursor++, prior = slots[index] as unknown[] | undefined; if (!prior || deps.some((value, i) => value !== prior[i])) { slots[index] = deps; effects.push({ index, callback }); } },
  };
  function Icon() { return React.createElement("svg"); }
  const mod = evaluate<{ default: () => Element; NotificationsContent: (props: { draftLocalesEnabled: boolean }) => React.ReactNode; validNotificationConsentTimestamp: (value: unknown) => boolean }>(read(path) + "\nexport { validNotificationConsentTimestamp, NotificationsContent };", {
    react: hooks, "react/jsx-runtime": nativeRequire("react/jsx-runtime"),
    "@/components/touchline/SiteLocaleReleaseContext": { useSiteLocaleRelease: () => policy.isTouchLineSiteLocalesEnabled() },
    "next/navigation": { useSearchParams: () => new URLSearchParams({ lang: locale }) },
    "lucide-react": { Bell: Icon, CheckCircle2: Icon, Clock3: Icon, Mail: Icon, Radio: Icon, Save: Icon, ShieldCheck: Icon, Smartphone: Icon },
    "@/lib/touchlineArena/auth-i18n": { normalizeTouchLineAuthLocale },
    "@/lib/touchlineArena/i18n": canonical,
    "@/lib/touchlineArena/catalogue-locale": { resolveTouchlineCatalogueLocale },
    "@/lib/touchlineArena/notification-centre-i18n": copy,
  }, { AbortController, URLSearchParams, Intl, Date, fetch: (url: string, options: RequestInit) => { const response = deferred<unknown>(); requests.push({ url, options, response }); return response.promise; } });
  function render() { cursor = 0; const entry = mod.default(); const tree = mod.NotificationsContent(future ? { draftLocalesEnabled: true } : entry.props as { draftLocalesEnabled: boolean }); return { tree, nodes: nodes(tree), html: renderToStaticMarkup(tree) }; }
  function commit() { for (const item of effects.splice(0)) { cleanups.get(item.index)?.(); const cleanup = item.callback(); if (cleanup) cleanups.set(item.index, cleanup); } return render(); }
  function resolve(index: number, value: unknown, ok = true) { requests[index].response.resolve({ ok, json: async () => value }); }
  return { requests, render, commit, resolve, valid: mod.validNotificationConsentTimestamp,
    locale: (next: string) => { locale = next; render(); return commit(); },
    start: () => { render(); return commit(); },
    save: () => { const button = render().nodes.find(node => node.type === "button")!; return (button.props.onClick as () => Promise<void>)(); },
    unmount: () => { for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); },
    strictReplay: () => { for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); for (const index of slots.keys()) if (Array.isArray(slots[index])) slots[index] = undefined; render(); return commit(); },
  };
}
test("initial and failed reads never claim authorization or absence from local defaults", async () => {
  // This test deliberately works before the catalogue exists to expose the UI bug.
  let c: CopyModule | undefined; try { c = await catalogue(); } catch { /* first RED */ }
  const f = fixture(c, "pt-BR"); assert.doesNotMatch(f.render().html, />Autorizado</);
  assert.match(f.start().html, /Consultando registro/); assert.equal(f.requests.length, 1);
  f.requests[0].response.reject(Error("PRIVATE_DETAIL")); await tick();
  assert.match(f.render().html, /Registro não confirmado/); assert.doesNotMatch(f.render().html, /PRIVATE_DETAIL|Registro não encontrado/); f.unmount();
  const jsonFailure = fixture(c, "pt-BR"); jsonFailure.start();
  jsonFailure.requests[0].response.resolve({ ok: true, json: async () => { throw Error("PRIVATE_JSON"); } }); await tick();
  assert.match(jsonFailure.render().html, /Registro não confirmado/);
  assert.doesNotMatch(jsonFailure.render().html, /PRIVATE_JSON|Registro não encontrado/); jsonFailure.unmount();
});
test("confirmed null, valid timestamps, local edits and invalid receipts have distinct observation states", async () => {
  const c = await catalogue();
  for (const [value, label] of [[null, "No record found"], [timestamp, "Record found"], [undefined, "Record unconfirmed"], ["", "Record unconfirmed"], [false, "Record unconfirmed"], ["2026-02-30T10:00:00Z", "Record unconfirmed"]] as const) {
    const f = fixture(c); f.start(); f.resolve(0, { ok: true, data: data(value) }); await tick(); assert.ok(f.render().html.includes(label), String(value));
    assert.equal(f.requests.length, 1); f.unmount();
  }
  const f = fixture(c); f.start(); f.resolve(0, { ok: true, data: data(timestamp) }); await tick();
  const inputs = f.render().nodes.filter(node => node.type === "input");
  for (const input of inputs) if (typeof input.props.onChange === "function") (input.props.onChange as (event: unknown) => void)({ target: { checked: false, value: "A & B, C" } });
  assert.match(f.render().html, /Record found/); assert.equal(f.requests.length, 1); f.unmount();
});
test("timestamp validator preserves offsets/microseconds and rejects malformed or normalized dates", async () => {
  const f = fixture(await catalogue());
  for (const value of [timestamp, "2024-02-29T00:00:00Z", "2026-10-03T10:20:30.1-03:30", "2026-10-03T10:20:30+00:00"]) assert.equal(f.valid(value), true, value);
  for (const value of [null, undefined, 0, true, {}, "", "1", "2026-02-30T10:00:00Z", "2025-02-29T00:00:00Z", "2026-10-03T24:00:00Z", "2026-10-03T10:20:30+99:99", "2026-10-03T10:20:30.1234567Z", "2026-10-03T10:20:30", " 2026-10-03T10:20:30Z"]) assert.equal(f.valid(value), false, JSON.stringify(value));
});
test("save only by gesture keeps exact payload; pending, success and lost response do not invent consent or delivery", async () => {
  const c = await catalogue(); const f = fixture(c); f.start(); const before = data(null); f.resolve(0, { ok: true, data: before }); await tick();
  const promise = f.save(); assert.match(f.render().html, /Checking record/);
  assert.equal(f.requests[1].url, "/api/notifications/preferences"); assert.equal(f.requests[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(f.requests[1].options.body as string), { ...before, explicitConsent: true });
  assert.equal(f.render().nodes.find(n => n.type === "button")?.props.disabled, true);
  f.resolve(1, { ok: true, data: { ...data(timestamp), frequency: "paused", channels: { in_app: false, push: false, email: false }, quietHours: { ...before.quietHours, enabled: true } } }); await promise;
  assert.match(f.render().html, /Record found/); assert.match(f.render().html, /Device permission, registration and delivery are separate/);
  const retry = f.save(); f.requests[2].response.reject(Error("private write")); await retry;
  assert.match(f.render().html, /Record unconfirmed/); assert.equal(f.requests.length, 3); f.unmount();
});
test("only the current observation can update the indicator; cleanup and StrictMode retire older GET/PUT receipts", async () => {
  const c = await catalogue(); const f = fixture(c); f.start();
  const save = f.save(); f.resolve(1, { ok: true, data: data(timestamp) }); await save;
  f.resolve(0, { ok: true, data: data(null) }); await tick(); assert.match(f.render().html, /Record found/);
  const late = f.save(); f.locale("pt-BR"); assert.match(f.render().html, /Consultando registro/);
  f.resolve(2, { ok: true, data: data(timestamp) }); await late; assert.match(f.render().html, /Consultando registro/);
  f.resolve(3, { ok: true, data: data(null) }); await tick(); assert.match(f.render().html, /Registro não encontrado/); f.unmount();
  const g = fixture(c); g.start(); g.strictReplay(); assert.equal(g.requests[0].options.signal?.aborted, true);
  g.resolve(0, { ok: true, data: data(timestamp) }); await tick(); assert.match(g.render().html, /Checking record/);
  g.resolve(1, { ok: true, data: data(null) }); await tick(); assert.match(g.render().html, /No record found/);
  const pending = g.save(); g.unmount(); g.resolve(2, { ok: true, data: data(timestamp) }); await pending;
  assert.match(g.render().html, /Checking record/);
});
test("76 keys per catalogue, six gated locales and complete-locale forwarding through real UI", async () => {
  const c = await catalogue(); assert.equal(c.TOUCHLINE_NOTIFICATION_CENTRE_DRAFT_STATUS, "draft"); assert.deepEqual(c.TOUCHLINE_NOTIFICATION_CENTRE_DRAFT_LOCALES, locales.slice(2));
  for (const locale of locales) {
    const values = c.TOUCHLINE_NOTIFICATION_CENTRE_CATALOGUES[locale]; assert.equal(Object.keys(values).length, 76); assert.deepEqual(Object.keys(values), Object.keys(c.TOUCHLINE_NOTIFICATION_CENTRE_CATALOGUES["en-GB"]));
    for (const value of Object.values(values)) assert.ok(value.trim());
    if (locale !== "pt-BR") assert.equal(c.getTouchlineNotificationCentreCopy(locale), c.TOUCHLINE_NOTIFICATION_CENTRE_CATALOGUES["en-GB"]);
  }
  const drafts = await catalogue();
  for (const locale of locales) {
    assert.equal(drafts.getTouchlineNotificationCentreCopy(locale, true), drafts.TOUCHLINE_NOTIFICATION_CENTRE_CATALOGUES[locale]);
    const calls: unknown[] = []; const markers = Object.fromEntries(Object.keys(drafts.getTouchlineNotificationCentreCopy(locale, true)).map(key => [key, `${locale}:${key}:<&>`]));
    const copyModule = { ...drafts, getTouchlineNotificationCentreCopy: (value?: string | null) => { calls.push(value); return markers; } };
    const f = fixture(copyModule, locale, true); let html = f.start().html;
    f.resolve(0, { ok: true, data: data(null) }); await tick(); html += f.render().html;
    const pending = f.save(); html += f.render().html; f.resolve(1, { ok: true, data: { ...data(timestamp), updatedAt: timestamp } }); await pending; html += f.render().html;
    const savedWithoutTimestamp = f.save(); f.resolve(2, { ok: true, data: data(null) }); await savedWithoutTimestamp;
    assert.ok(f.render().html.includes(`${locale}:notSaved:&lt;&amp;&gt;`), `notSaved:${locale}`); html += f.render().html;
    const failure = f.save(); f.requests[3].response.reject(Error()); await failure; html += f.render().html;
    // Last-saved read and unavailable read are separate existing states.
    f.locale(locale === "pt-BR" ? "en-GB" : "pt-BR"); f.resolve(4, { ok: true, data: { ...data(timestamp), updatedAt: timestamp } }); await tick(); html += f.render().html;
    f.locale(locale); f.requests[5].response.reject(Error()); await tick(); html += f.render().html;
    // Legacy plural fragment is retained in the catalogue for compatibility;
    // the visible count now has independently tested plural-aware formatting.
    for (const key of Object.keys(markers).filter(key => key !== "active")) assert.ok(html.includes(`${locale}:${key}:&lt;&amp;&gt;`), key);
    assert.equal(calls[0], locale); f.unmount();
  }
});

test("active category count uses locale plurals without changing the count or opening drafts", async () => {
  const { formatTouchlineNotificationActiveCount: count } = await catalogue();
  for (const [locale, one, three] of [
    ["en-GB", "1 category active", "3 categories active"], ["pt-BR", "1 categoria ativa", "3 categorias ativas"],
    ["es-ES", "1 categoría activa", "3 categorías activas"], ["it-IT", "1 categoria attiva", "3 categorie attive"],
    ["fr-FR", "1 catégorie active", "3 catégories actives"], ["tr-TR", "1 etkin kategori", "3 etkin kategori"],
    ["de-DE", "1 aktive Kategorie", "3 aktive Kategorien"],
  ]) { assert.equal(count(1, locale, true), one); assert.equal(count(3, locale, true), three); }
  for (const [n, expected] of [[0, "٠ فئات مفعّلة"], [1, "فئة واحدة مفعّلة"], [2, "فئتان مفعّلتان"], [3, "٣ فئات مفعّلة"], [11, "١١ فئة مفعّلة"], [100, "١٠٠ فئة مفعّلة"]] as const) assert.equal(count(n, "ar-SA", true), expected);
  assert.equal(count(2, "ar-SA"), "2 categories active");
  for (const invalid of [-1, 1.5, NaN, Infinity]) assert.equal(count(invalid, "pt-BR", true), "—");
});
test("real notification copy and active count reach the page in all eight opt-in locales", async () => {
  const c = await catalogue();
  for (const locale of locales) {
    const f = fixture(c, locale, true);
    f.start(); f.resolve(0, { ok: true, data: data(null) }); await tick();
    const html = f.render().html;
    const expectedCount = renderToStaticMarkup(React.createElement("span", null, c.formatTouchlineNotificationActiveCount(8, locale, true))).slice(6, -7);
    assert.ok(html.includes(expectedCount), locale);
    assert.match(html, locale === "ar-SA" ? /dir="rtl"/ : /dir="ltr"/);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].options.method ?? "GET", "GET");
    f.unmount();
  }
});
test("domain defaults, API handlers and key order remain intact outside the explicitly admitted observation projection", () => {
  const source = read(path);
  assert.match(source, /body: JSON\.stringify\(\{ \.\.\.preferences, explicitConsent: true \}\)/);
  assert.match(source, /disabled=\{saving \|\| loading\}/);
  assert.match(source, /return \(\) => \{/);
  assert.doesNotMatch(source, /requestPermission|serviceWorker|Notification\.permission|setInterval/);
  assert.deepEqual([...source.matchAll(/key: "(playerRumours|availability|confirmedLineup|goalsAndEvents|selectedLiveMatches|leagueLeadership|transfersAndOffers|creditsPromotionsRewards|accountSecurity|generalComms)"/g)].map(match => match[1]), categories);
  const defaults = source.slice(source.indexOf("const DEFAULT_PREFERENCES"), source.indexOf("const DEFAULT_PREFERENCES") + source.slice(source.indexOf("const DEFAULT_PREFERENCES")).indexOf("\n};") + 3);
  assert.equal(createHash("sha256").update(defaults).digest("hex"), "ff36a5aa7c92f7cd2ef8e3670a1322142800bef512abfb2f1d2b1198ed353827");
});

test("exported notifications page forwards server context release without changing request or consent behavior", async () => {
  const c = await catalogue();
  for (const flag of [undefined, "false", "true"]) for (const locale of locales) {
    const f = fixture(c, locale, false, flag);
    f.start();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, "/api/notifications/preferences");
    assert.equal(f.requests[0].options.method ?? "GET", "GET");
    f.resolve(0, { ok: true, data: data(null) }); await tick();
    const effective = flag === "true" || locale === "pt-BR" ? locale : "en-GB";
    const expectedCount = renderToStaticMarkup(React.createElement("span", null, c.formatTouchlineNotificationActiveCount(8, effective, flag === "true"))).slice(6, -7);
    assert.ok(f.render().html.includes(expectedCount), `${flag} ${locale}`);
    assert.match(f.render().html, effective === "ar-SA" ? /dir="rtl"/ : /dir="ltr"/);
    assert.equal(f.requests.length, 1, "render and receipt must never save or grant consent");
    f.unmount();
  }
});
