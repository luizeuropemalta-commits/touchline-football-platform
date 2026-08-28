import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { touchlineDeviceNeedsLandscape } from "../lib/touchlineArena/device-orientation.ts";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("every phone and tablet portrait viewport is blocked while landscape and desktop remain available", () => {
  assert.equal(touchlineDeviceNeedsLandscape({ width: 390, height: 844, coarsePointer: true, hoverlessPointer: true }), true);
  assert.equal(touchlineDeviceNeedsLandscape({ width: 820, height: 1180, coarsePointer: true, hoverlessPointer: true }), true);
  assert.equal(touchlineDeviceNeedsLandscape({ width: 844, height: 390, coarsePointer: true, hoverlessPointer: true }), false);
  assert.equal(touchlineDeviceNeedsLandscape({ width: 1024, height: 768, coarsePointer: true, hoverlessPointer: true }), false);
  assert.equal(touchlineDeviceNeedsLandscape({ width: 402, height: 874, coarsePointer: false, hoverlessPointer: false, mobileDevice: true }), true);
  assert.equal(touchlineDeviceNeedsLandscape({ width: 874, height: 402, coarsePointer: false, hoverlessPointer: false, mobileDevice: true }), false);
  assert.equal(touchlineDeviceNeedsLandscape({ width: 900, height: 1440, coarsePointer: false, hoverlessPointer: false }), false);
});

test("the root layout owns one global landscape boundary and the PWA requests landscape", async () => {
  const [layout, boundary, styles, manifest] = await Promise.all([
    source("app/layout.tsx"),
    source("components/touchline/TouchlineLandscapeBoundary.tsx"),
    source("components/touchline/TouchlineLandscapeBoundary.module.css"),
    source("app/manifest.ts"),
  ]);
  assert.match(layout, /<TouchlineLandscapeBoundary locale=\{locale\} skipLabel=\{skipLabel\}>/);
  assert.equal((layout.match(/<TouchlineLandscapeBoundary/g) ?? []).length, 1);
  assert.match(boundary, /Android\|iPhone\|iPad\|iPod\|Mobile\|Tablet/);
  assert.match(boundary, /window\.navigator\.maxTouchPoints > 1/);
  assert.match(boundary, /window\.matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(boundary, /window\.matchMedia\("\(hover: none\)"\)/);
  assert.match(boundary, /orientation\?\.lock\?\.\("landscape"\)/);
  assert.match(boundary, /const content = contentRef\.current[\s\S]*?content\.inert = nextBlocked/);
  assert.match(boundary, /if \(blocked\) gateRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(boundary, /lastLandscapeScrollYRef/);
  assert.match(boundary, /window\.addEventListener\("scroll", rememberLandscapeScroll, \{ passive: true \}\)/);
  assert.match(boundary, /window\.scrollTo\(\{ top: lastLandscapeScrollYRef\.current, left: 0, behavior: "auto" \}\)/);
  assert.match(boundary, /Gire para o modo horizontal|Rotate to landscape/);
  assert.match(styles, /@media \(orientation: portrait\) and \(pointer: coarse\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(manifest, /orientation: "landscape"/);
});
