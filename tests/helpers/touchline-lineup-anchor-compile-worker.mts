import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { bundleIsolatedBrowserFixture } from "./touchline-isolated-browser-bundle.mts";
import { extractIsolatedPageCss } from "./touchline-lineup-anchor-page-css.mts";

// Exit releases TypeScript/PostCSS before the parent may open a browser.
assert.equal(process.argv.length, 3, "Expected one test-owned temporary directory");
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-lineup-anchor-[A-Za-z0-9]+$/);
const root = path.resolve(import.meta.dirname, "../..");

const pageSource = readFileSync(path.join(root, "app/touchline-clubs/[club]/page.tsx"), "utf8");
const ast = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fallback = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ClubHubDeferredSection");
assert.ok(fallback, "production deferred fallback must exist");
const fallbackScript = ts.transpileModule(fallback.getText(ast), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
} }).outputText;
const pageCss = extractIsolatedPageCss(ast);
assert.ok(pageCss.includes("#touchline-club-lineup") && pageCss.includes(".club-hub-deferred-lineup"), "real page anchor and fallback CSS required");
const bundle = bundleIsolatedBrowserFixture({
  entryPath: "tests/fixtures/ClubHubDelayedLineupBrowserFixture.tsx",
  requiredSources: ["components/touchline/ClubHubOfficialLineup.tsx", "components/touchline/ClubHubOfficialLineup.module.css", "components/touchline/club-hub/ClubHubSectionNavigation.tsx"],
  mountScript: `${fallbackScript}\nwindow.resolveIsolatedLineup=loadEntry().resolveLineup;flushSync(()=>root.render(React.createElement(loadEntry().default,{DeferredSection:ClubHubDeferredSection})));`,
});
const globals = readFileSync(path.join(root, "app/globals.css"), "utf8");
const baseStart = globals.indexOf(":root {"), baseEnd = globals.indexOf("body::before {");
const scrollbarStart = globals.indexOf("/* Shared visible-scrollbar contract"), scrollbarEnd = globals.indexOf("\n.arena-bg {");
assert.ok(baseStart >= 0 && baseEnd > baseStart && scrollbarStart >= 0 && scrollbarEnd > scrollbarStart,
  "real global typography and scrollbar boundaries required");
// Keep the actual site's root/body/scrollbar rules, including smooth anchor
// behavior. Deliberately exclude the coarse-pointer portrait gate: 390 is
// defensive isolated coverage, not a newly exposed product portrait flow.
const baseCss = globals.slice(baseStart, baseEnd) + globals.slice(scrollbarStart, scrollbarEnd)
  + globals.match(/button, a, input, textarea, select \{[^}]+\}/)![0];
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseCss}${pageCss}${bundle.css}</style></head><body><div id="root"></div><script>${bundle.script.replaceAll("</script", "<\\/script")}</script></body></html>`;

const sources = [...new Set([...bundle.sources, "app/touchline-clubs/[club]/page.tsx", "app/globals.css",
  "tests/helpers/touchline-lineup-anchor-page-css.mts", "tests/helpers/touchline-lineup-anchor-compile-worker.mts",
  "tests/helpers/touchline-isolated-browser-bundle.mts"])].sort();
const sha256 = Object.fromEntries(sources.map(source => [source,
  createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex")]));
writeFileSync(path.join(output, "fixture.html"), html, { flag: "wx" });
writeFileSync(path.join(output, "fixture-sources.json"), JSON.stringify({ sources, sha256 }, null, 2), { flag: "wx" });
