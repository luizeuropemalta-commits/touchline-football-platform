import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundleIsolatedBrowserFixture } from "./touchline-isolated-browser-bundle.mts";

// Preserve the exact T23 source bundle/CSS; child exit releases compiler caches.
assert.equal(process.argv.length, 3, "Expected one test-owned temporary directory");
const output = realpathSync(process.argv[2]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), /^touchline-hero-goals-[A-Za-z0-9]+$/);
const root = path.resolve(import.meta.dirname, "../..");
const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/MatchHeroGoalsBrowserFixture.tsx", cssPrefix: "herogoals",
  requiredSources: ["components/touchline/match-centre/TouchlineMatchCentre.tsx", "components/touchline/match-centre/touchline-match-centre.module.css", "lib/touchlineArena/match-hero-goals.ts"],
  mountScript: "window.goalStyles=loadEntry().goalStyles;window.renderGoalScenario=scenario=>flushSync(()=>root.render(React.createElement(loadEntry().default,{scenario})));",
});
const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
  + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
const sources = [...new Set([...bundle.sources, "app/globals.css", "tests/helpers/touchline-isolated-browser-bundle.mts",
  "tests/helpers/touchline-hero-goals-compile-worker.mts"])].sort();
const sha256 = Object.fromEntries(sources.map(source => [source, createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex")]));
writeFileSync(path.join(output, "fixture.js"), bundle.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture.css"), css, { flag: "wx" });
writeFileSync(path.join(output, "fixture-sources.json"), JSON.stringify({ sources, sha256 }, null, 2), { flag: "wx" });
