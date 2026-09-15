import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { advanceStudioPlayback, emptyStudioPlayback, studioPlaybackMayRepeat, type StudioPlaybackState } from "../lib/touchlineArena/social-studio-playback.ts";

function playCycle(state: StudioPlaybackState, start: number) {
  for (let step = 0; step <= 24; step++) state = advanceStudioPlayback(state, { kind: step === 24 ? "ended" : "sample", time: step / 4, duration: 6, now: start + step * 250, visible: true, paused: false, seeking: false, rate: 1 });
  return state;
}

test("two complete normal-speed visible cycles are counted; loops are capped and interruption drops partial progress", () => {
  let state = playCycle(emptyStudioPlayback(), 0);
  assert.equal(state.loops, 1);
  state = playCycle(state, 6500); assert.equal(state.loops, 2);
  assert.equal(playCycle(state, 13000).loops, 2);
  state = advanceStudioPlayback(state, { kind: "interrupt" }); assert.equal(state.loops, 2);
});

test("seeking, backwards jumps, hidden playback, pauses, bad rates and long gaps cannot manufacture cycles", () => {
  for (const changed of [{ seeking: true }, { visible: false }, { paused: true }, { rate: 2 }, { time: 5.9 }, { now: 9000 }]) {
    let state = emptyStudioPlayback();
    const base = { kind: "sample" as const, time: 0, duration: 6, now: 0, visible: true, paused: false, seeking: false, rate: 1 };
    state = advanceStudioPlayback(state, base);
    state = advanceStudioPlayback(state, { ...base, time: 0.25, now: 250, ...changed });
    state = advanceStudioPlayback(state, { ...base, kind: "ended", time: 6, now: 6000 });
    assert.equal(state.loops, 0);
  }
  let state = emptyStudioPlayback();
  for (const time of [5.8, 0.1, 5.9, 0.1]) state = advanceStudioPlayback(state, { kind: "sample", time, duration: 6, now: time * 1000, visible: true, paused: false, seeking: false, rate: 1 });
  assert.equal(state.loops, 0, "The former >70% to <30% seek heuristic must not count");
});

test("auto-repeat needs explicit playback intent, visibility and no reduced-motion preference", () => {
  assert.equal(studioPlaybackMayRepeat({ requested: false, visible: true, reducedMotion: false }), false);
  assert.equal(studioPlaybackMayRepeat({ requested: true, visible: false, reducedMotion: false }), false);
  assert.equal(studioPlaybackMayRepeat({ requested: true, visible: true, reducedMotion: true }), false);
  assert.equal(studioPlaybackMayRepeat({ requested: true, visible: true, reducedMotion: false }), true);
});

test("preview exposes manual controls, reduced motion, visibility pause and seek-safe tracking", () => {
  const ui = readFileSync("components/touchline/admin/TouchlineSocialStudio.tsx", "utf8");
  assert.match(ui, /<video[^>]*\bcontrols\b/);
  assert.match(ui, /prefers-reduced-motion: reduce/);
  assert.match(ui, /onSeeking=/);
  assert.match(ui, /onRateChange=/);
  assert.match(ui, /onEnded=/);
  assert.match(ui, /advanceStudioPlayback/);
  assert.doesNotMatch(ui, /previousTime\.current > media\.durationSeconds \* 0\.7/);
  assert.match(ui, /visibilitychange/);
  assert.match(ui, /loops >= 2 && serverLoops >= 2/);
  assert.match(ui, /action: "invalidate"/);
  assert.match(ui, /recordServerReview\(reviewSession\.current \? "tick" : "start", true\)/);
  assert.match(ui, /function rewindReviewLoop\(video: HTMLVideoElement\) \{\s*internalLoopSeek\.current = true;\s*video\.currentTime = 0;/);
  assert.match(ui, /if \(internalLoopSeek\.current\) \{ internalLoopSeek\.current = false; return; \}/);
  assert.match(ui, /if \(video\.ended\) rewindReviewLoop\(video\)/);
  assert.equal(ui.match(/rewindReviewLoop\(video\)/g)?.length, 2, "manual and automatic second loops share the protected internal seek");
});
