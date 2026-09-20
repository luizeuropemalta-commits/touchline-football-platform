import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the shared boundary blocks mobile portrait while preserving the mounted content", async () => {
  const [layout, boundary, manifest] = await Promise.all([
    source("app/layout.tsx"),
    source("components/touchline/TouchlineLandscapeBoundary.tsx"),
    source("app/manifest.ts"),
  ]);
  assert.match(layout, /<TouchlineLandscapeBoundary skipLabel=\{skipLabel\}/);
  assert.equal((layout.match(/<TouchlineLandscapeBoundary/g) ?? []).length, 1);
  assert.match(boundary, /href="#touchline-main-content"/);
  assert.match(boundary, /id="touchline-main-content"/);
  assert.match(boundary, /data-touchline-main-content-fallback/);
  assert.match(boundary, /installTouchlineOrientationGate/);
  assert.match(boundary, /role="dialog"/);
  assert.match(boundary, /aria-modal="true"/);
  assert.match(boundary, /Gire para o modo horizontal/);
  assert.match(boundary, /\{children\}/);
  assert.doesNotMatch(boundary, /orientation\.lock|router\.(push|replace)|location\.(assign|reload)/);
  assert.match(manifest, /orientation:\s*"landscape"/);
});
