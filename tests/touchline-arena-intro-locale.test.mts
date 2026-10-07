import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getTouchlineIntroCopy,
  TOUCHLINE_INTRO_CATALOGUES,
  TOUCHLINE_INTRO_DRAFT_LOCALES,
  TOUCHLINE_INTRO_DRAFT_STATUS,
} from "../lib/touchlineArena/intro-i18n.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const intro = readFileSync(new URL("../components/touchline/arena/TouchlineArenaIntro.tsx", import.meta.url), "utf8");
const entry = readFileSync(new URL("../components/touchline/arena/TouchlineGameEntry.tsx", import.meta.url), "utf8");

test("Arena intro owns complete eight-locale control catalogues while six remain drafts", () => {
  assert.deepEqual(Object.keys(TOUCHLINE_INTRO_CATALOGUES), locales);
  assert.deepEqual(TOUCHLINE_INTRO_DRAFT_LOCALES, locales.slice(2));
  assert.equal(TOUCHLINE_INTRO_DRAFT_STATUS, "draft");

  for (const locale of locales) {
    const catalogue = TOUCHLINE_INTRO_CATALOGUES[locale];
    assert.deepEqual(Object.keys(catalogue), [
      "introAria", "arenaEnableSound", "arenaMute", "skipIntro", "entryEnableSound", "entryMute", "goToMarket",
    ]);
    for (const value of Object.values(catalogue)) assert.ok(value.length > 0, locale);
  }

  assert.equal(getTouchlineIntroCopy("pt-BR").skipIntro, "Pular intro");
  assert.equal(getTouchlineIntroCopy("en-GB").skipIntro, "Skip intro");
  for (const locale of TOUCHLINE_INTRO_DRAFT_LOCALES) {
    assert.equal(isTouchLineLocaleComplete(locale), false, locale);
    assert.equal(getTouchlineIntroCopy(locale).skipIntro, "Skip intro", locale);
  }
});

test("rendered controls take their text and accessible names from the catalogues without changing protected behavior", () => {
  assert.match(intro, /const copy = getTouchlineIntroCopy\(locale, draftLocalesEnabled\)/);
  assert.match(intro, /aria-label=\{copy\.introAria\}/);
  assert.match(intro, /aria-label=\{audioMuted \? copy\.arenaEnableSound : copy\.arenaMute\}/);
  assert.match(intro, /\{copy\.sound\}/);
  assert.match(intro, /\{copy\.skipIntro\}/);
  assert.match(intro, /TOUCHLINE_ARENA_INTRO_SLOGAN/);
  assert.match(intro, /onClick=\{\(\) => skipRef\.current\(\)\}/);

  assert.match(entry, /const copy = getTouchlineIntroCopy\(locale, draftLocalesEnabled\)/);
  assert.match(entry, /\{muted \? copy\.entryEnableSound : copy\.entryMute\}/);
  assert.match(entry, /\{copy\.goToMarket\}/);
  assert.match(entry, /onToggleAudio=\{\(\) => setMuted\(\(value\) => !value\)\}/);
  assert.match(entry, /writeBrowserStorage\("localStorage", TOUCHLINE_ARENA_INTRO_STORAGE_KEY, "1"\)/);
  assert.match(entry, /router\.replace\(`\/clubowner\?lang=/);
});
