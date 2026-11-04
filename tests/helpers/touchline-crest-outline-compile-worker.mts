// Test-only compiler process. It exits before the parent launches a browser.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import { bundleIsolatedBrowserFixture } from "./touchline-isolated-browser-bundle.mts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [mode, directory, ...extra] = process.argv.slice(2);
assert.ok(mode === "filter" || mode === "fixture", "Explicit crest compiler mode required");
assert.ok(directory && path.isAbsolute(directory) && existsSync(directory) && statSync(directory).isDirectory(),
  "Parent-created absolute compiler directory required");
assert.equal(extra.length, 0, "Unexpected compiler arguments");

function realFilterMarkup() {
  const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
  const fragment = layout.match(/<filter id="touchline-proportional-crest-outline"[\s\S]*?<\/filter>/)?.[0];
  assert.ok(fragment, "Actual root filter required");
  const source = ts.transpileModule(`export default function Filter(){return <svg><defs>${fragment}</defs></svg>;}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {} as { default: () => ReactElement };
  runInNewContext(source, { exports, require(name: string) {
    assert.equal(name, "react/jsx-runtime"); return jsx;
  } });
  return renderToStaticMarkup(exports.default());
}

const bundle = mode === "fixture" ? bundleIsolatedBrowserFixture({
  entryPath: "tests/fixtures/CrestOutlineBrowserFixture.tsx", cssPrefix: "crest",
  requiredSources: ["components/touchline/cards/TouchlineCoachCard.tsx", "components/touchline/cards/TouchlineEliteExactCard.tsx"],
  mountScript: "flushSync(()=>root.render(React.createElement(loadEntry().default)));",
}) : null;
const artifacts: Record<string, string> = { "filter.svg": realFilterMarkup(),
  ...(bundle ? { "fixture.js": bundle.script, "fixture.css": bundle.css } : {}) };
const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const sources = [...new Set(["app/layout.tsx", "tests/helpers/touchline-crest-outline-compile-worker.mts",
  "tests/helpers/touchline-isolated-browser-bundle.mts", ...(bundle?.sources ?? [])])].sort();
const sha256 = Object.fromEntries(sources.map(source => [source, digest(readFileSync(path.join(root, source)))]));
for (const [name, content] of Object.entries(artifacts)) {
  writeFileSync(path.join(directory, name), content, { encoding: "utf8", flag: "wx" });
}
// Receipt is last: a partial or timed-out compiler cannot provide a valid package.
writeFileSync(path.join(directory, "compiler-receipt.json"), JSON.stringify({
  version: 1, mode, compilerPid: process.pid, sources, sha256, bundleSources: bundle?.sources ?? [],
  artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, content]) => [name, digest(content)])),
}, null, 2), { encoding: "utf8", flag: "wx" });
