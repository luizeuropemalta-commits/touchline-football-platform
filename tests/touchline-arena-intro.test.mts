import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_ARENA_ENTRY_VIDEO,
  TOUCHLINE_ARENA_FIRST_INTRO_VALUE,
  TOUCHLINE_ARENA_INTRO_QUERY_PARAM,
  TOUCHLINE_ARENA_INTRO_REDUCED_MOTION_TIMELINE,
  TOUCHLINE_ARENA_INTRO_SLOGAN,
  TOUCHLINE_ARENA_INTRO_STORAGE_KEY,
  TOUCHLINE_ARENA_INTRO_TIMELINE,
  TOUCHLINE_ARENA_INTRO_VERSION,
  TOUCHLINE_ARENA_LOOP_VIDEO,
  TOUCHLINE_ARENA_OFFICIAL_LOGO,
  TOUCHLINE_ARENA_SKIP_INTRO_QUERY_PARAM,
  TOUCHLINE_ARENA_VIDEO_POSTER,
  parseTouchlineArenaIntroIntent,
  resolveTouchlineArenaIntroLaunchMode,
  touchlineArenaFirstEntryHref,
  touchlineArenaIntroTimeline,
  type TouchlineArenaIntroTimeline,
} from "../lib/touchlineArena/arena-intro.ts";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function publicAssetExists(assetUrl: string) {
  const pathname = assetUrl.split("?", 1)[0];
  return existsSync(new URL(`../public${pathname}`, import.meta.url));
}

function assertOrderedTimeline(timeline: TouchlineArenaIntroTimeline) {
  assert.ok(timeline.outlineAt >= 0);
  assert.ok(timeline.outlineAt < timeline.energyAt);
  assert.ok(timeline.energyAt < timeline.sloganAt);
  assert.ok(timeline.sloganAt < timeline.stadiumAt);
  assert.ok(timeline.stadiumAt < timeline.revealAt);
  assert.ok(timeline.revealAt < timeline.completeAt);
}

test("official Arena intro keeps the current TouchLine identity and existing media assets", () => {
  const globalLoading = source("app/loading.tsx");

  assert.equal(TOUCHLINE_ARENA_OFFICIAL_LOGO, "/touchlineArena/brand/tl-shield-lime.svg");
  assert.equal(TOUCHLINE_ARENA_ENTRY_VIDEO, "/touchlineArena/arena/touchline-arena-entry-20260716.mp4");
  assert.equal(
    TOUCHLINE_ARENA_LOOP_VIDEO,
    "/touchlineArena/arena/touchline-arena-loop-20260716.mp4?v=202607170155",
  );
  assert.equal(TOUCHLINE_ARENA_VIDEO_POSTER, "/touchlineArena/arena/touchline-arena-poster-20260722.jpg");
  assert.equal(TOUCHLINE_ARENA_INTRO_SLOGAN, "THIS IS NOT A FANTASY.\nTHIS IS REALITY.");

  for (const asset of [
    TOUCHLINE_ARENA_OFFICIAL_LOGO,
    TOUCHLINE_ARENA_ENTRY_VIDEO,
    TOUCHLINE_ARENA_LOOP_VIDEO,
    TOUCHLINE_ARENA_VIDEO_POSTER,
  ]) {
    assert.equal(publicAssetExists(asset), true, asset);
  }

  assert.match(globalLoading, /import \{ TOUCHLINE_ARENA_OFFICIAL_LOGO \} from "@\/lib\/touchlineArena\/arena-intro"/);
  assert.match(globalLoading, /<Image[\s\S]*?src=\{TOUCHLINE_ARENA_OFFICIAL_LOGO\}/);
});

test("intro intent gives first registration priority and accepts only the explicit skip contract", () => {
  assert.equal(parseTouchlineArenaIntroIntent({ intro: "first", skipIntro: null }), "first");
  assert.equal(parseTouchlineArenaIntroIntent({ intro: null, skipIntro: "1" }), "skip");
  assert.equal(parseTouchlineArenaIntroIntent({ intro: "first", skipIntro: "1" }), "first");
  assert.equal(parseTouchlineArenaIntroIntent({ intro: "FIRST", skipIntro: "true" }), null);
  assert.equal(parseTouchlineArenaIntroIntent({}), null);

  assert.equal(TOUCHLINE_ARENA_INTRO_QUERY_PARAM, "intro");
  assert.equal(TOUCHLINE_ARENA_SKIP_INTRO_QUERY_PARAM, "skipIntro");
  assert.equal(TOUCHLINE_ARENA_FIRST_INTRO_VALUE, "first");
});

test("first-entry, returning-entry and explicit-skip launches resolve deterministically", () => {
  assert.equal(resolveTouchlineArenaIntroLaunchMode({ intent: "first", hasCompletedIntro: false }), "first");
  assert.equal(resolveTouchlineArenaIntroLaunchMode({ intent: "first", hasCompletedIntro: true }), "first");
  assert.equal(resolveTouchlineArenaIntroLaunchMode({ intent: "skip", hasCompletedIntro: false }), "skip");
  assert.equal(resolveTouchlineArenaIntroLaunchMode({ intent: "skip", hasCompletedIntro: true }), "skip");
  assert.equal(resolveTouchlineArenaIntroLaunchMode({ intent: null, hasCompletedIntro: false }), "first");
  assert.equal(resolveTouchlineArenaIntroLaunchMode({ intent: null, hasCompletedIntro: true }), "skip");

  assert.equal(TOUCHLINE_ARENA_INTRO_VERSION, 1);
  assert.equal(TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "touchline:arena:intro:v1:complete");
});

test("first-entry links preserve locale and cannot accidentally inject a skip parameter", () => {
  assert.equal(touchlineArenaFirstEntryHref("pt-BR"), "/arena?lang=pt-BR&intro=first");
  assert.equal(touchlineArenaFirstEntryHref("en-GB"), "/arena?lang=en-GB&intro=first");

  const hostileLocale = new URL(touchlineArenaFirstEntryHref("pt-BR&skipIntro=1"), "https://touchline.example");
  assert.equal(hostileLocale.searchParams.get("lang"), "pt-BR&skipIntro=1");
  assert.equal(hostileLocale.searchParams.get("intro"), "first");
  assert.equal(hostileLocale.searchParams.get("skipIntro"), null);
});

test("normal and reduced-motion timelines preserve logo, slogan and reveal order", () => {
  assertOrderedTimeline(TOUCHLINE_ARENA_INTRO_TIMELINE);
  assertOrderedTimeline(TOUCHLINE_ARENA_INTRO_REDUCED_MOTION_TIMELINE);
  assert.deepEqual(touchlineArenaIntroTimeline(false), TOUCHLINE_ARENA_INTRO_TIMELINE);
  assert.deepEqual(touchlineArenaIntroTimeline(true), TOUCHLINE_ARENA_INTRO_REDUCED_MOTION_TIMELINE);

  assert.equal(TOUCHLINE_ARENA_INTRO_TIMELINE.outlineAt, 700);
  assert.equal(TOUCHLINE_ARENA_INTRO_TIMELINE.energyAt, 1500);
  assert.equal(TOUCHLINE_ARENA_INTRO_TIMELINE.sloganAt, 5000);
  assert.equal(TOUCHLINE_ARENA_INTRO_TIMELINE.stadiumAt, 9300);
  assert.equal(TOUCHLINE_ARENA_INTRO_TIMELINE.revealAt, 10500);
  assert.ok(TOUCHLINE_ARENA_INTRO_TIMELINE.stadiumAt - TOUCHLINE_ARENA_INTRO_TIMELINE.sloganAt >= 3_500);

  for (const phase of ["outlineAt", "energyAt", "sloganAt", "stadiumAt", "revealAt", "completeAt"] as const) {
    assert.ok(
      TOUCHLINE_ARENA_INTRO_REDUCED_MOTION_TIMELINE[phase] < TOUCHLINE_ARENA_INTRO_TIMELINE[phase],
      phase,
    );
  }
  assert.ok(TOUCHLINE_ARENA_INTRO_REDUCED_MOTION_TIMELINE.completeAt <= 1_000);
});

test("the shared intro component implements an explicit first-entry sequence, skip and timer cleanup", () => {
  const component = source("components/touchline/arena/TouchlineArenaIntro.tsx");

  assert.match(component, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(component, /media\.addEventListener\("change", syncPreference\)/);
  assert.match(component, /media\.removeEventListener\("change", syncPreference\)/);
  assert.match(component, /if \(mode === "pending"\) return/);
  assert.match(component, /const displayPhase: IntroDisplayPhase = mode === "pending" \? "pending" : phase/);
  assert.match(component, /data-phase=\{displayPhase\}/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.doesNotMatch(component, /setPhase\("choice"\)/);
  assert.match(component, /setPhase\("suspense"\)/);
  assert.match(component, /setPhase\("outline"\)/);
  assert.match(component, /setPhase\("energy"\)/);
  assert.match(component, /setPhase\("slogan"\)/);
  assert.match(component, /setPhase\("stadium"\)/);
  assert.match(component, /setPhase\("reveal"\)/);
  assert.match(component, /revealRef\.current\(reducedMotion\)/);
  assert.match(component, /return \(\) => timers\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/);
  assert.match(component, /mode === "hidden" \|\| mode === "skip"/);
  assert.match(component, /Pular intro/);
  assert.match(component, /Skip intro/);
  assert.match(component, /onClick=\{\(\) => skipRef\.current\(\)\}/);
  assert.match(component, /import Image from "next\/image"/);
  assert.match(component, /<Image[\s\S]*?src=\{TOUCHLINE_ARENA_OFFICIAL_LOGO\}/);
  assert.match(component, /TOUCHLINE_ARENA_OFFICIAL_LOGO/);
  assert.match(component, /TOUCHLINE_ARENA_INTRO_SLOGAN/);
  assert.match(component, /TOUCHLINE_ARENA_VIDEO_POSTER/);
  assert.match(component, /THIS IS NOT A FANTASY\./);
  assert.match(component, /THIS IS REALITY\./);

  const outline = component.indexOf('setPhase("outline")');
  const energy = component.indexOf('setPhase("energy")');
  const slogan = component.indexOf('setPhase("slogan")');
  const stadium = component.indexOf('setPhase("stadium")');
  const reveal = component.indexOf('setPhase("reveal")');
  const complete = component.indexOf("completeRef.current()");
  assert.ok(outline < energy && energy < slogan && slogan < stadium && stadium < reveal && reveal < complete);
});

test("intro presentation protects safe areas, landscape controls and reduced-motion users", () => {
  const styles = source("components/touchline/arena/touchline-arena-intro.module.css");

  assert.match(styles, /env\(safe-area-inset-top\)/);
  assert.match(styles, /env\(safe-area-inset-right\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /env\(safe-area-inset-left\)/);
  assert.match(styles, /\.root:focus \{[\s\S]*?outline: none/);
  assert.match(styles, /@media \(max-width: 980px\) and \(orientation: landscape\)/);
  assert.match(styles, /@media \(max-height: 430px\) and \(orientation: landscape\)/);
  assert.match(styles, /\.logoStage \{[\s\S]*?width: clamp\(/);
  assert.match(styles, /\.slogan \{[\s\S]*?font-size: clamp\(/);
  assert.match(styles, /\.root\[data-phase="stadium"\] \.arenaPreview \{[\s\S]*?opacity: 0/);
  assert.match(styles, /\.root\[data-phase="reveal"\] \.arenaPreview \{[\s\S]*?opacity: 0/);
  assert.match(styles, /\.logoHalo \{[\s\S]*?display: none/);
  assert.match(styles, /\.root\[data-phase="energy"\] \.logoHalo,[\s\S]*?\.root\[data-phase="choice"\] \.logoHalo \{[\s\S]*?opacity: 0/);
  assert.match(styles, /\.root\[data-phase="stadium"\] \.slogan/);
  assert.match(styles, /\.slogan strong \{[\s\S]*?color: var\(--intro-lime\)/);
  assert.match(styles, /\.logoSweep \{[\s\S]*?mask: url\("\/touchlineArena\/brand\/tl-shield-lime\.svg"\) center \/ contain no-repeat/);
  assert.match(styles, /\.logoSweep \{[\s\S]*?-webkit-mask: url\("\/touchlineArena\/brand\/tl-shield-lime\.svg"\) center \/ contain no-repeat/);
  assert.match(styles, /\.logoSweep \{[\s\S]*?clip-path: none/);
  assert.match(styles, /animation: logoSweep 2600ms/);
  assert.match(styles, /@keyframes logoInnerIgnition/);
  assert.match(styles, /\.root\[data-phase="energy"\] \.logo \{[\s\S]*?animation: logoInnerIgnition 2600ms/);
  assert.match(styles, /\.sequenceSkip \{[\s\S]*?min-height: 46px/);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*?min-height: 44px/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation: none !important/);
  assert.match(styles, /transition-duration: 1ms !important/);
  assert.match(styles, /\.scan,[\s\S]*?\.logoSweep \{[\s\S]*?display: none/);
});

test("registration background uses one uninterrupted official intro and preserves the top logo", () => {
  const media = source("components/auth-cinematic-media.tsx");
  const layout = source("components/auth-layout.tsx");
  const globalStyles = source("app/globals.css");
  const normalMediaStart = media.indexOf('{motionPreference === "normal" ? (');
  const normalMediaEnd = media.indexOf(") : null}", normalMediaStart);
  const normalMedia = media.slice(normalMediaStart, normalMediaEnd);
  const entryVideo = media.slice(media.indexOf("<video"), media.indexOf("/>", media.indexOf("<video")) + 2);

  assert.ok(normalMediaStart >= 0 && normalMediaEnd > normalMediaStart);
  assert.match(media, /useState<"pending" \| "normal" \| "reduce">\("pending"\)/);
  assert.match(media, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(media, /media\.addEventListener\("change", syncPreference\)/);
  assert.match(media, /media\.removeEventListener\("change", syncPreference\)/);
  assert.equal((media.match(/<video\b/g) ?? []).length, 1);
  assert.equal((normalMedia.match(/<video\b/g) ?? []).length, 1);
  assert.match(media, /TOUCHLINE_ARENA_ENTRY_VIDEO/);
  assert.doesNotMatch(media, /TOUCHLINE_ARENA_LOOP_VIDEO/);
  assert.match(media, /TOUCHLINE_ARENA_VIDEO_POSTER/);
  assert.match(entryVideo, /muted/);
  assert.match(entryVideo, /autoPlay/);
  assert.match(entryVideo, /loop/);
  assert.match(entryVideo, /playsInline/);
  assert.match(entryVideo, /preload="auto"/);
  assert.match(layout, /<Logo[\s\S]*?officialArena\s*\/>/);
  assert.match(layout, /<header className="auth-brand-header/);
  assert.match(globalStyles, /\.auth-brand-header \{[\s\S]*?position: sticky;[\s\S]*?z-index: 40/);
  assert.match(globalStyles, /\.auth-cinematic-media \{[\s\S]*?var\(--auth-cinematic-poster\)/);
  assert.match(globalStyles, /\.auth-cinematic-video \{[\s\S]*?filter: none/);
  assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.auth-cinematic-media \{ background-position: center; \}/);
});

test("Arena without a lang query restores the stored language before using the cookie fallback", () => {
  const arena = source("app/arena/ArenaClient.tsx");
  const readerStart = arena.indexOf("function readTouchLineLocalePreference");
  const readerEnd = arena.indexOf("function writeTouchLineLocalePreference", readerStart);
  const reader = arena.slice(readerStart, readerEnd);
  const queryIndex = reader.indexOf('new URLSearchParams(window.location.search).get("lang")');
  const storageIndex = reader.indexOf('readBrowserStorage("localStorage", TOUCHLINE_LOCALE_STORAGE_KEY)');
  const cookieIndex = reader.indexOf("document.cookie");

  assert.ok(readerStart >= 0 && readerEnd > readerStart);
  assert.match(reader, /if \(rawUrlLocale\) return normalizeTouchLineLocale\(rawUrlLocale\)/);
  assert.match(reader, /if \(stored\) return stored/);
  assert.match(reader, /item\.startsWith\(`\$\{TOUCHLINE_LOCALE_STORAGE_KEY\}=`\)/);
  assert.match(reader, /cookie \? decodeURIComponent\(cookie\.split\("="\)\.slice\(1\)\.join\("="\)\) : null/);
  assert.ok(queryIndex >= 0 && queryIndex < storageIndex && storageIndex < cookieIndex);
  assert.match(arena, /const savedLocale = normalizeTouchLineLocale\(readTouchLineLocalePreference\(\)\)/);
  assert.match(arena, /const preferredLocale = initialLocale[\s\S]*?isTouchLineLocaleComplete\(savedLocale\)/);
  assert.match(arena, /setSiteLanguage\(\(current\) => current === preferredLocale \? current : preferredLocale\)/);
});

test("Arena supports portrait, reveals first access quickly and keeps replay explicit", () => {
  const arena = source("app/arena/ArenaClient.tsx");
  const page = source("app/arena/page.tsx");
  const zonePage = source("app/arena/[zone]/page.tsx");
  const revealStart = arena.indexOf("function revealOfficialArena");
  const revealEnd = arena.indexOf("function skipOfficialIntroExperience", revealStart);
  const reveal = arena.slice(revealStart, revealEnd);
  const hotkeyGuard = arena.indexOf("if (!isArenaFunctionalReady) return;");
  const hotkeyEffectStart = arena.lastIndexOf("useEffect(() => {", hotkeyGuard);
  const hotkeyEffectEnd = arena.indexOf("\n\n  useEffect(() => {", hotkeyGuard);
  const hotkeyEffect = arena.slice(hotkeyEffectStart, hotkeyEffectEnd);
  const videoStackStart = arena.indexOf('<div className="arena-video-stack"');
  const entryVideoStart = arena.indexOf("<video", videoStackStart);
  const loopVideoStart = arena.indexOf("<video", entryVideoStart + 1);
  const videoStackEnd = arena.indexOf("</div>", loopVideoStart);
  const entryVideo = arena.slice(entryVideoStart, loopVideoStart);
  const loopVideo = arena.slice(loopVideoStart, videoStackEnd);

  assert.match(page, /parseTouchlineArenaIntroIntent/);
  assert.match(page, /initialIntroIntent=/);
  assert.match(zonePage, /redirect\(`\$\{arenaZone\.href\}\$\{suffix\}`\)/);
  assert.match(arena, /readBrowserStorage\([\s\S]*?"localStorage",[\s\S]*?TOUCHLINE_ARENA_INTRO_STORAGE_KEY,[\s\S]*?\) === "1"/);
  assert.match(arena, /resolveTouchlineArenaIntroLaunchMode\(\{ intent, hasCompletedIntro \}\)/);
  assert.match(arena, /if \(launchMode === "skip"\)/);
  assert.match(arena, /setIntroExperienceMode\("hidden"\)/);
  assert.match(arena, /startCardLoopVideo\(\)/);
  assert.match(arena, /const isArenaIntroViewportReady = true/);
  assert.match(arena, /Every supported viewport, including portrait phones/);
  assert.match(
    arena,
    /const isArenaFunctionalReady = Boolean\(standaloneExperience\) \|\| \(\s*isArenaIntroViewportReady\s*&& introExperienceMode === "hidden"\s*&& hasEntryVideoFinished\s*\)/,
  );
  assert.match(arena, /<TouchlineArenaIntro/);
  assert.match(
    arena,
    /mode=\{introExperienceMode === "hidden" \? "hidden" : isArenaIntroViewportReady \? introExperienceMode : "pending"\}/,
  );
  assert.match(arena, /onComplete=\{completeOfficialIntroExperience\}/);
  assert.match(arena, /onReveal=\{revealOfficialArena\}/);
  assert.match(arena, /onSkip=\{skipOfficialIntroExperience\}/);
  assert.match(arena, /writeBrowserStorage\("localStorage", TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "1"\)/);
  assert.match(arena, /url\.searchParams\.delete\(TOUCHLINE_ARENA_INTRO_QUERY_PARAM\)/);
  assert.match(arena, /setIntroExperienceMode\("first"\)/);
  assert.match(arena, /\{siteLanguage === "pt-BR" \? "Ver intro" : "Watch intro"\}/);
  assert.match(arena, /preload=\{isEntrySkipAvailable \? "auto" : "metadata"\}/);
  assert.match(arena, /onEnded=\{startCardLoopVideo\}/);
  assert.match(arena, /onError=\{startCardLoopVideo\}/);
  assert.match(arena, /inert=\{isArenaFunctionalReady \? undefined : true\}/);
  assert.match(arena, /aria-hidden=\{!isArenaFunctionalReady\}/);
  assert.match(arena, /if \(reducedMotion\) \{[\s\S]*?loopVideo\.pause\(\)[\s\S]*?setIsArenaVideoPaused\(true\)/);
  assert.ok(revealStart >= 0 && revealEnd > revealStart);
  assert.doesNotMatch(reveal, /introExperienceMode === "first"[\s\S]*?startCardLoopVideo\(\)/);
  assert.match(reveal, /entryVideo\.currentTime = 0[\s\S]*?void entryVideo\.play\(\)\.catch\(startCardLoopVideo\)/);
  assert.ok(hotkeyEffectStart >= 0 && hotkeyEffectEnd > hotkeyEffectStart);
  assert.match(hotkeyEffect, /if \(!isArenaFunctionalReady\) return/);
  assert.match(hotkeyEffect, /document\.addEventListener\("keydown", handleArenaHotkeys\)/);
  assert.match(hotkeyEffect, /document\.removeEventListener\("keydown", handleArenaHotkeys\)/);
  assert.ok(hotkeyEffect.indexOf("if (!isArenaFunctionalReady) return") < hotkeyEffect.indexOf('document.addEventListener("keydown"'));
  assert.ok(videoStackStart >= 0 && entryVideoStart > videoStackStart && loopVideoStart > entryVideoStart && videoStackEnd > loopVideoStart);
  assert.match(entryVideo, /onPlay=\{\(\) => setIsArenaVideoPaused\(false\)\}/);
  assert.doesNotMatch(entryVideo, /onPlaying=/);
  assert.match(loopVideo, /onPlaying=\{handleCardLoopPlaying\}/);
  assert.doesNotMatch(loopVideo, /onPlay=/);
  assert.equal((arena.match(/onPlaying=/g) ?? []).length, 1);
  assert.doesNotMatch(arena, /arena-orientation-gate/);
});
