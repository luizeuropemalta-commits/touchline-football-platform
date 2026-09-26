import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTouchlineArenaMediaSession, playTouchlineArenaMedia, readTouchlineArenaMediaAvailability, subscribeTouchlineArenaMediaAvailability } from "../lib/touchlineArena/arena-media-playback.ts";

const arena = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

test("Arena sound is opt-in, scoped to official media and reachable from the intro", () => {
  assert.match(arena, /const \[isArenaAudioMuted, setIsArenaAudioMuted\] = useState\(true\)/);
  assert.equal((arena.match(/muted=\{isArenaAudioMuted\}/g) ?? []).length, 1);
  assert.match(arena, /muted=\{true\}\s+playsInline\s+loop/);
  assert.match(arena, /muted: video === secondVideoRef.current \|\| arenaAudioMutedRef.current/);
  assert.match(arena, /ambientAudio\?\.toggle\(\)/);
  assert.match(arena, /const isAmbientArena = activeVideoIndex === 1 && introExperienceMode === "hidden"/);
  assert.match(arena, /const introOwnsAudio = introExperienceMode !== "pending" && !isAmbientArena/);
  assert.match(arena, /onToggleAudio=\{toggleArenaAudio\}/);
  assert.match(arena, /aria-label=\{arenaAudioLabel\}/);
  assert.doesNotMatch(arena, /const isArenaIntroViewportReady = true/);
});

function media(play: () => Promise<void> = async () => {}) {
  return { muted: true, plays: 0, pauses: 0,
    async play() { this.plays++; await play(); },
    pause() { this.pauses++; },
  };
}

test("audible playback starts only when permitted and an explicit mute value is supplied", async () => {
  const video = media();
  const played = await playTouchlineArenaMedia(video, { muted: false, isAllowed: () => true, onMutedFallback: () => assert.fail("unneeded fallback") });
  assert.equal(played, true);
  assert.equal(video.muted, false);
  assert.equal(video.plays, 1);
});

test("hidden or portrait Arena never starts media", async () => {
  const video = media();
  assert.equal(await playTouchlineArenaMedia(video, { muted: false, isAllowed: () => false, onMutedFallback() {} }), false);
  assert.equal(video.plays, 0);
  assert.equal(video.pauses, 1);
});

test("browser denial falls back to muted autoplay once and reports its real state", async () => {
  let attempts = 0;
  let fallbacks = 0;
  const video = media(async () => {
    if (++attempts === 1) throw Object.assign(new Error("gesture required"), { name: "NotAllowedError" });
  });
  assert.equal(await playTouchlineArenaMedia(video, { muted: false, isAllowed: () => true, onMutedFallback() { fallbacks++; } }), true);
  assert.equal(video.muted, true);
  assert.equal(video.plays, 2);
  assert.equal(fallbacks, 1);
});

test("failed media does not retry indefinitely or claim playback", async () => {
  const video = media(async () => { throw new Error("decode failed"); });
  assert.equal(await playTouchlineArenaMedia(video, { muted: false, isAllowed: () => true, onMutedFallback: () => assert.fail("not an autoplay error") }), false);
  assert.equal(video.plays, 1);
  assert.equal(video.pauses, 1);
});

test("a pending play is stopped if the Arena hides, rotates or unmounts", async () => {
  let allowed = true;
  const video = media(async () => { allowed = false; });
  assert.equal(await playTouchlineArenaMedia(video, { muted: false, isAllowed: () => allowed, onMutedFallback() {} }), false);
  assert.equal(video.pauses, 1);
});

test("a denied muted fallback terminates without another retry", async () => {
  const video = media(async () => { throw Object.assign(new Error("blocked"), { name: "NotAllowedError" }); });
  assert.equal(await playTouchlineArenaMedia(video, { muted: false, isAllowed: () => true, onMutedFallback() {} }), false);
  assert.equal(video.plays, 2);
  assert.equal(video.pauses, 1);
});

test("visibility and orientation subscriptions share the same gate and are cleaned up", () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const portrait = new EventTarget();
  const documentEvents = new EventTarget();
  Object.assign(portrait, { matches: false });
  Object.assign(documentEvents, { visibilityState: "visible" });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => portrait } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentEvents });
  try {
    let notifications = 0;
    const unsubscribe = subscribeTouchlineArenaMediaAvailability(() => { notifications++; });
    assert.equal(readTouchlineArenaMediaAvailability(), true);
    Object.assign(portrait, { matches: true });
    portrait.dispatchEvent(new Event("change"));
    assert.equal(readTouchlineArenaMediaAvailability(), false);
    Object.assign(portrait, { matches: false });
    Object.assign(documentEvents, { visibilityState: "hidden" });
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    assert.equal(readTouchlineArenaMediaAvailability(), false);
    assert.equal(notifications, 2);
    unsubscribe();
    portrait.dispatchEvent(new Event("change"));
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    assert.equal(notifications, 2);
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

const playbackOptions = { muted: false, isAllowed: () => true, onMutedFallback() {} };

test("skip or manual pause invalidates pending playback without updating the new session", async () => {
  for (const skipToLoop of [false, true]) {
    const session = createTouchlineArenaMediaSession();
    const deferred = Promise.withResolvers<void>();
    const entry = media(() => deferred.promise);
    const pending = session.play(entry, playbackOptions);
    session.stop();
    const loop = media();
    if (skipToLoop) assert.equal(await session.play(loop, playbackOptions), true);
    deferred.resolve();
    assert.equal(await pending, null);
    assert.equal(session.owns(entry), false);
    assert.equal(session.owns(loop), skipToLoop);
    assert.ok(entry.pauses > 0);
    assert.equal(loop.pauses, 0);
  }
});

test("an older promise cannot pause a newer request for the same video", async () => {
  const session = createTouchlineArenaMediaSession();
  const deferred = Promise.withResolvers<void>();
  const video = media(() => deferred.promise);
  const older = session.play(video, playbackOptions);
  const newer = session.play(video, playbackOptions);
  deferred.resolve();
  assert.equal(await older, null);
  assert.equal(await newer, true);
  assert.equal(video.pauses, 0);
});

test("replay cancels the prior loop reveal and page lifecycle owns a media stop", () => {
  const replay = arena.slice(arena.indexOf("function replayEntryVideo()"), arena.indexOf("async function selectOfficialArenaCoach"));
  assert.match(replay, /arenaMediaSession\.stop\(\)/);
  assert.match(replay, /window\.clearTimeout\(loopRevealTimerRef\.current\)/);
  assert.match(replay, /loopRevealTimerRef\.current = null/);
  for (const event of ["pagehide", "freeze"]) {
    assert.ok(arena.includes(`addEventListener("${event}", stopMedia)`));
    assert.ok(arena.includes(`removeEventListener("${event}", stopMedia)`));
  }
  assert.match(arena, /reducedMotion\.addEventListener\("change", handleReducedMotion\)/);
  assert.match(arena, /reducedMotion\.removeEventListener\("change", handleReducedMotion\)/);
});
