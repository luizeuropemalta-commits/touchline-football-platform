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
assert.match(path.basename(output), /^touchline-search-content-[A-Za-z0-9]+$/);
const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

const pagePath = "app/(app)/football-search/page.tsx";
const source = readFileSync(path.join(root, pagePath), "utf8");
const ast = ts.createSourceFile(pagePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const renderers = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "renderFootballSearchPage");
assert.equal(renderers.length, 1, "extract the actual server renderer, never duplicate JSX");
assert.ok(renderers[0].body);
const compiledRenderer = transpileFixtureModule(renderers[0].getText(ast), "real-football-search-renderer.tsx");
const bundle = bundleIsolatedBrowserFixture({
  entryPath: "tests/fixtures/FootballSearchContentBrowserFixture.tsx", cssPrefix: "searchcontent",
  requiredSources: ["components/player-database-search.tsx", "components/touchline/TouchlineNavigationRail.tsx",
    "components/touchline/TouchlineGlobalNavigation.module.css", "app/(app)/football-search/FootballSearchContent.module.css"],
  mountScript: `void (async()=>{
    const fixture=loadEntry();
    const {Link,ArrowLeft,DatabaseZap,PlayerDatabaseSearch,TouchlineNavigationRail,navigationStyles,styles,touchLineAuthHref,resolveTouchlineCatalogueLocale}=fixture;
    const longLabels=new URLSearchParams(location.search).get('scenario')==='long-labels';
    const getTouchlineFootballSearchCopy=(locale,enabled)=>{
      const copy=fixture.getTouchlineFootballSearchCopy(locale,enabled);
      return longLabels?{...copy,back:copy.back+' · TouchLine',title:copy.title+' · '+copy.title+' · '+copy.title}:copy;
    };
    const exports={};
    const require=id=>{if(id==='react/jsx-runtime')return fixture.jsxRuntime;throw Error('Unapproved extracted renderer dependency: '+id);};
    ${compiledRenderer}
    const content=await renderFootballSearchPage({searchParams:Promise.resolve({lang:document.documentElement.lang})},true);
    flushSync(()=>root.render(React.createElement(fixture.default,null,content)));
    document.documentElement.dataset.fixtureReady='true';
  })().catch(error=>{setTimeout(()=>{throw error;},0);});`,
});
const tailwindRequire = createRequire(require.resolve("@tailwindcss/postcss"));
const { compile } = tailwindRequire("@tailwindcss/node");
const { Scanner } = tailwindRequire("@tailwindcss/oxide");
const candidates = new Scanner({ sources: [] }).scanFiles([...bundle.sources, pagePath].filter(f => /\.tsx?$/.test(f)).map(f => ({ content: readFileSync(path.join(root, f), "utf8"), extension: path.extname(f).slice(1) })));
const globals = path.join(root, "app/globals.css");
const compiler = await compile(readFileSync(globals, "utf8"), { base: path.dirname(globals), from: globals, onDependency() {} });
const css = `${compiler.build(candidates)}\n${bundle.css}`;

const sources = [...new Set([...bundle.sources, pagePath, "app/globals.css",
  "tests/helpers/touchline-football-search-content-compile-worker.mts",
  "tests/helpers/touchline-isolated-browser-bundle.mts"])].sort();
const sha256 = Object.fromEntries(sources.map(source => [source,
  createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex")]));
writeFileSync(path.join(output, "fixture-script.js"), bundle.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture-style.css"), css, { flag: "wx" });
writeFileSync(path.join(output, "fixture-sources.json"), JSON.stringify({ sources, sha256 }, null, 2), { flag: "wx" });
