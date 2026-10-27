import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundleIsolatedBrowserFixture } from "./touchline-isolated-browser-bundle.mts";

// Compile only: no browser, server, credentials or provider calls. Parent waits
// for process close so TypeScript/PostCSS caches do not overlap Chromium.
assert.equal(process.argv.length, 4, "Expected ranking fixture kind and test-owned directory");
const kind = process.argv[2];
assert.ok(kind === "podium" || kind === "zoom", "unknown ranking fixture kind");
const output = realpathSync(process.argv[3]);
assert.equal(path.dirname(output), "/private/tmp");
assert.match(path.basename(output), new RegExp(`^touchline-ranking-${kind}-[A-Za-z0-9]+$`));
const root = path.resolve(import.meta.dirname, "../..");

function compile() {
  if (kind === "podium") {
    const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/RankingPodiumPublicationBrowserFixture.tsx", cssPrefix: "rankingpodium",
      requiredSources: ["app/rankings/touchline-tables-client.tsx", "app/rankings/touchline-tables.module.css",
        "components/touchline/cards/TouchlineCardLeadershipProvider.tsx", "components/touchline/cards/TouchlineCardZoom.tsx",
        "components/touchline/a11y/TouchlineDialog.tsx", "lib/touchlineArena/published-ranking-awards.ts",
        "lib/touchlineArena/published-ranking-summary.ts",
        "lib/touchlineArena/touchline-ranking-zoom-selection.ts", "lib/touchlineArena/live-presentation-client-store.ts"],
      mountScript: `window.unmountFixture=()=>flushSync(()=>root.unmount());window.transportDigest=()=>loadEntry().transportDigest();window.rerenderCatalogue=catalogue=>flushSync(()=>root.render(React.createElement(loadEntry().default,{...window.fixtureProps,catalogue})));flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));`,
    });
    const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
      + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css;
    return { ...bundle, css };
  }
  const bundle = bundleIsolatedBrowserFixture({ entryPath: "tests/fixtures/RankingZoomPersistenceBrowserFixture.tsx", cssPrefix: "rankingzoom",
    requiredSources: ["components/touchline/TouchlinePlayerCardRankingsPublication.tsx", "components/touchline/cards/TouchlineCardZoom.tsx",
      "components/touchline/a11y/TouchlineDialog.tsx", "lib/touchlineArena/live-presentation-client-store.ts"],
    mountScript: `window.unmountFixture=()=>flushSync(()=>root.unmount());window.transportDigest=()=>loadEntry().transportDigest();window.rerenderCatalogue=catalogue=>flushSync(()=>root.render(React.createElement(loadEntry().default,{...window.fixtureProps,catalogue})));flushSync(()=>root.render(React.createElement(loadEntry().default,window.fixtureProps)));`,
  });
  const routeSource = readFileSync(path.join(root, "app/touchline-player-card-rankings/page.tsx"), "utf8");
  const routeCss = routeSource.match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1];
  assert.ok(routeCss, "use actual ranking route styles, not replacement fixture geometry");
  const css = readFileSync(path.join(root, "node_modules/tailwindcss/preflight.css"), "utf8")
    + readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/^@(import|source)[^;]*;\s*/gm, "") + bundle.css + routeCss;
  return { ...bundle, css };
}

const compiled = compile();
const sources = [...new Set([...compiled.sources, "app/globals.css", "node_modules/tailwindcss/preflight.css",
  ...(kind === "zoom" ? ["app/touchline-player-card-rankings/page.tsx"] : []),
  "tests/helpers/touchline-ranking-browser-compile-worker.mts", "tests/helpers/touchline-isolated-browser-bundle.mts"])].sort();
const sha256 = Object.fromEntries(sources.map(source => [source,
  createHash("sha256").update(readFileSync(path.join(root, source))).digest("hex")]));
writeFileSync(path.join(output, "fixture.js"), compiled.script, { flag: "wx" });
writeFileSync(path.join(output, "fixture.css"), compiled.css, { flag: "wx" });
writeFileSync(path.join(output, "fixture-sources.json"), JSON.stringify({ kind, sources, sha256 }, null, 2), { flag: "wx" });
