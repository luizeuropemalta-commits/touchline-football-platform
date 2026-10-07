import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as arenaIntro from "../lib/touchlineArena/arena-intro.ts";
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
    if (name.endsWith(".css")) return { default: { frame: "brand-frame", column: "brand-column", row: "brand-row", controls: "page-controls" } };
    throw Error(`Unexpected brand header dependency: ${name}`);
  } });
  return exports;
}

function fixture() {
  const logoProps: Record<string, unknown>[] = [], audio: Record<string, unknown>[] = [], language: Record<string, unknown>[] = [];
  const logo = load("../components/logo.tsx", {
    "@/lib/touchlineArena/arena-intro": arenaIntro,
    "next/link": { default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
    "next/image": { default: ({ priority, unoptimized, ...props }: Record<string, unknown>) => {
      void priority; void unoptimized; return React.createElement("img", props);
    } },
  }).Logo;
  const controls = load("../components/touchline/TouchlinePageControls.tsx", {
    "next/navigation": { usePathname: () => "/clubowner" },
    "./SiteLocaleReleaseContext": { useSiteLocaleRelease: () => false },
    "@/lib/touchlineArena/auth-i18n": authCopy,
    "@/components/auth-ambient-audio": { AuthAmbientAudio: (props: Record<string, unknown>) => {
      audio.push(props); return React.createElement("button", { "data-audio": true }, "Sound");
    } },
    "@/components/auth-language-switcher": { AuthLanguageSwitcher: (props: Record<string, unknown>) => {
      language.push(props); return React.createElement("span", { "data-language": true }, props.locale as string);
    } },
  }).default;
  const header = load("../components/touchline/TouchlineBrandHeader.tsx", {
    "@/components/logo": { Logo: (props: Record<string, unknown>) => { logoProps.push(props); return React.createElement(logo, props); } },
    "./TouchlinePageControls": { default: controls },
  }).default;
  return { logoProps, audio, language, render: (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(header, props)) };
}

test("brand shell composes one existing official login Logo and one LTR controls group", () => {
  for (const { code } of TOUCHLINE_APPROVED_LOCALES) {
    for (const draftLocalesEnabled of [undefined, true]) {
      const view = fixture();
      const context = { mode: "account", accountId: "canonical-account" };
      const href = `/clubowner?lang=${code}`;
      const html = view.render({ href, locale: code, accountLocaleContext: context, draftLocalesEnabled });
      assert.equal(view.logoProps.length, 1); assert.equal(view.audio.length, 1); assert.equal(view.language.length, 1);
      assert.equal(view.logoProps[0].href, href);
      assert.equal(view.logoProps[0].officialArena, true); assert.equal(view.logoProps[0].minimalMark, true);
      assert.equal(view.logoProps[0].subtitle, "TouchLine Futebol Cards");
      assert.equal(view.logoProps[0].wordmarkClassName, "text-[clamp(26px,3.2vw,34px)]");
      assert.equal(view.audio[0].locale, code);
      assert.equal(view.audio[0].allowDraftLocale, draftLocalesEnabled ?? false);
      assert.equal(view.language[0].context, context);
      assert.equal(view.language[0].draftLocalesEnabled, draftLocalesEnabled ?? false);
      assert.match(html, /<header class="brand-frame" dir="ltr"><div class="brand-column"><div class="brand-row">/);
      assert.equal((html.match(/<img\b/g) ?? []).length, 1);
      assert.ok(html.includes(arenaIntro.TOUCHLINE_ARENA_OFFICIAL_LOGO));
      assert.ok(html.includes('width="61" height="61"'));
      assert.equal((html.match(/class="page-controls" dir="ltr"/g) ?? []).length, 1);
      assert.ok(html.indexOf("<img") < html.indexOf("data-audio"));
      assert.ok(html.indexOf("data-audio") < html.indexOf("data-language"));
      assert.doesNotMatch(html, /<audio\b|<video\b|premium-ring/);
    }
  }
});

test("header placement contract matches login safe-area spacing and wide-screen columns", () => {
  const css = readFileSync(new URL("../components/touchline/TouchlineBrandHeader.module.css", import.meta.url), "utf8");
  const loginCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../components/auth-layout.tsx", import.meta.url), "utf8");
  for (const declaration of [
    "padding-top: max(1.25rem, env(safe-area-inset-top));",
    ...["1.25rem", "2rem", "2.5rem", "3.5rem"].flatMap(size => [
      `padding-right: max(${size}, env(safe-area-inset-right));`,
      `padding-left: max(${size}, env(safe-area-inset-left));`,
    ]),
  ]) { assert.ok(css.includes(declaration)); assert.ok(loginCss.includes(declaration)); }
  for (const breakpoint of [640, 1024, 1280]) {
    assert.ok(css.includes(`@media (min-width: ${breakpoint}px)`));
    assert.ok(loginCss.includes(`@media (min-width: ${breakpoint}px)`));
  }
  assert.ok(css.includes("@media (min-width: 1536px)"));
  assert.ok(css.includes("grid-template-columns: minmax(0, 1.45fr) minmax(320px, .55fr)"));
  assert.ok(layout.includes("2xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]"));
  assert.doesNotMatch(css, /padding-bottom|position:\s*(?:fixed|absolute)|row-reverse|column-reverse/);
});
