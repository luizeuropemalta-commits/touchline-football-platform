import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";
import { TOUCHLINE_APPROVED_LOCALES } from "../lib/touchlineArena/i18n.ts";

const require = createRequire(import.meta.url);
type Component = (props: Record<string, unknown>) => React.ReactNode;
function load(relative: string, modules: Record<string, unknown>): Record<string, Component> {
  const exports: Record<string, Component> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name in modules) return modules[name];
    if (name === "react/jsx-runtime") return require(name);
    if (name.endsWith(".css")) return { default: { controls: "shared-controls" } };
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    throw Error(`Unexpected auth layout dependency: ${name}`);
  } });
  return exports;
}

function fixture(contextEnabled = false, pathname = "/login") {
  const audio: Record<string, unknown>[] = [], language: Record<string, unknown>[] = [];
  const controls = load("../components/touchline/TouchlinePageControls.tsx", {
    "next/navigation": { usePathname: () => pathname },
    "./SiteLocaleReleaseContext": { useSiteLocaleRelease: () => contextEnabled },
    "@/lib/touchlineArena/auth-i18n": authCopy,
    "@/components/auth-ambient-audio": { AuthAmbientAudio: (props: Record<string, unknown>) => {
      audio.push(props); return React.createElement("button", { "data-sound": true }, "Sound");
    } },
    "@/components/auth-language-switcher": { AuthLanguageSwitcher: (props: Record<string, unknown>) => {
      language.push(props); return React.createElement("select", { "data-language": true, defaultValue: props.locale as string }, React.createElement("option", { value: props.locale as string }, props.locale as string));
    } },
  }).default;
  const layout = load("../components/auth-layout.tsx", {
    "@/lib/touchlineArena/auth-i18n": authCopy,
    "./touchline/TouchlinePageControls": { default: controls },
    "next/link": { default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
    "./logo": { Logo: () => React.createElement("span", { "data-brand": true }, "TouchLine") },
    "./auth-cinematic-media": { AuthCinematicMedia: () => null },
    "./auth-league-picker": { AuthLeaguePicker: () => null },
  }).AuthLayout;
  return { audio, language, renderControls: (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(controls, props)), render: (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(layout, props)) };
}

test("real auth layout composes one shared LTR group, preserving header, Arena link and context", () => {
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    for (const draftLocalesEnabled of [false, true]) {
      const view = fixture();
      const context = { mode: "account", accountId: "canonical-test-id" };
      const html = view.render({ locale: code, accountLocaleContext: context, draftLocalesEnabled, keepLoginLayoutStable: true });
      const expectedLocale = draftLocalesEnabled ? authCopy.normalizeTouchLineLoginLocale(code) : authCopy.normalizeTouchLineAuthLocale(code);
      assert.equal((html.match(/class="shared-controls"/g) ?? []).length, 1);
      assert.equal(view.audio.length, 1); assert.equal(view.language.length, 1);
      assert.equal(view.audio[0].locale, expectedLocale);
      assert.equal(view.audio[0].allowDraftLocale, draftLocalesEnabled);
      assert.equal(view.language[0].locale, expectedLocale);
      assert.equal(view.language[0].draftLocalesEnabled, draftLocalesEnabled);
      assert.equal(view.language[0].context, context);
      assert.match(html, /<header class="auth-brand-header flex shrink-0 items-center justify-between">/);
      assert.match(html, /<div class="flex items-center gap-2"><div class="shared-controls" dir="ltr">/);
      assert.ok(html.indexOf("data-brand") < html.indexOf("data-sound"));
      assert.ok(html.indexOf("data-sound") < html.indexOf("data-language"));
      const arenaHref = authCopy.touchLineAuthHref("/intro", expectedLocale).replaceAll("&", "&amp;");
      assert.ok(html.includes(`href="${arenaHref}"`));
      assert.ok(html.indexOf("data-language") < html.indexOf(`href="${arenaHref}"`));
      assert.match(html, /<section dir="ltr" class="relative z-10 grid min-h-\[100dvh\] min-w-0 2xl:grid-cols-\[minmax\(0,1\.45fr\)_minmax\(320px,\.55fr\)\]">/);
      assert.match(html, /class="auth-entry-content flex min-h-\[100dvh\] min-w-0 flex-col"/);
      if (expectedLocale === "ar-SA") {
        assert.match(html, /<main lang="ar-SA" dir="rtl"/);
        assert.match(html, /<div class="relative z-10" dir="rtl">/);
        assert.match(html, /<div dir="rtl" class="order-2 min-w-0 max-w-3xl xl:order-1">/);
        assert.match(html, /<p dir="rtl" class="text-\[10px\] text-slate-500">/);
        assert.match(html, /<div dir="rtl" class="hidden items-center gap-2 text-\[10px\] font-black text-slate-500 sm:flex">/);
        assert.match(html, /<div dir="rtl" class="relative z-10 mt-auto flex h-full flex-col justify-end">/);
      } else {
        assert.match(html, /<div class="order-2 min-w-0 max-w-3xl xl:order-1">/);
      }
    }
  }
});

test("default auth controls remain fail-closed and optional Arena link is still removable", () => {
  const view = fixture();
  const html = view.render({ locale: "ar-SA", showArenaHomeLink: false });
  assert.equal(view.audio[0].allowDraftLocale, false);
  assert.equal(view.language[0].draftLocalesEnabled, false);
  assert.equal(view.language[0].locale, "en-GB");
  assert.equal((view.language[0].context as { mode: string }).mode, "unavailable");
  assert.equal((html.match(/class="shared-controls"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<a\b|<audio\b|<video\b/);
});

test("shared brand controls inherit public release while explicit closed auth returns and protected paths stay closed", () => {
  for (const enabled of [false, true]) for (const pathname of ["/live", "/admin", "/admin/cards", "/visual-qa", "/visual-qa/layout"]) {
    const view = fixture(enabled, pathname);
    view.renderControls({ locale: "ar-SA", accountLocaleContext: { mode: "guest" }, draftLocalesEnabled: true });
    const protectedPath = pathname !== "/live";
    assert.equal(view.language[0].siteLocalesEnabled, enabled && !protectedPath);
    assert.equal(view.language[0].draftLocalesEnabled, !protectedPath);
    assert.equal(view.language[0].locale, protectedPath ? "en-GB" : "ar-SA");
  }
  const closed = fixture(true);
  closed.renderControls({ locale: "en-GB", accountLocaleContext: { mode: "guest" }, siteLocalesEnabled: false });
  assert.equal(closed.language[0].siteLocalesEnabled, false);
  const standalone = fixture(false);
  standalone.renderControls({ locale: "ar-SA", accountLocaleContext: { mode: "guest" }, siteLocalesEnabled: true });
  assert.equal(standalone.language[0].siteLocalesEnabled, true);
});
