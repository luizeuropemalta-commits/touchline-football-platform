import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as accountLocaleMenuCopy from "../lib/touchlineArena/account-locale-menu-i18n.ts";
import { startAccountLocaleBrowser } from "../lib/touchlineArena/account-locale-browser.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const markerKey = "touchline:presentation-locale-intent:v1";
type Element = React.ReactElement<Record<string, unknown>>;
type ChangeHandler = (event: { target: { value: string } }) => void;
function find(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(item => find(item, type));
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [...(tree.type === type ? [tree] : []), ...find(tree.props.children, type)];
}
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };

function harness(storageAvailable = true, writesAvailable = true) {
  const session = new Map<string, string>();
  const navigations: string[] = [];
  const requests: RequestInit[] = [];
  const window = {
    location: { href: "http://local.test/login?lang=en-GB", assign(url: string) { navigations.push(url); this.href = url; } },
    localStorage: { setItem() {} },
    get sessionStorage() {
      if (!storageAvailable) throw Error("SecurityError");
      return { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => { if (!writesAvailable) throw Error("QuotaExceededError"); session.set(key, value); }, removeItem: (key: string) => session.delete(key) };
    },
  };
  const document = { cookie: `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=pt-BR` };
  function compile<T = Record<string, unknown>>(path: string, modules: Record<string, unknown>, extras: Record<string, unknown> = {}) {
    const exports: Record<string, unknown> = {};
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { exports, window, document, URL, queueMicrotask, ...extras, require(name: string) {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "lucide-react") return { Languages: () => null, ChevronDown: () => null, Check: () => null };
      assert.ok(name in modules, name);
      return modules[name];
    } });
    return exports as T;
  }
  const storage = compile("../lib/touchlineArena/browser-storage.ts", {});
  const intent = compile<{ readTouchlinePresentationLocaleIntent(): string | null; rememberTouchlinePresentationLocaleIntent(value: unknown): boolean }>("../lib/touchlineArena/presentation-locale-intent.ts", { "./browser-storage.ts": storage, "./i18n.ts": i18n });
  const selector = compile<{ AuthLanguageSwitcher(props: Record<string, unknown>): unknown }>("../components/auth-language-switcher.tsx", {
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/browser-storage": storage,
    "@/lib/touchlineArena/presentation-locale-intent": intent,
    "@/components/touchline/AccountLocaleMenu": { default: () => null },
  });
  function chooseLogin(locale: string) {
    const tree = selector.AuthLanguageSwitcher({ locale: "en-GB", draftLocalesEnabled: true });
    (find(tree, "select")[0].props.onChange as ChangeHandler)({ target: { value: locale } });
  }
  function mountMenu(savedLocale: string) {
    window.location.href = "http://local.test/clubowner?lang=pt-BR&club=42#squad";
    navigations.length = 0;
    const slots: unknown[] = [];
    let cursor = 0, mounted = false;
    let effect: (() => () => void) | undefined;
    const menu = compile<{ default(props: Record<string, unknown>): unknown }>("../components/touchline/AccountLocaleMenu.tsx", {
      react: {
        useState(initial: unknown) { const n = cursor++; if (!(n in slots)) slots[n] = initial; return [slots[n], (value: unknown) => { slots[n] = value; }]; },
        useRef(initial: unknown) { const n = cursor++; if (!(n in slots)) slots[n] = { current: initial }; return slots[n]; },
        useLayoutEffect(callback: () => () => void) { if (!mounted) effect = callback; },
      },
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@/lib/supabase/client": { createClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) },
      "@/lib/touchlineArena/account-locale-browser": { startAccountLocaleBrowser },
      "@/lib/touchlineArena/account-locale-menu-i18n": accountLocaleMenuCopy,
      "@/lib/touchlineArena/i18n": i18n,
      "@/lib/touchlineArena/presentation-locale-intent": intent,
    }, { fetch: async (_input: string, init: RequestInit) => {
      requests.push(init);
      if (init.method === "GET") return Response.json({ ok: true, data: { accountId: owner, gameLocale: savedLocale, gameLocaleRevision: "3" } });
      const body = JSON.parse(String(init.body));
      return Response.json({ ok: true, data: { gameLocale: body.locale, gameLocaleRevision: "4", updatedAt: "2026-10-04T00:00:00Z" } });
    } });
    function render() { cursor = 0; return menu.default({ context: { mode: "account", accountId: owner }, locale: "pt-BR", menuClassName: "menu", panelClassName: "", variant: "select" }); }
    render();
    const cleanup = effect!(); mounted = true;
    return { cleanup, choose(locale: string) { (find(render(), "select")[0].props.onChange as ChangeHandler)({ target: { value: locale } }); } };
  }
  return { session, document, intent, requests, navigations, chooseLogin, mountMenu };
}

test("explicit login PT survives confirmed EN account restoration without PUT", async () => {
  const h = harness(); h.chooseLogin("pt-BR");
  assert.equal(h.session.get(markerKey), "pt-BR");
  const menu = h.mountMenu("en-GB"); await settle();
  assert.deepEqual(h.requests.map(r => r.method), ["GET"]);
  assert.deepEqual(h.navigations, []);
  assert.ok(h.document.cookie.includes("=pt-BR;"));
  menu.cleanup();
});

test("old cookie alone and invalid marker do not block normal account restoration", async () => {
  for (const invalid of [undefined, "ar-SA", "constructor", "", "pt-br"]) {
    const h = harness(); if (invalid !== undefined) h.session.set(markerKey, invalid);
    const menu = h.mountMenu("en-GB"); await settle();
    assert.deepEqual(h.navigations, ["http://local.test/clubowner?lang=en-GB&club=42#squad"]);
    assert.deepEqual(h.requests.map(r => r.method), ["GET"]);
    menu.cleanup();
  }
});

test("confirmed authenticated selection replaces presentation intent with unchanged identity CAS", async () => {
  const h = harness(); h.chooseLogin("pt-BR");
  const menu = h.mountMenu("en-GB"); await settle(); menu.choose("en-GB"); await settle();
  assert.deepEqual(h.requests.map(r => r.method), ["GET", "PUT"]);
  assert.deepEqual(JSON.parse(String(h.requests[1].body)), { action: "set_game_locale", locale: "en-GB", expectedRevision: "3" });
  assert.equal(new Headers(h.requests[1].headers).get("X-Touchline-Expected-Account"), owner);
  assert.equal(h.session.get(markerKey), "en-GB");
  assert.deepEqual(h.navigations, ["http://local.test/clubowner?lang=en-GB&club=42#squad"]);
  menu.cleanup();
});

test("blocked session storage preserves safe account fallback; drafts cannot create intent", async () => {
  const h = harness(false); h.chooseLogin("pt-BR");
  assert.equal(h.intent.readTouchlinePresentationLocaleIntent(), null);
  const menu = h.mountMenu("en-GB"); await settle();
  assert.equal(h.navigations.length, 1); assert.deepEqual(h.requests.map(r => r.method), ["GET"]);
  menu.cleanup();
  const available = harness();
  for (const value of [null, undefined, "unknown", "ar-SA", "es-ES", "it-IT", "fr-FR", "tr-TR", "de-DE"]) {
    assert.equal(available.intent.rememberTouchlinePresentationLocaleIntent(value), false);
  }
  assert.equal(available.session.size, 0);
});

test("write failure removes a readable stale intent after confirmed selection without extra PUT", async () => {
  const h = harness(true, false);
  h.session.set(markerKey, "pt-BR");
  const menu = h.mountMenu("en-GB"); await settle();
  assert.deepEqual(h.navigations, []);
  menu.choose("en-GB"); await settle();
  assert.deepEqual(h.requests.map(r => r.method), ["GET", "PUT"]);
  assert.deepEqual(JSON.parse(String(h.requests[1].body)), { action: "set_game_locale", locale: "en-GB", expectedRevision: "3" });
  assert.equal(new Headers(h.requests[1].headers).get("X-Touchline-Expected-Account"), owner);
  assert.equal(h.session.has(markerKey), false);
  assert.equal(h.intent.readTouchlinePresentationLocaleIntent(), null);
  menu.cleanup();
  const remounted = h.mountMenu("en-GB"); await settle();
  assert.deepEqual(h.navigations, ["http://local.test/clubowner?lang=en-GB&club=42#squad"]);
  assert.deepEqual(h.requests.map(r => r.method), ["GET", "PUT", "GET"]);
  remounted.cleanup();
});

test("all storage operations blocked cannot guarantee persistence or erase an inaccessible marker", () => {
  const h = harness(false);
  h.session.set(markerKey, "pt-BR");
  assert.equal(h.intent.rememberTouchlinePresentationLocaleIntent("en-GB"), false);
  assert.equal(h.intent.readTouchlinePresentationLocaleIntent(), null);
  // The storage fallback does not claim deletion when even access is denied.
  assert.equal(h.session.get(markerKey), "pt-BR");
});
