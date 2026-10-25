import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup, renderToPipeableStream } = require("react-dom/server");
const source = readFileSync(new URL("../components/touchline/TouchlineAccountLoading.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/touchline/TouchlineAccountLoading.module.css", import.meta.url), "utf8");

function loadLoading() {
  const exports: { default?: () => unknown } = {};
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => id.endsWith(".css")
      ? { default: new Proxy({}, { get: (_target, key) => key }) }
      : require(id),
  });
  return exports.default;
}

function renderLoading() {
  return renderToStaticMarkup(React.createElement(loadLoading()));
}

test("both actual navigation routes use the shared immediate loading boundary", () => {
  for (const route of ["account", "clubowner"]) {
    const entry = readFileSync(new URL(`../app/${route}/loading.tsx`, import.meta.url), "utf8");
    assert.match(entry, /export \{ default \} from "@\/components\/touchline\/TouchlineAccountLoading"/);
  }
  assert.doesNotMatch(source, /"use client"|fetch\(|useEffect|useSearchParams|async function|next\/headers|supabase/i);
});

test("ClubOwner covers async layout ranking reads outside the nested route loading boundary", () => {
  const layout = readFileSync(new URL("../app/clubowner/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /import \{ Suspense, type ReactNode \} from "react"/);
  assert.match(layout, /<Suspense fallback=\{<TouchlineAccountLoading \/>\}>\s*<TouchlineCardLeadershipLayout>\{children\}<\/TouchlineCardLeadershipLayout>\s*<\/Suspense>/);
  assert.doesNotMatch(layout, /async function|await |fetch\(/);
});

test("actual ClubOwner layout streams its real fallback before controlled leadership data resolves", { timeout: 5_000 }, async (context) => {
  // Isolated React streaming proof, not Next/RSC routing, hydration or Safari
  // navigation proof. Only the external async leadership read is substituted;
  // the production layout owns Suspense and renders the real loading component.
  let resolved = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  function ControlledLeadership({ children }: { children: unknown }) {
    if (!resolved) throw pending;
    return children;
  }
  const layoutSource = readFileSync(new URL("../app/clubowner/layout.tsx", import.meta.url), "utf8");
  const exports: { default?: (props: { children: unknown }) => unknown } = {};
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/components/touchline/TouchlineAccountLoading": { default: loadLoading() },
    "@/components/touchline/cards/TouchlineCardLeadershipLayout": { default: ControlledLeadership },
  };
  vm.runInNewContext(ts.transpileModule(layoutSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, {
    exports,
    require(id: string) {
      assert.ok(Object.hasOwn(modules, id), `Unexpected layout dependency: ${id}`);
      return modules[id];
    },
  });
  const destination = new PassThrough();
  const chunks: string[] = [];
  const errors: unknown[] = [];
  let shellReady = false;
  let allReady = false;
  let phase = "pending shell";
  destination.on("data", (chunk: Buffer) => { chunks.push(chunk.toString("utf8")); });
  const firstChunk = once(destination, "data", { signal: context.signal });
  const ended = once(destination, "end", { signal: context.signal });
  // Attach a rejection handler immediately: cancellation can reject the end
  // wait while the test is still checking the first chunk.
  void ended.catch(() => {});
  // Supply the outer document that the application root normally owns. A
  // naked Suspense root can retain React 19's preamble while its read is pending;
  // it is not the topology under test. Do not add a second Suspense here.
  const tree = React.createElement("html", { lang: "en-GB" },
    React.createElement("head", null, React.createElement("title", null, "Controlled loading test")),
    React.createElement("body", null,
      React.createElement("div", { "data-controlled-shell": "ready" },
        React.createElement(exports.default, null,
          React.createElement("main", { "data-controlled-route": "ready" }, "Controlled ClubOwner content")))));
  const stream = renderToPipeableStream(tree, {
    onShellReady() { shellReady = true; stream.pipe(destination); },
    onAllReady() { allReady = true; },
    onShellError(error: Error) { destination.destroy(error); },
    onError(error: unknown) { errors.push(error); },
  });
  // Fail with stage evidence before the test runner's unchanged five-second
  // bound, rather than silently hanging on either stream event.
  const diagnosticTimer = setTimeout(() => {
    destination.destroy(new Error(`Controlled streaming stalled: ${JSON.stringify({
      phase, shellReady, allReady, resolved, chunks: chunks.length,
      characters: chunks.join("").length,
      errors: errors.map((error) => error instanceof Error ? error.message : String(error)),
    })}`));
  }, 4_000);
  const cleanup = () => { stream.abort(); destination.destroy(); };
  context.signal.addEventListener("abort", cleanup, { once: true });
  try {
    await firstChunk;
    const shell = chunks.join("");
    assert.equal(shellReady, true);
    assert.match(shell, /data-controlled-shell="ready"/);
    assert.equal(allReady, false, "the controlled leadership read must still suspend");
    assert.match(shell, /aria-busy="true"/);
    assert.match(shell, /role="status"/);
    assert.ok(shell.includes(renderLoading()), "the shell must contain the complete real fallback");
    assert.doesNotMatch(shell, /data-controlled-route|Controlled ClubOwner content/);
    phase = "resolved content";
    resolved = true;
    release();
    await ended;
    assert.equal(allReady, true);
    assert.deepEqual(errors, []);
    const completed = chunks.join("");
    assert.equal((completed.match(/data-controlled-route="ready"/g) ?? []).length, 1);
    assert.match(completed, /Controlled ClubOwner content/);
    assert.ok(completed.indexOf('aria-busy="true"') < completed.indexOf('data-controlled-route="ready"'));
  } finally {
    clearTimeout(diagnosticTimer);
    context.signal.removeEventListener("abort", cleanup);
    resolved = true;
    release();
    cleanup();
  }
});

test("fallback renders one accessible status and decorative skeletons without fictional account data", () => {
  const html = renderLoading();
  assert.equal((html.match(/<main /g) ?? []).length, 1);
  assert.match(html, /aria-busy="true"/);
  assert.equal((html.match(/role="status"/g) ?? []).length, 1);
  assert.match(html, /aria-live="polite" aria-atomic="true"/);
  assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<button|<a |<img|0\.00|Haaland|Luiz|€|\$/);
});

test("all eight messages are available before hydration and CSS follows the document language", () => {
  const html = renderLoading();
  const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
  assert.equal((html.match(/class="statusText"/g) ?? []).length, locales.length);
  for (const locale of locales) {
    assert.match(html, new RegExp(`class="statusText" lang="${locale}" dir="${locale === "ar-SA" ? "rtl" : "ltr"}">[^<]+<`));
    assert.ok(css.includes(`.statusText[lang="${locale}"]`));
    if (locale !== "en-GB") assert.ok(css.includes(`:global(html[lang="${locale}"])`));
  }
  assert.match(css, /\.statusText\s*\{\s*display:none/);
  assert.match(css, /html:is\([^)]+\)\) \.statusText\[lang="en-GB"\]\s*\{ display:none/);
});

test("placeholder layout stays static and reserves safe areas with shrinkable cards", () => {
  assert.doesNotMatch(css, /animation:|@keyframes|transition:/);
  for (const side of ["top", "right", "bottom", "left"]) assert.ok(css.includes(`env(safe-area-inset-${side})`));
  assert.match(css, /box-sizing:border-box/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,64px\)\)/);
  assert.match(css, /min-height:100vh; min-height:100dvh/);
});
