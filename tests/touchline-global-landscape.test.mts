import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the root layout owns one non-blocking shared content target and PWA orientation is unrestricted", async () => {
  const [layout, boundary, manifest] = await Promise.all([
    source("app/layout.tsx"),
    source("components/touchline/TouchlineLandscapeBoundary.tsx"),
    source("app/manifest.ts"),
  ]);
  assert.match(layout, /<TouchlineLandscapeBoundary skipLabel=\{skipLabel\}>/);
  assert.equal((layout.match(/<TouchlineLandscapeBoundary/g) ?? []).length, 1);
  assert.match(boundary, /href="#touchline-main-content"/);
  assert.match(boundary, /id="touchline-main-content"/);
  assert.match(boundary, /data-touchline-main-content-fallback/);
  assert.doesNotMatch(boundary, /\.inert|aria-hidden|orientation\.lock|matchMedia|useEffect|useState/);
  assert.doesNotMatch(manifest, /orientation:/);
});
