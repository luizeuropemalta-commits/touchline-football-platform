import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as navigation from "../lib/touchlineArena/global-navigation.ts";
import * as rootLocale from "../lib/touchlineArena/root-locale.ts";
import * as catalogue from "../lib/touchlineArena/catalogue-locale.ts";
import * as copy from "../lib/touchlineArena/navigation-i18n.ts";
import * as authCopy from "../lib/touchlineArena/auth-i18n.ts";

type Component = (props: Record<string, unknown>) => React.ReactNode;
function load(path: string, modules: Record<string, unknown>) {
  const exports: { default?: Component } = {};
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name: string) {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.ok(name in modules, name);
    return modules[name];
  } });
  assert.ok(exports.default);
  return exports.default;
}

test("ClubOwner header plus real navigation uses one audio group; other navigation callers keep theirs", () => {
  const audio = () => React.createElement("button", { "data-audio": true });
  const controls = load("../components/touchline/TouchlinePageControls.tsx", {
    "next/navigation": { usePathname: () => "/clubowner" },
    "./SiteLocaleReleaseContext": { useSiteLocaleRelease: () => false },
    "@/lib/touchlineArena/auth-i18n": authCopy,
    "@/components/auth-ambient-audio": { AuthAmbientAudio: audio },
    "@/components/auth-language-switcher": { AuthLanguageSwitcher: () => React.createElement("select", { "data-language": true }) },
  });
  const brand = load("../components/touchline/TouchlineBrandHeader.tsx", {
    "@/components/logo": { Logo: () => React.createElement("span", { "data-logo": true }, "TouchLine") },
    "./TouchlinePageControls": { default: controls },
  });
  const nav = load("../components/touchline/TouchlineGlobalNavigation.tsx", {
    "next/link": { default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) },
    "./TouchlineNavigationLabel": { default: ({ label }: { label: string }) => React.createElement("span", null, label) },
    "@/components/auth-ambient-audio": { AuthAmbientAudio: audio },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/lib/touchlineArena/global-navigation": navigation,
    "@/lib/touchlineArena/root-locale": rootLocale,
    "@/lib/touchlineArena/catalogue-locale": catalogue,
    "@/lib/touchlineArena/navigation-i18n": copy,
  });
  for (const locale of ["en-GB", "pt-BR"]) {
    const props = { locale, currentRoute: "market", surface: "authenticated" };
    const normal = renderToStaticMarkup(React.createElement(nav, props));
    assert.equal((normal.match(/data-audio="true"/g) ?? []).length, 1);
    const without = renderToStaticMarkup(React.createElement(nav, { ...props, showAudioControl: false }));
    assert.equal((without.match(/data-audio="true"/g) ?? []).length, 0);
    assert.equal((normal.match(/<a\b/g) ?? []).length, (without.match(/<a\b/g) ?? []).length, "audio opt-out preserves every navigation link");
    const composed = renderToStaticMarkup(React.createElement(React.Fragment, null,
      React.createElement(brand, { locale, href: `/clubowner?lang=${locale}`, accountLocaleContext: { mode: "account", accountId: "trusted-customer" } }),
      React.createElement(nav, { ...props, showAudioControl: false }),
    ));
    assert.equal((composed.match(/data-logo="true"/g) ?? []).length, 1);
    assert.equal((composed.match(/data-audio="true"/g) ?? []).length, 1);
    assert.equal((composed.match(/data-language="true"/g) ?? []).length, 1);
  }
});
