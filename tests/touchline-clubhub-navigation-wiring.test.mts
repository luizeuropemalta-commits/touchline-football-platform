import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "ClubHubBrandHeader");
assert.ok(helper);
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function actualHeader() {
  const railExports = {};
  runInNewContext(compile(readFileSync(new URL("../components/touchline/TouchlineNavigationRail.tsx", import.meta.url), "utf8")), {
    exports: railExports, require(name: string) {
      if (name === "react") return React;
      assert.equal(name, "react/jsx-runtime"); return jsxRuntime;
    },
  });
  const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
  runInNewContext(compile(readFileSync(new URL("../components/touchline/TouchlineBrandHeader.tsx", import.meta.url), "utf8")), {
    exports,
    require(name: string) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "@/components/logo") return { Logo: () => React.createElement("span", { "data-test-brand": true }, "TouchLine") };
      if (name === "./TouchlinePageControls") return { default: () => React.createElement("div", { "data-test-controls": true }) };
      if (name === "./TouchlineNavigationRail") return railExports;
      // Never invoke auth: only prove that the real header mounts its existing
      // sign-out component once after the verified account promise resolves.
      if (name === "./TouchlineSignOutButton") return { default: () => React.createElement("button", { "data-test-signout": true }, "Sair") };
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return exports.default;
}

test("ClubHub resolved header forwards the same navigation and uses existing account-only sign-out", async () => {
  const exports: { header?: (props: unknown) => Promise<React.ReactElement<Record<string, unknown>>> } = {};
  runInNewContext(compile(`${helper.getText(tree)}\nexport {ClubHubBrandHeader as header};`), {
    exports, TouchlineBrandHeader: actualHeader(),
    require(name: string) { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
  });
  for (const mode of ["account", "guest", "unavailable"]) {
    const navigation = React.createElement("nav", { "data-test-menu": true }, "ClubOwner · ClubHub · Live · Rankings");
    const element = await exports.header!({ locale: "pt-BR", href: "/touchline-clubs/aston-villa?lang=pt-BR", navigation,
      viewerAccessPromise: Promise.resolve({ accountLocaleContext: { mode, ...(mode === "account" ? { accountId: "confirmed-id" } : {}) } }),
    });
    assert.equal(element.props.navigation, navigation);
    assert.equal(element.props.locale, "pt-BR");
    const html = renderToStaticMarkup(element);
    assert.equal((html.match(/data-test-menu=/g) ?? []).length, 1);
    assert.match(html, /data-centered-navigation="true"/);
    assert.ok(html.indexOf("data-test-menu") < html.indexOf("</header>"));
    assert.equal((html.match(/data-test-signout=/g) ?? []).length, mode === "account" ? 1 : 0);
  }
});

test("one shared menu is wired to both suspense fallback and resolved header, never the content", () => {
  assert.equal((page.match(/<TouchlineGlobalNavigation\b/g) ?? []).length, 1);
  assert.match(page, /<Suspense fallback=\{<TouchlineBrandHeader[^\n]+navigation=\{navigation\}/);
  assert.match(page, /<ClubHubBrandHeader[^\n]+navigation=\{navigation\}/);
  const content = page.slice(page.indexOf('<div className="club-hub-content">'));
  assert.doesNotMatch(content, /<TouchlineGlobalNavigation\b/);
  const declaration = page.slice(page.indexOf("const navigation = <TouchlineGlobalNavigation"), page.indexOf("const navigation = <TouchlineGlobalNavigation") + 500);
  for (const preserved of ['locale={locale}', 'draftLocalesEnabled={draftLocalesEnabled}', 'currentRoute="clubProfile"', 'surface="public"', 'showAudioControl={false}', 'teamId: club.teamId', 'slug: club.slug', 'name: club.name']) {
    assert.ok(declaration.includes(preserved), preserved);
  }
});
