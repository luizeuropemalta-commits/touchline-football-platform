import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { normalizeTouchLineAuthLocale } from "../lib/touchlineArena/auth-i18n.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/(app)/notifications/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function render(lang: string) {
  const exports: { default?: React.ComponentType } = {};
  vm.runInNewContext(compiled, { exports, require(name: string) {
    if (name === "next/navigation") return { useSearchParams: () => new URLSearchParams({ lang }) };
    if (name === "@/lib/touchlineArena/auth-i18n") return { normalizeTouchLineAuthLocale };
    return require(name);
  } });
  assert.ok(exports.default);
  // Real React server rendering executes the page and shared components without
  // running preference effects, making this a read-only copy regression test.
  return renderToStaticMarkup(React.createElement(exports.default));
}

test("notifications render British English headings and channel description", () => {
  const html = render("en-GB");
  assert.match(html, />Notification Centre<\/h1>/);
  assert.match(html, />Consent centre<\/p>/);
  assert.match(html, /Notification centre and in-product alerts\./);
  assert.doesNotMatch(html, /Notification Center|Consent center|Notification center/);
});

test("notifications preserve Portuguese copy", () => {
  const html = render("pt-BR");
  assert.match(html, />Central de Notificações<\/h1>/);
  assert.match(html, /Central de consentimento/);
  assert.match(html, /Central de notificações e alertas dentro da TouchLine\./);
});
