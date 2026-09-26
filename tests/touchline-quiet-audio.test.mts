import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createQuietAudio, TOUCHLINE_ENTRY_AUDIO_GAIN } from "../lib/touchlineArena/quiet-audio.ts";

test("entry integration shares portrait lifecycle gate and replaces failed audio graph elements", () => {
  const source = readFileSync(new URL("../components/auth-ambient-audio.tsx", import.meta.url), "utf8");
  assert.match(source, /subscribeTouchlineArenaMediaAvailability/);
  assert.match(source, /if \(!readTouchlineArenaMediaAvailability\(\)\) suspend\(\)/);
  assert.match(source, /addEventListener\("freeze", suspend\)/);
  assert.match(source, /removeEventListener\("freeze", suspend\)/);
  assert.match(source, /<audio key=\{audioRevision\}/);
  assert.match(source, /setAudioRevision\(\(value\) => value \+ 1\)/);
  assert.doesNotMatch(source, /autoPlay/);
});

test("one root-owned entry player survives auth route changes without competing with Arena intro", () => {
  const source = readFileSync(new URL("../components/auth-ambient-audio.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const control = source.slice(source.indexOf("export function AuthAmbientAudio"));
  assert.doesNotMatch(control, /<audio|createQuietAudio/);
  assert.match(layout, /<TouchlineAmbientAudioProvider enabled=\{!isIsolatedPreview\}>\s*\{children\}/);
  assert.match(source, /touchlineAmbientAudioRoute\(pathname\)/);
  assert.match(source, /if \(!allowed \|\| introClaim.current\) \{ stop\(\); return; \}/);
  assert.doesNotMatch(source, /key=\{pathname\}/);
  assert.match(control, /if \(!ambient\?\.available\) return null/);
  assert.match(source, /enabled && route !== "silent"/);
  assert.match(source, /getAttribute\("src"\) === source && !audio.current.paused/);
  assert.match(source, /if \(element.getAttribute\("src"\) !== policy.current.source\)/);
  const navigation = readFileSync(new URL("../components/touchline/TouchlineGlobalNavigation.tsx", import.meta.url), "utf8");
  assert.match(navigation, /<AuthAmbientAudio locale=\{effectiveLocale\}/);
  assert.doesNotMatch(source, /position: "fixed"|MutationObserver/);
  assert.match(navigation, /const effectiveLocale = resolveTouchLinePresentationLocale\(locale\)/);
  assert.match(source, /if \(audio.current\?\.paused && state === "on"\) \{ wanted.current = false; setState\("off"\)/);
  assert.match(source, /onError=\{\(\) => \{ wanted.current = false; stop\(\); setState\("error"\)/);
});

function media(play = async () => {}) {
  return { muted: true, plays: 0, pauses: 0, async play() { this.plays++; await play(); }, pause() { this.pauses++; } };
}

test("a stalled playback or audio-context activation stops quietly after the deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const stalled of ["play", "resume"]) {
    const deferred = Promise.withResolvers<void>();
    const sound = media(() => stalled === "play" ? deferred.promise : Promise.resolve());
    const controller = createQuietAudio(sound, () => ({
      resume: () => stalled === "resume" ? deferred.promise : Promise.resolve(),
      close: async () => {},
    }));
    let result: boolean | undefined;
    const pending = controller.start().then(value => { result = value; });
    t.mock.timers.tick(15_000);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(result, false, `${stalled} must not stay in starting state`);
    await pending;
    assert.equal(sound.muted, true);
    assert.equal(sound.pauses, 1);
    deferred.resolve();
    controller.dispose();
  }
});

test("entry audio connects attenuation before playback and reuses one graph", async () => {
  let connections = 0;
  const sound = media(async () => { assert.equal(connections, 1); });
  const controller = createQuietAudio(sound, (gain) => {
    connections++; assert.equal(gain, 0.12); assert.equal(gain, TOUCHLINE_ENTRY_AUDIO_GAIN);
    return { resume: async () => {}, close: async () => {} };
  });
  assert.equal(sound.plays, 0);
  assert.equal(await controller.start(), true);
  controller.stop(); assert.equal(sound.muted, true);
  assert.equal(await controller.start(), true);
  assert.equal(connections, 1);
  controller.dispose(); assert.equal(await controller.start(), false);
});

test("an older activation deadline cannot mute newer successful playback", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const deferred = Promise.withResolvers<void>();
  let calls = 0;
  const sound = media(() => ++calls === 1 ? deferred.promise : Promise.resolve());
  const controller = createQuietAudio(sound, () => ({ resume: async () => {}, close: async () => {} }));
  const older = controller.start();
  assert.equal(await controller.start(), true);
  t.mock.timers.tick(15_000);
  assert.equal(await older, false);
  assert.equal(sound.muted, false);
  assert.equal(sound.pauses, 0);
  deferred.resolve();
  controller.dispose();
});

test("unsupported or denied attenuation never falls back to loud audio", async () => {
  const unsupported = media();
  assert.equal(await createQuietAudio(unsupported, () => { throw new Error("unavailable"); }).start(), false);
  assert.equal(unsupported.plays, 0); assert.equal(unsupported.muted, true);
  const denied = media();
  const controller = createQuietAudio(denied, () => ({ resume: async () => { throw new Error("blocked"); }, close: async () => {} }));
  assert.equal(await controller.start(), false); assert.equal(denied.muted, true); assert.equal(denied.pauses, 1);
});

test("stop or disposal invalidates pending playback without reviving sound", async () => {
  for (const dispose of [false, true]) {
    const deferred = Promise.withResolvers<void>();
    const sound = media(() => deferred.promise);
    const controller = createQuietAudio(sound, () => ({ resume: async () => {}, close: async () => {} }));
    const pending = controller.start();
    if (dispose) controller.dispose(); else controller.stop();
    deferred.resolve();
    assert.equal(await pending, false); assert.equal(sound.muted, true); assert.equal(sound.pauses, 1);
  }
});

test("an obsolete rejected play cannot stop a newer request", async () => {
  const deferred = Promise.withResolvers<void>(); let calls = 0;
  const sound = media(() => ++calls === 1 ? deferred.promise : Promise.resolve());
  const controller = createQuietAudio(sound, () => ({ resume: async () => {}, close: async () => {} }));
  const previous = controller.start();
  assert.equal(await controller.start(), true);
  deferred.reject(new Error("old request"));
  assert.equal(await previous, false); assert.equal(sound.muted, false); assert.equal(sound.pauses, 0);
});
