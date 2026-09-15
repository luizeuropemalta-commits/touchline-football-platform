import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

test("Lineup pins exactly the current independently validated encoder without editing it", () => {
  const encoder = readFileSync(new URL("../scripts/local/encode-png-sequence-to-mp4.swift", import.meta.url));
  const actual = createHash("sha256").update(encoder).digest("hex");
  assert.equal(actual, "e823c09860eda5035d6a1fba312ff1f669a59da07bac989f889c0d2613f8a46b");
  const exporter = readFileSync(new URL("../scripts/social-lineup-live-render.mjs", import.meta.url), "utf8");
  assert.ok(exporter.includes(`sha256:${actual}`), "Lineup encoder pin is stale");
});

test("Lineup export decodes both delivery cycles and retains a two-loop review asset", () => {
  const exporter = readFileSync(new URL("../scripts/social-lineup-live-render.mjs", import.meta.url), "utf8");
  assert.match(exporter, /probe-social-studio-video\.swift/);
  assert.match(exporter, /assertEventsLiveDecode\(probe, \{ sha256: hash\(bytes\), \.\.\.dimensions, fps, seconds: 6 \}\)/);
  assert.match(exporter, /two-loops-review-only\.mp4/);
  assert.match(exporter, /assertEventsLiveDecode\(twoLoopProbe, \{ sha256: hash\(twoLoopBytes\), \.\.\.dimensions, fps, seconds: 12 \}\)/);
  assert.match(exporter, /caption-instagram-pt-BR\.txt/);
  assert.match(exporter, /caption-facebook-pt-BR\.txt/);
});

test("Lineup review keeps operational language out of the creative and owns a native Story canvas", () => {
  const review = readFileSync(new URL("../components/touchline/social/social-lineup-live-review.tsx", import.meta.url), "utf8");
  const reviewCss = readFileSync(new URL("../components/touchline/social/social-lineup-live-review.module.css", import.meta.url), "utf8");
  const creative = readFileSync(new URL("../components/touchline/social/TouchlineSocialLineupDraft.tsx", import.meta.url), "utf8");
  const creativeCss = readFileSync(new URL("../components/touchline/social/TouchlineSocialLineupDraft.module.css", import.meta.url), "utf8");

  assert.match(review, /reviewMode placement=\{placement\}/);
  assert.match(review, /LINE-UP REVIEW · MATCH REWIND/);
  assert.doesNotMatch(review, /Shape: Sportmonks|Club report|OUTBOUND DISABLED|CURRENTLY IN TESTING/);
  assert.match(creative, /reviewMode \? "LINE-UP REVIEW"/);
  assert.match(creative, /reviewMode \? "MATCHDAY SQUAD PRESENTATION"/);
  assert.match(creative, /reviewMode \? "TOUCHLINE · MATCH REWIND"/);
  assert.match(reviewCss, /\.story\{height:1920px/);
  assert.match(creativeCss, /\.storyCanvas\s*\{[\s\S]*height:\s*1920px/);
  assert.match(creativeCss, /\.storyCanvas \.pitch[\s\S]*width:\s*670px[\s\S]*height:\s*1035px/);
  assert.match(creativeCss, /\.storyCanvas \.technicalRail[\s\S]*height:\s*1760px/);
});
