import assert from "node:assert/strict";
import test from "node:test";
import { renderFrame, source } from "./helpers/touchline-site-frame-fixture.mts";

test("empty route retains a neutral content box before the sibling footer", () => {
  const html = renderFrame("empty");
  assert.match(html, /<div class="routeSpace" data-touchline-page-content="true"><\/div><footer /);
  assert.doesNotMatch(html, /<main|role="main"/);
});
test("fallback and ready content keep one route-owned main without nested landmarks", () => {
  for (const state of ["fallback", "short", "tall"] as const) {
    const html = renderFrame(state);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1);
    assert.match(html, /<\/main><\/div><footer /);
    assert.match(html, /href="#touchline-main-content"/);
    assert.equal((html.match(/id="touchline-main-content"/g) ?? []).length, 1);
  }
});
test("isolated preview stays unwrapped and has no global footer", () => {
  const html = renderFrame("short", true);
  assert.doesNotMatch(html, /data-touchline-page-content|<footer/);
  assert.match(html, /<main id="route-main"/);
  const root = source("app/layout.tsx");
  assert.match(root, /<TouchlineAmbientAudioProvider enabled=\{!isIsolatedPreview\}>\s*\{isIsolatedPreview \? children : <TouchlinePageContent>\{children\}<\/TouchlinePageContent>\}\s*\{!isIsolatedPreview \? <TouchlineSiteFooter/);
  assert.match(root, /<TouchlineLandscapeBoundary[^>]+>\s*<TouchlineAmbientAudioProvider/);
});
test("reservation adds no fixed size, clipping, positioning, landmark or extra suspense", () => {
  const css = source("components/touchline/TouchlinePageContent.module.css");
  assert.match(css, /min-height: 100vh;\s*min-height: 100dvh;/);
  assert.match(css, /min-width: 0;/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:height|max-height|overflow|position|transform|zoom)\s*:/m);
  assert.doesNotMatch(source("components/touchline/TouchlinePageContent.tsx"), /<main|<Suspense|role=|tabIndex=|useEffect|use client/);
});
