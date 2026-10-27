import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { bundleIsolatedBrowserFixture } from "./touchline-isolated-browser-bundle.mts";

// Compile only. The parent waits for close to release compiler caches before
// opening a browser; this worker never launches browsers or performs network IO.
assert.equal(process.argv.length, 3, "Expected one test-owned temporary directory");
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-arena-scroll-[A-Za-z0-9]+$/);
const rootPath = path.resolve(import.meta.dirname, "../..");
const source = readFileSync(path.join(rootPath, "app/fantasy/FantasyGameweekClient.tsx"), "utf8");
const ast = ts.createSourceFile("FantasyGameweekClient.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const extract = (name: string) => {
  const found = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(found.length, 1, `extract exact production ${name}`);
  return found[0].getText(ast);
};
const functions = ts.transpileModule(`${extract("ArenaView")}\n${extract("horizontalMyClubPitchPosition")}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/ClubOwnerArenaScrollFixture.tsx", cssPrefix: "arenaScroll",
  requiredSources: ["components/touchline/ClubHubFixtureStrip.tsx", "components/touchline/cards/TouchlineCoachCardZoom.tsx", "components/touchline/fantasy/TouchlineGameweekCard.tsx", "components/touchline/pitch/TouchlinePitchSurface.tsx", "app/fantasy/fantasy.module.css"],
  mountScript: `const {useRef,useEffect}=React;const styles=loadEntry().arenaStyles,createPortal=loadEntry().createArenaPortal;${functions}\nflushSync(()=>root.render(React.createElement(loadEntry().default,{ArenaBoundary:ArenaView,position:horizontalMyClubPitchPosition})));`,
});
const globals = readFileSync(path.join(rootPath, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "");
const preflight = readFileSync(path.join(rootPath, "node_modules/tailwindcss/preflight.css"), "utf8");
const css = `${preflight}\n${globals}\n${bundle.css}`;
const sources = [...new Set([...bundle.sources, "app/fantasy/FantasyGameweekClient.tsx", "app/globals.css",
  "node_modules/tailwindcss/preflight.css", "tests/helpers/touchline-arena-scroll-compile-worker.mts",
  "tests/helpers/touchline-isolated-browser-bundle.mts"])].sort();
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sha256 = Object.fromEntries(sources.map(source => [source, digest(readFileSync(path.join(rootPath, source)))]));
writeFileSync(path.join(output, "fixture.js"), bundle.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture.css"), css, { flag: "wx" });
writeFileSync(path.join(output, "fixture-sources.json"), JSON.stringify({ sources, sha256,
  outputs: { script: digest(bundle.script), css: digest(css) } }, null, 2), { flag: "wx" });
