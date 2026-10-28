import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const code = ts.transpileModule(readFileSync("components/admin-vip-access.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render(locale: string) {
  const exports: Record<string, unknown> = {};
  runInNewContext(code, { exports, require(name: string) { if (name === "react") return React; if (name === "react/jsx-runtime") return jsx; if (name === "lucide-react") return new Proxy({}, { get: () => () => null }); if (name.includes("club-market-rules")) return { CLUB_PLANS: { standard: { label: "Standard", budget: 100 }, master: { label: "Master", budget: 200 }, vip: { label: "VIP", budget: 300 } } }; if (name.endsWith(".module.css")) return { default: { arena: "" } }; throw new Error(name); } });
  const Component = exports.default as (props: { locale: string }) => React.ReactNode;
  return renderToStaticMarkup(React.createElement(Component, { locale }));
}
test("VIP component SSR renders both locales and no private values", () => {
  const en = render("en-GB"); const pt = render("pt-BR");
  assert.match(en, /Guest access|Choose Standard/); assert.match(pt, /acesso|Escolha/i);
  assert.doesNotMatch(`${en}${pt}`, /PRIVATE|SERVICE_ROLE/);
});
