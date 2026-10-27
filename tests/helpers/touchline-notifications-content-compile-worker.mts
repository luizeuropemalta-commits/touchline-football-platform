import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { bundleIsolatedBrowserFixture, transpileFixtureModule } from "./touchline-isolated-browser-bundle.mts";

// This process owns TypeScript/Tailwind/PostCSS and exits before browser launch.
assert.equal(process.argv.length, 3, "Expected one test-owned temporary directory");
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-notifications-content-[A-Za-z0-9]+$/);
const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

const pagePath = "app/(app)/notifications/page.tsx";
const source = readFileSync(path.join(root, pagePath), "utf8");
const ast = ts.createSourceFile(pagePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ast.statements.filter(ts.isFunctionDeclaration);
assert.equal(functions.filter(f => f.name?.text === "NotificationsPage").length, 1);
assert.equal(functions.filter(f => f.name?.text === "NotificationsContent").length, 1);
// All declarations are copied mechanically, including real state/effects/
// save handlers. We replace only imports with the explicit fixture bindings.
const compiled = transpileFixtureModule(ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join("\n"), "actual-notifications-page.tsx");
const bundle = bundleIsolatedBrowserFixture({
  entryPath: "tests/fixtures/NotificationsContentBrowserFixture.tsx", cssPrefix: "notificationscontent",
  requiredSources: ["components/touchline/TouchlineNavigationRail.tsx", "components/touchline/SiteLocaleReleaseContext.tsx",
    "app/(app)/notifications/NotificationsContent.module.css", "components/touchline/TouchlineGlobalNavigation.module.css", "lib/touchlineArena/notification-centre-i18n.ts"],
  mountScript: `const fixture=loadEntry();
    const {Bell,CheckCircle2,Clock3,Mail,Radio,Save,ShieldCheck,Smartphone,TouchlineNavigationRail,useSiteLocaleRelease,styles,navigationStyles,resolveTouchlineCatalogueLocale,getTouchlineNotificationCentreCopy,formatTouchlineNotificationActiveCount}=fixture;
    const {useEffect,useMemo,useRef,useState}=fixture.ReactHooks;
    const useSearchParams=()=>new URLSearchParams(location.search);
    const exports={};const require=id=>{if(id==='react/jsx-runtime')return fixture.jsxRuntime;throw Error('Unexpected extracted page dependency '+id);};
    ${compiled}
    flushSync(()=>root.render(React.createElement(fixture.default,null,React.createElement(exports.default))));
    document.documentElement.dataset.fixtureReady='true';`,
});
const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
const { compile } = tailwindRequire("@tailwindcss/node");
const { Scanner } = tailwindRequire("@tailwindcss/oxide");
const candidates = new Scanner({ sources: [] }).scanFiles([...bundle.sources, pagePath].filter(f => /\.tsx?$/.test(f)).map(f => ({ content: readFileSync(path.join(root, f), "utf8"), extension: path.extname(f).slice(1) })));
const globals = path.join(root, "app/globals.css");
const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
const css = `${compiler.build(candidates)}\n${bundle.css}`;

const sources = [...new Set([...bundle.sources, pagePath, "app/globals.css",
  "tests/helpers/touchline-notifications-content-compile-worker.mts",
  "tests/helpers/touchline-isolated-browser-bundle.mts"])].sort();
const sha256 = Object.fromEntries(sources.map(source => [source,
  createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex")]));
writeFileSync(path.join(output, "fixture-script.js"), bundle.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture-style.css"), css, { flag: "wx" });
writeFileSync(path.join(output, "fixture-sources.json"), JSON.stringify({ sources, sha256 }, null, 2), { flag: "wx" });
