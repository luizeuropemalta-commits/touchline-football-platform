import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveTouchlineArenaIntroLaunchMode } from "../lib/touchlineArena/arena-intro.ts";
const source = readFileSync(new URL("../components/touchline/arena/TouchlineGameEntry.tsx", import.meta.url), "utf8");
test("entry uses unchanged resolver for first, return and explicit skip", () => {
  assert.equal(resolveTouchlineArenaIntroLaunchMode({intent:null,hasCompletedIntro:false}), "first");
  assert.equal(resolveTouchlineArenaIntroLaunchMode({intent:null,hasCompletedIntro:true}), "skip");
  assert.equal(resolveTouchlineArenaIntroLaunchMode({intent:"first",hasCompletedIntro:true}), "first");
  assert.equal(resolveTouchlineArenaIntroLaunchMode({intent:"skip",hasCompletedIntro:false}), "skip");
  assert.match(source, /if \(launch === "skip"\) finish\(\)/);
});
test("entry has only official nonlooping media and market completion", () => {
  assert.doesNotMatch(source, /ArenaClient|LOOP_VIDEO|\bloop[ =]/);
  assert.equal((source.match(/<video /g) ?? []).length, 1);
  assert.match(source, /src=\{TOUCHLINE_ARENA_ENTRY_VIDEO\}/);
  assert.match(source, /router.replace\(`\/clubowner\?lang=/);
  assert.match(source, /onEnded=\{finish\} onError=\{finish\}/);
  assert.match(source, /if \(reduce\) finish\(\)/);
  assert.match(source, /if \(finished.current\) return/);
});
test("media uses availability subscription, owned session and cleanup", () => {
  assert.match(source, /useSyncExternalStore\(subscribeTouchlineArenaMediaAvailability/);
  assert.match(source, /return \(\) => \{ cancelled = true; mediaSession.stop\(\); \}/);
  assert.match(source, /writeBrowserStorage\("localStorage", TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "1"\)/);
  assert.match(source, /<TouchlineArenaIntro/);
});
