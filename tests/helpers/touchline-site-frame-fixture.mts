import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
export const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const base = new URL("../../", import.meta.url);
export const source = (file: string) => readFileSync(new URL(file, base), "utf8");
function load(file: string) {
  const exports: { default?: (props: unknown) => unknown } = {};
  vm.runInNewContext(ts.transpileModule(source(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (id: string) => id.endsWith(".css")
    ? { default: new Proxy({}, { get: (_target, key) => key }) } : require(id) });
  return exports.default!;
}
export const PageContent = load("components/touchline/TouchlinePageContent.tsx");
const Loading = load("components/touchline/TouchlineAccountLoading.tsx");
export type FrameState = "empty" | "fallback" | "short" | "tall";
export function renderFrame(state: FrameState, isolated = false) {
  const child = state === "empty" ? null : state === "fallback" ? React.createElement(Loading)
    : React.createElement("main", { id: "route-main", style: { height: state === "tall" ? "1500px" : "40px" } }, "Route content");
  // Synthetic footer content only; geometry uses the unchanged real footer CSS.
  // This fixture does not claim a full Next/locale/auth/browser navigation proof.
  return renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement("a", { href: "#touchline-main-content", style: { position: "absolute" } }, "Skip"),
    React.createElement("div", { id: "touchline-main-content", "data-touchline-main-content-fallback": true },
      isolated ? child : React.createElement(PageContent, null, child),
      isolated ? null : React.createElement("footer", { className: "footer" }, React.createElement("small", null, "TouchLine · fixture")))));
}
export function frameCss() {
  const nextRequire = createRequire(require.resolve("next/package.json"));
  const postcss = nextRequire("postcss");
  const localByDefault = require("next/dist/compiled/postcss-modules-local-by-default");
  const scope = require("next/dist/compiled/postcss-modules-scope");
  const moduleCss = ["TouchlinePageContent", "TouchlineAccountLoading", "TouchlineSiteFooter"].map(name => {
    const result = postcss([localByDefault({ mode: "local" }), scope({ generateScopedName: (name: string) => name })])
      .process(source(`components/touchline/${name}.module.css`), { from: undefined }).sync();
    result.root.walkRules(":export", (rule: { remove(): void }) => rule.remove());
    return result.root.toString();
  }).join("\n");
  const preflight = source("node_modules/tailwindcss/preflight.css");
  const globals = source("app/globals.css").replace(/^@(import|source)[^;]*;\s*/gm, "");
  return `${preflight}\n${globals}\n${moduleCss}`;
}
