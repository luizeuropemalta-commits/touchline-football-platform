import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as accountCopy from "../lib/touchlineArena/account-locale-menu-i18n.ts";

function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const switcherCode = compile("../components/auth-language-switcher.tsx");
const storageCode = compile("../lib/touchlineArena/browser-storage.ts");

const AccountMenu = () => null;
function selectLocale(nextLocale: string, storageAvailable: boolean, siteLocalesEnabled = false, draftLocalesEnabled = true, context?: Record<string, unknown>) {
  const events: string[] = [];
  let cookie = `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=en-GB`;
  const document = {
    get cookie() { return cookie; },
    set cookie(value: string) { cookie = value; events.push("cookie"); },
  };
  const window = {
    location: {
      href: "http://localhost:3217/login?lang=ar-SA&returnTo=%2Fclubowner%3Flang%3Den-GB",
      assign(destination: string) { events.push(`navigate:${destination}`); },
    },
    get localStorage() {
      if (!storageAvailable) throw new Error("SecurityError");
      return { setItem(key: string, value: string) { events.push(`storage:${key}:${value}`); } };
    },
  };
  const storage = {};
  runInNewContext(storageCode, { exports: storage, window });
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "lucide-react": { ChevronDown: () => null, Languages: () => null },
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/browser-storage": storage,
    "@/lib/touchlineArena/presentation-locale-intent": { rememberTouchlinePresentationLocaleIntent: () => false },
    "@/components/touchline/AccountLocaleMenu": { default: AccountMenu },
  };
  const exports: { AuthLanguageSwitcher?: (props: Record<string, unknown>) => React.ReactElement<{ children: React.ReactNode }> } = {};
  runInNewContext(switcherCode, { exports, document, window, URL, require(name: string) {
    assert.ok(name in modules, name);
    return modules[name];
  } });
  assert.ok(exports.AuthLanguageSwitcher);
  const tree = exports.AuthLanguageSwitcher({ locale: "ar-SA", draftLocalesEnabled, siteLocalesEnabled, context });
  if (tree?.type === AccountMenu) return { cookie, events, accountProps: tree.props as Record<string, unknown> };
  const select = React.Children.toArray(tree.props.children).find(child => React.isValidElement(child) && child.type === "select");
  assert.ok(React.isValidElement<{ onChange: (event: { target: { value: string } }) => void }>(select));
  select.props.onChange({ target: { value: nextLocale } });
  return { cookie, events, accountProps: undefined };
}

test("explicit complete-locale selection persists before navigation even with blocked storage", () => {
  for (const locale of ["en-GB", "pt-BR"]) {
    for (const available of [true, false]) {
      const result = selectLocale(locale, available);
      assert.equal(result.cookie, `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`);
      assert.deepEqual(result.events, [
        "cookie",
        ...(available ? [`storage:${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}:${locale}`] : []),
        `navigate:http://localhost:3217/login?lang=${locale}&returnTo=%2Fclubowner%3Flang%3Den-GB`,
      ]);
    }
  }
});

test("six login drafts remain route-local without overwriting the saved language", () => {
  for (const locale of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    const result = selectLocale(locale, true);
    assert.equal(result.cookie, `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=en-GB`);
    assert.deepEqual(result.events, [`navigate:http://localhost:3217/login?lang=${locale}&returnTo=%2Fclubowner%3Flang%3Den-GB`]);
  }
});

test("public release persists all eight validated selections before navigating", () => {
  for (const { code } of i18n.TOUCHLINE_APPROVED_LOCALES) for (const available of [true, false]) {
    const result = selectLocale(code, available, true, false, { mode: "guest" });
    assert.equal(result.cookie, `${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}=${code}; path=/; max-age=31536000; SameSite=Lax`);
    assert.deepEqual(result.events, [
      "cookie",
      ...(available ? [`storage:${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}:${code}`] : []),
      `navigate:http://localhost:3217/login?lang=${code}&returnTo=%2Fclubowner%3Flang%3Den-GB`,
    ]);
  }
});

test("authenticated public selection delegates to account persistence; private draft never escalates", () => {
  const context = { mode: "account", accountId: "canonical-account" };
  for (const draft of [false, true]) {
    const released = selectLocale("ar-SA", true, true, draft, context);
    assert.equal(released.accountProps?.context, context);
    assert.equal(released.accountProps?.draftLocalesEnabled, true);
    assert.equal(released.accountProps?.variant, "select");
    assert.deepEqual(released.events, [], "render alone cannot persist or navigate");
  }
  const closed = selectLocale("ar-SA", true, false, false, context);
  assert.equal(closed.accountProps?.draftLocalesEnabled, false);
  const privateDraft = selectLocale("ar-SA", true, false, true, context);
  assert.equal(privateDraft.accountProps, undefined);
  assert.deepEqual(privateDraft.events, ["navigate:http://localhost:3217/login?lang=ar-SA&returnTo=%2Fclubowner%3Flang%3Den-GB"]);
});

test("unavailable context can choose a public locale without creating an account write", () => {
  const result = selectLocale("de-DE", true, true, false, { mode: "unavailable" });
  assert.equal(result.accountProps, undefined);
  assert.deepEqual(result.events, ["cookie", `storage:${i18n.TOUCHLINE_LOCALE_STORAGE_KEY}:de-DE`, "navigate:http://localhost:3217/login?lang=de-DE&returnTo=%2Fclubowner%3Flang%3Den-GB"]);
});

test("released account branch renders the real account menu with eight choices and no SSR writes", () => {
  const cannotWrite = () => { throw Error("SSR must not access account persistence"); };
  const modules: Record<string, unknown> = {
    react: React, "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ refresh: cannotWrite }) },
    "lucide-react": { Check: () => null, ChevronDown: () => null, Languages: () => null },
    "@/lib/touchlineArena/i18n": i18n,
    "@/lib/touchlineArena/account-locale-menu-i18n": accountCopy,
    "@/lib/touchlineArena/account-locale-browser": { startAccountLocaleBrowser: cannotWrite },
    "@/lib/supabase/client": { createClient: cannotWrite },
    "@/lib/touchlineArena/browser-storage": { writeBrowserStorage: cannotWrite },
    "@/lib/touchlineArena/presentation-locale-intent": { rememberTouchlinePresentationLocaleIntent: cannotWrite, readTouchlinePresentationLocaleIntent: cannotWrite },
  };
  function load(code: string) {
    const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
    runInNewContext(code, { exports, require(name: string) {
      assert.ok(name in modules, name);
      return modules[name];
    } });
    return exports;
  }
  modules["@/components/touchline/AccountLocaleMenu"] = load(compile("../components/touchline/AccountLocaleMenu.tsx"));
  const Switcher = load(switcherCode).AuthLanguageSwitcher;
  for (const enabled of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(Switcher, {
      locale: enabled ? "ar-SA" : "en-GB", context: { mode: "account", accountId: "canonical-account" }, siteLocalesEnabled: enabled,
    }));
    assert.equal((html.match(/<option /g) ?? []).length, enabled ? 8 : 2);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /disabled=""/);
    assert.match(html, /role="status"/);
  }
});

test("unknown selections cannot write preferences or navigate", () => {
  for (const enabled of [true, false]) {
    const result = selectLocale("invalid", true, enabled);
    assert.deepEqual(result.events, []);
  }
});
