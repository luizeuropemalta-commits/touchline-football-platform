import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";

import {
  normalizeTouchLineAuthReturnTo,
  touchLineAuthHref,
  touchLinePostAuthHref,
} from "../lib/touchlineArena/auth-i18n.ts";
import {
  observeTouchlineArenaOnboardingPlayback,
  touchlineArenaOnboardingHref,
  touchlineRegistrationEntryHref,
} from "../lib/touchlineArena/arena-onboarding.ts";

const authFormSource = readFileSync(new URL("../components/auth-form.tsx", import.meta.url), "utf8");
const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

function registrationEntry(returnTo?: string, locale = "en-GB") {
  const statement = authFormSource.match(/const firstEntryHref = [\s\S]*?;/)?.[0];
  assert.ok(statement, "exercise the registration destination used by the real form");
  return new URL(runInNewContext(`${statement}\nfirstEntryHref`, {
    normalizedReturnTo: normalizeTouchLineAuthReturnTo(returnTo),
    normalizedLocale: locale,
    touchLineAuthHref,
    touchLinePostAuthHref,
    touchlineRegistrationEntryHref,
  }), "https://touchline.local");
}

test("new registration starts the complete official intro with an explicit onboarding marker", () => {
  const url = registrationEntry(undefined, "pt-BR");
  assert.equal(url.pathname, "/arena");
  assert.equal(url.searchParams.get("intro"), "first");
  assert.equal(url.searchParams.get("onboarding"), "market");
  assert.equal(url.searchParams.has("skipIntro"), false);
  assert.equal(url.searchParams.get("lang"), "pt-BR");
});

test("an ordinary registration return does not bypass the complete onboarding", () => {
  for (const returnTo of ["/my-club#squad", "/market-transfer?team=123", "/arena?skipIntro=1", "/inbox"]) {
    const url = registrationEntry(returnTo);
    assert.equal(url.pathname, "/arena", returnTo);
    assert.equal(url.searchParams.get("intro"), "first", returnTo);
    assert.equal(url.searchParams.get("onboarding"), "market", returnTo);
    assert.equal(url.searchParams.has("skipIntro"), false, returnTo);
    assert.equal(url.hash, "", returnTo);
  }
});

test("reserved administrative and QA returns retain their existing destinations", () => {
  for (const returnTo of ["/admin?tab=owners#accounts", "/visual-qa/cards?club=123"]) {
    const url = registrationEntry(returnTo);
    assert.equal(`${url.pathname}${url.search}${url.hash}`, touchLinePostAuthHref(returnTo, "en-GB"));
  }
});

test("Arena explicitly observes loop playback before the onboarding handoff", () => {
  assert.ok(arenaSource.includes("observeTouchlineArenaOnboardingPlayback("));
});

test("only an exact onboarding marker yields a local My Club destination without a hash", () => {
  for (const search of ["", "?intro=first", "?skipIntro=1", "?onboarding=", "?onboarding=MARKET", "?onboarding=other", "?returnTo=/my-club"]) {
    assert.equal(touchlineArenaOnboardingHref(search, "pt-BR"), null, search);
  }
  assert.equal(touchlineArenaOnboardingHref("?intro=first&onboarding=market", "pt-BR"), "/my-club?lang=pt-BR");
  assert.equal(touchlineArenaOnboardingHref("?skipIntro=1&onboarding=market&next=https://example.com#squad", "en-GB"), "/my-club?lang=en-GB");
});

test("registration normalization cannot introduce an external redirect or an administrative prefix lookalike", () => {
  for (const returnTo of ["https://example.com", "//example.com/admin", "/admin-other", "/visual-qa-other"]) {
    assert.equal(touchlineRegistrationEntryHref(returnTo, "en-GB"), "/arena?intro=first&onboarding=market&lang=en-GB");
  }
});

class FakeVideo extends EventTarget {
  currentTime = 0;
  paused = false;
  ended = false;
  seeking = false;
  readyState = 4;
  playbackRate = 1;
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (listener) this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
}

function playbackHarness() {
  const video = new FakeVideo();
  const frames = new Map<number, FrameRequestCallback>();
  const availabilityListeners = new Set<() => void>();
  let nextRequest = 0;
  let wallTime = 0;
  let allowed = true;
  let completions = 0;
  const options = {
    video,
    isAllowed: () => allowed,
    subscribeAvailability: (notify: () => void) => {
      availabilityListeners.add(notify);
      return () => { availabilityListeners.delete(notify); };
    },
    requestFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextRequest, callback);
      return nextRequest;
    },
    cancelFrame: (request: number) => { frames.delete(request); },
    onComplete: () => { completions += 1; },
  };
  return {
    video, frames, options, availabilityListeners,
    completions: () => completions,
    allow(value: boolean) {
      allowed = value;
      for (const notify of availabilityListeners) notify();
    },
    sample(milliseconds: number, mediaSeconds = milliseconds / 1_000 * video.playbackRate) {
      wallTime += milliseconds;
      video.currentTime += mediaSeconds;
      const pending = frames.entries().next().value;
      if (!pending) return;
      const [request, callback] = pending;
      frames.delete(request);
      callback(wallTime);
    },
  };
}

function assertObserverReleased(harness: ReturnType<typeof playbackHarness>) {
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.availabilityListeners.size, 0);
  assert.ok([...harness.video.listeners.values()].every((listeners) => listeners.size === 0));
}

test("handoff requires three seconds of actual loop progress and completes exactly once", () => {
  const harness = playbackHarness();
  const cleanup = observeTouchlineArenaOnboardingPlayback(harness.options);
  harness.sample(0);
  harness.sample(2_750);
  assert.equal(harness.completions(), 0);
  const lateFrame = [...harness.frames.values()][0];
  harness.sample(250);
  assert.equal(harness.completions(), 1);
  assertObserverReleased(harness);
  lateFrame(15_000);
  cleanup();
  assert.equal(harness.completions(), 1);
  assertObserverReleased(harness);
});

test("wall time while stalled cannot satisfy playback", () => {
  const harness = playbackHarness();
  observeTouchlineArenaOnboardingPlayback(harness.options);
  harness.sample(0);
  harness.sample(60_000, 0);
  assert.equal(harness.completions(), 0);
  harness.sample(2_750);
  assert.equal(harness.completions(), 0);
  harness.sample(250);
  assert.equal(harness.completions(), 1);
});

for (const state of ["paused", "seeking", "ended", "buffering"] as const) {
  test(`${state} media cannot advance the onboarding clock`, () => {
    const harness = playbackHarness();
    const cleanup = observeTouchlineArenaOnboardingPlayback(harness.options);
    harness.sample(0);
    if (state === "buffering") harness.video.readyState = 1;
    else harness.video[state] = true;
    harness.sample(12_000);
    assert.equal(harness.completions(), 0);
    cleanup();
    assertObserverReleased(harness);
  });
}

for (const interruption of ["hidden document", "portrait gate", "unowned media", "unmounted media"]) {
  test(`${interruption} excludes its entire interval and preserves earlier valid playback`, () => {
    const harness = playbackHarness();
    observeTouchlineArenaOnboardingPlayback(harness.options);
    harness.sample(0);
    harness.sample(2_000);
    harness.allow(false);
    // Includes a suspended animation-frame interval with no intermediate sample.
    harness.allow(true);
    harness.sample(60_000, 60);
    assert.equal(harness.completions(), 0);
    harness.sample(750);
    assert.equal(harness.completions(), 0);
    harness.sample(250);
    assert.equal(harness.completions(), 1);
  });
}

test("pausing and resuming retains only the already-played portion", () => {
  const harness = playbackHarness();
  observeTouchlineArenaOnboardingPlayback(harness.options);
  harness.sample(0);
  harness.sample(2_000);
  harness.video.paused = true;
  harness.video.dispatchEvent(new Event("pause"));
  harness.sample(60_000, 0);
  harness.video.paused = false;
  harness.video.dispatchEvent(new Event("playing"));
  harness.sample(0);
  harness.sample(750);
  assert.equal(harness.completions(), 0);
  harness.sample(250);
  assert.equal(harness.completions(), 1);
});

test("seeks and loop wrap do not count as playback", () => {
  const harness = playbackHarness();
  observeTouchlineArenaOnboardingPlayback(harness.options);
  harness.sample(0);
  harness.sample(1_000);
  harness.video.dispatchEvent(new Event("seeking"));
  harness.video.currentTime = 200;
  harness.video.dispatchEvent(new Event("seeked"));
  harness.sample(10_000, 0);
  assert.equal(harness.completions(), 0);
  harness.sample(1_000);
  harness.video.currentTime = 0;
  harness.sample(0);
  harness.sample(750);
  assert.equal(harness.completions(), 0);
  harness.sample(250);
  assert.equal(harness.completions(), 1);
});

test("accelerated playback still requires three real seconds", () => {
  const harness = playbackHarness();
  harness.video.playbackRate = 2;
  observeTouchlineArenaOnboardingPlayback(harness.options);
  harness.sample(0);
  harness.sample(1_500);
  assert.equal(harness.video.currentTime, 3);
  assert.equal(harness.completions(), 0);
  harness.sample(1_500);
  assert.equal(harness.completions(), 1);
});

test("cleanup cancels pending animation, media listeners and availability subscriptions", () => {
  const harness = playbackHarness();
  const cleanup = observeTouchlineArenaOnboardingPlayback(harness.options);
  harness.sample(0);
  harness.sample(2_750);
  const lateFrame = [...harness.frames.values()][0];
  cleanup();
  harness.video.currentTime = 99;
  lateFrame(99_000);
  harness.allow(false);
  cleanup();
  assert.equal(harness.completions(), 0);
  assertObserverReleased(harness);
});

const onboardingEffect = arenaSource.match(/useEffect\(\(\) => \{\n    \/\/ Registration onboarding[\s\S]*?\n  \}, \[[\s\S]*?\n  \]\);/)?.[0];

function realArenaEffect(overrides: Record<string, unknown> = {}) {
  assert.ok(onboardingEffect, "execute the real effect, not a duplicate of the component logic");
  const harness = playbackHarness();
  const navigations: Array<{ href: string; scroll: boolean }> = [];
  const timers = new Map<number, () => void>();
  let cleanup: (() => void) | undefined;
  let welcomeVisible = false;
  let mounted = true;
  let ownsMedia = true;
  const location = { search: "?intro=first&onboarding=market" };
  const completedRef = { current: false };
  runInNewContext(stripTypeScriptTypes(onboardingEffect), {
    useEffect: (effect: () => (() => void) | undefined) => { cleanup = effect(); },
    standaloneExperience: null,
    isQaReadOnly: false,
    introExperienceMode: "hidden",
    hasEntryVideoFinished: true,
    arenaPersistencePrincipal: { kind: "authenticated" },
    onboardingHandoffCompletedRef: completedRef,
    secondVideoRef: { current: harness.video },
    siteLanguage: "pt-BR",
    window: {
      location,
      requestAnimationFrame: harness.options.requestFrame,
      cancelAnimationFrame: harness.options.cancelFrame,
      setTimeout: (callback: () => void) => { timers.set(1, callback); return 1; },
      clearTimeout: (request: number) => { timers.delete(request); },
    },
    setIsMarketOnboardingWelcomeVisible: (value: boolean) => { welcomeVisible = value; },
    arenaMediaMountedRef: { get current() { return mounted; } },
    arenaMediaSession: { owns: () => ownsMedia },
    readTouchlineArenaMediaAvailability: harness.options.isAllowed,
    subscribeTouchlineArenaMediaAvailability: harness.options.subscribeAvailability,
    observeTouchlineArenaOnboardingPlayback,
    touchlineArenaOnboardingHref,
    router: { replace: (href: string, options: { scroll: boolean }) => { navigations.push({ href, scroll: options.scroll }); } },
    ...overrides,
  });
  return {
    harness, navigations, timers, location, completedRef,
    cleanup: () => cleanup?.(),
    welcomeVisible: () => welcomeVisible,
    setMounted: (value: boolean) => { mounted = value; },
    setOwned: (value: boolean) => { ownsMedia = value; },
  };
}

test("the real Arena effect redirects the marked, completed intro to My Club at the top after playback", () => {
  const effect = realArenaEffect();
  for (const callback of effect.timers.values()) callback();
  assert.equal(effect.welcomeVisible(), true);
  assert.equal(effect.navigations.length, 0, "the welcome timer must not navigate");
  effect.harness.sample(0);
  effect.harness.sample(2_750);
  assert.equal(effect.navigations.length, 0);
  effect.harness.sample(250);
  assert.deepEqual(effect.navigations, [{ href: "/my-club?lang=pt-BR", scroll: true }]);
  assert.equal(effect.completedRef.current, true);
  effect.cleanup();
  assert.equal(effect.timers.size, 0);
  assertObserverReleased(effect.harness);
});

test("the real effect cannot redirect during intro, entry video, anonymous/demo/QA or standalone visits", () => {
  for (const overrides of [
    { introExperienceMode: "first" },
    { introExperienceMode: "pending" },
    { hasEntryVideoFinished: false },
    { arenaPersistencePrincipal: null },
    { arenaPersistencePrincipal: { kind: "anonymous" } },
    { arenaPersistencePrincipal: { kind: "demo" } },
    { isQaReadOnly: true },
    { standaloneExperience: "market" },
    { onboardingHandoffCompletedRef: { current: true } },
    { secondVideoRef: { current: null } },
  ]) {
    const effect = realArenaEffect(overrides);
    effect.harness.sample(30_000);
    assert.deepEqual(effect.navigations, [], JSON.stringify(overrides));
    assert.equal(effect.timers.size, 0);
    assertObserverReleased(effect.harness);
  }
});

test("normal Arena returns never schedule an automatic handoff, even after intro or explicit skip", () => {
  for (const search of ["", "?intro=first", "?skipIntro=1", "?onboarding=other"]) {
    const effect = realArenaEffect({ window: { location: { search } } });
    effect.harness.sample(30_000);
    assert.deepEqual(effect.navigations, []);
    assertObserverReleased(effect.harness);
  }
});

test("the existing explicit intro skip starts the loop and still requires its three seconds", () => {
  const skip = arenaSource.match(/function skipOfficialIntroExperience\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(skip);
  const calls: string[] = [];
  runInNewContext(`${skip}\nskipOfficialIntroExperience();`, {
    completeOfficialIntroExperience: () => { calls.push("complete"); },
    startCardLoopVideo: () => { calls.push("loop"); },
  });
  assert.deepEqual(calls, ["complete", "loop"]);
  const effect = realArenaEffect();
  effect.location.search = "?onboarding=market&skipIntro=1";
  effect.harness.sample(0);
  effect.harness.sample(2_750);
  assert.equal(effect.navigations.length, 0);
  effect.harness.sample(250);
  assert.equal(effect.navigations.length, 1);
});

test("the real effect honors hidden/portrait, media ownership and unmount boundaries", () => {
  for (const interruption of ["hidden", "portrait", "ownership", "unmount"]) {
    const effect = realArenaEffect();
    effect.harness.sample(0);
    effect.harness.sample(2_000);
    if (interruption === "ownership") effect.setOwned(false);
    else if (interruption === "unmount") effect.setMounted(false);
    else effect.harness.allow(false);
    effect.harness.sample(60_000);
    assert.equal(effect.navigations.length, 0, interruption);
    effect.cleanup();
    assertObserverReleased(effect.harness);
  }
});

test("removing the onboarding marker or unmounting prevents a pending handoff", () => {
  const removed = realArenaEffect();
  removed.harness.sample(0);
  removed.location.search = "?lang=pt-BR";
  removed.harness.sample(3_000);
  assert.equal(removed.navigations.length, 0);
  removed.cleanup();

  const unmounted = realArenaEffect();
  unmounted.harness.sample(0);
  unmounted.harness.sample(2_750);
  const lateFrame = [...unmounted.harness.frames.values()][0];
  unmounted.cleanup();
  unmounted.harness.video.currentTime = 99;
  lateFrame(99_000);
  assert.equal(unmounted.navigations.length, 0);
  assert.equal(unmounted.timers.size, 0);
  assertObserverReleased(unmounted.harness);
});

test("login, signup confirmation/OAuth and recovery keep their distinct existing continuations", () => {
  assert.match(authFormSource, /const arenaHref = touchLinePostAuthHref\(normalizedReturnTo, normalizedLocale\)/);
  assert.match(authFormSource, /name="return_to" value=\{arenaHref\}/);
  assert.match(authFormSource, /emailRedirectTo: buildTouchLineAuthCallbackUrl\(firstEntryHref\)/);
  assert.match(authFormSource, /mode === "register" \? firstEntryHref : arenaHref/);
  assert.match(authFormSource, /const resetPasswordHref = touchLineAuthHref\("\/reset-password", normalizedLocale\)/);
  assert.match(authFormSource, /resetPasswordForEmail\([\s\S]*buildTouchLineAuthCallbackUrl\(resetPasswordHref\)/);
});
