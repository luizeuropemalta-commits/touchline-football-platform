import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

export const arenaRequiredSources = [
  "app/fantasy/FantasyGameweekClient.tsx", "app/fantasy/fantasy.module.css", "app/globals.css",
  "tests/fixtures/ClubOwnerArenaScrollFixture.tsx",
  "components/touchline/ClubHubFixtureStrip.tsx", "components/touchline/cards/TouchlineCoachCardZoom.tsx",
  "components/touchline/fantasy/TouchlineGameweekCard.tsx", "components/touchline/pitch/TouchlinePitchSurface.tsx",
  "node_modules/tailwindcss/preflight.css", "tests/helpers/touchline-arena-scroll-compile-worker.mts",
  "tests/helpers/touchline-isolated-browser-bundle.mts",
] as const;

/** Read bytes once and validate them before use. No compiler, browser or fallback rebuild. */
export function readArenaScrollBundle(rootPath: string, directory: string) {
  assert.equal(path.dirname(directory), "/private/tmp", "Arena bundle must be an explicit /private/tmp directory");
  assert.match(path.basename(directory), /^touchline-arena-scroll-[A-Za-z0-9]+$/);
  assert.equal(realpathSync(directory), directory, "Arena bundle must use its exact real path, never an alias or symlink");
  assert.ok(lstatSync(directory).isDirectory());
  const readOutput = (name: string) => {
    const file = path.join(directory, name);
    assert.equal(realpathSync(file), file, "Arena output symlinks are not accepted");
    assert.ok(lstatSync(file).isFile());
    return readFileSync(file, "utf8");
  };
  const script = readOutput("fixture.js"), css = readOutput("fixture.css");
  const receipt = JSON.parse(readOutput("fixture-sources.json")) as {
    sources: string[]; sha256: Record<string, string>; outputs: { script: string; css: string };
  };
  const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  assert.ok(script.length > 0 && css.length > 0 && Array.isArray(receipt.sources) && receipt.sources.length > 0);
  assert.equal(digest(script), receipt.outputs?.script, "compiled script receipt");
  assert.equal(digest(css), receipt.outputs?.css, "compiled CSS receipt");
  assert.equal(new Set(receipt.sources).size, receipt.sources.length, "duplicate source receipt");
  const root = realpathSync(rootPath);
  for (const source of receipt.sources) {
    assert.ok(typeof source === "string" && source.length > 0 && !path.isAbsolute(source)
      && !source.includes("\\") && !source.split("/").some(part => part === ".." || part === "." || part === ""), "invalid source path");
    assert.match(receipt.sha256?.[source] ?? "", /^[a-f0-9]{64}$/);
    const file = path.join(root, source), real = realpathSync(file);
    // The release intentionally shares installed dependencies via node_modules.
    // Only the compiler's one explicitly listed dependency stylesheet may use it.
    if (source === "node_modules/tailwindcss/preflight.css") {
      assert.ok(real.startsWith(realpathSync(path.join(root, "node_modules")) + path.sep));
    } else {
      assert.equal(real, file, "product/compiler sources must not be symlink aliases");
    }
    assert.equal(digest(readFileSync(real)), receipt.sha256[source], `unchanged real source: ${source}`);
  }
  for (const source of arenaRequiredSources) assert.ok(receipt.sources.includes(source), `Arena provenance requires ${source}`);
  return { script, css, sources: receipt.sources, outputs: receipt.outputs };
}
