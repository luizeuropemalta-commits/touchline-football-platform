import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/local/render-touchline-match-preview-live-video.mts", import.meta.url), "utf8");
const motionSource = readFileSync(new URL("../components/touchline/social/TouchlineSocialMatchPreviewLiveMotionPreview.tsx", import.meta.url), "utf8");
const approvedSource = readFileSync(new URL("../components/touchline/social/TouchlineSocialApprovedMatchPreviewDraft.tsx", import.meta.url), "utf8");
const previewRoute = readFileSync(new URL("../app/visual-qa/social-match-preview-live/page.tsx", import.meta.url), "utf8");

test("Match Preview exporter reuses one page per presentation and keeps only durable loop evidence", () => {
  assert.equal((source.match(/await page\.goto\(/g) ?? []).length, 1);
  assert.match(source, /setDeterministicFrame/);
  assert.match(source, /const REVIEW_LOOP_COUNT = 2/);
  assert.match(source, /frameCount = framesPerLoop \* REVIEW_LOOP_COUNT/);
  assert.match(source, /probeEncodedVideo/);
  assert.match(source, /TL_MATCH_PREVIEW_LIVE_VIDEO_PROBE_INVALID/);
  assert.match(source, /DECODED_REQUIRES_HUMAN_TWO_LOOP_REVIEW/);
  assert.match(source, /pixel-identical screenshots are not a trustworthy seam oracle/);
  assert.match(source, /localObjectKeyEvidence/);
  assert.match(source, /root\.style\.setProperty\("--match-preview-motion-delay"/);
  assert.match(source, /await rm\(frameDirectory, \{ recursive: true, force: false \}\)/);
  assert.match(source, /facts: metadata/);
  assert.match(source, /TL_MATCH_PREVIEW_LIVE_VIDEO_OUTPUT_EXISTS/);
  assert.match(source, /root\.closest<HTMLElement>\("\[data-match-preview-live-video-qa='non-publishable'\]"\)/);
  assert.match(source, /fixtureId: factualRoot\.dataset\.fixtureId/);
  assert.match(source, /dispatch: factualRoot\.dataset\.dispatch/);
  assert.match(source, /caption: factualRoot\.dataset\.caption/);
  assert.match(source, /validateStudioMedia/);
  assert.match(source, /studio-manifest\.json/);
});

test("stale local Match Preview video uses honest copy and a native Story canvas", () => {
  assert.match(motionSource, /data-factual-state="preview"/);
  assert.match(motionSource, /data-template-version="touchline-match-preview-live-candidate-v1"/);
  assert.match(motionSource, /const story = presentation === "story"/);
  assert.match(motionSource, /minHeight: story \? 1920 : 1350/);
  assert.match(motionSource, /height: story \? 1920 : undefined/);
  assert.doesNotMatch(motionSource, /data-social-approved-snapshot/);
  assert.doesNotMatch(motionSource, /OUTBOUND DISABLED|STORY CANDIDATE|LOCAL VISUAL QA/);
  assert.match(motionSource, /TOUCHLINE PREVIEW/);
  assert.match(motionSource, /kickoffInMalta/);
  assert.doesNotMatch(approvedSource, /TOUCHLINE PREVIEW|kickoffInMalta|data-factual-state/);
  assert.match(previewRoute, /nextjs-portal \{ display: none !important; \}/);
});
