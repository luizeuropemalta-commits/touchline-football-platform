import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { bundleIsolatedBrowserFixture } from "./touchline-isolated-browser-bundle.mts";

assert.equal(process.argv.length, 3, "Expected one test-owned temporary directory");
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-technical-integration-[A-Za-z0-9]+$/);
const rootPath = path.resolve(import.meta.dirname, "../..");

const production = readFileSync(path.join(rootPath, "app/fantasy/FantasyGameweekClient.tsx"), "utf8");
const ast = ts.createSourceFile("FantasyGameweekClient.tsx", production, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const arena = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "ArenaView");
assert.equal(arena.length, 1);
const arenaFunction = ts.transpileModule(arena[0].getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const liveMarker = production.indexOf('data-clubowner-live-position="above-reserves"');
const railMarker = production.indexOf('<ClubOwnerTechnicalRail enabled=');
assert.ok(liveMarker >= 0 && railMarker >= 0, "both production placement markers must exist");
assert.ok(liveMarker < railMarker, "production Live precedes technical rail");
const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/helpers/clubowner-technical-rail-fixture.tsx",
  requiredSources: ["components/touchline/fantasy/ClubOwnerTechnicalRail.tsx", "components/touchline/fantasy/ClubOwnerCollectionSlots.tsx",
    "components/touchline/fantasy/TouchlineGameweekCard.tsx", "components/touchline/cards/TouchlineCoachCard.tsx",
    "components/touchline/cards/TouchlineCoachCardZoom.tsx", "components/touchline/cards/TouchlineCardZoom.tsx",
    "components/touchline/fantasy/ClubOwnerCollectionSlots.module.css", "app/fantasy/fantasy.module.css",
    "components/touchline/ClubHubFixtureStrip.tsx", "components/touchline/pitch/TouchlinePitchSurface.tsx"],
  mountScript: `const {useRef,useEffect}=React;const styles=loadEntry().arenaStyles,createPortal=loadEntry().createArenaPortal;${arenaFunction}\nwindow.renderRailFixture=(props)=>flushSync(()=>root.render(React.createElement(loadEntry().default,{...props,ArenaBoundary:ArenaView})));`,
});

const sources = [...new Set([...bundle.sources, "app/fantasy/FantasyGameweekClient.tsx",
  "tests/helpers/touchline-technical-rail-compile-worker.mts", "tests/helpers/touchline-isolated-browser-bundle.mts"])].sort();
const sha256 = Object.fromEntries(sources.map(source => [source,
  createHash("sha256").update(readFileSync(path.join(rootPath, source))).digest("hex")]));
writeFileSync(path.join(output, "fixture-script.js"), bundle.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture-style.css"), bundle.css, { flag: "wx" });
writeFileSync(path.join(output, "fixture-sources.json"), JSON.stringify({ sources, sha256 }, null, 2), { flag: "wx" });
